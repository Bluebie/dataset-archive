/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai')
const { encode, decode } = require('../string-codec.cjs')

describe('string-codec', () => {
  it('returns buffers', () => {
    expect(encode('hello')).to.be.an.instanceOf(Buffer)
  })

  it('decodes buffers', () => {
    expect(decode(Buffer.from('hi'))).to.equal('hi')
  })

  it('roundtrips unicode well', () => {
    const unicodeStrings = [
      'بِسْمِ ٱللّٰهِ ٱلرَّحْمـَبنِ ٱلرَّحِيمِ', // arabic
      'ஸ்றீனிவாஸ ராமானுஜன் ஐயங்கார்', // tamil
      '子曰：「學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？', // chinese
      'पशुपतिरपि तान्यहानि कृच्छ्राद् ', // sanskrit
      'Ἰοὺ ἰού· τὰ πάντʼ ἂν ἐξήκοι σαφῆ. ', // greek
      'По оживлённым берегам ', // russian
      '♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖', // chess
      '👋🤚🖐✋🖖👌🤌🤏🤞🤟🤘🤙👈👉👆🖕👇👍👎✊👊🤛🤜👏🙌👐🤲🤝', // plain emoji
      '👋🏽🤚🏽🖐🏽✋🏽🖖🏽👌🏽🤌🏽🤏🏽✌🏽🤞🏽🤟🏽🤘🏽🤙🏽👈🏽👉🏽👆🏽🖕🏽👇🏽' // skin tone emoji
    ]

    for (const str of unicodeStrings) {
      expect(decode(encode(str))).to.equal(str)
    }
  })
})
