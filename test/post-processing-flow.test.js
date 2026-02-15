import assert from 'assert'
import path from 'path'
import url from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import { parseCaseSections } from './post-processing/case-file-utils.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const CASE_FILE = path.join(__dirname, 'post-processing', 'flow-cases.txt')

const makeMd = (option = { mode: 'aggressive' }, prePlugins = [], postPlugins = []) => {
  const md = new MarkdownIt()
  for (let i = 0; i < prePlugins.length; i++) {
    md.use(prePlugins[i])
  }
  md.use(mditStrongJa, { ...(option || {}) })
  for (let i = 0; i < postPlugins.length; i++) {
    md.use(postPlugins[i])
  }
  return md
}

const renderWithMetricsAndHtml = (markdown, option = { mode: 'aggressive' }, prePlugins = [], postPlugins = []) => {
  const md = makeMd(option, prePlugins, postPlugins)
  const env = { __strongJaPostprocessMetrics: {} }
  const html = md.render(markdown, env)
  return {
    metrics: env.__strongJaPostprocessMetrics || {},
    html
  }
}

const breakStrongMarkupPlugin = (md) => {
  md.core.ruler.before('strong_ja_token_postprocess', 'strong_ja_test_break_strong_markup_for_flow', (state) => {
    if (!state || !state.tokens) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children) continue
      for (let j = 0; j < token.children.length; j++) {
        const child = token.children[j]
        if (!child) continue
        if (child.type !== 'strong_open' && child.type !== 'strong_close') continue
        if (child.markup !== '**') continue
        child.markup = '!!'
      }
    }
  })
}

const POST_PLUGIN_REGISTRY = {
  'break-strong-markup': breakStrongMarkupPlugin
}

const resolvePostPlugins = (pluginName) => {
  if (!pluginName || pluginName === 'none') return []
  const plugin = POST_PLUGIN_REGISTRY[pluginName]
  if (!plugin) throw new Error(`Unknown post_plugin: ${pluginName}`)
  return [plugin]
}

const assertMetricHit = (metrics, bucket, key, label) => {
  const table = metrics && metrics[bucket] ? metrics[bucket] : null
  const count = table && typeof table[key] === 'number' ? table[key] : 0
  assert.ok(count > 0, `${label}: expected ${bucket}.${key} hit`)
}

export const runPostprocessFlowTests = () => {
  let allPass = true
  const runCase = (name, fn) => {
    try {
      fn()
    } catch (err) {
      console.log(`Test [postprocess flow, ${name}] >>>`)
      console.log(err)
      allPass = false
    }
  }

  const cases = parseCaseSections(CASE_FILE, {
    defaults: {
      mode: '',
      flow: '',
      fastpath: '',
      htmlParity: '',
      postPlugin: '',
      markdown: ''
    },
    fieldMap: {
      html_parity: 'htmlParity',
      post_plugin: 'postPlugin'
    },
    multilineFields: ['markdown'],
    transforms: {
      htmlParity: (v) => String(v || '').toLowerCase(),
      fastpath: (v) => String(v || 'none'),
      postPlugin: (v) => String(v || 'none')
    },
    isValid: (c) => {
      return !!(
        c.name &&
        c.mode &&
        c.flow &&
        (c.htmlParity === 'same' || c.htmlParity === 'different') &&
        c.markdown
      )
    }
  })
  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]
    runCase(testCase.name, () => {
      const postPlugins = resolvePostPlugins(testCase.postPlugin)
      const on = renderWithMetricsAndHtml(testCase.markdown, { mode: testCase.mode }, [], postPlugins)
      const offHtml = makeMd({ mode: testCase.mode, postprocess: false }, [], postPlugins).render(testCase.markdown)

      assertMetricHit(on.metrics, 'brokenRefFlow', 'candidate', `${testCase.name} candidate`)
      assertMetricHit(on.metrics, 'brokenRefFlow', testCase.flow, `${testCase.name} flow`)

      const brokenRefFastPaths = on.metrics && on.metrics.brokenRefFastPaths
        ? on.metrics.brokenRefFastPaths
        : {}
      if (testCase.fastpath && testCase.fastpath !== 'none') {
        assertMetricHit(on.metrics, 'brokenRefFastPaths', testCase.fastpath, `${testCase.name} fastpath`)
      } else {
        assert.strictEqual(Object.keys(brokenRefFastPaths).length, 0, `${testCase.name} fastpath`)
      }

      if (testCase.htmlParity === 'same') {
        assert.strictEqual(on.html, offHtml, `${testCase.name} html`)
      } else {
        assert.notStrictEqual(on.html, offHtml, `${testCase.name} html`)
      }
    })
  }

  if (allPass) {
    console.log('Passed postprocess flow tests.')
  }
  return allPass
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (!runPostprocessFlowTests()) {
    process.exitCode = 1
  }
}
