import assert from 'assert'
import path from 'path'
import url from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import { parseCaseSections } from './post-processing/case-file-utils.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const CASE_FILE = path.join(__dirname, 'post-processing', 'token-only-regressions.txt')

const runCase = (name, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [token-only progress, ${name}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

const makeMd = (mode, postprocess) => {
  return new MarkdownIt().use(mditStrongJa, { mode, postprocess })
}

const countInlineParseCalls = (md, markdown) => {
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

const ensurePhaseBucket = (stats, phase) => {
  if (!stats[phase]) {
    stats[phase] = {
      total: 0,
      expectExtra: 0,
      expectNone: 0,
      passExtra: 0,
      passNone: 0
    }
  }
  return stats[phase]
}

export const runTokenOnlyProgressTests = () => {
  const allPassRef = { value: true }
  const cases = parseCaseSections(CASE_FILE, {
    defaults: {
      phase: '',
      mode: '',
      expectCalls: '',
      contains: '',
      markdown: ''
    },
    fieldMap: {
      expect_calls: 'expectCalls'
    },
    multilineFields: ['markdown'],
    isValid: (c) => !!(c.name && c.phase && c.mode && c.expectCalls && c.markdown)
  })
  const phaseStats = {}

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    runCase(`${c.name}`, () => {
      const bucket = ensurePhaseBucket(phaseStats, c.phase)
      bucket.total++

      const mdOn = makeMd(c.mode, true)
      const mdOff = makeMd(c.mode, false)

      const on = countInlineParseCalls(mdOn, c.markdown)
      const off = countInlineParseCalls(mdOff, c.markdown)
      const htmlOn = on.html
      const htmlOff = off.html
      const extra = on.count - off.count

      if (c.contains) {
        assert.ok(htmlOn.indexOf(c.contains) !== -1, `missing expected snippet: ${c.contains}`)
      }

      if (c.expectCalls === 'extra') {
        bucket.expectExtra++
        assert.ok(extra > 0, `expected extra parseInline calls, got extra=${extra}`)
        bucket.passExtra++
      } else if (c.expectCalls === 'none') {
        bucket.expectNone++
        assert.strictEqual(extra, 0, `expected no extra parseInline calls, got extra=${extra}`)
        bucket.passNone++
      } else {
        throw new Error(`Unknown expectCalls expectation: ${c.expectCalls}`)
      }

      if (c.mode === 'compatible') {
        const baseline = new MarkdownIt().render(c.markdown)
        assert.strictEqual(htmlOn, baseline)
        assert.strictEqual(htmlOff, baseline)
      }
    }, allPassRef)
  }

  const phases = Object.keys(phaseStats).sort()
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    const s = phaseStats[phase]
    console.log(
      `[token-only-progress] phase=${phase} total=${s.total} ` +
      `extra=${s.passExtra}/${s.expectExtra} none=${s.passNone}/${s.expectNone}`
    )
  }

  return allPassRef.value
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (runTokenOnlyProgressTests()) {
    console.log('Passed token-only progress tests.')
  } else {
    process.exitCode = 1
  }
}
