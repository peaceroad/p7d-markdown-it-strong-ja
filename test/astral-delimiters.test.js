import assert from 'assert'
import url from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import { readMarkdownHtmlCases } from './fixture-runner.js'

const render = (md, src) => md.render(src).trim()
const fixture = (name) => url.fileURLToPath(new URL(name, import.meta.url))

const runCase = (name, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [astral delimiters, ${name}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

const mdPlain = new MarkdownIt()
const mdDefault = new MarkdownIt().use(mditStrongJa)
const mdCompatible = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })
const ASTRAL_HAN_SINGLE_STAR = '*𠀋?*abc*'
const ASTRAL_HAN_SINGLE_STAR_DEFAULT = '<p><em>𠀋?</em>abc*</p>'
const ASTRAL_HAN_SINGLE_STAR_COMPATIBLE = '<p>*𠀋?<em>abc</em></p>'

const assertPlainCompatibleParity = (src) => {
  assert.strictEqual(render(mdCompatible, src), render(mdPlain, src))
}

const assertFixtureCases = (label, md, filePath) => {
  const cases = readMarkdownHtmlCases(filePath)
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    assert.strictEqual(md.render(c.markdown), c.html, `${label} #${i + 1}`)
  }
}

export const runAstralDelimiterTests = () => {
  const allPassRef = { value: true }

  runCase('default golden fixtures', () => {
    assertFixtureCases(
      'astral mode=japanese default',
      mdDefault,
      fixture('p-astral--o-japaneseonly-default.txt')
    )
  }, allPassRef)

  runCase('compatible golden fixtures', () => {
    assertFixtureCases(
      'astral mode=compatible',
      mdCompatible,
      fixture('p-astral--o-compatible.txt')
    )
  }, allPassRef)

  runCase('compatible follows markdown-it 14.2 astral punctuation behavior', () => {
    const cases = [
      '**😀**x',
      '**🀄**x',
      '*𐄀*x*',
      '*😀?*abc*',
      '**😀**です',
      '**🀄**です',
      '**𠀋**x',
      '*𠀋?*abc*'
    ]
    for (const src of cases) assertPlainCompatibleParity(src)
  }, allPassRef)

  runCase('mode options keep astral Han policy boundaries', () => {
    const relaxedOptions = [
      undefined,
      { mode: 'japanese' },
      { mode: 'japanese-boundary' },
      { mode: 'japanese-boundary-guard' },
      { mode: 'aggressive' },
      { mode: 'japanese', postprocess: false },
      { mode: 'japanese', mditAttrs: false }
    ]
    for (const option of relaxedOptions) {
      const md = new MarkdownIt().use(mditStrongJa, option)
      assert.strictEqual(render(md, ASTRAL_HAN_SINGLE_STAR), ASTRAL_HAN_SINGLE_STAR_DEFAULT)
    }
    assert.strictEqual(render(mdCompatible, ASTRAL_HAN_SINGLE_STAR), ASTRAL_HAN_SINGLE_STAR_COMPATIBLE)
  }, allPassRef)

  runCase('runtime mode override keeps astral Han policy boundaries', () => {
    assert.strictEqual(
      mdDefault.render(ASTRAL_HAN_SINGLE_STAR, { __strongJaTokenOpt: { mode: 'compatible' } }).trim(),
      ASTRAL_HAN_SINGLE_STAR_COMPATIBLE
    )
    assert.strictEqual(
      mdCompatible.render(ASTRAL_HAN_SINGLE_STAR, { __strongJaTokenOpt: { mode: 'japanese-boundary-guard' } }).trim(),
      ASTRAL_HAN_SINGLE_STAR_DEFAULT
    )
  }, allPassRef)

  runCase('promoted delimiter lookup keeps astral indexes and empty sentinels stable', () => {
    const rightLookupSource = '𠀋* English*𠀋'.repeat(24)
    const leftLookupSource = '𠀋*English *𠀋'.repeat(24)
    const emptyLookupSource = '  *𠀋* \n'.repeat(24)
    const mdBoundary = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
    const mdGuard = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })

    assert.strictEqual(
      mdBoundary.renderInline(rightLookupSource),
      '𠀋<em> English</em>𠀋'.repeat(24)
    )
    assert.strictEqual(
      mdBoundary.renderInline(leftLookupSource),
      '𠀋<em>English </em>𠀋'.repeat(24)
    )
    const emptyLookupExpected = '  <em>𠀋</em>\n' + '<em>𠀋</em>\n'.repeat(23)
    assert.strictEqual(mdBoundary.renderInline(emptyLookupSource), emptyLookupExpected)
    assert.strictEqual(mdGuard.renderInline(emptyLookupSource), emptyLookupExpected)
  }, allPassRef)

  return allPassRef.value
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (runAstralDelimiterTests()) {
    console.log('Passed astral delimiter tests.')
  } else {
    process.exitCode = 1
  }
}
