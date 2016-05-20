'use strict';

const bzip2 = require('./build/Release/bzip2_addon.node');
const fs = require('fs');
var Stream = require('stream');

const DEFAULT_OUTPUT_BUFFER_SIZE = 8192;

function getTraceFunc(verbose) {
  if (!verbose) return () => {};
  console.log('Enable verbose ' + verbose);
  return log => {
    console.log(verbose + JSON.stringify(log));
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

function createDecompressStream(verbose, outputBufSize) {
  var trace = getTraceFunc(verbose ? '[DEC]' : verbose);
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

function createCompressStream(verbose, outputBufSize) {
  outputBufSize = outputBufSize || DEFAULT_OUTPUT_BUFFER_SIZE;
  var trace = getTraceFunc(verbose ? '[CO]' : verbose);
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

function bz2Codec(createStream, codec, closeStream, data, verbose, outputBufSize) {
  outputBufSize = outputBufSize || DEFAULT_OUTPUT_BUFFER_SIZE;
  var trace = getTraceFunc(verbose);
  var bz2Stream = createStream();
  var result = { in : data.length,
    out: outputBufSize
  };

  var compressed;
  while (result && !result.reachEnd && result.in > 0 && result.out > 0) {
    var output = Buffer.alloc(outputBufSize);
    result = codec(bz2Stream, data, output);
    data = data.slice(data.length - result.in);
    trace('++ Bytes available in input buffer is ' + data.length);
    trace('++ Bytes in output buffer is ' + result.out);
    trace('++ Is stream reaches end ? ' + !!result.reachEnd);
    if (result.out > 0) {
      trace('++ Try to push ' + result.out + ' bytes');
      if (compressed) {
        compressed = Buffer.concat([compressed, output.slice(0, result.out)]);
      } else {
        compressed = output.slice(0, result.out);
      }
    }
  }

  var output = closeStream(bz2Stream);
  if (output) {
    if (compressed) {
      compressed = Buffer.concat([compressed, output]);
    } else {
      compressed = output;
    }
  }

  return compressed;
}

function compressSync(data, verbose, outputBufSize) {
  outputBufSize = outputBufSize || DEFAULT_OUTPUT_BUFFER_SIZE;
  var trace = getTraceFunc(verbose ? '[CO]' : verbose);

  return bz2Codec(
    () => bzip2.compressInit(),
    (bz2Stream, data, output) => bzip2.compress(bz2Stream, data, output),
    bz2Stream => {
      var compressed;
      var result = { in : data.length,
        out: outputBufSize
      };
      while (result && !result.reachEnd && result.out > 0) {
        var output = Buffer.alloc(outputBufSize);
        result = bzip2.compressEnd(bz2Stream, output);
        trace('-- Bytes available in input buffer is ' + result.in);
        trace('-- Bytes in output buffer is ' + result.out);
        trace('-- Is stream reaches end ? ' + !!result.reachEnd);
        if (result.out > 0) {
          trace('-- Try to push ' + result.out + ' bytes');
          if (compressed) {
            compressed = Buffer.concat([compressed, output.slice(0, result.out)]);
          } else {
            compressed = output.slice(0, result.out);
          }
        }
      }

      return compressed;
    },
    data,
    verbose ? '[CO]' : verbose,
    outputBufSize
  );
}

function decompressSync(data, verbose, outputBufSize) {
  return bz2Codec(
    () => bzip2.decompressInit(),
    (bz2Stream, data, output) => bzip2.decompress(bz2Stream, data, output),
    bz2Stream => bzip2.decompressEnd(bz2Stream),
    data,
    verbose ? '[DEC]' : verbose,
    outputBufSize
  );
}

module.exports = {
  createCompressStream,
  createDecompressStream,
  compressSync,
  decompressSync,
};
