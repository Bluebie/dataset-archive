/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
import { expect } from 'chai'
import { encode, decode } from '../json-codec.js'

const testData = [
  'hello world', // roman
  'بِسْمِ ٱللّٰهِ ٱلرَّحْمـَبنِ ٱلرَّحِيمِ', // arabic
  'ஸ்றீனிவாஸ ராமானுஜன் ஐயங்கார்', // tamil
  '子曰：「學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？', // chinese
  'पशुपतिरपि तान्यहानि कृच्छ्राद् ', // sanskrit
  'Ἰοὺ ἰού· τὰ πάντʼ ἂν ἐξήκοι σαφῆ. ', // greek
  'По оживлённым берегам ', // russian
  '♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖', // chess
  '👋🤚🖐✋🖖👌🤌🤏🤞🤟🤘🤙👈👉👆🖕👇👍👎✊👊🤛🤜👏🙌👐🤲🤝', // plain emoji
  '👋🏽🤚🏽🖐🏽✋🏽🖖🏽👌🏽🤌🏽🤏🏽✌🏽🤞🏽🤟🏽🤘🏽🤙🏽👈🏽👉🏽👆🏽🖕🏽👇🏽', // skin tone emoji
  true,
  false,
  null,
  Math.random(),
  { a: 1, b: 2 },
  [1, 2, 3, 4, 5, '6']
]

describe('json-codec', () => {
  it('returns buffers', () => {
    expect(encode('hello')).to.be.an.instanceOf(Buffer)
  })

  it('roundtrips well', () => {
    for (const val of testData) {
      expect(decode(encode(val))).to.deep.equal(val, `${val} roundtrips`)
    }
  })
})
