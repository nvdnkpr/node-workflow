// Copyright 2012 Pedro P. Candel <kusorbox@gmail.com>. All rights reserved.
var util = require('util'),
    test = require('tap').test,
    uuid = require('node-uuid'),
    Workflow = require('../lib/workflow');

var job = {
  timeout: 3,
  workflow_uuid: 'bdfa0821-5071-4682-b965-88293149a8d2',
  name: 'A workflow name',
  exec_after: '2012-01-03T12:54:05.788Z',
  params: {
    'a': '1',
    'b': '2'
  },
  uuid: 'fb4c202d-19ed-4ed9-afda-8255aa7f38ad',
  target: '/foo/bar',
  status: 'running',
  chain_results: [],
  chain: [],
  onerror: []
};

var aWorkflow;

test('setup', function(t) {
  // body...
  aWorkflow = new Workflow(job);
  t.ok(aWorkflow, 'workflow ok');
  t.equal(aWorkflow.exec_after.toISOString(), job.exec_after);
  t.equal(aWorkflow.chain_results.length, 0);
  t.end();
});

test('a task which succeeds on 1st retry', function(t) {
  var task = {
    'uuid': uuid(),
    'name': 'A name',
    'body': function(job, cb) {
      return cb(null);
    }.toString()
  };
  aWorkflow.runTask(task, function(err) {
    t.ifError(err, 'task error');
    t.equal(aWorkflow.chain_results.length, 1);
    var res = aWorkflow.chain_results[0];
    t.equal(res.error, '');
    t.equal(res.result, 'OK');
    t.end();
  });
});


test('a task which succeeds on 2nd retry', function(t) {
  var task = {
    'uuid': uuid(),
    'name': 'A name',
    'retry': 2,
    'body': function(job, cb) {
      if (!job.foo) {
        job.foo = true;
        return cb('Foo was not defined');
      }
      return cb(null);
    }.toString()
  };
  aWorkflow.runTask(task, function(err) {
    t.ifError(err, 'task error');
    t.equal(aWorkflow.chain_results.length, 2);
    var res = aWorkflow.chain_results[1];
    t.equal(res.error, '');
    t.equal(res.result, 'OK');
    t.ok(job.foo);
    t.end();
  });
});

test('a task which fails and succeeds "onerror"', function(t) {
  var task = {
    'uuid': uuid(),
    'name': 'A name',
    'retry': 2,
    'body': function(job, cb) {
      return cb('Task body error');
    }.toString(),
    'onerror': function(err, job, cb) {
      job.the_err = err;
      return cb(null);
    }.toString()
  };
  aWorkflow.runTask(task, function(err) {
    t.ifError(err, 'task error');
    t.equal(aWorkflow.chain_results.length, 3);
    var res = aWorkflow.chain_results[2];
    t.equal(res.error, '');
    t.equal(res.result, 'OK');
    t.equal(job.the_err, 'Task body error');
    t.end();
  });
});


test('a task which fails and has no "onerror"', function(t) {
  var task = {
    'uuid': uuid(),
    'name': 'A name',
    'body': function(job, cb) {
      return cb('Task body error');
    }.toString()
  };
  aWorkflow.runTask(task, function(err) {
    t.ok(err, 'task error');
    t.equal(aWorkflow.chain_results.length, 4);
    var res = aWorkflow.chain_results[3];
    t.equal(res.error, 'Task body error');
    t.equal(res.result, '');
    t.end();
  });
});

test('a task which fails and "onerror" fails too', function(t) {
  var task = {
    'uuid': uuid(),
    'name': 'A name',
    'body': function(job, cb) {
      return cb('Task body error');
    }.toString(),
    'onerror': function(err, job, cb) {
      return cb('OnError error');
    }.toString()
  };
  aWorkflow.runTask(task, function(err) {
    t.ok(err, 'task error');
    t.equal(aWorkflow.chain_results.length, 5);
    var res = aWorkflow.chain_results[4];
    t.equal(res.error, 'OnError error');
    t.equal(res.result, '');
    t.end();
  });
});

test('a task which fails after two retries and has no "onerror"', function(t) {
  var task = {
    'uuid': uuid(),
    'name': 'A name',
    'retry': 2,
    'body': function(job, cb) {
      if (!job.bar) {
        job.bar = true;
        return cb('Bar was not defined');
      } else if (!job.baz) {
        job.baz = true;
        return cb('Baz was not defined');
      }
      // Should not be called
      return cb(null);
    }.toString()
  };
  aWorkflow.runTask(task, function(err) {
    t.ok(err, 'task error');
    t.equal(aWorkflow.chain_results.length, 6);
    var res = aWorkflow.chain_results[5];
    t.equal(res.error, 'Baz was not defined');
    t.equal(res.result, '');
    t.ok(job.bar);
    t.ok(job.baz);
    t.end();
  });
});

test('a task which time out and succeeds "onerror"', function(t) {
  var task = {
    'uuid': uuid(),
    'name': 'A name',
    'timeout': 1,
    'body': function(job, cb) {
      setTimeout(function() {
        // Should not be called:
        return cb('Error within timeout');
      }, 1050);
    }.toString(),
    'onerror': function(err, job, cb) {
      job.the_err = err;
      return cb(null);
    }.toString()
  };
  aWorkflow.runTask(task, function(err) {
    t.ifError(err, 'task error');
    t.equal(job.the_err, 'timeout error');
    t.equal(aWorkflow.chain_results.length, 7);
    var res = aWorkflow.chain_results[6];
    t.equal(res.error, '');
    t.equal(res.result, 'OK');
    t.end();
  });
});

test('a task which time out and succeeds on 2nd retry', function(t) {
  var task = {
    'uuid': uuid(),
    'name': 'A name',
    'timeout': 1,
    'retry': 2,
    'body': function(job, cb) {
      if (!job.timer) {
        job.timer = 'Timeout set';
        setTimeout(function() {
          // Should not be called:
          job.timer = 'Within timeout';
          return cb('Error within timeout');
        }, 1050);
      } else {
        return cb(null);
      }
    }.toString()
  };
  aWorkflow.runTask(task, function(err) {
    t.ifError(err, 'task error');
    t.equal(job.timer, 'Timeout set');
    t.equal(aWorkflow.chain_results.length, 8);
    var res = aWorkflow.chain_results[7];
    t.equal(res.error, '');
    t.equal(res.result, 'OK');
    t.end();
  });
});


test('a workflow which suceeds', function(t) {
  var aJob = {
    timeout: 3,
    exec_after: '2012-01-03T12:54:05.788Z',
    status: 'running',
    chain_results: [],
    chain: [],
    onerror: []
  },
  task = {
    'uuid': uuid(),
    'name': 'A name',
    'body': function(job, cb) {
      return cb(null);
    }.toString()
  },
  theWorkflow;

  aJob.chain.push(task);
  theWorkflow = new Workflow(aJob);
  t.ok(theWorkflow, 'the workflow ok');

  theWorkflow.run(function(err) {
    t.ifError(err, 'workflow error');
    t.equal(theWorkflow.chain_results.length, 1);
    t.equal(theWorkflow.chain_results, theWorkflow.job.chain_results);
    var res = theWorkflow.chain_results[0];
    t.equal(res.error, '');
    t.equal(res.result, 'OK');
    t.equal(theWorkflow.job.status, 'finished');
    t.end();
  });
});



test('teardown', function(t) {
  // body...
  t.end();
});
