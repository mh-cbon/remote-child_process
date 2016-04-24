# Remote-Child_process

Spawn a child_process on a remote via a server almost like a normal child_process.

# Install

```sh
npm i @mh-cbon/Remote-Child_process --save
```

# Usage

__spawn__

```js
var Rcp         = require('@mh-cbon/remote-child_process')
var RcpServer   = Rcp.RcpServer;

var spawn       = Rcp.spawn;


var address = {host: '127.0.0.1', port: 8080};
var server = new RcpServer()

server.open(address, function () {
  var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  // child.stdin.end('some data');

  child.on('error', function (err) {
    console.log(err); // it may also throw ECONNREFUSED
  })

  child.on('started', function (err) {
    console.log("pid=%s", child.pid);
  })

  child.on('exit', function (err) {
    console.log("exited");
  })
  child.on('close', function () {
    console.log("closed")
    server.close(force=!true);
  })
})

var tout = setTimeout(function () {
  throw 'no client connected yet'
}, 1500)

server.on('client_connected', function () {
  clearTimeout(tout)
})

```

__exec__

```js
var Rcp         = require('@mh-cbon/remote-child_process')
var RcpServer   = Rcp.RcpServer;

var exec        = Rcp.exec;


var address = {host: '127.0.0.1', port: 8080};
var server = new RcpServer()

server.open(address, function () {
  var opts = {bridgeAddress: address};
  var child = exec('ls -al', opts, function (err, stdout, stderr) {
    console.log("exec end")
    console.log("error=%s", error);
    console.log("stdout=%s", stdout);
    console.log("stderr=%s", stderr);
  });

  child.on('error', function (err) {
    console.log(err); // it may also throw ECONNREFUSED
  })

  child.on('started', function (err) {
    console.log("pid=%s", child.pid);
  })

  child.on('exit', function (err) {
    console.log("exited");
  })
  child.on('close', function () {
    console.log("closed")
    server.close(force=!true);
  })
})

var tout = setTimeout(function () {
  throw 'no client connected yet'
}, 1500)

server.on('client_connected', function () {
  clearTimeout(tout)
})

```

- `pid` and `methods call` are available after `started` event has emit
- on network failure, it throw error on the child
- the remote process is __not__ running a TTY, so it may be a bit different
- `cwd` is always forwarded and set appropriately

# Why

It is used to spawn process on windows with elevated privileges, see [here](https://github.com/mh-cbon/aghfabsowecwn)

# Todos

- write tests
