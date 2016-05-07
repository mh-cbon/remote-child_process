require('should')

var Rcp         = require('../index.js')
var RcpServer   = Rcp.RcpServer;

var spawn       = Rcp.spawn;
var exec        = Rcp.exec;

var useLocal = !!process.env['LOCAL'];
if(useLocal) {
  console.error("USING node api")
  spawn = require('child_process').spawn;
}

describe('remote-child_process - api', function () {
  var address = {host: '127.0.0.1', port: 8080};
  var server = new RcpServer()
  before(function (done) {
    server.open(address, done);
  })
  after(function (done) {
    server.close(!true);
    done();
  })
  it('emit child.started only once', function (done) {
    // this is specific to a remote cp
    if (useLocal) return done();
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.on('started', done)
  })
  it('emit sets the pid', function (done) {
    // this is specific to a remote cp
    if (useLocal) return done();
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.on('started', function (){
      child.pid.toString().should.match(/[0-9]+/);
      done()
    })
  })
  it('emit child.close only once', function (done) {
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.on('close', done)
  })
  it('emit child.exit only once', function (done) {
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.on('close', done)
  })
  it('emit child.stdout.end only once', function (done) {
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.stdout.on('end', done)
  })
  it('emit child.stderr.end only once', function (done) {
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.stderr.on('end', done)
  })
  it('emit child.stdin.end only once', function (done) {
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.stdin.on('end', done)
  })
  it('should emit child.close when the child errored', function (done) {
    var child = spawn('nop', ['-c'], {bridgeAddress: address, stdio: 'pipe'});
    var err;
    child.on('error', function (e) { /* void */})
    child.on('close', function () {
      done();
    })
  })
  it('should not emit child.exit when the child errored', function (done) {
    var child = spawn('nop', ['-c'], {bridgeAddress: address, stdio: 'pipe'});
    var err;
    child.on('error', function (e) { /* void */})
    child.on('exit', function () {
      done('must not emit exit !!');
    })
    child.on('close', function () {
      done();
    })
  })
  it('should display stdout content', function (done) {
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    var data = '';
    child.stdout.on('data', function (d) {
      data += d.toString();
    })
    child.on('close', function () {
      data.match(/example-buggy/).length.should.eql(1)
      done();
    })
  })
  it('should emit stdin.error when stdin is not available and is writen', function (done) {
    var child = spawn('ls', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.stdin.write('end')
    child.stdin.on('error', function (err) {
      done();
    })
  })
  it('should display stderr content', function (done) {
    var child = spawn('sh', ['-c', 'echo "some" 1>&2'], {bridgeAddress: address, stdio: 'pipe'});
    var data = '';
    child.stderr.on('data', function (d) {
      data += d.toString();
    })
    child.on('close', function () {
      data.match(/some/).length.should.eql(1)
      done();
    })
  })
  it('should emit child error', function (done) {
    var child = spawn('nop', ['-c'], {bridgeAddress: address, stdio: 'pipe'});
    var err;
    child.on('error', function (e) {
      err = e;
    })
    child.on('close', function () {
      (err!==undefined).should.eql(true);
      done();
    })
  })
  it('should not emit error on stdin because it was written and the child errored', function (done) {
    var child = spawn('nop', ['-al'], {bridgeAddress: address, stdio: 'pipe'});
    child.stdin.write('end')
    child.on('error', function (err) {/* it will obviously throw an error, so we should catch and void it */})
    child.stdin.on('error', function (err) {
      done(err);
    });
    child.on('close', function () {
      done();
    })
  })
  it('should write to stdin correctly', function (done) {
    var child = spawn(process.argv[0], [__dirname + '/../utils/stdin.js'], {bridgeAddress: address, stdio: 'pipe'});
    var stderr = '';
    child.stderr.on('data', function (d) {
      stderr += d.toString();
    })
    var stdout = '';
    child.stdout.on('data', function (d) {
      stdout += d.toString();
    })
    child.on('close', function () {
      stdout.should.eql('stdout what ever')
      stderr.should.eql('stderr what ever')
      done();
    })
    child.stdin.end('what ever');
  })
  it('should end because the remote did end', function (done) {
    var child = spawn(process.argv[0], [__dirname + '/../utils/stdin.js'], {bridgeAddress: address, stdio: 'pipe'});
    var stderr = '';
    child.stderr.on('data', function (d) {
      stderr += d.toString();
    })
    var stdout = '';
    child.stdout.on('data', function (d) {
      stdout += d.toString();
    })
    child.on('close', function () {
      stdout.should.eql('stdout what ever')
      stderr.should.eql('stderr what ever')
      done();
    })
    child.stdin.write('what ever');
  })
  it('should end because end was called on all pipe', function (done) {
    var child = spawn(process.argv[0], [__dirname + '/../utils/stdin0.js'], {bridgeAddress: address, stdio: 'pipe'});
    var stderr = '';
    child.stderr.on('data', function (d) {
      stderr += d.toString();
    })
    var stdout = '';
    child.stdout.on('data', function (d) {
      stdout += d.toString();
    })
    child.on('close', function () {
      stdout.should.eql('stdout what ever\n')
      stderr.should.eql('stderr what ever\n')
      done();
    })
    child.stdin.end('what ever');
  })
})
