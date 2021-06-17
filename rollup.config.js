export default [
  {
    input: 'index.js',
    output: {
      file: 'index.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: ['readable-stream', 'zlib', 'length-prefixed-stream', 'v8', 'fs']
  },
  {
    input: 'dataset-archive.js',
    output: {
      file: 'dataset-archive.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: ['readable-stream', 'zlib', 'length-prefixed-stream']
  },
  {
    input: 'json-codec.js',
    output: {
      file: 'json-codec.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: []
  },
  {
    input: 'v8-codec.js',
    output: {
      file: 'v8-codec.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: ['v8']
  },
  {
    input: 'string-codec.js',
    output: {
      file: 'string-codec.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: []
  },
  {
    input: 'fs-io.js',
    output: {
      file: 'fs-io.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: ['fs']
  },
  {
    input: 'test-utilities/async-iter-to-array.js',
    output: {
      file: 'test-utilities/async-iter-to-array.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: []
  },
  {
    input: 'test-utilities/memory-io.js',
    output: {
      file: 'test-utilities/memory-io.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: []
  }
]
