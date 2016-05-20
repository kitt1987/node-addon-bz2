# node-addon-bz2

bz2 stream for Node. Thanks to [libbz2](http://www.bzip.org/).

## Installation

`npm i --save git+https://git@github.com/kitt1987/node-addon-bz2.git#master`

## HowTo
```
const bz2 = require('node-addon-bz2');
const bz2Compress = bz2.createCompressStream();
fs.createReadStream('raw').pipe(bz2Compress).pipe(fs.createWriteStream('compressed'));
const bz2Decompress = bz2.createDecompressStream();
fs.createReadStream('compressed').pipe(bz2Decompress).pipe(fs.createWriteStream('raw'));
```

## License
[License](https://github.com/kitt1987/node-addon-bz2/tree/master/libbzip2/LICENSE)