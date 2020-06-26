import { Stream } from 'stream'

export default class StreamTree {
  constructor(stream: Stream)
  finish(callback?: (error?: Error) => void): Readable
  pipe(stream: Stream): StreamTree
  split(children?: number): StreamTree[]
}
