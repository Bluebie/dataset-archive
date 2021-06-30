# Dataset Archive

Dataset Archive is a dirt simple way to store key-value data very compactly on disk. Goals:

- Super compact, any redundant/repeated data between values, are efficiently compressed
- Super simple, a century from now, it shouldn't take more than an hour to implement a decoder
- Efficiently handles very large datasets without needing to buffer too much in to memory
- Friendly API to make working with data similar to working with a javascript Map or Array
- Self compacting - it's not an append-only log!
- Reads concurrent with writes will correctly read previous version without corruption

Downsides:

- Random reads are not super fast, the whole file needs to be read through to find a random key. Turns out, this isn't that slow, thanks to fast SSDs and compression that often achieves 50-100x factors in practical uses, even relatively large datasets generally resolve random reads in less than a second.
- Concurrent writes can result in clobbering. Corruption is not possible, but later changes may overwrite earlier changes if not executed serially.
- Provides no write locking - do this yourself if you need multiple processes writing to it. Out of scope.

## Format

dataset archives are a file, containing length prefixed entries in sequence. Lengths are encoded with protobuf-style varints.

Entries in the file alternate key, value, key, value. Keys are generally utf-8 strings, and by default, values are JSON strings, but this is configurable. Dataset Archives do not store metadata so they do not inherantly hint their content type. Something to be careful with.

Dataset Archive is used by Pigeon Optics DB as a storage at rest format on disk. It's not really designed to be used as a transmission/rpc format. If you're designing APIs, use a zip file or something.

## Why another format?

Compactness, mostly. Most other formats prioritise random access, which severely kneecaps compression by resetting the compression algo for each value/file in the archive. For data I work with, like scrapes of websites, a lot of the information is highly redundant, so the difference between these design choices is a 105mb file versus a 1.3mb file.

Many people solve problems by throwing money at it, but I'm dirt poor and I don't want to spend more than five bucks a month on a server, so here we are, doing the old fashioned work of making software that runs well in resource constrained environments, and **never monetising anything** because it never becomes necessary to deal with the devil if you do things right.

## Basic Usage

```js
import { fsOpen as openDatasetArchive } from 'dataset-archive'
// or: const { fsOpen: openDatasetArchive } = require('dataset-archive/index.cjs')

const dataset = openDatasetArchive('/path/to/file.dataset-archive.br')
// overwrite/create dataset with specified content
await dataset.write([
  ['key1', 'value1'],
  ['key2', 'value2'],
  ['key3', { simple: { value: 3 }}]
])
// overwrite key 1, add key4, and keep key2, and delete key3
await dataset.merge([
  ['key1', 'value1 is updated'],
  ['key3', undefined],
  ['key4', 'has a value also']
])

// log out the current data in the dataset archive
for await (const [key, value] of dataset) {
  console.log(key, '=>', value)
}
```

## Interface

### constructor options

- `io` (required) an object with `async write(async iterable of buffers)` and `async * read()` functions, providing low level file access
- `limit` (optional) if set, this number sets the maximum number of bytes that an encoded key or value can take up
- `codec` (optional) an object with  `encode(value)` and `decode(buffer)` functions, for serializing values

Two default io implementations are included, `dataset-archive/fs-io.js` (or `.cjs`) implements NodeJS filesystem access using the `fs` module. `dataset-archive/test-utilities/memory.io.js` provides an in-memory storage fixture, mainly for testing the library without making a mess in the filesystem.



—
Phoenix