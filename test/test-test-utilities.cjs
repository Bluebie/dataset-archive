/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai')
const MemoryIO = require('../test-utilities/memory-io.cjs')
const toArr = require('../test-utilities/async-iter-to-array.cjs')

describe('test-utilities', () => {
  it('async-iter-to-array', async () => {
    async function * generate () {
      for (const val of ['abc', 'def', 'ghi', 'jkl', 'mno', 'pqr', 'stu', 'vwx', 'yz']) {
        await new Promise((resolve, reject) => { setImmediate(resolve) })
        yield val
      }
    }

    const output = await toArr(generate())
    expect(output).to.be.an('array')
    expect(output.join('')).to.equal('abcdefghijklmnopqrstuvwxyz')
  })

  it('memory-io', async () => {
    const io = new MemoryIO()
    await io.write('hello how are you?'.split('').map(x => Buffer.from(x, 'utf-8')))
    expect(Buffer.concat(await toArr(io.read())).toString('utf-8')).to.equal('hello how are you?')

    await io.write('rewriteable too'.split('').map(x => Buffer.from(x, 'utf-8')))
    expect(Buffer.concat(await toArr(io.read())).toString('utf-8')).to.equal('rewriteable too')
  })
})
