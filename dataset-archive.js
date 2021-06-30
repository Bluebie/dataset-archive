/**
 * Dataset Archive is used to store a dataset of key-value pairs in a single flat file on disk
 * It's a simple format, using length-prefixed-stream to chunk keys and values with a specific length
 * The first entry is always a key, which is a raw utf-8 string, the second entry is any value encoded
 * with the provided codec (default: JSON), all compressed with brotli. Highly redundant data compresses
 * really well. Unlike zip files, redundancies between different values are efficiently compressed.
 *
 * Designed originally for Pigeon Optics, to store data like scrapes of an entire website, where much of
 * the markup is identical between values. In the case of Auslan Signbank, roughly 105mb of scrape data
 * compressed down to 1.3mb packed in to this format.
 */
import { createBrotliCompress, createBrotliDecompress, constants as zlibConsts } from 'zlib'
import * as jsonCodec from './json-codec.js'
import * as stringCodec from './string-codec.js'
import { encode as lengthEncoder, decode as lengthDecoder } from 'it-length-prefixed'
import { pipeline } from 'streaming-iterables'
import { transform } from 'stream-to-it'

export class DatasetArchiveLimitError extends Error {
  constructor (limit, size) {
    super(`Dataset entry size limit exceeded, max size is ${limit} bytes but value encoded to ${size} bytes`)
  }
}

export class DatasetArchive {
  /**
   * Create a DatasetArchive interface with custom options
   * @param {object} options
   * @param {object} options.io - io, object implements read and write functions implementation, read returns an async iterable of buffers, write accepts an async iterable of buffers
   * @param {object} [options.codec] - object which implements encode and decode functions, which convert objects to Buffers and vice versa
   * @param {number|Infinity} [options.limit] - max bytes for a key or value, or Infinity to make unlimited
   */
  constructor (options) {
    this.brotli = {
      chunkSize: 32 * 1024,
      ...(options.brotli || {}),
      params: {
        [zlibConsts.BROTLI_PARAM_QUALITY]: 5,
        ...((options.brotli || {}).params || {})
      }
    }
    if (options.io === undefined) throw new Error('Missing option, io')
    /** @type {{async * read (), async write (list)}} */
    this.io = options.io

    this.keyCodec = stringCodec
    this.valueCodec = options.codec || jsonCodec
    this.limit = typeof options.limit === 'number' ? options.limit : Infinity
  }

  /**
   * iterate the contents of the dataset archive, yielding objects with "id" and "data" fields
   * @param {object} [options]
   * @param {boolean} [options.decode] - should the value be decoded or left as a buffer with V prefix
   * @yields {[id, data]}
   */
  async * read ({ decode = true } = {}) {
    const chunks = pipeline(
      () => this.io.read(),
      transform(createBrotliDecompress(this.brotli)),
      lengthDecoder({ maxDataLength: this.limit })
    )

    let index = 0
    let key
    for await (const lpsBuffer of chunks) {
      const buffer = lpsBuffer.slice()
      if (index % 2 === 0) {
        // key
        key = decode ? this.keyCodec.decode(buffer) : buffer
      } else {
        const value = decode ? this.valueCodec.decode(buffer) : buffer
        yield [key, value]
      }
      index += 1
    }
  }

  /**
   * Given an async iterable, rebuilds the dataset archive with new contents, completely replacing it
   * @param {AsyncIterable|Iterable} iterable
   * @param {object} [options]
   * @param {boolean} [options.encode] - should the iterable's stuff be encoded?
   * @returns {Set.<string>} keys in archive
   * @async
   */
  async write (iterable, { encode = true } = {}) {
    const storedKeys = new Set()
    async function * gen (self) {
      for await (const object of iterable) {
        if (!Array.isArray(object)) throw new Error('iterator must provide two element arrays')
        if (object.length !== 2) throw new Error('Array must have length of 2')
        // skip entries which are duplicates
        if (storedKeys.has(encode ? object[0] : self.keyCodec.decode(object[1]))) {
          continue
        }

        const output = [...object]
        if (encode) {
          if (typeof object[0] !== 'string') throw new Error('key must be a string')
          storedKeys.add(output[0])
          output[0] = self.keyCodec.encode(object[0])
          output[1] = self.valueCodec.encode(object[1])
        } else {
          storedKeys.add(self.keyCodec.decode(object[0]))
        }
        if (output.length !== 2) throw new Error('each iterable value must be an array of length 2, key value pair')
        if (!Buffer.isBuffer(output[0])) throw new Error('key must be a Buffer')
        if (!Buffer.isBuffer(output[1])) throw new Error('value must be a Buffer')
        if (output[0].length > self.limit) throw new DatasetArchiveLimitError(self.limit, output[0].length)
        if (output[1].length > self.limit) throw new DatasetArchiveLimitError(self.limit, output[1].length)
        yield * output
      }
    }

    await new Promise((resolve, reject) => {
      pipeline(
        () => gen(this),

        // catch errors
        async function * (input) {
          try {
            for await (const val of input) yield val
          } catch (err) {
            reject(err)
            throw err
          }
        },

        lengthEncoder({}),

        // make sure real node buffers are coming out of this
        async function * (input) { for await (const val of input) yield val.slice() },

        transform(createBrotliCompress(this.brotli)),

        buffers => this.io.write(buffers)
      ).then(resolve).catch(reject)
    })
    return storedKeys
  }

  /**
   * filter the contents of the dataset archive using a supplied testing function, rewriting the archive with the new subset retained
   * @param {function (key, value)} filterFunction - function which returns a truthy value or a promise that resolves to one
   * @param {boolean} [includeValue = 'auto'] - should value be decoded and provided to filter function? auto detects based on arguments list in function definition
   */
  async filter (filter, includeValue = 'auto') {
    const includeVal = includeValue === 'auto' ? filter.length === 2 : !!includeValue
    async function * iter (archive) {
      for await (const [keyBuffer, valueBuffer] of archive.read({ decode: false })) {
        const key = archive.keyCodec.decode(keyBuffer)
        if (await (includeVal ? filter(key, archive.valueCodec.decode(valueBuffer)) : filter(key))) {
          yield [keyBuffer, valueBuffer]
        }
      }
    }
    await this.write(iter(this), { encode: false })
  }

  /**
   * generator yields key,value tuple arrays for any key,value pair which selectFunction evaluates truthy
   * @param {function (key, value)} selectFunction - function which returns a truthy value or a promise that resolves to one
   * @param {boolean} [includeValue = 'auto'] - should value be decoded and provided to select function? auto detects based on arguments list in function definition
   * @yields {[string, any]} values for which selectFn is truthy
   */
  async * select (selectFn, includeValue = 'auto') {
    const includeVal = includeValue === 'auto' ? selectFn.length === 2 : !!includeValue
    for await (const [keyBuffer, valueBuffer] of this.read({ decode: false })) {
      const key = this.keyCodec.decode(keyBuffer)
      if (includeVal) {
        const value = this.valueCodec.decode(valueBuffer)
        if (await selectFn(key, value)) yield [key, value]
      } else {
        if (await selectFn(key)) yield [key, this.valueCodec.decode(valueBuffer)]
      }
    }
  }

  /**
   * rewrite the archive, without specified keys included
   * @param  {...string} keys - list of keys
   */
  async delete (...keys) {
    await this.filter(key => !keys.includes(key), false)
  }

  /**
   * rewrite the archive, only including specified keys
   * @param  {...string} keys - list of keys
   */
  async retain (...keys) {
    await this.filter(key => keys.includes(key), false)
  }

  /**
   * rewrite the archive, adding in any content which iterates with a data value other than undefined
   * and removing any content which is does have an undefined value, as well as removing any duplicates
   * @param {AsyncIterable} iter
   * @returns {Set.<string>} set of retained string keys - every key that is still in the archive
   */
  async merge (iter) {
    const set = new Set()
    async function * gen (archive, iter) {
      for await (const [key, value] of iter) {
        if (!set.has(key)) {
          set.add(key)
          if (value !== undefined) {
            yield [archive.keyCodec.encode(key), archive.valueCodec.encode(value)]
          }
        }
      }

      for await (const [keyBuffer, valueBuffer] of archive.read({ decode: false })) {
        const key = archive.keyCodec.decode(keyBuffer)
        if (!set.has(key)) {
          set.add(key)
          yield [keyBuffer, valueBuffer]
        }
      }
    }

    return await this.write(gen(this, iter), { encode: false })
  }

  /**
   * rewrite archive, overwriting specific key with a new value, or removing it if the value is exactly undefined
   * @param {string} key
   * @param {*} value
   */
  async set (key, value) {
    await this.merge([[key, value]])
  }

  /**
   * search for a specific key and return it's value, or undefined if it isn't found
   * @param {string} searchKey
   */
  async get (searchKey) {
    const searchBuffer = this.keyCodec.encode(searchKey)
    for await (const [keyBuffer, valueBuffer] of this.read({ decode: false })) {
      if (searchBuffer.equals(keyBuffer)) {
        return this.valueCodec.decode(valueBuffer)
      }
    }
  }

  /**
   * allow DatasetArchive instances to be used directly as async iterables, for example in for await loops
   * or the Readable.from constructor
   */
  async * [Symbol.asyncIterator] () {
    yield * this.read({ decode: true })
  }
}
