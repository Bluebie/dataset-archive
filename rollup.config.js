export default [
  {
    input: 'index.js',
    output: {
      file: 'index.cjs',
      format: 'cjs',
      exports: 'auto'
    },
    external: ['v8']
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
  }
]
