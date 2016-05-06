
var pkg           = require('../package.json')
var debug         = require('debug')(pkg.name)
var util          = require('util');
var fs            = require('fs');
var net           = require('net');
var streams       = require('stream');
var split         = require('split');
var Emitter       = require('events');
var spawn         = require('child_process').spawn;
var exec          = require('child_process').exec;
var jsonParse     = require('./json-parse.js')
var passThrough   = require('./pass-through.js')

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
    var k = split();
    var l = jsonParse();
    l.on('error', console.error.bind(console))
    var socketStream = socket.pipe(k).pipe(l)
    socketStream.once('data', function (d) {

      // a socket to receive message to close the server
      if (d.type==='close') {
        that.close(!!d.force);
        // there could be a check about
        // the identity of the close message sender.
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
          if (!d.runOpts.mode || !clients[d.id]) return socket.end()
          if (clients[d.id].child) return socket.end()
          runProcess(d, clients[d.id]);
        })

      // a socket to pipe into the spawned/exec'ed process
      } else {
        if (!d.type || !clients[d.id] || d.type==='child') return socket.end()
        if (!d.direction || !d.direction.match(/read|write/)) return socket.end()
        if (clients[d.id][d.type]) return socket.end()
        clients[d.id][d.type] = {
          direction:  d.direction,
          socket:     socket,
          stream:     passThrough()
        }
        socket.removeAllListeners('error')
        socket.removeAllListeners('data')
        socket.on('error', function (err) {
          debug('RcpServer.socket.err %s %s %s', d.id, d.type, err);
        });
        socket.on('data', function (data) {
          debug('RcpServer.socket.data %s', d.id, d.type, data.toString());
        });
        clients[d.id][d.type].stream.pause();
        clients[d.id][d.type].socket.on('end', function () {
          debug('RcpServer.socket.end %s %s', d.id, d.type);
          clients[d.id][d.type].stream.end()
        });
        clients[d.id][d.type].stream.on('end', function () {
          debug('RcpServer.stream.end %s %s', d.id, d.type);
          clients[d.id][d.type].socket.end()
        });
        clients[d.id][d.type].stream.on('error', function (err) {
          debug('RcpServer.stream.error %s %s %s', d.id, d.type, err);
        });
        socket.write(JSON.stringify('ok') + '\n');
        if (!d.type.match(/controlout|controlin/)) {
          socket.unpipe(k);
          // socket.unpipe(l);
        }
        if (d.direction==='read') {
          clients[d.id][d.type].stream.on('data', function (data) {
            socket.write(data);
          })
        } else if (d.direction==='write') {
          socket.on('data', function (data) {
            clients[d.id][d.type].stream.write(data);
          })
        }
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
      client.controlin.stream.pipe(split()).pipe(jsonParse()).on('data', function (d) {
        if (d.action==='method') {
          if (child[d.name] && typeof(child[d.name])==='function') {
            child[d.name].apply(child, d.args);
          }
        }
      })
    }

    if (client.controlout.stream) {
      reEmitEvent('error', child, client.controlout.stream)
      reEmitEvent('close', child, client.controlout.stream)
      reEmitEvent('exit', child, client.controlout.stream)
      client.controlout.stream.write(JSON.stringify({
        action: 'set', name: 'pid', value: child.pid
      }) + '\n')
    }

    if (runOpts.mode==='spawn') {
      child.stdio && child.stdio.forEach(function (stdio, index) {
        index===0 && client.stdin && client.stdin.stream.pipe(child.stdin);
        index===1 && client.stdout && child.stdout.pipe(client.stdout.stream);
        index===2 && client.stderr && child.stderr.pipe(client.stderr.stream);
        if (client[index]) {
          if (client[index].direction==='read') {
            child.stdio[index].pipe(client[index].stream);
          }else if (client[index].direction==='write') {
            client[index].stream.pipe(child.stdio[index]);
          }
        }
      })
    }

    Object.keys(client).forEach(function(k){
      client[k] && client[k].stream && client[k].stream.resume();
      client[k] && client[k].socket && client[k].socket.resume();
    })

    child.on('close', function () {
      debug('RcpServer.child.close %j', Object.keys(client));
      Object.keys(client).forEach(function(k){
        client[k] && client[k].stream && client[k].stream.end();
        client[k] && client[k].socket && client[k].socket.end();
      })
      client.main.socket.end();
      that.emit('child_close', opts.id);
    })
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
            that.close(true);
            fs.unlink(fileToWatch);
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

function reEmitEvent(name, child, stream) {
  child.on(name, function (){
    var message = JSON.stringify({action: 'event', name: name, args: [].slice.call(arguments)});
    stream.write(message + '\n')
  })
}
