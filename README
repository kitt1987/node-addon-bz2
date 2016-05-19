# node-addon-bz2

bz2 stream for Node. Thanks to [libbz2](http://www.bzip.org/).

## Installation

`npm i --save git+https://git@github.com/kitt1987/node-addon-bz2.git#master`

## HowTo
```
const bz2 = require('node-addon-bz2');
bz2.createDecompressStream(compressedDataFile).pipe(fs.createWriteStream(rawDataFile));
fs.createReadStream(rawDataFile).pipe(bz2.createCompressStream(compressedDataFile));
```

## License
[License](https://github.com/kitt1987/node-addon-bz2/tree/master/libbzip2/LICENSE)