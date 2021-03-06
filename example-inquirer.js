var Rcp         = require('./index.js')
var RcpServer   = Rcp.RcpServer;

var spawn       = Rcp.spawn;


var address = {host: '127.0.0.1', port: 8080};
var server = new RcpServer()

var env = {'FORCE_COLOR':1};

server.open(address, function () {
  console.log('\n-------------------------------------------------------\n');

  var child = spawn(process.argv[0], [__dirname + '/utils/inquirer.js'], {bridgeAddress: address, stdio: 'pipe', env: env});

  process.stdin.pipe(child.stdin);
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
    process.stdin.end();
  })

});
