import { Duplex, Readable, Writable } from 'stream'

export interface ReadableStreamTree {
  finish(callback?: (error?: Error) => void): Readable
  pipe(stream: Duplex): StreamTree
  split(children?: number): StreamTree[]
}

export interface WritableStreamTree {
  finish(callback?: (error?: Error) => void): Writable
  pipeFrom(stream: Duplex): StreamTree
}

declare namespace StreamTree {
  const readable: (stream: Readable) => ReadableStreamTree
  const writable: (stream: Writable) => WritableStreamTree
}

export = StreamTree
