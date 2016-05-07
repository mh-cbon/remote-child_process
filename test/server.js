require('should')

var fs          = require('fs');
var net         = require('net');
var Rcp         = require('../index.js')
var RcpServer   = Rcp.RcpServer;

var spawn       = Rcp.spawn;
var exec        = Rcp.exec;

describe('remote-child_process - server', function () {
  var address = {host: '127.0.0.1', port: 8080};
  it('should start-stop the server properly', function (done) {
    var server = new RcpServer()
    server.open(address, function () {
      server.close(!true);
    });
    server.on('close', function () {
      done();
    })
  })
  it('should stop the server when a close message is sent', function (done) {
    var server = new RcpServer()
    server.open(address, function () {
      var client = net.createConnection({port: 8080}, () => {
        client.end(JSON.stringify({
          type: 'close',
          force: true
        }));
      });
    });
    server.on('close', function () {
      done();
    })
  })
  it('should stop the server when a file is wrote', function (done) {
    this.timeout(5000);
    var fPath = __dirname + '/var/token'
    var token = 'thetoken'
    var server = new RcpServer()
    server.open(address, function () {
      fs.writeFileSync(fPath, token)
    });
    server.enableFileToQuit(fPath, token)
    server.on('close', function () {
      fs.existsSync(fPath).should.eql(false);
      done();
    })
  })
  before(function (done){
    fs.mkdir(__dirname + '/var', function () {
      done()
    });
  })
  after(function (done) {
    fs.unlink(__dirname + '/var/token', function (){
      done();
    })
  })
})
