import { DatasetArchive, DatasetArchiveLimitError } from './dataset-archive.js'
import fsIO from './fs-io.js'

export { DatasetArchive, DatasetArchiveLimitError }
export * as jsonCodec from './json-codec.js'
export * as v8Codec from './v8-codec.js'

/**
 *
 * @param {string} path - filesystem path where dataset should be read/written to
 * @param {object} [options] - any extra options you'd like to adjust
 * @returns {DatasetArchive}
 */
export function fsOpen (path, options = {}) {
  return new DatasetArchive({ io: fsIO(path), ...options })
}
