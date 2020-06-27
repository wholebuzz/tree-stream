# tree-stream

tree-stream is a small node module that pipes streams together and destroys all of them if one of them closes.

```
npm install tree-stream
```

This package is forked from `pump` and aims to be a superset of `pump`.  When the pipe() topology is a linked list they're functionally equivalent.

[![build status](http://img.shields.io/travis/wholenews/tree-stream.svg?style=flat)](http://travis-ci.org/wholenews/tree-stream)

## What problem does it solve?

When using standard `source.pipe(dest)` source will _not_ be destroyed if dest emits close or an error.
You are also not able to provide a callback to tell when then pipe has finished.

tree-stream does these two things for you

## Usage

``` js
var streamTree = require('tree-stream')
var fs = require('fs')

var source = fs.createReadStream('/dev/random')
var dest = fs.createWriteStream('/dev/null')

var stream = streamTree.readable(source)
stream = stream.pipe(dest)
stream.finish(function(err) {
  console.log('pipe finished', err)
})

setTimeout(function() {
  dest.destroy() // when dest is closed tree-stream will destroy source
}, 1000)
```

You can process an input stream and also hash it:

``` js
var streamTree = require('tree-stream')
var fs = require('fs')
var hasha = require('hasha')

var readable2
var readable = streamTree.readable(fs.createReadStream('/tmp/foo.txt'))
readable = readable.split(2)
hasha.fromStream(readable[0].finish()).then((hash) => console.log(`Hash: ${hash}`))
readable[1].finish().on('data', function(data){ console.log(`Data: ${data}`) })
```

Or you can just go wild.  Enjoy ;)

``` js
var streamTree = require('./tree-stream')
var fs = require('fs')
var hasha = require('hasha')

var writable = streamTree.writable(fs.createWriteStream('/tmp/foo.txt'))
var readable
[writable, readable] = writable.joinReadable(1)
hasha.fromStream(readable[0].finish()).then((hash) => console.log(`Hash: ${hash}`))

writable = writable.joinWritable([fs.createWriteStream('/tmp/bar.txt')])
var stream = writable.finish()
stream.write('unicorn', function() { stream.end() })
```

## License

MIT

## Related

Derived from `pump`, part of the [mississippi stream utility collection](https://github.com/maxogden/mississippi).
