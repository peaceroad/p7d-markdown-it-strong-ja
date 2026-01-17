import assert from 'assert'
import mdit from 'markdown-it'
import mditStrongJa from '../index.js'

// Auto-leading (default): Japanese text stays aggressive; English-only text follows markdown-it
export const runAutoLeadingTests = () => {
  let allPass = true

  const mdAuto = mdit().use(mditStrongJa)
  try {
    assert.strictEqual(mdAuto.render('string**[text](url)**'), '<p>string**<a href="url">text</a>**</p>\n')
  } catch (e) {
    console.log('Test [auto-leading default, English] >>>')
    console.log(e)
    allPass = false
  }

  const mdAutoJa = mdit().use(mditStrongJa)
  try {
    assert.strictEqual(mdAutoJa.render('これは**link [text](url)**です'), '<p>これは<strong>link <a href="url">text</a></strong>です</p>\n')
  } catch (e) {
    console.log('Test [auto-leading default, Japanese] >>>')
    console.log(e)
    allPass = false
  }

  return allPass
}
