'use strict';

// import {
// 	CompressStream,
// 	DecompressStream
// } from '..';

const bz2 = require('..');
const stream = require('stream');
const crypto = require('crypto');

function bz2Codec(dataSize, t) {
  const data = crypto.randomBytes(dataSize);
  var output;
  var writable = new stream.Writable({
    write: function(chunk, encoding, next) {
    	if (output) output = Buffer.concat([output, chunk]);
    	else output = chunk;
      next()
    }
  });
  writable.on('finish', () => {
  	t.eq(output.compare(data), 0);
    t.done();
  });
  var bz2C = new bz2.createCompressStream();
  var bz2D = new bz2.createDecompressStream();
  bz2C.pipe(bz2D).pipe(writable);
  bz2C.end(data);
}

module.exports = {
  compressSmallData: t => bz2Codec(4096, t),
  compressMediumData: t => bz2Codec(1024 * 1024, t),
  // compressLargeData: t => bz2Codec(1024* 1024 * 1024, t),
};
