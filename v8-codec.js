/**
 * Provides V8 structured clone algorithm as a LevelDB compatible codec
 */
import { serialize, deserialize } from 'v8'

/**
 * Given any structure cloneable value, returns a buffer using v8 html structured clone algorithm
 * @param {any} value
 * @returns {Buffer}
 */
export function encode (value) {
  return serialize(value)
}

/**
 * Given a Buffer containing v8 html structured clone data, returns the original value
 * @param {any} value
 * @returns {Buffer}
 */
export function decode (buffer) {
  return deserialize(buffer)
}

export const type = 'v8-structured-clone'
export const buffer = true
