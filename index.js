var once = require('once')
var eos = require('end-of-stream')
var fs = require('fs') // we only need fs to get the ReadStream and WriteStream prototypes
var ReadableStreamClone = require('readable-stream-clone')

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

var createNode = function(stream, parentNode) {
  var node = Object.create(null)
  node.childNode = []
  node.parentNode = parentNode
  node.stream = stream
  if (parentNode) parentNode.childNode.push(node)
  return node
}

var addDestroyer = function(node, reading, writing) {
  node.destroy = destroyer(node.stream, reading, writing, function (err) {
    if (!node.error) node.error = err
    if (err) {
      propagateDestroyForward(node)
      propagateDestroyBackward(node)
    }
    if (reading) return
    propagateDestroyForward(node)
    propagateDestroyBackward(node)
    if (node.callback) node.callback(node.error)
  })
}

var propagateDestroyForward = function(node) {
  node.destroy()
  var i
  for (i = 0; i < node.childNode.length; i++) {
    propagateDestroyForward(node.childNode[i])
  }
}

var propagateDestroyBackward = function(node) {
  node.destroy()
  if (node.parentNode) {
    var parentChildren = node.parentNode.childNode.length
    if (parentChildren == 1) {
      propagateDestroyBackward(node.parentNode)
    } else {
      node.parentNode.destroyed.add(node)
      if (node.parentNode.destroyed.size == parentChildren) {
        propagateDestroyBackward(node.parentNode)
      }
    }
  }
}

var readableStreamTree = function (rootStream) {
  var pipe = function(parentNode, stream) {
    var childNode = createNode(stream, parentNode)
    addDestroyer(parentNode, true, parentNode.stream != rootStream)
    parentNode.stream.pipe(stream)
    return createHandle(childNode)
  }

  var split = function(parentNode, children) {
    var child = []
    var i
    for (i = 0; i < children; i++) {
      child.push(createHandle(createNode(new ReadableStreamClone(parentNode.stream), parentNode)))
    }
    parentNode.destroyed = new Set()
    addDestroyer(parentNode, true, parentNode.stream != rootStream)
    return child
  }

  var finish = function(finalNode, callback) {
    if (callback) finalNode.callback = callback
    addDestroyer(finalNode, false, finalNode.stream != rootStream)
    return finalNode.stream
  }

  var createHandle = function(node) {
    var handle = Object.create(null)
    handle.finish = function(callback) { return finish(node, callback) }
    handle.pipe = function(stream) { return pipe(node, stream) }
    handle.split = function(children=2) { return split(node, children) }
    return handle
  }

  return createHandle(createNode(rootStream))
}

var writableStreamTree = function (terminalStream) {
  var pipeFrom = function(childNode, stream) {
    var parentNode = createNode(stream)
    parentNode.childNode.push(childNode)
    childNode.parent = parentNode

    addDestroyer(childNode, childNode.stream != rootStream, true)
    stream.pipe(childNode.stream)
    return createHandle(parentNode)
  }

  var finish = function(finalNode, callback) {
    if (callback) finalNode.callback = callback
    addDestroyer(finalNode, true, true)
    return finalNode.stream
  }

  var createHandle = function(node) {
    var handle = Object.create(null)
    handle.finish = function(callback) { return finish(node, callback) }
    handle.pipeFrom = function(stream) { return pipeFrom(node, stream) }
    return handle
  }

  return createHandle(createNode(terminalStream))
}

module.exports = {
  readable: readableStreamTree,
  writable: writableStreamTree,
}
