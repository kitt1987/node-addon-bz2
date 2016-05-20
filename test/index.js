'use strict';

// import {
// 	CompressStream,
// 	DecompressStream
// } from '..';

const bz2 = require('..');
const stream = require('stream');
const fs = require('fs');
const crypto = require('crypto');
const debug = false;

function bz2Codec(dataSize, t) {
  const data = Buffer.alloc(dataSize);
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
  var bz2C = bz2.createCompressStream(debug);
  var bz2D = bz2.createDecompressStream(debug);
  bz2C.pipe(bz2D).pipe(writable);
  bz2C.end(data);
}

module.exports = {
  // compressSmallData: t => bz2Codec(4096, t),
  // compressMediumData: t => bz2Codec(1024 * 1024, t),
  // compressLargeData: t => bz2Codec(10* 1024 * 1024, t),
  compressFile: t => {
    var input = fs.createReadStream('test/raw');
    var bz2C = bz2.createCompressStream(debug);
    const hash = crypto.createHash('md5');
    const compressedHash = crypto.createHash('md5');
		compressedHash.update(fs.readFileSync('test/compressed'), 'binary');

    var writable = new stream.Writable({
      write: (chunk, encoding, next) => {
        hash.update(chunk, 'binary');
        next()
      }
    });

    writable.on('finish', () => {
      t.eq(hash.digest('hex'), compressedHash.digest('hex'));
      t.done();
    });

    input.pipe(bz2C).pipe(writable);
    // var output = fs.createWriteStream('test/compressed');
    // output.on('close', () => setTimeout(() => t.done(), 5000));
    // input.pipe(bz2C).pipe(output);
  }
};
