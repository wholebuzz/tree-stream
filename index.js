var once = require('once')
var eos = require('end-of-stream')
var fs = require('fs') // we only need fs to get the ReadStream and WriteStream prototypes
var pipeErrors = require('pipe-errors')
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

var streamTree = function (rootStream) {
  var pipe = function(parentNode, stream) {
    var childNode = createNode(stream, parentNode)
    addDestroyer(parentNode, true)
    parentNode.stream.pipe(stream)
    pipeErrors(parentNode.stream, stream)
    return createHandle(childNode)
  }

  var split = function(parentNode) {
    var pathA = createNode(new ReadableStreamClone(parentNode), parentNode)
    var pathB = createNode(new ReadableStreamClone(parentNode), parentNode)
    addDestroyer(parentNode, true)
    return [ createHandle(pathA), createHandle(pathB) ]
  }

  var finish = function(finalNode, callback) {
    if (callback) finalNode.callback = callback
    addDestroyer(finalNode, false)
    return finalNode.stream
  }

  var createNode = function(stream, parentNode) {
    var node = Object.create(null)
    node.childNode = []
    node.destroyed = {}
    node.parentNode = parentNode
    node.stream = stream
    if (parentNode) parentNode.childNode.push(node)
    return node
  }

  var createHandle = function(node) {
    var handle = Object.create(null)
    handle.pipe = function(stream) { return pipe(node, stream) }
    handle.finish = function(callback) { return finish(node, callback) }
    return handle
  }

  var addDestroyer = function(node, reading) {
    var writing = node.stream != rootStream
    node.destroy = destroyer(node.stream, reading, writing, function (err) {
      if (!node.error) node.error = err
      if (err) {
        propagateDestroyForward(node)
        propagateDestroyBackward(node)
      }
      if (reading) return
      propagateDestroyForward(node)
      propagateDestroyBackward(node)
      if (node.callback) node.callback()
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
        node.parentNode.destroyed[node] = true
        if (Object.keys(node.parentNode.destroyed).length == parentChildren) {
          propagateDestroyBackward(node.parentNode)
        }
      }
    }
  }

  return createHandle(createNode(rootStream))
}

module.exports = streamTree
