# node-addon-bz2

bz2 stream for Node. Thanks to [libbz2](http://www.bzip.org/).

## Installation

`npm i --save git+https://git@github.com/kitt1987/node-addon-bz2.git#master`

## HowTo
```
const bz2 = require('node-addon-bz2');
const bz2Compress = bz2.createCompressStream([verbose, outputBufSize=8192]);
fs.createReadStream('raw').pipe(bz2Compress).pipe(fs.createWriteStream('compressed'));

const bz2Decompress = bz2.createDecompressStream([verbose, outputBufSize=8192]);
fs.createReadStream('compressed').pipe(bz2Decompress).pipe(fs.createWriteStream('raw'));

var compressed = bz2.compressSync(raw, [verbose, outputBufSize=8192]);

var decompressed = bz2.decompressSync(compressed, [verbose, outputBufSize=8192]);
```

## License
[License](https://github.com/kitt1987/node-addon-bz2/tree/master/libbzip2/LICENSE)