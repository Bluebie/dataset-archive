/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect } from 'chai'
import toArr from '../test-utilities/async-iter-to-array.js'
import fsIO from '../fs-io.js'

describe('fs-io', () => {
  const tmpPath = join(tmpdir(), `fs-io-test-file-${Date.now()}`)
  let io

  it('create', () => {
    io = fsIO(tmpPath)
    expect(io).to.be.an('object')
    expect(io).to.have.property('read').which.is.a('function')
    expect(io).to.have.property('write').which.is.a('function')
  })

  it('read outputs nothing for non-existing file', async () => {
    const datas = await toArr(io.read())
    expect(datas).to.deep.equal([])
  })

  it('short writes work correctly', async () => {
    await io.write(['abc', 'def', 'ghi'].map(x => Buffer.from(x)))
    expect(await fs.readFile(tmpPath, { encoding: 'utf-8' })).to.equal('abcdefghi')

    await io.write(['123', '456', '789'].map(x => Buffer.from(x)))
    expect(await fs.readFile(tmpPath, { encoding: 'utf-8' })).to.equal('123456789')
  })

  it('handles short reads', async () => {
    await fs.writeFile(tmpPath, 'abcdefghi')
    expect(Buffer.concat(await toArr(io.read())).toString('utf-8')).to.equal('abcdefghi')

    await fs.writeFile(tmpPath, '1234567890')
    expect(Buffer.concat(await toArr(io.read())).toString('utf-8')).to.equal('1234567890')
  })

  it('roundtrips well', async () => {
    const tests = [
      [randomBytes(8)],
      [randomBytes(32)],
      [randomBytes(8), randomBytes(8)],
      [randomBytes(32 * 1024)],
      [randomBytes(64 * 1024)],
      [randomBytes(128 * 1024)],
      [randomBytes(256 * 1024)],
      []
    ]

    for (const test of tests) {
      await io.write(test)
      const readback = await toArr(io.read())
      expect(Buffer.concat(readback).equals(Buffer.concat(test)))
    }
  })

  it('handles large data chunking at 64kb boundaries', async () => {
    const chunks = [randomBytes(64 * 1024), randomBytes(64 * 1024), randomBytes(64 * 1024)]
    await io.write(chunks)

    for await (const chunk of io.read()) {
      expect(chunks.shift().equals(chunk)).to.be.true
    }
  })

  afterEach(async () => {
    await fs.rm(tmpPath).catch(x => {})
  })
})
