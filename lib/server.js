
var pkg           = require('../package.json')
var debug         = require('debug')(pkg.name)
var util          = require('util');
var fs            = require('fs');
var net           = require('net');
var streams       = require('stream');
var split         = require('split');
var Emitter       = require('events');
var through2      = require('through2');
var spawn         = require('child_process').spawn;
var exec          = require('child_process').exec;
var jsonParse     = require('./json-parse.js')
var pumpify       = require('pumpify')

var RcpServer = function () {

  var that = this;

  var clients = [];

  var server = net.createServer()
  .on('error', (err) => {
    debug('RcpServer.err %s', err);
    that.emit('error', err)
  })
  .on('connection', (socket) => {
    socket.setNoDelay();
    debug('RcpServer got socket');
    socket.on('error', function (err) {
      debug('RcpServer.socket.err %s', err);
    });
    socket.on('data', function (data) {
      debug('RcpServer.socket.data %s', data.toString());
    });

    var socketStream = pumpify.obj(split(), jsonParse())
    socket.pipe(socketStream).once('data', function (d) {

      // a socket to receive message to close the server
      if (d.type==='close') {
        that.close(!!d.force);
        // there could be a check about
        // the identity of the close message sender.
        socketStream.destroy();
        socket.end();

      // a socket to receive commands to spawn/exec
      } else if (d.type==='main') {
        var id = clients.length;
        socket.write(JSON.stringify({id: id}) + '\n')
        clients.push({
          child: null,
          main: {
            socket: socket
          }
        })
        socket.on('end', function () {
          debug('RcpServer.socket.end %s %s', id, d.type);
        });
        debug('RcpServer.emit client_connected')
        that.emit('client_connected', id);
        socketStream.once('data', function (d) {
          socketStream.destroy();
          if (!d.runOpts.mode || !clients[d.id]) return socket.end()
          if (clients[d.id].child) return socket.end()
          runProcess(d, clients[d.id]);
        })

      // a socket to pipe into the spawned/exec'ed process
      } else {
        socketStream.destroy();
        if (!d.type || !clients[d.id] || d.type==='child') return socket.end()
        if (!d.direction || !d.direction.match(/read|write/)) return socket.end()
        if (clients[d.id][d.type]) return socket.end()

        socket.removeAllListeners('error')
        socket.removeAllListeners('data')
        var childPipe = {
          direction:  d.direction,
          socket: socket,
          stream: null
        }
        // socketStream.destroy();
        if (d.type.match(/controlin/)) {
          childPipe.stream = pumpify.obj(split(), jsonParse(), through2())
        } else {
          childPipe.stream = through2();
        }
        if (d.direction==="read") {
          childPipe.stream.on('data', function (d) {socket.write(d)})
          socket.on('end', function () {childPipe.stream.removeAllListeners('data');})
        } else {
          socket.on('data', function (d) {childPipe.stream.write(d)})
          childPipe.stream.on('close', function () { socket.end(); socket.removeAllListeners('data'); })
          socket.on('end', function () { childPipe.stream.end(); })
        }
        childPipe.stream.on('error', function (err) {
          debug('RcpServer.socket.err %s %s %s', d.id, d.type, err);
        });
        childPipe.stream.on('data', function (data) {
          debug('RcpServer.socket.data %s', d.id, d.type, data.toString());
        });
        childPipe.stream.pause();
        clients[d.id][d.type] = childPipe;
        // send reply
        socket.write(JSON.stringify('ok') + '\n');
      }
    })
  });

  var runProcess = function (opts, client) {
    var child;
    var runOpts = opts.runOpts;

    debug('RcpServer.runProcess runOpts %j', runOpts)
    debug('RcpServer.runProcess options %j', opts.options)

    if (runOpts.mode==='spawn')  child = spawn(runOpts.bin, runOpts.args, opts.options);
    if (runOpts.mode==='exec')   child = exec(runOpts.cmd, opts.options, function (error, stdout, stderr) {
      child.stdout && client.stdout.stream.end(stdout);
      child.stderr && client.stderr.stream.end(stderr);
    });

    if (client.controlin.stream) {
      client.controlin.stream.on('data', function (d) {
        if (d.action==='method') {
          if (child[d.name] && typeof(child[d.name])==='function') {
            child[d.name].apply(child, d.args);
          }
        }
      })
    }

    if (client.controlout.stream) {
      reEmitEvent(child, 'error', 'child')
      reEmitEvent(child, 'close', 'child')
      reEmitEvent(child, 'exit', 'child')
      client.controlout.stream.write(JSON.stringify({
        about: 'child', action: 'set', name: 'pid', value: child.pid
      }) + '\n')
    }
    // we do not want to re emit error of child.stdios,
    // if it s because the child got errored
    child.on('error', function () {
      child.stdin.removeAllListeners('error');
      child.stdout.removeAllListeners('error');
      child.stderr.removeAllListeners('error');
      // but we still need it to catch them, and void them
      child.stdin.on('error', function (){/* void */});
      child.stdout.on('error', function (){/* void */});
      child.stderr.on('error', function (){/* void */});
    })
    if (runOpts.mode==='spawn') {
      child.stdio && child.stdio.forEach(function (stdio, index) {
        if (index===0 && client.stdin) {
          client.stdin.stream.on('data', function (d){child.stdin.write(d)})
          client.stdin.stream.on('end', function (){child.stdin.end()})
          reEmitEvent(child.stdin, 'error', index);
        } else if (index===1 && client.stdout) {
          child.stdout.on('data', function (d){client.stdout.stream.write(d)})
          child.stdout.on('end', function (){client.stdout.stream.end()})
          reEmitEvent(child.stdout, 'error', index);
        } else if (index===2 && client.stderr) {
          child.stderr.on('data', function (d){client.stderr.stream.write(d)})
          child.stderr.on('end', function (){client.stderr.stream.end()})
          reEmitEvent(child.stderr, 'error', index);
        } else if (client[index]) {
          if (client[index].direction==='read') {
            reEmitEvent(pumpify(child.stdio[index], client[index].stream), 'error', index);
          }else if (client[index].direction==='write') {
            reEmitEvent(pumpify(client[index].stream, child.stdio[index]), 'error', index);
          }
        }
      })
    }

    Object.keys(client).forEach(function(k){
      client[k] && client[k].socket && client[k].socket.resume();
      client[k] && client[k].stream && client[k].stream.resume();
    })

    child.on('close', function () {
      debug('RcpServer.child.close %j', Object.keys(client));
      client.main.socket.end();
      that.emit('child_close', opts.id);
      Object.keys(client).forEach(function(k){
        client[k] && client[k].stream && client[k].stream.destroy();
        client[k] && client[k].socket && client[k].socket.end();
      })
    })

    function reEmitEvent(srcObj, name, about) {
      srcObj.on(name, function (e){
        var args = [].slice.call(arguments);
        if (name==='error') {
          args = [{
            code: e.code,
            errno: e.errno,
            syscall: e.syscall,
            message: e.message,
            stack: e.stack,
            type: e.constructor.name
          }]
        }
        var message = JSON.stringify({
          about: about,
          action: 'event',
          name: name,
          args: args
        });
        client.controlout.stream.write(message + '\n')
      })
    }
  }


  this.open = function (address, then) {
    debug('RcpServer.listen %j', address);
    server.listen(address, then);
    server.on('close', function () {
      debug('RcpServer.closed');
    })
  }
  this.close = function (force) {
    debug('RcpServer.close force=%s', force);
    if (force) {
      clients.forEach(function (client) {
        if(client.child && client.child.kill) client.child.kill();
      })
    }
    server.close();
    fileToCloseInterval && clearInterval(fileToCloseInterval);
    that.emit('close')
  }

  // an interval to lookup for a file
  // which when it contains the token
  // indicates that the server should quit.
  var fileToCloseInterval = setInterval(function () {
    if (fileToWatch && tokenToWatch) {
      fs.readFile(fileToWatch, function (err, content) {
        if(!err) {
          if (content.toString().match(tokenToWatch)) {
            fs.unlink(fileToWatch);
            that.close(true);
          }
        }
      })
    }
  }, 2000);
  var fileToWatch = null;
  var tokenToWatch = null;
  this.enableFileToQuit = function (filePath, token) {
    fileToWatch = filePath;
    tokenToWatch = token;
  }


}

util.inherits(RcpServer, Emitter);

module.exports = RcpServer;
