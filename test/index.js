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

function fileCodec(inputFile, destinationFile, bz2C, t) {
  var input = fs.createReadStream(inputFile);
  const hash = crypto.createHash('md5');
  const compressedHash = crypto.createHash('md5');
  compressedHash.update(fs.readFileSync(destinationFile), 'binary');

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
}

module.exports = {
  compressSmallData: t => bz2Codec(4096, t),
  compressMediumData: t => bz2Codec(1024 * 1024, t),
  compressLargeData: t => bz2Codec(10* 1024 * 1024, t),
  compressFile: t => fileCodec('test/raw', 'test/compressed',
  	bz2.createCompressStream(debug), t),
  decompressFile: t => fileCodec('test/compressed', 'test/raw',
  	bz2.createDecompressStream(debug), t),
};
