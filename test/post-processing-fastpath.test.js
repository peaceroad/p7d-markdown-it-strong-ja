import assert from 'assert'
import path from 'path'
import url from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import { parseCaseSections } from './post-processing/case-file-utils.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const CASE_FILE = path.join(__dirname, 'post-processing', 'fastpath-cases.txt')

const renderWithMetrics = (markdown, option = { mode: 'aggressive' }) => {
  const md = new MarkdownIt().use(mditStrongJa, { ...(option || {}) })
  const env = { __strongJaPostprocessMetrics: {} }
  md.render(markdown, env)
  return env.__strongJaPostprocessMetrics || {}
}

const assertPathHit = (metrics, bucket, key, label) => {
  const table = metrics && metrics[bucket] ? metrics[bucket] : null
  const count = table && typeof table[key] === 'number' ? table[key] : 0
  assert.ok(count > 0, `${label}: expected ${bucket}.${key} hit`)
}

export const runPostprocessFastPathTests = () => {
  let allPass = true
  const runCase = (name, fn) => {
    try {
      fn()
    } catch (err) {
      console.log(`Test [postprocess fastpath, ${name}] >>>`)
      console.log(err)
      allPass = false
    }
  }

  const cases = parseCaseSections(CASE_FILE, {
    defaults: { mode: '', bucket: '', key: '', markdown: '' },
    multilineFields: ['markdown'],
    isValid: (c) => !!(c.name && c.mode && c.bucket && c.key && c.markdown)
  })

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]
    runCase(testCase.name, () => {
      const metrics = renderWithMetrics(testCase.markdown, { mode: testCase.mode })
      assertPathHit(metrics, testCase.bucket, testCase.key, testCase.name)
    })
  }

  if (allPass) {
    console.log('Passed postprocess fast-path tests.')
  }
  return allPass
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (!runPostprocessFastPathTests()) {
    process.exitCode = 1
  }
}
