# tree-stream ![image](https://img.shields.io/npm/v/tree-stream) [![test](https://github.com/wholebuzz/tree-stream/actions/workflows/test.yaml/badge.svg)](https://github.com/wholebuzz/tree-stream/actions/workflows/test.yaml)

tree-stream is a small node module that pipes streams together and destroys all of them if one of them closes.

```
npm install tree-stream
```

This package is forked from [mafintosh](https://www.npmjs.com/~mafintosh)'s [pump](https://www.npmjs.com/package/pump) and aims to be a superset of `pump`. When the provided pipe() topology is a linked-list, they're functionally equivalent.

## What problem does it solve?

- The original problems pump solved: When using standard `source.pipe(dest)` source will _not_ be destroyed if dest emits close or an error.
You are also not able to provide a callback to tell when then pipe has finished.

- The object model (of `ReadableStreamTree` and `WritableStreamTree`) is expressive.
A representation for a sequence (or DAG) of stream transforms turns out to be really useful.
Sometimes you want to "pipeFrom" (a `WritableStreamTree`) e.g. (from [@wholebuzz/fs/src/local.ts](https://github.com/wholebuzz/fs/blob/master/src/local.ts)):

```typescript
  import StreamTree, { ReadableStreamTree, WritableStreamTree } from 'tree-stream'

  async function openWritableFile(url: string, _options?: OpenWritableFileOptions) {
    let stream = StreamTree.writable(fs.createWriteStream(url))
    if (url.endsWith('.gz')) stream = stream.pipeFrom(zlib.createGzip())
    return stream
  }
```

And sometimes you want the typical "pipe" case (for a `ReadableStreamTree`):

```typescript
  async function openReadableFile(url: string, options?: OpenReadableFileOptions) {
    let stream = StreamTree.readable(fs.createReadStream(url))
    if (url.endsWith('.gz')) stream = stream.pipe(zlib.createGunzip())
    return stream
  }
```

You can equivalently apply a transform then, with either:

```typescript
  const tf = new Transform({ objectMode: true, transform(x, _, cb) { this.push(x); cb(); } })
  readable.pipe(tf)
```

or

```typescript
  writable.pipeFrom(tf)
```

Provided that the `ReadableStreamTree` and `WritableStreamTree` are connected later:

```typescript
  const returnValue = await pumpWritable(writable, 'any return value', readable)
```

These APIs form the basis of [@wholebuzz/fs](https://www.npmjs.com/package/@wholebuzz/fs),
which together, power [dbcp](https://www.npmjs.com/package/dbcp).

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
