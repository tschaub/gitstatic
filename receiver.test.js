var MockReq = require('mock-req');
var MockRes = require('mock-res');
var test = require('tape');


process.env.RECEIVER_REPO_OWNER = 'test';
var receiver = require('./receiver');

test('assertValid - AOK', function(t) {
  t.plan(1);

  var push = {
    after: 'asdf',
    ref: 'refs/heads/master',
    repository: {
      url: 'https://github.com/test/repo',
      name: 'repo',
      master_branch: 'master'
    }
  };

  t.ok(receiver.assertValid(push));
});

test('assertValid - missing after', function(t) {
  t.plan(1);

  var push = {
    ref: 'refs/heads/master',
    repository: {
      url: 'https://github.com/test/repo',
      name: 'repo',
      master_branch: 'master'
    }
  };

  t.throws(function() {
    receiver.assertValid(push);
  });
});

test('assertValid - missing ref', function(t) {
  t.plan(1);

  var push = {
    after: 'asdf',
    repository: {
      url: 'https://github.com/test/repo',
      name: 'repo',
      master_branch: 'master'
    }
  };

  t.throws(function() {
    receiver.assertValid(push);
  });
});

test('assertValid - bad repo url', function(t) {
  t.plan(3);

  t.throws(function() {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master',
      repository: {
        url: 'http://github.com/test/repo',
        name: 'repo',
        master_branch: 'master'
      }
    };
    receiver.assertValid(push);
  }, 'invalid protocol');

  t.throws(function() {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master',
      repository: {
        url: 'https://example.com/test/repo',
        name: 'repo',
        master_branch: 'master'
      }
    };
    receiver.assertValid(push);
  }, 'invalid hostname');

  t.throws(function() {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master',
      repository: {
        url: 'https://example.com/foo/repo',
        name: 'repo',
        master_branch: 'master'
      }
    };
    receiver.assertValid(push);
  }, 'invalid repo owner');

});
