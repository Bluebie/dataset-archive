'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var zlib = require('zlib');
var itLengthPrefixed = require('it-length-prefixed');
var streamingIterables = require('streaming-iterables');
var streamToIt = require('stream-to-it');
var fs = require('fs');
var v8 = require('v8');

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
const buffer$2 = true;
const type$2 = 'JSON';

var jsonCodec = /*#__PURE__*/Object.freeze({
  __proto__: null,
  encode: encode$2,
  decode: decode$2,
  buffer: buffer$2,
  type: type$2
});

/**
 * LevelDB compatible codec, implementing standard JSON, the default codec
 */

/**
 * Given a JSON encodeable value, returns a Buffer containing a JSON string
 * @param {string} value
 * @returns {Buffer}
 */
function encode$1 (value) {
  if (typeof value !== 'string') value = `${value}`;
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
const buffer$1 = true;
const type$1 = 'utf-8';

var stringCodec = /*#__PURE__*/Object.freeze({
  __proto__: null,
  encode: encode$1,
  decode: decode$1,
  buffer: buffer$1,
  type: type$1
});

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
    super(`Dataset entry size limit exceeded, max size is ${limit} bytes but value encoded to ${size} bytes`);
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
    };
    if (options.io === undefined) throw new Error('Missing option, io')
    /** @type {{async * read (), async write (list)}} */
    this.io = options.io;

    this.keyCodec = stringCodec;
    this.valueCodec = options.codec || jsonCodec;
    this.limit = typeof options.limit === 'number' ? options.limit : Infinity;
  }

  /**
   * iterate the contents of the dataset archive, yielding objects with "id" and "data" fields
   * @param {object} [options]
   * @param {boolean} [options.decode] - should the value be decoded or left as a buffer with V prefix
   * @yields {[id, data]}
   */
  async * read ({ decode = true } = {}) {
    const chunks = streamingIterables.pipeline(
      () => this.io.read(),
      streamToIt.transform(zlib.createBrotliDecompress(this.brotli)),
      itLengthPrefixed.decode({ maxDataLength: this.limit })
    );

    let index = 0;
    let key;
    for await (const lpsBuffer of chunks) {
      const buffer = lpsBuffer.slice();
      if (index % 2 === 0) {
        // key
        key = decode ? this.keyCodec.decode(buffer) : buffer;
      } else {
        const value = decode ? this.valueCodec.decode(buffer) : buffer;
        yield [key, value];
      }
      index += 1;
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
    const storedKeys = new Set();
    async function * gen (self) {
      for await (const object of iterable) {
        if (!Array.isArray(object)) throw new Error('iterator must provide two element arrays')
        if (object.length !== 2) throw new Error('Array must have length of 2')
        // skip entries which are duplicates
        if (storedKeys.has(encode ? object[0] : self.keyCodec.decode(object[1]))) {
          continue
        }

        const output = [...object];
        if (encode) {
          if (typeof object[0] !== 'string') throw new Error('key must be a string')
          storedKeys.add(output[0]);
          output[0] = self.keyCodec.encode(object[0]);
          output[1] = self.valueCodec.encode(object[1]);
        } else {
          storedKeys.add(self.keyCodec.decode(object[0]));
        }
        if (output.length !== 2) throw new Error('each iterable value must be an array of length 2, key value pair')
        if (!Buffer.isBuffer(output[0])) throw new Error('key must be a Buffer')
        if (!Buffer.isBuffer(output[1])) throw new Error('value must be a Buffer')
        if (output[0].length > self.limit) throw new DatasetArchiveLimitError(self.limit, output[0].length)
        if (output[1].length > self.limit) throw new DatasetArchiveLimitError(self.limit, output[1].length)
        yield * output;
      }
    }

    await new Promise((resolve, reject) => {
      streamingIterables.pipeline(
        () => gen(this),

        // catch errors
        async function * (input) {
          try {
            for await (const val of input) yield val;
          } catch (err) {
            reject(err);
            throw err
          }
        },

        itLengthPrefixed.encode({}),

        // make sure real node buffers are coming out of this
        async function * (input) { for await (const val of input) yield val.slice(); },

        streamToIt.transform(zlib.createBrotliCompress(this.brotli)),

        buffers => this.io.write(buffers)
      ).then(resolve).catch(reject);
    });
    return storedKeys
  }

  /**
   * filter the contents of the dataset archive using a supplied testing function, rewriting the archive with the new subset retained
   * @param {function (key, value)} filterFunction - function which returns a truthy value or a promise that resolves to one
   * @param {boolean} [includeValue = 'auto'] - should value be decoded and provided to filter function? auto detects based on arguments list in function definition
   */
  async filter (filter, includeValue = 'auto') {
    const includeVal = includeValue === 'auto' ? filter.length === 2 : !!includeValue;
    async function * iter (archive) {
      for await (const [keyBuffer, valueBuffer] of archive.read({ decode: false })) {
        const key = archive.keyCodec.decode(keyBuffer);
        if (await (includeVal ? filter(key, archive.valueCodec.decode(valueBuffer)) : filter(key))) {
          yield [keyBuffer, valueBuffer];
        }
      }
    }
    await this.write(iter(this), { encode: false });
  }

  /**
   * generator yields key,value tuple arrays for any key,value pair which selectFunction evaluates truthy
   * @param {function (key, value)} selectFunction - function which returns a truthy value or a promise that resolves to one
   * @param {boolean} [includeValue = 'auto'] - should value be decoded and provided to select function? auto detects based on arguments list in function definition
   * @yields {[string, any]} values for which selectFn is truthy
   */
  async * select (selectFn, includeValue = 'auto') {
    const includeVal = includeValue === 'auto' ? selectFn.length === 2 : !!includeValue;
    for await (const [keyBuffer, valueBuffer] of this.read({ decode: false })) {
      const key = this.keyCodec.decode(keyBuffer);
      if (includeVal) {
        const value = this.valueCodec.decode(valueBuffer);
        if (await selectFn(key, value)) yield [key, value];
      } else {
        if (await selectFn(key)) yield [key, this.valueCodec.decode(valueBuffer)];
      }
    }
  }

  /**
   * rewrite the archive, without specified keys included
   * @param  {...string} keys - list of keys
   */
  async delete (...keys) {
    await this.filter(key => !keys.includes(key), false);
  }

  /**
   * rewrite the archive, only including specified keys
   * @param  {...string} keys - list of keys
   */
  async retain (...keys) {
    await this.filter(key => keys.includes(key), false);
  }

  /**
   * rewrite the archive, adding in any content which iterates with a data value other than undefined
   * and removing any content which is does have an undefined value, as well as removing any duplicates
   * @param {AsyncIterable} iter
   * @returns {Set.<string>} set of retained string keys - every key that is still in the archive
   */
  async merge (iter) {
    const set = new Set();
    async function * gen (archive, iter) {
      for await (const [key, value] of iter) {
        if (!set.has(key)) {
          set.add(key);
          if (value !== undefined) {
            yield [archive.keyCodec.encode(key), archive.valueCodec.encode(value)];
          }
        }
      }

      for await (const [keyBuffer, valueBuffer] of archive.read({ decode: false })) {
        const key = archive.keyCodec.decode(keyBuffer);
        if (!set.has(key)) {
          set.add(key);
          yield [keyBuffer, valueBuffer];
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
    await this.merge([[key, value]]);
  }

  /**
   * search for a specific key and return it's value, or undefined if it isn't found
   * @param {string} searchKey
   */
  async get (searchKey) {
    const searchBuffer = this.keyCodec.encode(searchKey);
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
    yield * this.read({ decode: true });
  }
}

function createFSIO (path) {
  const chunkSize = 64 * 1024;

  return {
    async * read () {
      let handle;
      try {
        handle = await fs.promises.open(path, 'r');
      } catch (err) {
        if (err.code === 'ENOENT') {
          try {
            handle = await fs.promises.open(`${path}.backup`, 'r');
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

      let position = 0;
      while (true) {
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(chunkSize), 0, chunkSize, position);
        position += bytesRead;
        if (bytesRead > 0) {
          yield buffer.slice(0, bytesRead);
        }
        // we have reached the end of the file, close and bail
        if (bytesRead < chunkSize) {
          await handle.close();
          return
        }
      }
    },

    async write (bufferIterator) {
      const tmpPath = `${path}.temporary-${Date.now().toString(36)}-${Math.round(Math.random() * 0xFFFFFFFF).toString(36)}`;
      const bakPath = `${path}.backup`;
      const handle = await fs.promises.open(tmpPath, 'wx');
      try {
        for await (const chunk of bufferIterator) {
          await handle.write(chunk);
        }
        await handle.close();
        await fs.promises.unlink(bakPath).catch(x => {});
        await fs.promises.rename(path, bakPath).catch(x => {});
        await fs.promises.rename(tmpPath, path);
        await fs.promises.unlink(bakPath).catch(x => {});
      } catch (err) {
        await fs.promises.unlink(tmpPath).catch(x => {});
        throw err
      }
    }
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

const type = 'v8-structured-clone';
const buffer = true;

var v8Codec = /*#__PURE__*/Object.freeze({
  __proto__: null,
  encode: encode,
  decode: decode,
  type: type,
  buffer: buffer
});

/**
 *
 * @param {string} path - filesystem path where dataset should be read/written to
 * @param {object} [options] - any extra options you'd like to adjust
 * @returns {DatasetArchive}
 */
function fsOpen (path, options = {}) {
  return new DatasetArchive({ io: createFSIO(path), ...options })
}

exports.DatasetArchive = DatasetArchive;
exports.DatasetArchiveLimitError = DatasetArchiveLimitError;
exports.fsOpen = fsOpen;
exports.jsonCodec = jsonCodec;
exports.v8Codec = v8Codec;
