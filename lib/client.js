
var pkg           = require('../package.json')
var debug         = require('debug')(pkg.name)
var util          = require('util');
var net           = require('net');
var async         = require('async');
var streams       = require('stream');
var split         = require('split');
var Emitter       = require('events');
var spawn         = require('child_process').spawn;
var exec          = require('child_process').exec;
var jsonParse     = require('./json-parse.js')
var passThrough   = require('./pass-through.js')


var RcpClient = function () {

  var that = this;

  var id;
  var main;
  var controlout;
  var controlin;

  that.open = function (address, then) {
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

    address = runOpts.address;

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
                stream.on('end', function () {
                  child.stdin.end()
                })
                child.stdin.on('end', function () {
                  stream.end()
                })
              })
            }
            if (index===1) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stdout', 'read', next);
                stream.pipe(child.stdout)
              })
            }
            if (index===2) {
              todos.push(function (next) {
                var stream = openStream (address, id, 'stderr', 'read', next)
                stream.pipe(child.stderr)
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

    child.stdio.forEach(function (stream) {
      stream.pause();
    })

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

      child.kill = remoteMethodInvoke(child, 'kill', controlin);

      var k = split();
      var l = jsonParse();
      l.on('error', function (err) {
        child.emit('error', err)
      })
      closeEventArgs = [];
      controlout.pipe(k).pipe(l).on('data', function (d) {
        if (d.action==='event') {
          if (d.name!=='close') { // special treatment for close event.
            d.args.unshift(d.name);
            child.emit.apply(child, d.args);
          } else {
            closeEventArgs = d.args;
          }
        } else if (d.action==='set') {
          child[d.name] = d.value;
          if (d.name==='pid') child.emit('started')
        }
      })

      !err && that.emit('ready', err);
    });

    // close event, it must be carefully sent AFTER all streams are closed
    var closed = [];
    child.stdio.forEach(function (s, k) {
      closed.push(function (next) {
        s.on('end', next)
      })
    })
    async.parallel(closed, function () {
      closeEventArgs.unshift('close');
      child.emit.apply(child, closeEventArgs);
    })

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
  var stream = passThrough()
  stream.on('end', function () {
    debug('RcpClient.stream end %s', type)
  })
  stream.on('data', function () {})
  var client = net.connect(address, () => {
    client.write(JSON.stringify({type: type, direction: direction, id: id}) + '\n');
    var k = split();
    var l = jsonParse();
    l.on('error', function (err) {
      stream.emit('error', err)
    })
    client.on('data', function (d) {
      debug('RcpClient.client.data %s %j', type, d.toString())
    })
    client.pipe(k).pipe(l)
      .once('data', function (d) {
        client.unpipe(k);
        client.unpipe(l);
        if (direction==='read') {
          client.pipe(stream);
        } else if (direction==='write') {
          stream.on('data', function (d) {
            client.write(d);
          })
        }
        then && then();
      })
  });
  stream.on('end', function () {
    debug('RcpClient.stream end %s', type)
    client.end()
  })
  client.on('end', function () {
    debug('RcpClient.client end %s', type)
    stream.end()
  })
  client.on('error', function (err) {
    debug('RcpClient.client err %j', err)
    stream.emit('error', err)
  });
  return stream;
}
