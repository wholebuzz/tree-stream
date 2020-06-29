import { Duplex, Readable, Writable } from 'stream'

export interface ReadableStreamTree {
  finish(callback?: (error?: Error) => void): Readable
  pipe(stream: Duplex): ReadableStreamTree
  split(children?: number): ReadableStreamTree[]
}

export interface WritableStreamTree {
  finish(callback?: (error?: Error) => void): Writable
  joinReadable(siblings: number) : [WritableStreamTree, ReadableStreamTree[]]
  joinWritable(siblings: Writable[]): WritableStreamTree
  pipeFrom(stream: Duplex): WritableStreamTree
}

declare namespace StreamTree {
  const readable: (stream: Readable) => ReadableStreamTree
  const writable: (stream: Writable) => WritableStreamTree
}

export = StreamTree
