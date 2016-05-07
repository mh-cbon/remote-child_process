
var pkg           = require('../package.json')
var debug         = require('debug')(pkg.name)
var util          = require('util');
var net           = require('net');
var async         = require('async');
var streams       = require('stream');
var split         = require('split');
var Emitter       = require('events');
var through2      = require('through2');
var pumpify       = require('pumpify');
var spawn         = require('child_process').spawn;
var exec          = require('child_process').exec;
var jsonParse     = require('./json-parse.js')


var RcpClient = function () {

  var that = this;

  var serverAddress;
  var id;
  var main;
  var controlout;
  var controlin;

  that.open = function (address, then) {
    serverAddress = address;
    debug('RcpClient open %j', address)
    var socket = net.connect(address, () => {
      socket.setNoDelay();
      socket.write(JSON.stringify({type: 'main'}) + '\n');
      socket.pipe(split()).pipe(jsonParse())
      .once('data', function (d) {
        debug('RcpClient.main data %j', d)
        socket.removeListener('end', then)
        main = socket;
        id = d.id;
        then && then();
        then = null;
      })
      socket.on('end', function () {
        debug('RcpClient.main end')
        then && then();
      })
    });
    socket.on('error', then)
    socket.on('error', function (err) {
      debug('RcpClient.main err %j', err)
    })
  }

  that.runRemote = function (child, runOpts, options) {
    if(!main) throw 'not connected';

    debug('RcpClient.runRemote runOpts %j', runOpts)
    debug('RcpClient.runRemote options %j', options)

    address = serverAddress;

    var todos = [];

    if (options.stdio) {
      if (options.stdio==='pipe') {
        options.stdio = ['pipe', 'pipe', 'pipe']
      } else if (options.stdio==='ihnerit') {
        options.stdio = ['ihnerit', 'ihnerit', 'ihnerit']
      } else if (!options.stdio || options.stdio==='ignore') {
        options.stdio = []
      }

      if (options.stdio instanceof Array){
        options.stdio.forEach(function (type, index) {
          if (type==='pipe' || (type===null || type===undefined && index<3)) {
            if (index===0) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stdin', 'write', next);
                child.stdin.on('data', function (d) {
                  stream.write(d);
                })
                stream.once('end', function () {
                  child.stdin.end()
                })
                child.stdin.once('end', function () {
                  stream.end()
                })
              })
            }
            if (index===1) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stdout', 'read', next);
                pumpify(stream, child.stdout);
              })
            }
            if (index===2) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stderr', 'read', next)
                pumpify(stream, child.stderr);
              })
            }
          } else if (type==='ihnerit') {
            if (index===0) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stdin', 'write', next)
                process.stdin.pipe(stream);
              })
            } else if (index===1) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stdout', 'read', next)
                stream.pipe(process.stdout);
              })
            } else if (index===2) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stderr', 'read', next)
                stream.pipe(process.stderr);
              })
            }
          } else if (typeof(type)==='object') {
            if (index===0) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stdin', 'write', next)
                type.pipe(stream);
              })
            } else if (index===1) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stdout', 'read', next)
                stream.pipe(type);
              })
            } else if (index===2) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stderr', 'read', next)
                stream.pipe(type);
              })
            } else {
              todos.push(function (next) {
                // maybe it should behave given the type of the stream - writable / readable / duplex etc
                var stream = openStream (address, id, index, 'read', next)
                stream.pipe(type);
              })
            }
          } else if (typeof(type)==='number') {
            throw 'not implemented';
            /* see
            Positive integer - The integer value is interpreted as
            a file descriptor that is is currently open in the parent process.
            It is shared with the child process,
            similar to how Stream objects can be shared.
            */
          }
        })
      }
    }

    todos.push(function(next){
      controlout = openStream (address, id, 'controlout', 'read', next)
      controlout.pause();
    })
    todos.push(function(next){
      controlin = openStream (address, id, 'controlin', 'write', next)
      controlin.pause();
    })
    async.parallel(todos, function (err) {
      err && that.emit('error', err);

      remoteMethodInvoke(child, 'kill', controlin);

      var k = split();
      var l = jsonParse();
      l.on('error', function (err) {
        child.emit('error', err)
      })
      var controloutStream = controlout.pipe(k).pipe(l);
      controloutStream.on('data', function (d) {
        if (d.about==="child") {
          if (d.action==='event') {
            if (d.name!=='close') { // special treatment for close event.
              d.args.unshift(d.name);
              child.emit.apply(child, d.args);
            }
          } else if (d.action==='set') {
            child[d.name] = d.value;
            if (d.name==='pid') child.emit('started')
          }
        } else if (child.stdio[d.about] && d.action==='event'){
          if (d.name==='error') {
            var err = new Error(d.args[0].message);
            err.code = d.args[0].code;
            err.errno = d.args[0].errno;
            err.syscall = d.args[0].syscall;
            err.stack = d.args[0].stack;
            child.stdio[d.about].emit('error', err);
          } else {
            d.args.unshift(d.name);
            child.stdio[d.about].emit.apply(child.stdio[d.about], d.args);
          }
        }
      })

      // close event,
      // it must be carefully sent AFTER all streams are closed
      // after close event was received
      var closed = [];
      child.stdio.forEach(function (s, k) {
        closed.push(function (next) {
          s.once('end', next)
        })
      })
      closeEventArgs = [];
      closed.push(function (next) {
        controloutStream.on('data', function (d) {
          if (d.action==='event' && d.name==='close') {
            closeEventArgs = d.args;
            next();
          }
        })
      })
      async.parallel(closed, function () {
        closeEventArgs.unshift('close');
        child.emit.apply(child, closeEventArgs);
      })

      !err && that.emit('ready', err);
    });


    that.once('ready', function () {
      main.write(JSON.stringify({
        id:       id,
        runOpts:  runOpts,
        options:  options
      }) + '\n');
      child.stdio.forEach(function (stream) {
        stream.resume();
      });
      controlout.resume();
      controlin.resume();
    })

    return child;
  }

}

util.inherits(RcpClient, Emitter);

module.exports = RcpClient;

function remoteMethodInvoke (child, method, stream) {
  child[method] = function () {
    stream.write(JSON.stringify({
      action: 'method',
      name: method,
      args: [].slice.call(arguments)
    }) + '\n')
  }
}

function openStream (address, id, type, direction, then) {
  var stream = through2()
  var client = net.connect(address, () => {
    client.write(JSON.stringify({type: type, direction: direction, id: id}) + '\n');
    client.on('data', function (d) {
      debug('RcpClient.client.data %s %j', type, d.toString())
    })
    var p = pumpify.obj(split(), jsonParse())
    client.pipe(p)
      .once('data', function (d) {
        client.unpipe(p);
        if (direction==='read') {
          pumpify(client, stream);
        } else if (direction==='write') {
          pumpify(stream, client);
          client.on('end', function () {
            stream.resume().end()
          })
          stream.on('end', function () {
            client.resume().end()
          })
        }
        client.on('end', function () {
          debug("RcpClient.socket.end %s %s %s", id, type, direction)
        })
        stream.on('end', function () {
          debug("RcpClient.stream.end %s %s %s", id, type, direction)
        })
        then && then();
      })
  });
  return stream;
}
