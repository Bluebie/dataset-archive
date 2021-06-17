import { promises as fs } from 'fs'

export default function createFSIO (path) {
  const chunkSize = 64 * 1024

  return {
    async * read () {
      let handle
      try {
        handle = await fs.open(path, 'r')
      } catch (err) {
        if (err.code === 'ENOENT') {
          try {
            handle = await fs.open(`${path}.backup`, 'r')
          } catch (err2) {
            if (err.code === 'ENOENT') {
              return
            } else {
              throw err
            }
          }
        } else {
          throw err
        }
      }

      let position = 0
      while (true) {
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(chunkSize), 0, chunkSize, position)
        position += bytesRead
        if (bytesRead > 0) {
          yield buffer.slice(0, bytesRead)
        }
        // we have reached the end of the file, close and bail
        if (bytesRead < chunkSize) {
          await handle.close()
          return
        }
      }
    },

    async write (bufferIterator) {
      const tmpPath = `${path}.temporary-${Date.now().toString(36)}-${Math.round(Math.random() * 0xFFFFFFFF).toString(36)}`
      const bakPath = `${path}.backup`
      const handle = await fs.open(tmpPath, 'wx')
      try {
        for await (const chunk of bufferIterator) {
          await handle.write(chunk)
        }
        await handle.close()
        await fs.rm(bakPath).catch(x => {})
        await fs.rename(path, bakPath).catch(x => {})
        await fs.rename(tmpPath, path).catch(x => {})
        await fs.rm(bakPath).catch(x => {})
      } catch (err) {
        await fs.rm(tmpPath).catch(x => {})
        throw err
      }
    }
  }
}
