/**
 * DatasetArchive IO objects which just store everything in ram, for test rig
 */
export default class MemoryIO {
  constructor () {
    this.chunks = []
  }

  async * read () {
    yield * this.chunks
  }

  async write (chunksIter) {
    const newChunks = []
    for await (const chunk of chunksIter) {
      newChunks.push(chunk)
    }
    this.chunks = newChunks
  }
}
