import assert from 'assert'
import { pathToFileURL } from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'

const renderWithMetrics = (markdown, option = {}) => {
  const md = new MarkdownIt().use(mditStrongJa, { ...(option || {}) })
  const env = { __strongJaPostprocessMetrics: {} }
  md.render(markdown, env)
  return env.__strongJaPostprocessMetrics || {}
}

const assertMetricHit = (metrics, bucket, key, label) => {
  const table = metrics && metrics[bucket] ? metrics[bucket] : null
  const count = table && typeof table[key] === 'number' ? table[key] : 0
  assert.ok(count > 0, `${label}: expected ${bucket}.${key} hit`)
}

const assertMetricMissing = (metrics, bucket, key, label) => {
  const table = metrics && metrics[bucket] ? metrics[bucket] : null
  const count = table && typeof table[key] === 'number' ? table[key] : 0
  assert.strictEqual(count, 0, `${label}: expected ${bucket}.${key} miss`)
}

export const runPostprocessEmphasisMetricsTests = () => {
  let allPass = true
  const runCase = (name, fn) => {
    try {
      fn()
    } catch (err) {
      console.log(`Test [postprocess emphasis metrics, ${name}] >>>`)
      console.log(err)
      allPass = false
    }
  }

  runCase('leading asterisk fix is reported in japanese mode', () => {
    const markdown = '[リンク内で *強調 と `code*` と **太字** *終端*](https://example.com/foo*bar)の後ろに*補足*があります。'
    const metrics = renderWithMetrics(markdown, { mode: 'japanese' })
    assertMetricHit(metrics, 'emphasisFixers', 'leading-asterisk-em', 'leading-asterisk-em')
    assertMetricHit(metrics, 'emphasisSanitize', 'attempted', 'leading-asterisk sanitize attempted')
    assertMetricHit(metrics, 'emphasisSanitize', 'attempted-after-change', 'leading-asterisk sanitize after change')
  })

  runCase('tail emphasis fixers are reported together on canonical malformed tail', () => {
    const markdown = 'aa**aa***Text***と*More*bb**bbテストは[aa**aa***Text***と*More*bb**bb][]です。aa**aa***Text***と*More*bb**bb\n\n[aa**aa***Text***と*More*bb**bb]: https://example.net/'
    const metrics = renderWithMetrics(markdown, { mode: 'japanese' })
    assertMetricHit(metrics, 'emphasisFixers', 'em-outer-strong-sequence', 'em-outer-strong-sequence')
    assertMetricHit(metrics, 'emphasisFixers', 'trailing-strong', 'trailing-strong')
  })

  runCase('sanitize fixer is reported on malformed broken-ref residue in aggressive mode', () => {
    const markdown = '**[a**a**[x*](u)*a**\n\n[ref]: u'
    const metrics = renderWithMetrics(markdown, { mode: 'aggressive' })
    assertMetricHit(metrics, 'emphasisFixers', 'sanitize-em-strong-balance', 'sanitize-em-strong-balance')
    assertMetricHit(metrics, 'emphasisSanitize', 'attempted', 'sanitize attempted')
    assertMetricHit(metrics, 'emphasisSanitize', 'repaired', 'sanitize repaired')
  })

  runCase('balanced emphasis skips sanitize on no-op path', () => {
    const markdown = '和食では**「だし」**が料理の土台です。説明文では*味*の比較もします。'
    const metrics = renderWithMetrics(markdown, { mode: 'japanese' })
    assertMetricHit(metrics, 'emphasisSanitize', 'skipped-balanced', 'sanitize skipped balanced')
    assertMetricMissing(metrics, 'emphasisSanitize', 'attempted', 'sanitize attempted')
  })

  if (allPass) {
    console.log('Passed postprocess emphasis metrics tests.')
  }
  return allPass
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!runPostprocessEmphasisMetricsTests()) {
    process.exitCode = 1
  }
}
