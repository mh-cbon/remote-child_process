
var Rcp         = require('./index.js')
var RcpServer   = Rcp.RcpServer;

var spawn       = Rcp.spawn;


var address = {host: '127.0.0.1', port: 8080};
var server = new RcpServer()

server.open(address, function () {

  var child = spawn(process.argv[0], [__dirname + '/utils/buggy.js'], {bridgeAddress: address, stdio: 'pipe'});
  child.stdin.on('error', function (err) {
    console.log('GOT ERROR %j', err)
    console.log('%s', err.stack)
  })
  child.stdin.write('some stuff');
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
    server.close();
  })
});
