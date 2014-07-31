var assert = require('assert');
var events = require('events');
var http = require('http');
var path = require('path');
var spawn = require('child_process').spawn;
var url = require('url');
var sshUrl = require('ssh-url');
var util = require('util');


/**
 * The current environment.
 * @type {Object}
 */
var env;


/**
 * Set the environment.
 * @param {Object} newEnv New environment.
 */
exports.setEnv = function(newEnv) {
  env = newEnv;
};


/**
 * Get the current environment.
 * @return {Object} The environment.
 */
exports.getEnv = function() {
  return env;
};


/**
 * Get an environment variable.
 * @param {string} key Variable name.
 * @param {function(string):*} opt_cast Function to cast environment variable
 *     to another value.
 * @return {*} Value.
 */
exports.get = function(key, opt_cast) {
  if (!env) {
    throw new Error('Environment not set');
  }
  var value = env[key];
  if (opt_cast) {
    value = opt_cast(value);
  }
  return value;
};


/*
 * Remove a string from the end of a string if it is a suffix; otherwise,
 * return the string unchanged.
 * @param {String} suffix
 * @param {String} string
 * @return {String}
 */
function stripSuffix(suffix, str) {
  var lastIndex = str.lastIndexOf(suffix);
  if (lastIndex === str.length - suffix.length) {
    return str.substring(0, lastIndex);
  } else {
    return str;
  }
}


/*
 * Asserts that an SSH url included in a push event payload is valid. Throws
 * `assert.AssertionError` if invalid.
 * @param {string} url SSH url
 * @return {Object} information obtained from parsing the url.
 */
function assertValidSshUrl(urlString) {
  var parsed;
  assert.doesNotThrow(function() {
    parsed = sshUrl.parse(urlString);
  });
  var message = 'bad repository url: ' + urlString;
  assert.equal(parsed.user, 'git', message);
  assert.equal(parsed.hostname, 'github.com', message);
  var parts = parsed.pathname.split('/');
  return {
    'owner': parts[1],
    'name': stripSuffix('.git', parts[2])
  };
}


/*
 * Asserts that an HTTPS url included in a push event payload is valid. Throws
 * `assert.AssertionError` if invalid.
 * @param {string} url HTTPS url
 * @return {Object} information obtained from parsing the url.
 */
function assertValidHttpsUrl(urlString) {
  var parsed;
  assert.doesNotThrow(function() {
    parsed = url.parse(urlString);
  });
  var message = 'bad repository url: ' + urlString;
  assert.equal(parsed.protocol, 'https:', message);
  assert.equal(parsed.hostname, 'github.com', message);
  var parts = parsed.pathname.split('/');
  return {
    'owner': parts[1],
    'name': parts[2]
  };
}


/**
 * Asserts that a push event payload is valid.  Throws `assert.AssertionError`
 * if invalid.
 * @param {Object} push Payload from push event.
 * @return {boolean} The payload is valid.
 */
exports.assertValid = function(push) {
  assert.ok(push.repository, 'no repository');

  var urlInfo;
  if (exports.get('RECEIVER_USE_SSH') === 'true') {
    urlInfo = assertValidSshUrl(push.repository.ssh_url);
  } else {
    urlInfo = assertValidHttpsUrl(push.repository.url);
  }

  assert.equal(urlInfo.owner, exports.get('RECEIVER_REPO_OWNER'),
      'bad repo owner');
  assert.equal(urlInfo.name, push.repository.name, 'bad repo name');

  // confirm other details are present
  assert.equal(typeof push.repository.master_branch, 'string', 'no master');
  assert.equal(typeof push.ref, 'string', 'no ref');
  assert.equal(typeof push.after, 'string', 'no after');
  return true;
};


/**
 * Log levels.
 * @enum {string}
 */
var LOG_LEVELS = {
  silent: 5,
  error: 4,
  info: 3,
  verbose: 2,
  debug: 1
};


/**
 * Log a message.
 * @param {string} level Log level.
 * @param {string} msg Message.
 */
function log(level, msg) {
  msg = util.format.apply(util, Array.prototype.slice.call(arguments, 1));
  msg = util.format('[%s] %s - %s',
      level.charAt(0).toUpperCase(), new Date().toISOString(), msg);
  if (LOG_LEVELS[level] >= LOG_LEVELS[exports.get('RECEIVER_LOG_LEVEL')]) {
    if (level === 'error') {
      process.stderr.write(msg + '\n');
    } else {
      process.stdout.write(msg + '\n');
    }
  }
}


/**
 * HTTP request listener.
 * @param {http.IncomingMessage} req Request.
 * @param {http.ClientResponse} res Response.
 */
exports.handler = function(req, res) {
  var headers = {'content-type': 'application/json'};
  var event = req.headers['x-github-event'];
  if (event === 'ping') {
    res.writeHead(200, headers);
    res.end(JSON.stringify({ok: true, msg: 'pong'}));
    return;
  }
  if (req.method !== 'POST') {
    log('debug', 'method not allowed: %s', req.method);
    res.writeHead(405, headers);
    res.end(JSON.stringify({ok: false, msg: 'method not allowed'}));
    return;
  }
  if (event !== 'push') {
    log('debug', 'bad event type: %s', event);
    res.writeHead(403, headers);
    res.end(JSON.stringify({ok: false, msg: 'bad event type'}));
    return;
  }

  var body = '';
  req.on('data', function(buffer) {
    body += String(buffer);
  });
  req.on('end', function() {
    var push;
    try {
      push = JSON.parse(body);
      exports.assertValid(push);
    } catch (err) {
      log('error', 'bad payload: %s', err.message);
      res.writeHead(400, headers);
      res.end(JSON.stringify({ok: false, msg: 'bad payload'}));
      return;
    }
    log('debug', 'handling push event: %j', push);
    var emitter = exports.make(push);
    if (emitter) {
      emitter.on('error', function(err) {
        // logged elsewhere, but if not handled here, it will be thrown
      });
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify({ok: true}));
  });
};


/**
 * Running jobs.  This provides a lookup of of running jobs by repository name.
 * @type {Object.<string, Job>}
 */
var runningJobs = {};


/**
 * Pending jobs.  Up to one pending job is allwed per repository name.  When
 * a new push event is received and there is a job running for the same
 * repository the new job will be set as pending.
 * @type {Object.<string, Job>}
 */
var pendingJobs = {};



/**
 * Job constructor.  Maintains job info.
 * @param {Object} push Push event data.
 * @param {events.EventEmitter} emitter The job event emitter.
 * @constructor
 */
exports.Job = function(push, emitter) {
  this.push = push;
  this.emitter = emitter;
};


/**
 * Generate a link to the GitHub page for the pushed commit.
 * @param {Object} push A push event.
 * @return {string} A URL.
 */
function link(push) {
  return push.repository.url + '/tree/' + push.after;
}


/**
 * Run a job.  If there is already a job running for the same repository, the
 * job will be queued.
 * @param {Job} job The job to run.
 */
function run(job) {
  var push = job.push;
  var emitter = job.emitter;
  var name = push.repository.name;

  if (runningJobs[name]) {
    var pending = pendingJobs[name];
    if (pending) {
      log('verbose', 'removing job %s from queue', link(pending.push));
      pending.emitter.emit('aborted');
    }
    log('verbose', 'queued job %s', link(push));
    pendingJobs[name] = job;
    return;
  }
  runningJobs[name] = job;

  // GitHub push events don't include the SSH clone URL
  // so we force a conversion here
  var cloneUrl;
  if (exports.get('RECEIVER_USE_SSH') === 'true') {
    cloneUrl = push.repository.ssh_url;
  } else {
    cloneUrl = push.repository.url;
  }

  var args = [
    push.repository.name,
    cloneUrl,
    push.after,
    path.resolve(exports.get('RECEIVER_CLONE_ROOT')),
    path.resolve(exports.get('RECEIVER_STATIC_ROOT'))
  ];

  var builder = path.join(__dirname, 'builder.sh');

  log('info', 'building: %s', link(push));
  var child = spawn(builder, args);

  child.stdout.on('data', function(chunk) {
    log('info', String(chunk).trim());
  });

  child.stderr.on('data', function(chunk) {
    log('error', String(chunk).trim());
  });

  child.on('exit', function(code) {
    delete runningJobs[name];
    if (code) {
      log('error', 'build failed: %s %s', builder, args.join(' '));
      var err = new Error('Build failed with code: ' + code);
      emitter.emit('error', err);
    } else {
      log('info', 'build completed: %s', link(push));
      emitter.emit('end');
    }

    // run any pending job
    var pending = pendingJobs[name];
    if (pending) {
      delete pendingJobs[name];
      process.nextTick(run.bind(null, pending));
    }
  });
}


/**
 * Make the site based on a push event.
 * @param {Object} push Push event.
 * @return {events.EventEmitter} An event emitter (or `null` if no job was
 *     started).  This will fire an `error` event if the job fails, an `end`
 *     event if it succeeds, or an `abort` event if it is not run due to another
 *     job being scheduled for the same repository.
 */
exports.make = function(push) {
  if (push.ref !== 'refs/heads/' + push.repository.master_branch) {
    log('debug', 'skipping push for %s of %s (default branch is %s)',
        push.ref, push.repository.url, push.repository.master_branch);
    return null;
  }
  var emitter = new events.EventEmitter();
  var job = new exports.Job(push, emitter);
  process.nextTick(run.bind(null, job));
  return emitter;
};


/**
 * Convert a GitHub HTTPS clone URL to a SSH clone URL.  Since push events
 * from GitHub don't include the SSH clone URL, we have to do the conversion
 * here.
 * @param {string} httpsUrl HTTPS clone URL.
 * @return {string} SSH clone URL.
 */
exports.sshUrl = function(httpsUrl) {
  var parts = url.parse(httpsUrl);
  return 'git@' + parts.hostname + ':' + parts.path.substr(1);
};


/**
 * Assign properties from source objects to target if property names are not
 * present in target.
 * @param {Object} target Target object.
 * @param {Object} source Source object(s).
 * @return {Object} The modified target object.
 */
function defaults(target, source) {
  var args = Array.prototype.slice.call(arguments);
  target = args.shift();
  for (source = args.shift(); source; source = args.shift()) {
    for (var key in source) {
      if (!(key in target)) {
        target[key] = source[key];
      }
    }
  }
  return target;
}


/**
 * Start server when run directly.
 */
if (require.main === module) {

  // set up environment with some defaults
  exports.setEnv(defaults({}, process.env, {
    RECEIVER_CLONE_ROOT: path.resolve(__dirname, 'repos'),
    RECEIVER_STATIC_ROOT: path.resolve(__dirname, 'sites'),
    RECEIVER_LOG_LEVEL: 'info',
    RECEIVER_USE_SSH: 'true',
    RECEIVER_PORT: '8000'
  }));

  if (!exports.get('RECEIVER_REPO_OWNER')) {
    log('error', 'missing RECEIVER_REPO_OWNER environment variable');
    process.exit(1);
  }

  var server = new http.Server(exports.handler);
  server.listen(exports.get('RECEIVER_PORT', Number), function() {
    var info = server.address();
    log('info', 'listening on http://%s:%d/', info.address, info.port);
  });

}
