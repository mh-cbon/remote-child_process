
var streams = require('stream');

function passThrough (opts) {
  opts = opts || {}
  var o = {
    transform: function(chunk, encoding, next) {
      this.push(chunk)
      next();
    },
    flush: function(done) {
      done();
    }
  };
  if (opts.writableObjectMode) o .writableObjectMode = true;
  if (opts.readableObjectMode) o .readableObjectMode = true;
  if (opts.objectMode) o .objectMode = true;
  var stream = new streams.Transform(o)
  return stream;
}

module.exports = passThrough;
