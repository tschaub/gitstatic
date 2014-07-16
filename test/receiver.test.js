var fs = require('fs');
var path = require('path');

var MockReq = require('mock-req');
var MockRes = require('mock-res');
var TarGZ = require('tar.gz');
var lab = require('lab');
var temp = require('temp');
var rimraf = require('rimraf');

var receiver = require('../receiver');

lab.experiment('assertValid()', function() {

  var env;
  lab.beforeEach(function(done) {
    env = receiver.getEnv();
    receiver.setEnv({
      RECEIVER_REPO_OWNER: 'test'
    });
    done();
  });

  lab.afterEach(function(done) {
    receiver.setEnv(env);
    done();
  });

  lab.test('valid push', function(done) {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master',
      repository: {
        url: 'https://github.com/test/repo',
        name: 'repo',
        master_branch: 'master'
      }
    };

    lab.assert.ok(receiver.assertValid(push));

    done();
  });

  lab.test('missing after', function(done) {
    var push = {
      ref: 'refs/heads/master',
      repository: {
        url: 'https://github.com/test/repo',
        name: 'repo',
        master_branch: 'master'
      }
    };

    lab.assert.throws(function() {
      receiver.assertValid(push);
    }, 'no after');

    done();
  });

  lab.test('missing ref', function(done) {
    var push = {
      after: 'asdf',
      repository: {
        url: 'https://github.com/test/repo',
        name: 'repo',
        master_branch: 'master'
      }
    };

    lab.assert.throws(function() {
      receiver.assertValid(push);
    }, 'no ref');

    done();
  });

  lab.test('missing repository', function(done) {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master'
    };

    lab.assert.throws(function() {
      receiver.assertValid(push);
    }, 'no repository');

    done();
  });

  lab.test('missing repository url', function(done) {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master',
      repository: {
        name: 'repo',
        master_branch: 'master'
      }
    };

    lab.assert.throws(function() {
      receiver.assertValid(push);
    });

    done();
  });

  lab.test('missing repository name', function(done) {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master',
      repository: {
        url: 'https://github.com/test/repo',
        master_branch: 'master'
      }
    };

    lab.assert.throws(function() {
      receiver.assertValid(push);
    }, 'bad repo name');

    done();
  });

  lab.test('mismatched repository name', function(done) {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master',
      repository: {
        name: 'not-repo',
        url: 'https://github.com/test/repo',
        master_branch: 'master'
      }
    };

    lab.assert.throws(function() {
      receiver.assertValid(push);
    }, 'bad repo name');

    done();
  });

  lab.test('missing repository master_branch', function(done) {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master',
      repository: {
        url: 'https://github.com/test/repo',
        name: 'repo'
      }
    };

    lab.assert.throws(function() {
      receiver.assertValid(push);
    }, 'no master');

    done();
  });

  lab.test('bad repository url', function(done) {

    lab.assert.throws(function() {
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
    }, 'bad repository url', 'wrong protocol');

    lab.assert.throws(function() {
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
    }, 'bad repository url', 'wrong hostname');

    lab.assert.throws(function() {
      var push = {
        after: 'asdf',
        ref: 'refs/heads/master',
        repository: {
          url: 'https://github.com/foo/repo',
          name: 'repo',
          master_branch: 'master'
        }
      };
      receiver.assertValid(push);
    }, 'bad repository url', 'wrong owner');

    done();
  });

});

lab.experiment('get()', function() {

  lab.test('gets env variables', function(done) {
    var env = receiver.getEnv();
    receiver.setEnv({foo: 'bar'});

    lab.assert.equal(receiver.get('foo'), 'bar');

    receiver.setEnv(env);
    done();
  });

  lab.test('accepts a cast', function(done) {
    var env = receiver.getEnv();
    receiver.setEnv({foo: '42'});

    lab.assert.strictEqual(receiver.get('foo', Number), 42);

    receiver.setEnv(env);
    done();
  });

  lab.test('throws if env is not set', function(done) {
    lab.assert.throws(function() {
      receiver.get('foo');
    });
    done();
  });

});

lab.experiment('make()', function() {

  var tgz = new TarGZ();
  var fixtures = path.join(__dirname, 'fixtures.tgz');
  var env, scratch;

  lab.beforeEach(function(done) {
    env = receiver.getEnv();
    temp.mkdir('scratch', function(err, dir) {
      if (err) {
        done(err);
        return;
      }
      scratch = dir;
      receiver.setEnv({
        RECEIVER_REPO_OWNER: 'fixtures',
        RECEIVER_CLONE_ROOT: path.join(scratch, 'repos'),
        RECEIVER_STATIC_ROOT: path.join(scratch, 'sites')
      });
      tgz.extract(fixtures, scratch, done);
    });
  });

  lab.afterEach(function(done) {
    receiver.setEnv(env);
    rimraf(scratch, done);
  });


  lab.test('smoke', function(done) {
    var name = 'smoke';
    var push = {
      after: 'origin/master',
      ref: 'refs/heads/master',
      repository: {
        url: path.join(scratch, 'fixtures', name),
        name: name,
        master_branch: 'master'
      }
    };

    receiver.make(push, function(err) {
      if (err) {
        done(err);
        return;
      }
      var output = path.join(scratch, 'sites', name, 'ok');
      fs.exists(output, function(exists) {
        lab.assert.strictEqual(exists, true, output + ' exists');
        done();
      });
    });

  });

  lab.test('two builds in series', function(done) {
    var name = 'smoke';
    var push = {
      after: 'origin/master',
      ref: 'refs/heads/master',
      repository: {
        url: path.join(scratch, 'fixtures', name),
        name: name,
        master_branch: 'master'
      }
    };

    receiver.make(push, function(err) {
      if (err) {
        done(err);
        return;
      }
      var output = path.join(scratch, 'sites', name, 'ok');
      fs.exists(output, function(exists) {
        lab.assert.strictEqual(exists, true, output + ' exists');
        receiver.make(push, function(err) {
          if (err) {
            done(err);
            return;
          }
          var output = path.join(scratch, 'sites', name, 'ok');
          fs.exists(output, function(exists) {
            lab.assert.strictEqual(exists, true, output + ' exists');
            done();
          });
        });
      });
    });

  });

});
