var async       = require('async');
var Rcp         = require('./index.js')
var RcpServer   = Rcp.RcpServer;

var spawn       = Rcp.spawn;
var exec        = Rcp.exec;


var address = {host: '127.0.0.1', port: 8080};
var server = new RcpServer()

server.open(address, function () {
  async.series([
    function (next) {
      console.log('\n-------------------------------------------------------\n');

      var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});

      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);

      child.on('started', function () {
        console.log('started');
        console.log("pid=%s", child.pid);
      })

      child.on('error', function (err) {
        console.log(err);
      })

      child.on('exit', function () {
        console.log("exited");
        console.log(arguments);
      })

      child.on('close', function () {
        console.log("closed");
        console.log(arguments);
        next()
      })
    },
    function (next) {
      console.log('\n-------------------------------------------------------\n');

      var child = spawn('nop', ['-al'], {bridgeAddress: address, stdio: 'pipe'});

      child.stdin.on('error', function () {});
      child.stdout.on('error', function () {});
      child.stderr.on('error', function () {});
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);

      child.on('started', function () {
        console.log('started');
        console.log("pid=%s", child.pid);
      })

      child.on('error', function (err) {
        // console.log(err);
      })

      child.on('exit', function () {
        console.log("exited");
        console.log(arguments);
      })

      child.on('close', function () {
        console.log("closed");
        console.log(arguments);
        next()
      })
    },
    function (next) {
      console.log('\n-------------------------------------------------------\n');

      var child = spawn(process.argv[0], [__dirname + '/utils/stdin.js'], {bridgeAddress: address, stdio: 'pipe'});

      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
      child.stdin.write('what ever');

      child.on('started', function () {
        console.log('started');
        console.log("pid=%s", child.pid);
      })

      child.on('error', function (err) {
        console.log(err);
      })

      child.on('exit', function () {
        console.log("exited");
        console.log(arguments);
      })

      child.on('close', function () {
        console.log("closed");
        console.log(arguments);
        next()
      })
    },
    function (next) {
      console.log('\n-------------------------------------------------------\n');

      var child = spawn(process.argv[0], [__dirname + '/utils/stdin0.js'], {bridgeAddress: address, stdio: 'pipe'});

      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
      child.stdin.end('what ever');

      child.on('started', function () {
        console.log('started');
        console.log("pid=%s", child.pid);
      })

      child.on('error', function (err) {
        console.log(err);
      })

      child.on('exit', function () {
        console.log("exited");
        console.log(arguments);
      })

      child.on('close', function () {
        console.log("closed");
        console.log(arguments);
        next()
      })
    },
    function (next) {
      console.log('\n-------------------------------------------------------\n');

      var child = spawn(process.argv[0], [__dirname + '/utils/stdin0.js'], {bridgeAddress: {port:5656}, stdio: 'pipe'});

      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
      child.stdin.write('what ever');
      child.stdin.end();

      child.on('started', function () {
        console.log('started');
        console.log("pid=%s", child.pid);
      })

      child.on('error', function (err) {
        console.log(err);
      })

      child.on('exit', function () {
        console.log("exited");
        console.log(arguments);
      })

      child.on('close', function () {
        console.log("closed");
        console.log(arguments);
        next()
      })
    },
    function (next) {
      console.log('\n-------------------------------------------------------\n');

      var child = exec('ls -al', {bridgeAddress: address}, function (error, stdout, stderr) {
        console.log("exec end")
        console.log("error=%s", error);
        console.log("stdout=%s", stdout);
        console.log("stderr=%s", stderr);
      });

      child.on('started', function () {
        console.log('started');
        console.log("pid=%s", child.pid);
      })

      child.on('error', function (err) {
        console.log(err);
      })

      child.on('exit', function () {
        console.log("exited");
        console.log(arguments);
      })

      child.on('close', function () {
        console.log("closed");
        console.log(arguments);
        next()
      })
    }
  ], function () {
    server.close(!true);
  })
})

var tout = setTimeout(function () {
  throw 'no client connected yet'
}, 1500)

server.on('client_connected', function () {
  clearTimeout(tout)
})
