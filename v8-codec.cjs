'use strict'

Object.defineProperty(exports, '__esModule', { value: true })

const v8 = require('v8')

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

exports.buffer = buffer
exports.decode = decode
exports.encode = encode
exports.type = type
