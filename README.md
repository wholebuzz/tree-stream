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

var readable = streamTree.readable(fs.createReadStream('/tmp/foo.txt'))
readable = readable.split(2)
hasha.fromStream(readable[0].finish()).then((hash) => console.log(`Hash: ${hash}`))
readable[1].finish().on('data', function(data){ console.log(`Data: ${data}`) })

// Outputs:
// Data: unicorn
// Hash: e233b19aabc7d5e53826fb734d1222f1f0444c3a3fc67ff4af370a66e7cadd2cb24009f1bc86f0bed12ca5fcb226145ad10fc5f650f6ef0959f8aadc5a594b27
```

You can get pretty wild:

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

// /tmp/foo.txt and /tmp/bar.text now contain "unicorn"
// Outputs:
// Hash: e233b19aabc7d5e53826fb734d1222f1f0444c3a3fc67ff4af370a66e7cadd2cb24009f1bc86f0bed12ca5fcb226145ad10fc5f650f6ef0959f8aadc5a594b27
```

## License

MIT

## Related

Derived from `pump`, part of the [mississippi stream utility collection](https://github.com/maxogden/mississippi).
