var MockReq = require('mock-req');
var MockRes = require('mock-res');
var TarGZ = require('tar.gz');
var events = require('events');
var expect = require('code').expect;
var fs = require('fs');
var lab = exports.lab = require('lab').script();
var path = require('path');
var rimraf = require('rimraf');
var temp = require('temp');

var receiver = require('../receiver');

lab.experiment('assertValid()', function() {

  var env;
  lab.beforeEach(function(done) {
    env = receiver.getEnv();
    receiver.setEnv({
      RECEIVER_REPO_OWNER: 'test',
      RECEIVER_USE_SSH: 'false'
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

    expect(receiver.assertValid(push)).to.be.true();

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

    expect(function() {
      receiver.assertValid(push);
    }).to.throw(Error, 'no after');

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

    expect(function() {
      receiver.assertValid(push);
    }).to.throw(Error, 'no ref');

    done();
  });

  lab.test('missing repository', function(done) {
    var push = {
      after: 'asdf',
      ref: 'refs/heads/master'
    };

    expect(function() {
      receiver.assertValid(push);
    }).to.throw(Error, 'no repository');

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

    expect(function() {
      receiver.assertValid(push);
    }).to.throw(Error);

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

    expect(function() {
      receiver.assertValid(push);
    }).to.throw(Error, 'bad repo name');

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

    expect(function() {
      receiver.assertValid(push);
    }).to.throw(Error, 'bad repo name');

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

    expect(function() {
      receiver.assertValid(push);
    }).to.throw(Error, 'no master');

    done();
  });

  lab.test('bad repository url', function(done) {

    expect(function() {
      receiver.setEnv({RECEIVER_USE_SSH: 'false'});
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
    }).to.throw(Error, 'bad repository url: http://github.com/test/repo');

    expect(function() {
      receiver.setEnv({RECEIVER_USE_SSH: 'true'});
      var push = {
        after: 'asdf',
        ref: 'refs/heads/master',
        repository: {
          url: 'https://github.com/test/repo',
          ssh_url: 'foo@github.com:test/repo',
          name: 'repo',
          master_branch: 'master'
        }
      };
      receiver.assertValid(push);
    }).to.throw(Error, 'bad repository url: foo@github.com:test/repo');

    expect(function() {
      receiver.setEnv({RECEIVER_USE_SSH: 'false'});
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
    }).to.throw(Error, 'bad repository url: https://example.com/test/repo');

    expect(function() {
      receiver.setEnv({RECEIVER_USE_SSH: 'true'});
      var push = {
        after: 'asdf',
        ref: 'refs/heads/master',
        repository: {
          url: 'https://example.com/test/repo',
          ssh_url: 'git@example.com:test/repo.git',
          name: 'repo',
          master_branch: 'master'
        }
      };
      receiver.assertValid(push);
    }).to.throw(Error, 'bad repository url: https://example.com/test/repo');

    expect(function() {
      receiver.setEnv({RECEIVER_USE_SSH: 'false'});
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
    }).to.throw(Error, 'bad repo owner');

    expect(function() {
      receiver.setEnv({RECEIVER_USE_SSH: 'true'});
      var push = {
        after: 'asdf',
        ref: 'refs/heads/master',
        repository: {
          url: 'https://github.com/foo/repo',
          ssh_url: 'git@github.com:foo/repo.git',
          name: 'repo',
          master_branch: 'master'
        }
      };
      receiver.assertValid(push);
    }).to.throw('bad repo owner');

    done();
  });

});

lab.experiment('get()', function() {

  lab.test('gets env variables', function(done) {
    var env = receiver.getEnv();
    receiver.setEnv({foo: 'bar'});

    expect(receiver.get('foo')).to.equal('bar');

    receiver.setEnv(env);
    done();
  });

  lab.test('accepts a cast', function(done) {
    var env = receiver.getEnv();
    receiver.setEnv({foo: '42'});

    expect(receiver.get('foo', Number)).to.equal(42);

    receiver.setEnv(env);
    done();
  });

  lab.test('throws if env is not set', function(done) {
    expect(function() {
      receiver.get('foo');
    }).to.throw(Error);
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

    var emitter = receiver.make(push);
    expect(emitter).to.be.an.instanceOf(events.EventEmitter);

    emitter.on('error', done);

    emitter.on('end', function() {
      var output = path.join(scratch, 'sites', name, 'ok');
      fs.exists(output, function(exists) {
        expect(exists).to.be.true();
        done();
      });
    });

  });

  lab.test('skipped job (push not on default branch)', function(done) {
    var name = 'smoke';
    var push = {
      after: 'commit-sha',
      ref: 'refs/heads/feature',
      repository: {
        url: path.join(scratch, 'fixtures', name),
        name: name,
        master_branch: 'master'
      }
    };

    var emitter = receiver.make(push);
    expect(emitter).to.be.null();
    done();
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

    var emitter = receiver.make(push);
    expect(emitter).to.be.an.instanceOf(events.EventEmitter);

    emitter.on('error', done);

    emitter.on('end', function() {
      var output = path.join(scratch, 'sites', name, 'ok');
      fs.exists(output, function(exists) {
        expect(exists).to.be.true();

        var emitter = receiver.make(push);
        expect(emitter).to.be.an.instanceOf(events.EventEmitter);

        emitter.on('error', done);

        emitter.on('end', function() {
          var output = path.join(scratch, 'sites', name, 'ok');
          fs.exists(output, function(exists) {
            expect(exists).to.be.true();
            done();
          });
        });
      });
    });

  });

  lab.test('four push events at once', function(done) {
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

    var emitter1 = receiver.make(push);
    expect(emitter1).to.be.an.instanceOf(events.EventEmitter);
    emitter1.on('error', done);
    emitter1.on('aborted', function() {
      done(new Error('Unexpected abort for job'));
    });

    var emitter2 = receiver.make(push);
    expect(emitter2).to.be.an.instanceOf(events.EventEmitter);
    emitter2.on('error', done);

    var emitter3 = receiver.make(push);
    expect(emitter3).to.be.an.instanceOf(events.EventEmitter);
    emitter3.on('error', done);

    var emitter4 = receiver.make(push);
    expect(emitter4).to.be.an.instanceOf(events.EventEmitter);
    emitter4.on('error', done);
    emitter4.on('aborted', function() {
      done(new Error('Unexpected abort for job'));
    });

    // the first and last jobs should run, others should be ignored
    var aborted = 0;
    emitter2.on('aborted', function() {
      ++aborted;
    });
    emitter3.on('aborted', function() {
      ++aborted;
    });

    var completed = 0;
    emitter1.on('end', function() {
      ++completed;
    });
    emitter4.on('end', function() {
      ++completed;
      expect(aborted).to.equal(2);
      expect(completed).to.equal(2);
      done();
    });

  });

});

lab.experiment('handler()', function() {

  var env, make, _make;

  lab.beforeEach(function(done) {
    env = receiver.getEnv();
    receiver.setEnv({
      RECEIVER_REPO_OWNER: 'test',
      RECEIVER_CLONE_ROOT: 'bogus/clone/root',
      RECEIVER_STATIC_ROOT: 'bogus/static/root'
    });
    _make = receiver.make;
    make = receiver.make = function() {
      make.calls.push(Array.prototype.slice.call(arguments));
    };
    make.calls = [];
    done();
  });

  lab.afterEach(function(done) {
    receiver.setEnv(env);
    receiver.make = _make;
    make = null;
    done();
  });

  lab.test('GET ping', function(done) {

    var req = new MockReq({
      method: 'GET',
      url: '/',
      headers: {
        'x-github-event': 'ping'
      }
    });

    var res = new MockRes(function() {
      expect(res.statusCode).to.equal(200);
      var obj = res._getJSON();
      expect(obj).to.equal({ok: true, msg: 'pong'});
      expect(make.calls).to.have.length(0);
      done();
    });

    receiver.handler(req, res);

  });

  lab.test('PUT (method not allowed)', function(done) {

    var req = new MockReq({
      method: 'PUT',
      url: '/'
    });

    var res = new MockRes(function() {
      expect(res.statusCode).to.equal(405);
      var obj = res._getJSON();
      expect(obj).to.equal({ok: false, msg: 'method not allowed'});
      expect(make.calls).to.have.length(0);
      done();
    });

    receiver.handler(req, res);
    req.end();

  });

  lab.test('POST bad event', function(done) {
    var req = new MockReq({
      method: 'POST',
      url: '/',
      headers: {
        'x-github-event': 'bad'
      }
    });

    var res = new MockRes(function() {
      expect(res.statusCode).to.equal(403);
      var obj = res._getJSON();
      expect(obj).to.equal({ok: false, msg: 'bad event type'});
      expect(make.calls).to.have.length(0);
      done();
    });

    receiver.handler(req, res);
    req.end();

  });

  lab.test('POST bad payload', function(done) {
    var req = new MockReq({
      method: 'POST',
      url: '/',
      headers: {
        'x-github-event': 'push'
      }
    });

    var res = new MockRes(function() {
      expect(res.statusCode).to.equal(400);
      var obj = res._getJSON();
      expect(obj).to.equal({ok: false, msg: 'bad payload'});
      expect(make.calls).to.have.length(0);
      done();
    });

    receiver.handler(req, res);

    req.write('invalid JSON');
    req.end();

  });

  lab.test('POST valid push', function(done) {
    var push = {
      after: 'invalid-sha',
      ref: 'refs/heads/master',
      repository: {
        url: 'https://github.com/test/bogus-repo',
        name: 'bogus-repo',
        master_branch: 'master'
      }
    };

    var req = new MockReq({
      method: 'POST',
      url: '/',
      headers: {
        'x-github-event': 'push'
      }
    });

    var res = new MockRes(function() {
      expect(res.statusCode).to.equal(200);
      var obj = res._getJSON();
      expect(obj).to.equal({ok: true});
      expect(make.calls).to.have.length(1);
      var args = make.calls[0];
      expect(args).to.have.length(1);
      expect(args[0]).to.equal(push);
      done();
    });

    receiver.handler(req, res);

    req.write(push);
    req.end();

  });

});
