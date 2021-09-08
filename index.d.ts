import { Duplex, Readable, Writable } from 'stream'

export type Callback = (error?: Error) => void
export type WritableCallback = (writable: Writable) => Promise<void>
export type WritableStreamTreeFilter = (writable: WritableStreamTree) => Promise<boolean>

declare namespace StreamTree {
  export interface ReadableStreamTree {
    finish(callback?: Callback): Readable
    pipe(stream: Duplex): ReadableStreamTree
    split(children?: number): ReadableStreamTree[]
  }

  export interface WritableStreamTree {
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
