
var pkg           = require('../package.json')
var debug         = require('debug')(pkg.name)
var util          = require('util');
var Emitter       = require('events');
var passThrough   = require('./pass-through.js')

var FakeChild = function (stdio) {
  var that = this;

  that.stdio = [];
  that.pid = null;
  that.kill = function () {
    throw 'not ready'
  }
  that.send = function () {
    throw 'not ready'
  }
  that.disconnect = function () {
    throw 'not ready'
  }



  if (stdio) {
    if (stdio==='pipe') {
      stdio = ['pipe', 'pipe', 'pipe']
    } else if (stdio==='ihnerit') {
      stdio = ['ihnerit', 'ihnerit', 'ihnerit']
    } else if (!stdio || stdio==='ignore') {
      stdio = []
    }

    if (stdio instanceof Array){
      var todos = [];
      stdio.forEach(function (type, index) {
        if (type==='pipe' ||(type===null || type===undefined && index<3)) {
          if (index===0) {
            that.stdin = passThrough()
            that.stdio.push(that.stdin);
          }
          if (index===1) {
            that.stdout = passThrough()
            that.stdio.push(that.stdout);
          }
          if (index===2) {
            that.stderr = passThrough()
            that.stdio.push(that.stderr);
          }
        } else if (typeof(type)==='object') {
          that.stdio.push(type);
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
}

util.inherits(FakeChild, Emitter);

module.exports = FakeChild;
