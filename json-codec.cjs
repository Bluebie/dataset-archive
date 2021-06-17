'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * LevelDB compatible codec, implementing standard JSON, the default codec
 */

/**
 * Given a JSON encodeable value, returns a Buffer containing a JSON string
 * @param {string|number|boolean|null|Array|object} value
 * @returns {Buffer}
 */
function encode (value) {
  return Buffer.from(JSON.stringify(value), 'utf-8')
}

/**
 * Given a Buffer containing a JSON string, returns the object inside the JSON data
 * @param {Buffer} value
 * @returns {string|number|boolean|null|Array|object}
 */
function decode (value) {
  return JSON.parse(value.toString('utf-8'))
}
const buffer = true;
const type = 'JSON';

exports.buffer = buffer;
exports.decode = decode;
exports.encode = encode;
exports.type = type;
