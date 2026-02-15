import assert from 'assert'
import path from 'path'
import url from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import { parseCaseSections } from './post-processing/case-file-utils.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const CASE_FILE = path.join(__dirname, 'post-processing', 'fail-safe-cases.txt')
const MARKER_LITERAL = '\uE000SJI0:0\uE001'

const runCase = (label, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [postprocess fail-safe, ${label}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

const countInlineParseCalls = (markdown, option) => {
  const md = new MarkdownIt().use(mditStrongJa, option)
  const original = md.inline.parse
  let count = 0
  md.inline.parse = function countedInlineParse(src, parserMd, env, outTokens) {
    count++
    return original.call(this, src, parserMd, env, outTokens)
  }
  try {
    const html = md.render(markdown)
    return { count, html }
  } finally {
    md.inline.parse = original
  }
}

const assertNoExtraInlineParse = (markdown, option) => {
  const on = countInlineParseCalls(markdown, option)
  const off = countInlineParseCalls(markdown, { ...(option || {}), postprocess: false })
  assert.strictEqual(on.count, off.count)
  return { on, off }
}

const countTag = (html, tagName) => {
  const open = (html.match(new RegExp(`<${tagName}>`, 'g')) || []).length
  const close = (html.match(new RegExp(`</${tagName}>`, 'g')) || []).length
  return { open, close }
}

export const runPostprocessFailSafeTests = () => {
  const allPassRef = { value: true }
  const cases = parseCaseSections(CASE_FILE, {
    defaults: { type: '', markdown: '' },
    multilineFields: ['markdown'],
    isValid: (c) => !!(c.name && c.type && c.markdown)
  })

  const mdBaseline = new MarkdownIt()
  const mdCompatible = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })
  const mdBoundary = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
  const mdGuard = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
  const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
  const mdBoundaryNoPost = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary', postprocess: false })
  const mdGuardNoPost = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard', postprocess: false })
  const mdAggressiveNoPost = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive', postprocess: false })

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    runCase(`${c.name} (${c.type})`, () => {
      const baseline = mdBaseline.render(c.markdown)

      if (c.type === 'compatible_equals_baseline') {
        const counted = assertNoExtraInlineParse(c.markdown, { mode: 'compatible' })
        assert.strictEqual(counted.on.html, baseline)
        assert.strictEqual(mdCompatible.render(c.markdown), baseline)
        return
      }

      if (c.type === 'japanese_no_context_equals_baseline') {
        assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary' })
        assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary-guard' })
        assert.strictEqual(mdBoundary.render(c.markdown), baseline)
        assert.strictEqual(mdGuard.render(c.markdown), baseline)
        return
      }

      if (c.type === 'no_reference_definitions_equals_baseline') {
        assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary' })
        assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary-guard' })
        assertNoExtraInlineParse(c.markdown, { mode: 'aggressive' })
        assert.strictEqual(mdBoundary.render(c.markdown), baseline)
        assert.strictEqual(mdGuard.render(c.markdown), baseline)
        assert.strictEqual(mdAggressive.render(c.markdown), baseline)
        return
      }

      if (c.type === 'no_emphasis_signal_no_extra_parse_calls') {
        const boundary = assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary' }).on.html
        const guard = assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary-guard' }).on.html
        const aggressive = assertNoExtraInlineParse(c.markdown, { mode: 'aggressive' }).on.html
        assert.ok(boundary.indexOf('<a href="https://example.com/p">plain</a>') !== -1)
        assert.ok(guard.indexOf('<a href="https://example.com/p">plain</a>') !== -1)
        assert.ok(aggressive.indexOf('<a href="https://example.com/p">plain</a>') !== -1)
        return
      }

      if (c.type === 'postprocess_disabled_no_extra_parse_calls') {
        const boundary = assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary' })
        const guard = assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary-guard' })
        const aggressive = assertNoExtraInlineParse(c.markdown, { mode: 'aggressive' })
        assert.strictEqual(boundary.on.html, boundary.off.html)
        assert.strictEqual(guard.on.html, guard.off.html)
        assert.strictEqual(aggressive.on.html, aggressive.off.html)

        assert.strictEqual(mdBoundaryNoPost.render(c.markdown), boundary.off.html)
        assert.strictEqual(mdGuardNoPost.render(c.markdown), guard.off.html)
        assert.strictEqual(mdAggressiveNoPost.render(c.markdown), aggressive.off.html)
        return
      }

      if (c.type === 'no_link_pair_no_extra_parse_calls') {
        const boundary = assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary' }).on.html
        const guard = assertNoExtraInlineParse(c.markdown, { mode: 'japanese-boundary-guard' }).on.html
        const aggressive = assertNoExtraInlineParse(c.markdown, { mode: 'aggressive' }).on.html
        assert.ok(boundary.indexOf('[a<em>literal</em>]') !== -1)
        assert.ok(guard.indexOf('[a<em>literal</em>]') !== -1)
        assert.ok(aggressive.indexOf('[a<em>literal</em>]') !== -1)
        return
      }

      if (c.type === 'marker_literal_preserved') {
        const boundary = mdBoundary.render(c.markdown)
        const guard = mdGuard.render(c.markdown)
        const aggressive = mdAggressive.render(c.markdown)
        assert.ok(boundary.indexOf(MARKER_LITERAL) !== -1)
        assert.ok(guard.indexOf(MARKER_LITERAL) !== -1)
        assert.ok(aggressive.indexOf(MARKER_LITERAL) !== -1)
        return
      }

      if (c.type === 'balanced_tags_failsafe') {
        const outputs = [
          mdBoundary.render(c.markdown),
          mdGuard.render(c.markdown),
          mdAggressive.render(c.markdown)
        ]
        for (let o = 0; o < outputs.length; o++) {
          const html = outputs[o]
          const strong = countTag(html, 'strong')
          const em = countTag(html, 'em')
          assert.strictEqual(strong.open, strong.close)
          assert.strictEqual(em.open, em.close)
        }
        return
      }

      throw new Error(`Unknown fail-safe case type: ${c.type}`)
    }, allPassRef)
  }

  return allPassRef.value
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (runPostprocessFailSafeTests()) {
    console.log('Passed postprocess fail-safe tests.')
  } else {
    process.exitCode = 1
  }
}
