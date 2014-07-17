var assert = require('assert');
var events = require('events');
var http = require('http');
var path = require('path');
var spawn = require('child_process').spawn;
var url = require('url');
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
var setEnv = exports.setEnv = function(newEnv) {
  env = newEnv;
};


/**
 * Get the current environment.
 * @return {Object} The environment.
 */
var getEnv = exports.getEnv = function() {
  return env;
};


/**
 * Get an environment variable.
 * @param {string} key Variable name.
 * @param {function(string):*} opt_cast Function to cast environment variable
 *     to another value.
 * @return {*} Value.
 */
var get = exports.get = function(key, opt_cast) {
  if (!env) {
    throw new Error('Environment not set');
  }
  var value = env[key];
  if (opt_cast) {
    value = opt_cast(value);
  }
  return value;
};


/**
 * Asserts that a push event payload is valid.  Throws if invalid.
 * @param {Object} push Payload from push event.
 * @return {boolean} The payload is valid.
 */
exports.assertValid = function(push) {
  assert.ok(push.repository, 'no repository');

  // confirm the repo url is valid
  var parsed;
  assert.doesNotThrow(function() {
    parsed = url.parse(push.repository.url);
  });
  var message = 'bad repository url: ' + parsed.href;
  assert.equal(parsed.protocol, 'https:', message);
  assert.equal(parsed.hostname, 'github.com', message);
  var parts = parsed.pathname.split('/');
  assert.equal(parts.length, 3, message);
  assert.equal(parts[1], get('RECEIVER_REPO_OWNER'), message);

  // confirm other details are present
  assert.equal(push.repository.name, parts[2], 'bad repo name');
  assert.equal(typeof push.repository.master_branch, 'string', 'no master');
  assert.equal(typeof push.ref, 'string', 'no ref');
  assert.equal(typeof push.after, 'string', 'no after');
  return true;
};


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

  log('debug', 'handling push event');
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
    res.writeHead(200, headers);
    res.end(JSON.stringify({ok: true}));
    exports.make(push);
  });
};


/**
 * Make the site based on a push event.
 * @param {Object} push Push event.
 * @return {events.EventEmitter} An event emitter (or `null` if no job was
 *     started).  This will fire an `error` event if the job fails or an `end`
 *     event if it succeeds.
 */
exports.make = function(push) {
  var emitter = new events.EventEmitter();
  if (push.ref !== 'refs/heads/' + push.repository.master_branch) {
    log('debug', 'skipping push for %s of %s (default branch is %s)',
        push.ref, push.repository.url, push.repository.master_branch);
    return null;
  }

  var args = [
    push.repository.name,
    push.repository.url,
    push.after,
    path.resolve(get('RECEIVER_CLONE_ROOT')),
    path.resolve(get('RECEIVER_STATIC_ROOT'))
  ];

  var builder = path.join(__dirname, 'builder.sh');

  log('verbose', 'building: %s', push.ref);
  var child = spawn(builder, args);

  child.stdout.on('data', function(chunk) {
    log('info', String(chunk).trim());
  });

  child.stderr.on('data', function(chunk) {
    log('error', String(chunk).trim());
  });

  child.on('exit', function(code) {
    if (code) {
      log('error', 'build failed: %s %s', builder, args.join(' '));
      var err = new Error('Build failed with code: ' + code);
      emitter.emit('error', err);
    } else {
      emitter.emit('end');
    }
  });
  return emitter;
};


var LOG_LEVELS = {
  debug: 3,
  verbose: 2,
  info: 1
};

function log(level, msg) {
  msg = util.format.apply(util, Array.prototype.slice.call(arguments, 1));
  msg = util.format('[%s] %s - %s', level, new Date().toISOString(), msg);
  if (level === 'error') {
    process.stderr.write(msg + '\n');
  } else {
    if (LOG_LEVELS[level] <= LOG_LEVELS[get('RECEIVER_LOG_LEVEL')]) {
      process.stdout.write(msg + '\n');
    }
  }
}


/**
 * Start server when run directly.
 */
if (require.main === module) {

  // set up environment with some defaults
  setEnv(Object.create(process.env, {
    RECEIVER_CLONE_ROOT: {value: 'repos'},
    RECEIVER_LOG_LEVEL: {value: 'info'},
    RECEIVER_PORT: {value: '8000'}
  }));

  if (!get('RECEIVER_REPO_OWNER')) {
    log('error', 'missing RECEIVER_REPO_OWNER environment variable');
    process.exit(1);
  }

  if (!get('RECEIVER_STATIC_ROOT')) {
    log('error', 'missing RECEIVER_STATIC_ROOT environment variable');
    process.exit(1);
  }

  var server = new http.Server(exports.handler);
  server.listen(get('RECEIVER_PORT', Number), function() {
    var info = server.address();
    log('info', 'listening on http://%s:%d/', info.address, info.port);
  });

}
