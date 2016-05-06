
var pkg        = require('./package.json')
var debug      = require('debug')(pkg.name)
var RcpServer  = require('./lib/server.js')
var RcpClient  = require('./lib/client.js')
var FakeChild  = require('./lib/fake_child.js')

var spawn = function (bin, args, options) {
  if(!options) options = {};
  if(!options.cwd) options.cwd = process.cwd();
  var child = new FakeChild(options.stdio);
  var client = new RcpClient();
  var address = options.bridgeAddress;
  delete options.bridgeAddress;
  client.open(address, function (err) {
    if (err) {
      child.emit('error', err);
      child.emit('close', -2) // unsure what i should put here.
      return ;
    }
    var runOpts = {
      mode:     'spawn',
      bin:      bin,
      args:     args
    }
    client.runRemote(child, runOpts, options)
  })
  return child;
}

var exec = function (cmd, options, done) {
  if(!options) options = {};
  if(!options.cwd) options.cwd = process.cwd();
  options.stdio = ['ignore', 'pipe', 'pipe']; // it is forced
  var child = new FakeChild(options.stdio);
  var client = new RcpClient();
  var address = options.bridgeAddress;
  delete options.bridgeAddress;
  client.open(address, function (err) {
    if (err) {
      child.emit('error', err);
      child.emit('close', -2) // unsure what i should put here.
      return ;
    }
    var runOpts = {
      mode:     'exec',
      cmd:      cmd
    }
    client.runRemote(child, runOpts, options);
  })
  var stdout = '';
  var stderr = '';
  var error;
  child.stderr.on('data', function (d) {
    stderr += d.toString();
  })
  child.stdout.on('data', function (d) {
    stdout += d.toString();
  })
  child.on('error', function (err) {
    error = err;
  })
  child.on('close', function () {
    done && done(error, stdout,stderr);
  })
  return child;
}

module.exports = {
  FakeChild:  FakeChild,
  RcpClient:  RcpClient,
  RcpServer:  RcpServer,
  spawn:      spawn,
  exec:       exec
};
