'use strict';

const bzip2 = require('./build/Release/bzip2_addon.node');
const fs = require('fs');
var Stream = require('stream');

class DecompressStream extends Stream.Transform {
  constructor() {
    super();
    this.bz2Stream = bzip2.decompressInit();
  }

  _transform(chunk, encoding, callback) {
    if (this.readBuf) {
      this.readBuf = Buffer.concat(
        [this.readBuf, chunk]
      );
    } else {
      this.readBuf = chunk;
    }

    const outputBufSize = 8192;
    var result = {
      in: this.readBuf.length,
      out: outputBufSize
    };

    while (result && !result.reachEnd && result.in > 0 && result.out > 0) {
      var output = Buffer.alloc(outputBufSize);
      result = bzip2.decompress(this.bz2Stream, this.readBuf, output);
      this.readBuf = this.readBuf.slice(this.readBuf.length - result.in);
      if (result.out > 0) {
        if (!this.push(output.slice(0, result.out))) {
          break;
        }
      }
    }

    callback();
  }

  _flush(callback) {
    bzip2.decompressEnd(this.bz2Stream);
    callback();
  }
}

class CompressStream extends Stream.Transform {
  constructor() {
    super();
    this.bz2Stream = bzip2.compressInit();
  }

  _transform(chunk, encoding, callback) {
    if (this.readBuf) {
      this.readBuf = Buffer.concat(
        [this.readBuf, chunk]
      );
    } else {
      this.readBuf = chunk;
    }

    const outputBufSize = 8192;
    var result = {
      in: this.readBuf.length,
      out: outputBufSize
    };

    while (result && !result.reachEnd && result.in > 0 && result.out > 0) {
      var output = Buffer.alloc(outputBufSize);
      result = bzip2.compress(this.bz2Stream, this.readBuf, output);
      this.readBuf = this.readBuf.slice(this.readBuf.length - result.in);
      if (result.out > 0) {
        if (!this.push(output.slice(0, result.out))) {
          break;
        }
      }
    }

    callback();
  }

  _flush(callback) {
    const outputBufSize = 8192;
    var result = {
      out: outputBufSize
    };

    while (result && !result.reachEnd && result.out > 0) {
      var output = Buffer.alloc(outputBufSize);
      result = bzip2.compressEnd(this.bz2Stream, output);
      this.readBuf = this.readBuf.slice(this.readBuf.length - result.in);
      if (result.out > 0) {
        if (!this.push(output.slice(0, result.out))) {
          break;
        }
      }
    }

    callback();
  }

}

class Bz2FileReadStream extends Stream.Readable {
  constructor(path) {
    super();
    this.path = path;
    this._openBzip();
    this.reachEnd = false;
  }

  _openBzip() {
    this.bz2Stream = bzip2.decompressInit();
    this.fd = fs.openSync(this.path, 'r');
    if (this.fd < 0) throw new Error('Cant open file ' + path);
  }

  _closeBzip() {
    bzip2.decompressEnd(this.bz2Stream);
    fs.closeSync(this.fd);
    this.bz2Stream = null;
    this.fd = null;
  }

  _read(size) {
    if (this.bz2Stream === null || this.fd === null) {
      this.push(null);
      return;
    }

    if (!this.reachEnd) {
      var readBuf = Buffer.alloc(size);
      var bytesRead = fs.readSync(this.fd, readBuf, 0, size);
      if (bytesRead === 0) {
        this.reachEnd = true;
      } else {
        if (this.readBuf) {
          this.readBuf = Buffer.concat(
            [this.readBuf, readBuf.slice(0, bytesRead)]
          );
        } else {
          this.readBuf = readBuf.slice(0, bytesRead);
        }
      }
    }

    var outputBuf = Buffer.alloc(size);
    var result = bzip2.decompress(this.bz2Stream, this.readBuf, outputBuf);
    if (result.in === 0 && this.reachEnd) this._closeBzip();

    this.readBuf = this.readBuf.slice(this.readBuf.length - result.in);
    this.push(outputBuf.slice(0, result.out))
  }

  resume() {
    this._openBzip();
    super.resume();
  }
}

class Bz2FileWriteStream extends Stream.Writable {
  constructor(path) {
    super();
    this.bz2Stream = bzip2.compressInit();
    this.fd = fs.openSync(path, 'w');
    if (this.fd < 0) throw new Error('Cant open file ' + path);
  }

  _writeCB(buf) {
    var result = fs.writeSync(this.fd, buf, 0, buf.length);
    if (result !== buf.length) throw new Error('Fail to write file ' + path +
      ' cause ' + result + ' vs. ' + buf.length);
  }

  _write(chunk, encoding, callback) {
    var bufs = bzip2.compress(this.bz2Stream, chunk);
    bufs.map(buf => this._writeCB(buf));
    callback();
  }

  _writev(chunks, callback) {
    chunks.map(chunk =>
      bzip2.compress(this.bz2Stream, chunk).map(buf => this._writeCB(buf))
    );
    callback();
  }

  end(chunk, encoding, callback) {
    super.end(chunk, encoding, err => {
      if (err) {
        if (callback) callback(err);
        return;
      }

      bzip2.compressEnd(this.bz2Stream).map(buf => this._writeCB(buf));
      fs.closeSync(this.fd);
      if (callback) callback(err);
    });
  }
}

function createCompressStream(path) {
  return new Bz2FileWriteStream(path);
}

function createDecompressStream(path) {
  return new Bz2FileReadStream(path);
}

module.exports = {
  createCompressStream,
  createDecompressStream,
  DecompressStream,
  CompressStream
};
