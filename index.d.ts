import { Duplex, Readable, Writable } from 'stream'

declare namespace StreamTree {
  type Callback = (error?: Error) => void
  type WritableCallback = (writable: Writable) => Promise<void>
  type WritableStreamTreeFilter = (writable: WritableStreamTree) => Promise<boolean>

  interface TreeNode {
    childNode: TreeNode[]
    parentNode: TreeNode
    stream: any
  }

  interface ReadableStreamTree {
    node: TreeNode
    finish(callback?: Callback): Readable
    pipe(stream: Duplex): ReadableStreamTree
    split(children?: number): ReadableStreamTree[]
  }

  interface WritableStreamTree {
    node: TreeNode
    finish(callback?: Callback, pipe?: Readable): Writable
    joinReadable(siblings: number): [WritableStreamTree, ReadableStreamTree[]]
    joinWritable(siblings: Writable[], callback?: Callback[]): WritableStreamTree
    pipeFrom(stream: Duplex): WritableStreamTree
  }

  const readable: (stream: Readable) => ReadableStreamTree
  const writable: (stream: Writable) => WritableStreamTree
  const writer: (writeCallback: WritableCallback | WritableCallback[]) => WritableStreamTreeFilter

  const pumpReadable: <X extends unknown>(stream: ReadableStreamTree, resolveValue: X) => Promise<X>
  const pumpWritable: <X extends unknown>(stream: WritableStreamTree, resolveValue: X, readable?: Readable) => Promise<X>
  const finishReadable: <X extends unknown>(stream: ReadableStreamTree, resolve: (x: X) => void, reject: (err: Error) => void, resolveValue?: X) => Readable
  const finishWritable: <X extends unknown>(stream: WritableStreamTree, resolve: (x: X) => void, reject: (err: Error) => void, resolveValue?: X, readable?: Readable) => Writable
}

export = StreamTree
