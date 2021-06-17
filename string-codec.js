/**
 * LevelDB compatible codec, implementing standard JSON, the default codec
 */

/**
 * Given a JSON encodeable value, returns a Buffer containing a JSON string
 * @param {string} value
 * @returns {Buffer}
 */
export function encode (value) {
  if (typeof value !== 'string') value = `${value}`
  return Buffer.from(value, 'utf-8')
}

/**
 * Given a Buffer containing a JSON string, returns the object inside the JSON data
 * @param {Buffer} value
 * @returns {string}
 */
export function decode (value) {
  return value.toString('utf-8')
}
export const buffer = true
export const type = 'utf-8'
