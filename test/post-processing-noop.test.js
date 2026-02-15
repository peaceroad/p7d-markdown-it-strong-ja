import assert from 'assert'
import path from 'path'
import url from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import { parseCaseSections } from './post-processing/case-file-utils.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const CASE_FILE = path.join(__dirname, 'post-processing', 'noop-heavy-cases.txt')

const countInlineParseCalls = (markdown, option) => {
  const md = new MarkdownIt().use(mditStrongJa, option)
  const original = md.inline.parse
  let count = 0
  md.inline.parse = function countedInlineParse(src, parserMd, env, outTokens) {
    count++
    return original.call(this, src, parserMd, env, outTokens)
  }
  const html = md.render(markdown)
  md.inline.parse = original
  return { count, html }
}

const runCase = (name, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [postprocess noop-heavy, ${name}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

export const runPostprocessNoopHeavyTests = () => {
  const allPassRef = { value: true }
  const cases = parseCaseSections(CASE_FILE, {
    defaults: { maxExtra: '', markdown: '' },
    fieldMap: { max_extra: 'maxExtra' },
    multilineFields: ['markdown'],
    transforms: {
      maxExtra: (v) => Number(v || 0)
    },
    isValid: (c) => !!(c.name && Number.isFinite(c.maxExtra) && c.markdown)
  })
  const modeMatrix = [
    { label: 'japanese-boundary', mode: 'japanese-boundary' },
    { label: 'aggressive', mode: 'aggressive' }
  ]

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]
    runCase(testCase.name, () => {
      for (let m = 0; m < modeMatrix.length; m++) {
        const modeCase = modeMatrix[m]
        const on = countInlineParseCalls(testCase.markdown, { mode: modeCase.mode })
        const off = countInlineParseCalls(testCase.markdown, { mode: modeCase.mode, postprocess: false })
        const delta = on.count - off.count
        assert.ok(delta <= testCase.maxExtra, `${modeCase.label} delta=${delta} max=${testCase.maxExtra}`)
        assert.strictEqual(on.html, off.html, `${modeCase.label} html`)
      }
    }, allPassRef)
  }

  return allPassRef.value
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (runPostprocessNoopHeavyTests()) {
    console.log('Passed postprocess noop-heavy tests.')
  } else {
    process.exitCode = 1
  }
}
