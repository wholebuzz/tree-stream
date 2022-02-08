var once = require('once')
var cloneable = require('cloneable-readable')
var eos = require('end-of-stream')
var fs = require('fs') // we only need fs to get the ReadStream and WriteStream prototypes
var multi = require('multi-write-stream')
var nodeStreams = require('stream') // optionally used

var noop = function () {}
var ancient = /^v?\.0/.test(process.version)

var isFn = function (fn) {
  return typeof fn === 'function'
}

var isFS = function (stream) {
  if (!ancient) return false // newer node version do not need to care about fs is a special way
  if (!fs) return false // browser
  return (stream instanceof (fs.ReadStream || noop) || stream instanceof (fs.WriteStream || noop)) && isFn(stream.close)
}

var isRequest = function (stream) {
  return stream.setHeader && isFn(stream.abort)
}

var destroyer = function (stream, reading, writing, callback) {
  callback = once(callback)

  var closed = false
  stream.on('close', function () {
    closed = true
  })

  eos(stream, {readable: reading, writable: writing}, function (err) {
    if (err) return callback(err)
    closed = true
    callback()
  })

  var destroyed = false
  return function (err) {
    if (closed) return
    if (destroyed) return
    destroyed = true

    if (isFS(stream)) return stream.close(noop) // use close for fs streams to avoid fd leaks
    if (isRequest(stream)) return stream.abort() // request.destroy just do .end - .abort is what we want

    if (isFn(stream.destroy)) return stream.destroy()

    callback(err || new Error('stream was destroyed'))
  }
}

// A node is created for every Stream in our tree.
var createNode = function(stream, parentNode) {
  var node = Object.create(null)
  node.childNode = []
  node.parentNode = parentNode
  node.stream = stream
  if (parentNode) parentNode.childNode.push(node)
  return node
}

// Adapt the `pump` destroys.forEach logic to follow the tree.
var addDestroyer = function(node, reading, writing) {
  node.destroy = destroyer(node.stream, reading, writing, function (err) {
    if (!node.error) node.error = err
    if (err) {
      propagateDestroyBackward(node, node.error)
      propagateDestroyForward(node, node.error)
    }
    if (reading) return
    propagateDestroyBackward(node, node.error)
    propagateDestroyForward(node, node.error)
    if (node.callback) {
      node.callback(node.error)
      node.callback = null
    }
  })
}

// Any stream error destroys all descendent streams.
var propagateDestroyForward = function(node, err) {
  if (!node.error) node.error = err
  node.destroy()
  var i
  for (i = 0; i < node.childNode.length; i++) {
    propagateDestroyForward(node.childNode[i], node.error)
  }
}

// Ancestor streams are only destroyed when all descendent branches have finished.
var propagateDestroyBackward = function(node, err) {
  if (!node.error) node.error = err
  node.destroy()
  if (node.callback) {
    node.callback(node.error)
    node.callback = null
  }
  if (node.parentNode) {
    var parentChildren = node.parentNode.childNode.length
    if (parentChildren == 1) {
      propagateDestroyBackward(node.parentNode, node.error)
    } else {
      node.parentNode.destroyed.add(node)
      if (node.parentNode.destroyed.size == parentChildren) {
        propagateDestroyBackward(node.parentNode, node.error)
      }
    }
  }
}

// readableStreamTree is a logical replacement for stream.Readable.
var readableStreamTree = function (rootStream, parentTree) {

  // Safe wrapper around Stream.pipe() for resource cleanup.
  var pipe = function(parentNode, stream) {
    var childNode = createNode(stream)
    piped(parentNode, childNode)
    parentNode.stream.pipe(stream)
    return createHandle(childNode)
  }

  var piped = function(parentNode, childNode) {
    parentNode.childNode.push(childNode)
    childNode.parentNode = parentNode
    addDestroyer(parentNode, true, parentNode.stream != rootStream)
  }

  // With this utility you can pipe readable stream into multiple writable streams.
  var split = function(parentNode, children) {
    var child = [ createHandle(createNode(cloneable(parentNode.stream), parentNode)) ]
    var i
    for (i = 1; i < children; i++) {
      child.push(createHandle(createNode(child[0].node.stream.clone(), parentNode)))
    }
    parentNode.destroyed = new Set()
    addDestroyer(parentNode, true, parentNode.stream != rootStream)
    return child
  }

  // Finalize tree structure and return stream.Readable.
  var finish = function(finalNode, callback) {
    if (callback) finalNode.callback = callback
    addDestroyer(finalNode, false, finalNode.stream != rootStream)
    return finalNode.stream
  }

  // Returns a handle to a terminal node of the Stream tree.
  var createHandle = function(node) {
    var handle = Object.create(null)
    handle.node = node
    handle.finish = function(callback) { return finish(node, callback) }
    handle.pipe = function(stream) { return pipe(node, stream) }
    handle.piped = function(childNode) { return piped(node, childNode.node) }
    handle.split = function(children=2) { return split(node, children) }
    return handle
  }

  return createHandle(createNode(rootStream, parentTree))
}

// writableStreamTree is a logical replacement for stream.Writable.
var writableStreamTree = function (terminalStream) {

  // Analogous to readableStreamTree.pipe.
  var pipeFrom = function(childNode, stream) {
    var parentNode = createNode(stream)
    pipedFrom(childNode, parentNode)
    stream.pipe(childNode.stream)
    return createHandle(parentNode)
  }

  var pipedFrom = function(childNode, parentNode, external) {
    if (!parentNode.destroyed) parentNode.destroyed = new Set()
    parentNode.childNode.push(childNode)
    childNode.parentNode = parentNode
    addDestroyer(childNode, external || childNode.stream != terminalStream, true)
  }

  // Analogous to readableStreamTree.split, returns Readables.
  var joinReadable = function(siblingNode, siblings, newPassThrough) {
    var parentNode = createNode(newPassThrough ? newPassThrough() : new nodeStreams.PassThrough())
    var midwifeNode = createNode(cloneable(parentNode.stream), parentNode)
    midwifeNode.childNode.push(siblingNode)
    siblingNode.parentNode = midwifeNode
    midwifeNode.stream.pipe(siblingNode.stream)
    parentNode.destroyed = new Set()
    addDestroyer(siblingNode, siblingNode.stream != terminalStream, true)
    addDestroyer(midwifeNode, true, true)

    var sibling = []
    var i
    for (i = 0; i < siblings; i++) {
      sibling.push(readableStreamTree(midwifeNode.stream.clone(), parentNode))
    }
    return [createHandle(parentNode), sibling]
  }

  // Analogous to readableStreamTree.split, accepts Writables.
  var joinWritable = function(siblingNode, siblings, callback) {
    var parentNode = createNode(multi([siblingNode.stream, ...siblings], { autoDestroy: false }))
    parentNode.childNode.push(siblingNode)
    siblingNode.parentNode = parentNode
    parentNode.destroyed = new Set()
    addDestroyer(siblingNode, siblingNode.stream != terminalStream, true)

    var i
    for (i = 0; i < siblings.length; i++) {
      siblingNode = createNode(siblings[i], parentNode)
      if (callback) siblingNode.callback = callback
      addDestroyer(siblingNode, false, true)
    }
    return createHandle(parentNode)
  }

  // Finalize tree structure and return stream.Writable.
  var finish = function(finalNode, callback, readNode) {
    if (callback) terminalNode.callback = callback

    if (readNode) {
      readNode.childNode.push(finalNode)
      finalNode.parentNode = readNode
    }

    addDestroyer(finalNode, finalNode.destroyed || finalNode.stream != terminalStream, true)
    if (readNode) {
      addDestroyer(readNode, true, false)
      readNode.stream.pipe(finalNode.stream)
    }

    return finalNode.stream
  }

  // Returns a handle to the root node of the Stream tree.
  var createHandle = function(node) {
    var handle = Object.create(null)
    handle.node = node
    handle.finish = function(callback, readHandle) { return finish(node, callback, readHandle ? readHandle.node : undefined) }
    handle.joinReadable = function(siblings, newPassThrough) { return joinReadable(node, siblings, newPassThrough) }
    handle.joinWritable = function(siblings, callback) { return joinWritable(node, siblings, callback) }
    handle.pipeFrom = function(stream) { return pipeFrom(node, stream) }
    handle.pipedFrom = function(parentNode) { return pipedFrom(node, parentNode.node, true) }
    return handle
  }

  // Handle stdout stream differently because it won't emit finish.
  if (terminalStream == process.stdout) {
    terminalStream = new nodeStreams.Writable({
      write(chunk, _encoding, callback) {
        process.stdout.write(chunk, callback);
      },
    })
  }

  var terminalNode = createNode(terminalStream)
  return createHandle(terminalNode)
}

var streamTreeWriter = function(writeCallback) {
  return async (writable) => {
    const error = await new Promise(async (resolve, reject) => {
      const stream = writable.finish((err) => {
        if (err) reject(err)
        else resolve()
      })
      if (Array.isArray(writeCallback)) {
        for (const wcb of writeCallback) await wcb(stream)
      } else {
        await writeCallback(stream)
      }
    })
    return !error
  }
}

var pumpReadable = function(stream, resolveValue) {
  return new Promise((resolve, reject) => {
    finishReadable(stream, resolve, reject, resolveValue)
  })
}

var pumpWritable = function(stream, resolveValue, readable) {
  return new Promise((resolve, reject) => {
    finishWritable(stream, resolve, reject, resolveValue, readable)
  })
}

var finishReadable = function(stream, resolve, reject, resolveValue) {
  return stream.finish((err) => {
    if (err) reject(err)
    else resolve(resolveValue)
  })
}

var finishWritable = function(stream, resolve, reject, resolveValue, readable) {
  return stream.finish((err) => {
    if (err) reject(err)
    else resolve(resolveValue)
  }, readable)
}

module.exports = {
  readable: readableStreamTree,
  writable: writableStreamTree,
  writer: streamTreeWriter,
  pumpReadable: pumpReadable,
  pumpWritable: pumpWritable,
  finishReadable: finishReadable,
  finishWritable: finishWritable,
}
