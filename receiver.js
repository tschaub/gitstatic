var assert = require('assert');
var http = require('http');
var path = require('path');
var spawn = require('child_process').spawn;
var url = require('url');
var util = require('util');

var LOG_LEVEL = process.env.RECEIVER_LOG_LEVEL || 'info';
var PORT = Number(process.env.RECEIVER_PORT) || 8080;
var STATIC_ROOT = process.env.RECEIVER_STATIC_ROOT;
var REPO_OWNER = process.env.RECEIVER_REPO_OWNER;


/**
 * Asserts that a push event payload is valid.  Throws if invalid.
 * @param {Object} push Payload from push event.
 * @return {boolean} The payload is valid.
 */
exports.assertValid = function(push) {
  // confirm the repo url is valid
  var parsed = url.parse(push.repository.url);
  var badUrl = 'bad repository url: ' + parsed.href;
  assert.equal(parsed.protocol, 'https:', badUrl);
  assert.equal(parsed.hostname, 'github.com', badUrl);
  var parts = parsed.pathname.split('/');
  assert.equal(parts.length, 3, badUrl);
  assert.equal(parts[1], REPO_OWNER, badUrl);

  // confirm other details are present
  assert.equal(push.repository.name, parts[2], 'bad repo name');
  assert.equal(typeof push.repository.master_branch, 'string', 'no master');
  assert.equal(typeof push.ref, 'string', 'no ref');
  assert.equal(typeof push.after, 'string', 'no after');
  return true;
};

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

exports.make = function(push) {
  if (push.ref !== 'refs/heads/' + push.repository.master_branch) {
    log('debug', 'skipping push for %s of %s (default branch is %s)',
        push.ref, push.repository.url, push.repository.master_branch);
    return;
  }
  log('verbose', 'building: %s', push.ref);
  var dir = path.join(STATIC_ROOT, push.repository.name);
  var args = [dir, push.repository.url, push.after];
  var builder = path.join(__dirname, 'builder.sh');
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
    }
  });
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
    if (LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL]) {
      process.stdout.write(msg + '\n');
    }
  }
}

if (require.main === module) {
  if (!REPO_OWNER) {
    log('error', 'missing RECEIVER_REPO_OWNER environment variable');
    process.exit(1);
  }
  if (!STATIC_ROOT) {
    log('error', 'missing RECEIVER_STATIC_ROOT environment variable');
    process.exit(1);
  }
  var server = new http.Server(exports.handler);
  server.listen(PORT, function() {
    var info = server.address();
    log('info', 'listening on http://%s:%d/', info.address, info.port);
  });  
}
