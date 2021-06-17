/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
const chai = require('chai')
chai.use(require('chai-as-promised'))
const { expect } = chai
const { DatasetArchive, DatasetArchiveLimitError } = require('../index.cjs')
const MemoryIO = require('../test-utilities/memory-io.cjs')
const toArr = require('../test-utilities/async-iter-to-array.cjs')
const { randomBytes } = require('crypto')

const testData = [
  ['abc', 'xyz'],
  ['cat', 'dog'],
  ['pea', 'soup']
]

describe('dataset-archive', function () {
  /** @type {DatasetArchive} */
  let tape

  it('creates an archive and read it back', async () => {
    tape = new DatasetArchive({ io: new MemoryIO(), limit: 32 * 1024 })
    const storedKeys = await tape.write(testData)
    expect([...storedKeys].sort()).to.deep.equal(['abc', 'cat', 'pea'])

    const readback = await toArr(tape.read())
    expect(readback).to.deep.equal(testData)
  })

  it('adds a record', async () => {
    await tape.set('beans', 'cool!')

    const readback = await toArr(tape.read())
    expect(readback).to.deep.equal([['beans', 'cool!'], ...testData])
  })

  it('merges', async () => {
    const storedKeys = await tape.merge([['cat', 'friend'], ['beans', undefined]])
    expect([...storedKeys].sort()).to.deep.equal(['abc', 'cat', 'pea'])

    const readback = Object.fromEntries(await toArr(tape.read()))
    expect(readback).to.deep.equal({
      abc: 'xyz',
      cat: 'friend',
      pea: 'soup'
    })
  })

  it('selects', async () => {
    expect(await toArr(tape.select(key => key.includes('c')))).to.deep.equal([
      ['cat', 'friend'],
      ['abc', 'xyz']
    ])

    expect(await toArr(tape.select((key, value) => value.includes('o')))).to.deep.equal([
      ['pea', 'soup']
    ])
  })

  it('deletes', async () => {
    await tape.delete('abc', 'pea')

    const readback = Object.fromEntries(await toArr(tape.read()))
    expect(readback).to.deep.equal({ cat: 'friend' })
  })

  it('retains', async () => {
    await tape.write(testData)
    await tape.retain('abc', 'cat')

    const readback = Object.fromEntries(await toArr(tape.read()))
    expect(readback).to.deep.equal({ abc: 'xyz', cat: 'dog' })
  })

  it('filters', async () => {
    await tape.write(testData)
    await tape.filter((key, value) => key === 'abc' || value === 'dog')

    const readback = Object.fromEntries(await toArr(tape.read()))
    expect(readback).to.deep.equal({ abc: 'xyz', cat: 'dog' })
  })

  it('gets', async () => {
    expect(await tape.get('cat')).to.equal('dog')
    expect(await tape.get('fake')).to.be.undefined
  })

  it('throws limit errors when data is too large', async () => {
    await expect(tape.set('foo', randomBytes(50 * 1024).toString('hex'))).to.be.rejectedWith(DatasetArchiveLimitError)
  })
})
