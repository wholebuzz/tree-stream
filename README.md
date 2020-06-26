# stream-tree

stream-tree is a small node module that pipes streams together and destroys all of them if one of them closes.

```
npm install stream-tree
```

This package is forked from `pump` and aims to be a superset of `pump`.  When the pipe() topology is a linked list their functioanlity should be equivalent.

[![build status](http://img.shields.io/travis/wholenews/stream-tree.svg?style=flat)](http://travis-ci.org/wholenews/stream-tree)

## What problem does it solve?

When using standard `source.pipe(dest)` source will _not_ be destroyed if dest emits close or an error.
You are also not able to provide a callback to tell when then pipe has finished.

stream-tree does these two things for you

## Usage

``` js
var streamTree = require('streamTree')
var fs = require('fs')

var source = fs.createReadStream('/dev/random')
var dest = fs.createWriteStream('/dev/null')

var stream = streamTree(source)
stream = stream.pipe(dest)
stream.finish(function(err) {
  console.log('pipe finished', err)
})

setTimeout(function() {
  dest.destroy() // when dest is closed stream-tree will destroy source
}, 1000)
```

## License

MIT

## Related

Derived from `pump`, part of the [mississippi stream utility collection](https://github.com/maxogden/mississippi).
