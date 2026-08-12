import assert from 'assert'
import { pathToFileURL } from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'

const runCase = (name, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [markdown-it v15 contract, ${name}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

const renderPair = (src, options = {}) => {
  const baseline = new MarkdownIt(options)
  const compatible = new MarkdownIt(options).use(mditStrongJa, { mode: 'compatible' })
  return {
    baseline: baseline.render(src),
    compatible: compatible.render(src)
  }
}

export const runMarkdownItV15ContractTests = () => {
  const allPass = { value: true }

  runCase('public runtime APIs used by the plugin remain available', () => {
    const md = new MarkdownIt()
    assert.strictEqual(typeof MarkdownIt.Token, 'function')
    assert.strictEqual(typeof MarkdownIt.StateInline, 'function')
    assert.strictEqual(md.inline.State, MarkdownIt.StateInline)
    assert.strictEqual(typeof md.inline.State.prototype.scanDelims, 'function')
    assert.strictEqual(typeof md.utils.isWhiteSpace, 'function')
  }, allPass)

  runCase('Japanese in-sentence punctuation boundaries still need the plugin', () => {
    const standalone = '**「aaa」**'
    const inSentence = 'これは**「aaa」**です'
    const plain = new MarkdownIt()
    const plugin = new MarkdownIt().use(mditStrongJa)

    assert.strictEqual(plain.render(standalone), '<p><strong>「aaa」</strong></p>\n')
    assert.strictEqual(plugin.render(standalone), plain.render(standalone))
    assert.strictEqual(plain.render(inSentence), '<p>これは**「aaa」**です</p>\n')
    assert.strictEqual(plugin.render(inSentence), '<p>これは<strong>「aaa」</strong>です</p>\n')
  }, allPass)

  runCase('compatible mode keeps v15 image-alt processing', () => {
    const src = '![**alt** `code`][]\n\n[**alt** `code`]: /image.png'
    const rendered = renderPair(src)
    assert.strictEqual(rendered.compatible, rendered.baseline)
    assert.strictEqual(rendered.baseline, '<p><img src="/image.png" alt="alt code"></p>\n')
  }, allPass)

  runCase('compatible mode keeps v15 linkify and entity behavior', () => {
    const src = 'AT&T &copy test@example.com。これは**「aaa」**です'
    const rendered = renderPair(src, { linkify: true })
    assert.strictEqual(rendered.compatible, rendered.baseline)
    assert.match(rendered.baseline, /mailto:test@example\.com/)
    assert.match(rendered.baseline, /AT&amp;T &amp;copy/)
  }, allPass)

  return allPass.value
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (runMarkdownItV15ContractTests()) {
    console.log('Passed markdown-it v15 contract tests.')
  } else {
    process.exitCode = 1
  }
}
