'use strict'

Object.defineProperty(exports, '__esModule', { value: true })

const promises = require('stream/promises')
const zlib = require('zlib')
const lps = require('length-prefixed-stream')
const v8 = require('v8')

function _interopNamespace (e) {
  if (e && e.__esModule) return e
  const n = Object.create(null)
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        const d = Object.getOwnPropertyDescriptor(e, k)
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () {
            return e[k]
          }
        })
      }
    })
  }
  n.default = e
  return Object.freeze(n)
}

const lps__namespace = /* #__PURE__ */_interopNamespace(lps)

/**
 * LevelDB compatible codec, implementing standard JSON, the default codec
 */

/**
 * Given a JSON encodeable value, returns a Buffer containing a JSON string
 * @param {string|number|boolean|null|Array|object} value
 * @returns {Buffer}
 */
function encode$2 (value) {
  return Buffer.from(JSON.stringify(value), 'utf-8')
}

/**
 * Given a Buffer containing a JSON string, returns the object inside the JSON data
 * @param {Buffer} value
 * @returns {string|number|boolean|null|Array|object}
 */
function decode$2 (value) {
  return JSON.parse(value.toString('utf-8'))
}
const buffer$2 = true
const type$2 = 'JSON'

const jsonCodec = /* #__PURE__ */Object.freeze({
  __proto__: null,
  encode: encode$2,
  decode: decode$2,
  buffer: buffer$2,
  type: type$2
})

/**
 * LevelDB compatible codec, implementing standard JSON, the default codec
 */

/**
 * Given a JSON encodeable value, returns a Buffer containing a JSON string
 * @param {string} value
 * @returns {Buffer}
 */
function encode$1 (value) {
  if (typeof value !== 'string') value = `${value}`
  return Buffer.from(value, 'utf-8')
}

/**
 * Given a Buffer containing a JSON string, returns the object inside the JSON data
 * @param {Buffer} value
 * @returns {string}
 */
function decode$1 (value) {
  return value.toString('utf-8')
}
const buffer$1 = true
const type$1 = 'utf-8'

const stringCodec = /* #__PURE__ */Object.freeze({
  __proto__: null,
  encode: encode$1,
  decode: decode$1,
  buffer: buffer$1,
  type: type$1
})

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

class DatasetArchiveLimitError extends Error {
  constructor (limit, size) {
    super(`Dataset entry size limit exceeded, max size is ${limit} bytes but value encoded to ${size} bytes`)
  }
}

class DatasetArchive {
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
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        ...((options.brotli || {}).params || {})
      }
    }
    if (options.io === undefined) throw new Error('Missing option, io')
    /** @type {import('fs')} */
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
    try {
      const bytes = this.fs.createReadStream(this.path)
      const decompressed = bytes.pipe(zlib.createBrotliDecompress(this.brotli))
      bytes.on('error', err => decompressed.destroy(err))
      const chunked = decompressed.pipe(lps__namespace.decode())
      decompressed.on('error', err => chunked.destroy(err))

      let index = 0
      let key
      for await (const buffer of chunked) {
        if (index % 2 === 0) {
          // key
          key = decode ? buffer.toString('utf-8') : buffer
        } else {
          const value = decode ? exports.valueDecode(buffer) : buffer
          yield [key, value]
        }
        index += 1
      }
    } catch (err) {
      // don't throw errors for missing files, just treat them as empty
      if (err.code !== 'ENOENT') throw err
      else console.log('no file')
    }
  }

  /**
   * Given an async iterable, rebuilds the dataset archive with new contents, completely replacing it
   * @param {object} [options]
   * @param {boolean} [options.encode] - should the iterable's stuff be encoded?
   * @param {AsyncIterable|Iterable} iterable
   * @returns {Set.<string>} keys in archive
   * @async
   */
  async write (iterable, { encode = true } = {}) {
    const storedKeys = new Set()
    async function * gen () {
      for await (const object of iterable) {
        if (!Array.isArray(object)) throw new Error('iterator must provide two element arrays')
        if (object.length !== 2) throw new Error('Array must have length of 2')
        // skip entries which are duplicates
        if (storedKeys.has(encode ? object[0] : object[1].toString('utf-8'))) {
          continue
        }

        if (encode) {
          storedKeys.add(object[0])
          if (typeof object[0] !== 'string') throw new Error('key must be a string')
          yield Buffer.from(object[0], 'utf-8')
          yield exports.valueEncode(object[1])
        } else {
          if (!Buffer.isBuffer(object[0])) throw new Error('key must be a Buffer')
          if (!Buffer.isBuffer(object[1])) throw new Error('value must be a Buffer')
          storedKeys.add(object[0].toString('utf-8'))
          yield object[0]
          yield object[1]
        }
      }
    }

    await promises.pipeline([
      gen(),
      lps__namespace.encode(),
      zlib.createBrotliCompress(this.brotli),
      this.raw.writeStream(this.path)
    ])

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
        const key = keyBuffer.toString('utf-8')
        if (await (includeVal ? filter(key, exports.valueDecode(valueBuffer)) : filter(key))) {
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
      const key = keyBuffer.toString('utf-8')
      if (includeVal) {
        const value = exports.valueDecode(valueBuffer)
        if (await selectFn(key, value)) yield [key, value]
      } else {
        if (await selectFn(key)) yield [key, exports.valueDecode(valueBuffer)]
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
   * delete the whole archive, effectively making it empty, and removing the underlying file
   */
  async deleteArchive () {
    await this.raw.delete(this.path)
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
            yield [Buffer.from(`${key}`, 'utf-8'), exports.valueEncode(value)]
          }
        }
      }

      for await (const [keyBuffer, valueBuffer] of archive.read({ decode: false })) {
        const key = keyBuffer.toString('utf-8')
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
    const searchBuffer = Buffer.from(searchKey, 'utf-8')
    for await (const [keyBuffer, valueBuffer] of this.read({ decode: false })) {
      if (searchBuffer.equals(keyBuffer)) {
        return exports.valueDecode(valueBuffer)
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

/**
 * Provides V8 structured clone algorithm as a LevelDB compatible codec
 */

/**
 * Given any structure cloneable value, returns a buffer using v8 html structured clone algorithm
 * @param {any} value
 * @returns {Buffer}
 */
function encode (value) {
  return v8.serialize(value)
}

/**
 * Given a Buffer containing v8 html structured clone data, returns the original value
 * @param {any} value
 * @returns {Buffer}
 */
function decode (buffer) {
  return v8.deserialize(buffer)
}

const type = 'v8-structured-clone'
const buffer = true

const v8Codec = /* #__PURE__ */Object.freeze({
  __proto__: null,
  encode: encode,
  decode: decode,
  type: type,
  buffer: buffer
})

exports.DatasetArchive = DatasetArchive
exports.DatasetArchiveLimitError = DatasetArchiveLimitError
exports.jsonCodec = jsonCodec
exports.v8Codec = v8Codec
