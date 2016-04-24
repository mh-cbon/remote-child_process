
var pkg     = require('../package.json')
var debug   = require('debug')(pkg.name)
var streams = require('stream');

function jsonParse() {
  var stream = new streams.Transform({
    readableObjectMode: true,
    transform: function(chunk, encoding, next) {
      chunk = chunk.toString();
      if (chunk) {
        var err;
        var parsed;
        try{
          parsed = JSON.parse(chunk);
        }catch(ex){
          debug('jsonParse.transform failed data=%j', chunk);
          err = ex;
          this.emit('error', ex)
        }
        !err && this.push(parsed);
      }
      next();
    },
    flush: function(done) {
      done();
    }
  })
  return stream;
}

module.exports = jsonParse;
