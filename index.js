'use strict';

const bzip2 = require('./build/Release/bzip2_addon.node');
const fs = require('fs');
var Stream = require('stream');

class Bz2ReadStream extends Stream.Readable {
  constructor(path) {
    super();
    this.path = path;
    this._openBzip();
    this.pendingBuf = null;
  }

  _openBzip() {
    this.bz2Stream = bzip2.decompressInit();
    this.fd = fs.openSync(this.path, 'r');
    if (this.fd < 0) throw new Error('Cant open file ' + path);
  }

  _closeBzip() {
    if (this.bz2Stream === null || this.fd === null) return;
    console.log('Stream will be closed');
    bzip2.decompressEnd(this.bz2Stream);
    fs.closeSync(this.fd);
    this.bz2Stream = null;
    this.fd = null;
  }

  _writeCB(buf) {
    if (buf) {
      console.log(buf.length + ' bytes decompressed');
      if (this.pendingBuf) {
        this.pendingBuf.push(buf);
      } else {
        console.log('Push buffer');
        if (!this.push(buf)) {
          this.pendingBuf = [];
        }
      }
    } else {
      console.log('==>with buf null');
      this.push(null);
    }
  }

  _read(size) {
    console.log('Reading');
    if (this.pendingBuf) {
      while (this.pendingBuf.length > 0) {
        var buf = this.pendingBuf[0];
        this.pendingBuf.shift();
        console.log('Push pendingBuf');
        if (buf === null) console.log('Got a null pending');
        if (this.pendingBuf.length === 0) this.pendingBuf = null;
        if (!this.push(buf)) return;
      }

      console.log(this.pendingBuf);
      if (this.pendingBuf.length === 0) this.pendingBuf = null;
    }

    if (!this.bz2Stream || !this.fd) {
      console.log('Push end');
      this.push(null);
      return;
    }

    var buf = Buffer.alloc(size);
    var bytesRead = fs.readSync(this.fd, buf, 0, size)
    var bufs = bzip2.decompress(this.bz2Stream, buf.slice(0, bytesRead))
    console.log(bufs.length + ' buffers got');
    if (bufs.length === 0 && bytesRead === 0) {
      console.log('Reach end');
      this._closeBzip();
      this._writeCB(null);
      return;
    }

    bufs.map(buf => {
      if (this.pendingBuf) {
        console.log('Push pending');
        this.pendingBuf.push(buf);
      } else {
        this._writeCB(buf);
      }
    });
  }

  resume() {
    this._openBzip();
    super.resume();
  }
}

class Bz2WriteStream extends Stream.Writable {
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
  return new Bz2WriteStream(path);
}

function createDecompressStream(path) {
  return new Bz2ReadStream(path);
}

module.exports = {
  createCompressStream,
  createDecompressStream
};
