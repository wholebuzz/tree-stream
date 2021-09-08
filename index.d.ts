import { Duplex, Readable, Writable } from 'stream'

declare namespace StreamTree {
  type Callback = (error?: Error) => void
  type WritableCallback = (writable: Writable) => Promise<void>
  type WritableStreamTreeFilter = (writable: WritableStreamTree) => Promise<boolean>

  interface ReadableStreamTree {
    finish(callback?: Callback): Readable
    pipe(stream: Duplex): ReadableStreamTree
    split(children?: number): ReadableStreamTree[]
  }

  interface WritableStreamTree {
    finish(callback?: Callback, pipe?: Readable): Writable
    joinReadable(siblings: number): [WritableStreamTree, ReadableStreamTree[]]
    joinWritable(siblings: Writable[], callback?: Callback[]): WritableStreamTree
    pipeFrom(stream: Duplex): WritableStreamTree
  }

  const readable: (stream: Readable) => ReadableStreamTree
  const writable: (stream: Writable) => WritableStreamTree
  const writer: (writeCallback: WritableCallback | WritableCallback[]) => WritableStreamTreeFilter
}

export = StreamTree
