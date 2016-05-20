'use strict';

const bzip2 = require('./build/Release/bzip2_addon.node');
const fs = require('fs');
var Stream = require('stream');

const DEFAULT_OUTPUT_BUFFER_SIZE = 8192;

function getTraceFunc(debug) {
  if (!debug) return () => {};
  console.log('Enable verbose ' + debug);
  return log => {
    console.log(debug + JSON.stringify(log));
  };
}

class Bz2Stream extends Stream.Transform {
  constructor(onCreateStream, onTransform, onFlush, outputBufSize, trace) {
    super();
    this.bz2Stream = onCreateStream();
    this.onTransform = onTransform;
    this.onFlush = onFlush;
    this.outputBufSize = outputBufSize;
    this.trace = trace;
  }

  _transform(chunk, encoding, callback) {
    if (this.readBuf) {
      this.readBuf = Buffer.concat(
        [this.readBuf, chunk]
      );
    } else {
      this.readBuf = chunk;
    }

    this.trace('+ Bytes of input chunk is ' + chunk.length);
    this.trace('+ Bytes of whole input buffer is ' + this.readBuf.length);

    var result = { in : this.readBuf.length,
      out: this.outputBufSize
    };

    while (result && !result.reachEnd && result.in > 0 && result.out > 0) {
      var output = Buffer.alloc(this.outputBufSize);
      result = this.onTransform(this.bz2Stream, this.readBuf, output);
      this.readBuf = this.readBuf.slice(this.readBuf.length - result.in);
      this.trace('++ Bytes available in input buffer is ' + this.readBuf.length);
      this.trace('++ Bytes in output buffer is ' + result.out);
      this.trace('++ Is stream reaches end ? ' + !!result.reachEnd);
      if (result.out > 0) {
        this.trace('++ Try to push ' + result.out + ' bytes');
        if (!this.push(output.slice(0, result.out))) {
          this.trace('++ Output queue is full, cant push anymore');
          break;
        }
      }
    }

    this.trace('+ Transform Done');
    callback();
  }

  _flush(callback) {
    this.trace('- Flushing');
    this.onFlush(this.bz2Stream, buf => this.push(buf), callback);
  }
}

function createDecompressStream(debug, outputBufSize) {
  var trace = getTraceFunc(debug ? '[DEC]' : debug);
  return new Bz2Stream(
    () => bzip2.decompressInit(),
    (stream, input, output) => bzip2.decompress(stream, input, output),
    (stream, pushCB, cb) => {
      bzip2.decompressEnd(stream);
      cb();
    },
    outputBufSize || DEFAULT_OUTPUT_BUFFER_SIZE,
    trace
  );
}

function createCompressStream(debug, outputBufSize) {
  outputBufSize = outputBufSize || DEFAULT_OUTPUT_BUFFER_SIZE;
  var trace = getTraceFunc(debug ? '[DEC]' : debug);
  return new Bz2Stream(
    () => bzip2.compressInit(),
    (stream, input, output) => bzip2.compress(stream, input, output),
    (stream, pushCB, cb) => {
      var result = {
        out: outputBufSize
      };

      while (result && !result.reachEnd && result.out > 0) {
        var output = Buffer.alloc(outputBufSize);
        result = bzip2.compressEnd(stream, output);
        trace('-- Bytes available in input buffer is ' + result.in);
        trace('-- Bytes in output buffer is ' + result.out);
        trace('-- Is stream reaches end ? ' + !!result.reachEnd);
        if (result.out > 0) {
          trace('-- Try to push ' + result.out + ' bytes');
          if (!pushCB(output.slice(0, result.out))) {
            trace('-- Output queue is full, cant push anymore');
          }
        }
      }

      cb();
    },
    outputBufSize,
    trace
  );
}

function createFileReadStream(path, debug, outputBufSize) {
  return fs.createReadStream(path).pipe(
    createDecompressStream(debug, outputBufSize)
  );
}

function createFileWriteStream(path, debug, outputBufSize) {
  return createCompressStream(debug, outputBufSize).pipe(
    fs.createWriteStream(path)
  );
}

module.exports = {
  createCompressStream,
  createDecompressStream,
  createFileReadStream,
  createFileWriteStream

};
