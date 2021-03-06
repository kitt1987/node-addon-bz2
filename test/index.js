'use strict';

// import {
// 	CompressStream,
// 	DecompressStream
// } from '..';

const bz2 = require('..');
const stream = require('stream');
const fs = require('fs');
const crypto = require('crypto');
const verbose = false;

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
  var bz2C = bz2.createCompressStream(verbose);
  var bz2D = bz2.createDecompressStream(verbose);
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

function codecSync(dataSize, t) {
	const raw = Buffer.alloc(dataSize);
	var compressed = bz2.compressSync(raw, verbose);
	var decompressed = bz2.decompressSync(compressed, verbose);
	t.eq(decompressed.compare(raw), 0);
	t.done();
}

module.exports = {
  compressSmallData: t => bz2Codec(4096, t),
  compressMediumData: t => bz2Codec(1024 * 1024, t),
  compressLargeData: t => bz2Codec(10 * 1024 * 1024, t),
  compressFile: t => fileCodec('test/raw', 'test/compressed',
  	bz2.createCompressStream(verbose), t),
  decompressFile: t => fileCodec('test/compressed', 'test/raw',
  	bz2.createDecompressStream(verbose), t),
  compressSmallDataSync: t => codecSync(4096, t),
  compressMediumDataSync: t => codecSync(1024 * 1024, t),
  compressLargeDataSync: t => codecSync(10 * 1024 * 1024, t),
};
