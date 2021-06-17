'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * LevelDB compatible codec, implementing standard JSON, the default codec
 */

/**
 * Given a JSON encodeable value, returns a Buffer containing a JSON string
 * @param {string} value
 * @returns {Buffer}
 */
function encode (value) {
  if (typeof value !== 'string') value = `${value}`;
  return Buffer.from(value, 'utf-8')
}

/**
 * Given a Buffer containing a JSON string, returns the object inside the JSON data
 * @param {Buffer} value
 * @returns {string}
 */
function decode (value) {
  return value.toString('utf-8')
}
const buffer = true;
const type = 'utf-8';

exports.buffer = buffer;
exports.decode = decode;
exports.encode = encode;
exports.type = type;
