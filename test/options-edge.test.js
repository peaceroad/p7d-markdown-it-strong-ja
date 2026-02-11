import assert from 'assert'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import mditCJKBreaks from '@peaceroad/markdown-it-cjk-breaks-mod'

const runCase = (name, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [options edge, ${name}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

const markInlineMetaPlugin = (md) => {
  md.core.ruler.after('inline', 'strong_ja_test_mark_inline_meta', (state) => {
    if (!state || !state.tokens) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children) continue
      for (let j = 0; j < token.children.length; j++) {
        const child = token.children[j]
        if (!child || child.type !== 'text' || !child.content) continue
        if (child.content.indexOf('Text') === -1 && child.content.indexOf('リンク') === -1) continue
        child.meta = { ...(child.meta || {}), __strongJaMetaProbe: true }
      }
    }
  })
}

const withParseInlineCounter = (fn) => {
  const original = MarkdownIt.prototype.parseInline
  let count = 0
  MarkdownIt.prototype.parseInline = function countedParseInline(src, env) {
    count++
    return original.call(this, src, env)
  }
  try {
    fn()
  } finally {
    MarkdownIt.prototype.parseInline = original
  }
  return count
}

const COMPLEX_CASE_INPUT = {
  brokenA: '**崩れた[参照*リンクラベル][ref-star と [inline*link*broken](https://example.com/in*complete) と [urlwithstar](https://example.com/path*with) の組み合わせ**\n\n[ref-star]: https://example.com/ref*star',
  brokenB: '**壊れ1[参照*ラベル1][ref-a と [ok1](https://example.com/a*1) と 壊れ2[参照*ラベル2][ref-b と [ok2](https://example.com/b*2) の組み合わせ**\n\n[ref-a]: https://example.com/ref*a\n[ref-b]: https://example.com/ref*b',
  tail: 'aa**aa***Text***と*More*bb**bbテストは[aa**aa***Text***と*More*bb**bb][]です。aa**aa***Text***と*More*bb**bb\n\n[aa**aa***Text***と*More*bb**bb]: https://example.net/'
}

const COMPLEX_CASE_EXPECTED_HTML = {
  brokenA: '<p><strong>崩れた[参照*リンクラベル][ref-star と <a href="https://example.com/in*complete">inline<em>link</em>broken</a> と <a href="https://example.com/path*with">urlwithstar</a> の組み合わせ</strong></p>\n',
  brokenB: '<p><strong>壊れ1[参照<em>ラベル1][ref-a と <a href="https://example.com/a*1">ok1</a> と 壊れ2[参照</em>ラベル2][ref-b と <a href="https://example.com/b*2">ok2</a> の組み合わせ</strong></p>\n',
  tail: '<p>aa<strong>aa</strong><em>Text</em><strong>と<em>More</em>bb</strong>bbテストは<a href="https://example.net/">aa<strong>aa</strong><em>Text</em><strong>と<em>More</em>bb</strong>bb</a>です。aa<strong>aa</strong><em>Text</em><strong>と<em>More</em>bb</strong>bb</p>\n'
}

const REPAIR_OPTION_MATRIX = [
  { label: 'japanese', option: {} },
  { label: 'aggressive', option: { mode: 'aggressive' } },
  { label: 'japanese+mditAttrs:false', option: { mditAttrs: false } },
  { label: 'aggressive+mditAttrs:false', option: { mode: 'aggressive', mditAttrs: false } }
]

const COMPAT_OPTION_MATRIX = [
  { label: 'compatible', option: { mode: 'compatible' } },
  { label: 'compatible+mditAttrs:false', option: { mode: 'compatible', mditAttrs: false } }
]

const BROKEN_WITH_CODE_LABEL_INPUT = '**崩れ[参照*ラベル][ref-c と [code`a*b`](https://example.com/c*1) と [ok](https://example.com/ok*2) の組み合わせ**\n\n[ref-c]: https://example.com/ref*c'
const BROKEN_WITH_CODE_LABEL_EXPECTED = '<p><strong>崩れ[参照*ラベル][ref-c と <a href="https://example.com/c*1">code<code>a*b</code></a> と <a href="https://example.com/ok*2">ok</a> の組み合わせ</strong></p>\n'

const TAIL_WITH_CODE_INPUT = 'aa**aa***Text***と*More*bb**bbテストは[aa**aa***Text***と*More*bb**bb][]です。aa**aa***Text***と*More*bb**bbと`c*d`\n\n[aa**aa***Text***と*More*bb**bb]: https://example.net/'
const ENGLISH_ONLY_TAIL_INPUT = 'aa**aa***Text***and*More*bb**bb test [aa**aa***Text***and*More*bb**bb][] end aa**aa***Text***and*More*bb**bb\n\n[aa**aa***Text***and*More*bb**bb]: https://example.net/'
const ISLAND_MARKER_LITERAL = '\uE000SJI0\uE001'
const TAIL_WITH_ISLAND_MARKER_INPUT = `aa**aa***Text***と*More*bb**bbテストは[aa**aa***Text***と*More*bb**bb][]です。${ISLAND_MARKER_LITERAL}aa**aa***Text***と*More*bb**bb\n\n[aa**aa***Text***と*More*bb**bb]: https://example.net/`

const BROKEN_WITH_LINK_TITLE_INPUT = '**崩れた[参照*リンクラベル][ref-star と [inline*link*broken](https://example.com/in*complete "T") と [urlwithstar](https://example.com/path*with) の組み合わせ**\n\n[ref-star]: https://example.com/ref*star'
const BROKEN_WITH_LINK_TITLE_EXPECTED = '<p><strong>崩れた[参照*リンクラベル][ref-star と <a href="https://example.com/in*complete" title="T">inline<em>link</em>broken</a> と <a href="https://example.com/path*with">urlwithstar</a> の組み合わせ</strong></p>\n'

const BROKEN_WITH_HARDBREAK_LINK_LABEL_INPUT = '**崩れた[参照*リンクラベル][ref-star と [line  \nbreak*label*](https://example.com/in*complete) と [urlwithstar](https://example.com/path*with) の組み合わせ**\n\n[ref-star]: https://example.com/ref*star'
const BROKEN_WITH_HARDBREAK_LINK_LABEL_EXPECTED = '<p><strong>崩れた[参照*リンクラベル][ref-star と <a href="https://example.com/in*complete">line<br>\nbreak<em>label</em></a> と <a href="https://example.com/path*with">urlwithstar</a> の組み合わせ</strong></p>\n'
const UNRESOLVED_COLLAPSED_REF_LINK_CASES = [
  '[**a[x](v)**][]\n\n[nohit]: https://example.com',
  '[**aa[x](v)**][]\n\n[nohit]: https://example.com',
  '[**a[x](v)a**][]\n\n[nohit]: https://example.com',
  '[**a。[x](v)**][]\n\n[nohit]: https://example.com',
  '[**a[x](v)と**][]\n\n[nohit]: https://example.com',
  '[**a[x](v)*a***][]\n\n[nohit]: https://example.com',
  '[**a[x](v)`a*b`**][]\n\n[nohit]: https://example.com',
  '[**a[x](v)a*][]\n\n[nohit]: https://example.com',
  '[**a[x](v)と*][]\n\n[nohit]: https://example.com',
  '[*a[x](v)a**][]\n\n[nohit]: https://example.com',
  '[*a[x](v)と**][]\n\n[nohit]: https://example.com',
  '[*a[x](v)*][]\n\n[nohit]: https://example.com',
  '[*aa[x](v)*][]\n\n[nohit]: https://example.com',
  '[*a[x](v)a*][]\n\n[nohit]: https://example.com',
  '[*a。[x](v)*][]\n\n[nohit]: https://example.com',
  '[*a[x](v)と*][]\n\n[nohit]: https://example.com',
  '[*a[x](v)`a*b`*][]\n\n[nohit]: https://example.com'
]
const MALFORMED_NESTED_LINK_STAR_CASES = [
  '**[**[x](v)](u)**',
  '*[a*a*[x](v)](u)*',
  '**[a**a**[x](v)](u)**',
  '**壊れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**\n\n[ref]: https://example.com'
]

export const runOptionEdgeTests = () => {
  const allPassRef = { value: true }

  runCase('mode alias japanese-only', () => {
    const input = 'これは**[text](url)**です'
    const mdDefault = new MarkdownIt().use(mditStrongJa)
    const mdAlias = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-only' })
    assert.strictEqual(mdAlias.render(input), mdDefault.render(input))
  }, allPassRef)

  runCase('scanDelims patch is idempotent per prototype', () => {
    const md1 = new MarkdownIt().use(mditStrongJa)
    const patched = md1.inline.State.prototype.scanDelims
    const md2 = new MarkdownIt().use(mditStrongJa)
    assert.strictEqual(md2.inline.State.prototype.scanDelims, patched)
  }, allPassRef)

  runCase('per-render mode override', () => {
    const input = 'これは**[text](url)**です'
    const md = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })
    assert.strictEqual(
      md.render(input),
      '<p>これは**<a href="url">text</a>**です</p>\n'
    )
    assert.strictEqual(
      md.render(input, { __strongJaTokenOpt: { mode: 'aggressive' } }),
      '<p>これは<strong><a href="url">text</a></strong>です</p>\n'
    )
  }, allPassRef)

  runCase('postprocess off keeps collapsed ref literal', () => {
    const input = '[**Text**][]'
    const env = { references: { TEXT: { href: 'https://example.com', title: '' } } }
    const mdOn = new MarkdownIt().use(mditStrongJa)
    const mdOff = new MarkdownIt().use(mditStrongJa, { postprocess: false })
    assert.strictEqual(
      mdOn.render(input, env),
      '<p>[<strong>Text</strong>][]</p>\n'
    )
    assert.strictEqual(
      mdOff.render(input, env),
      '<p>[<strong>Text</strong>][]</p>\n'
    )
  }, allPassRef)

  runCase('collapsed reference label matching stays markdown-it compatible', () => {
    const input = '[**x**][]\n\n[x]: /u'
    const mdBase = new MarkdownIt()
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
    const mdCompatible = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })
    const expected = mdBase.render(input)
    assert.strictEqual(mdJapanese.render(input), expected)
    assert.strictEqual(mdAggressive.render(input), expected)
    assert.strictEqual(mdCompatible.render(input), expected)
  }, allPassRef)

  runCase('collapsed reference label matches when definition keeps emphasis markup', () => {
    const input = '[**Text**][]\n\n[**Text**]: https://example.com/'
    const mdBase = new MarkdownIt()
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
    const mdCompatible = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })
    const expected = mdBase.render(input)
    assert.strictEqual(mdJapanese.render(input), expected)
    assert.strictEqual(mdAggressive.render(input), expected)
    assert.strictEqual(mdCompatible.render(input), expected)
  }, allPassRef)

  runCase('collapsed reference label matching follows normalizeReference case folding', () => {
    const input = '[**Text**][]\n\n[**text**]: https://example.com/'
    const mdBase = new MarkdownIt()
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
    const mdCompatible = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })
    const expected = mdBase.render(input)
    assert.strictEqual(mdJapanese.render(input), expected)
    assert.strictEqual(mdAggressive.render(input), expected)
    assert.strictEqual(mdCompatible.render(input), expected)
  }, allPassRef)

  runCase('japanese mode uses local star context instead of whole-inline trigger', () => {
    const input = '日本語です。 **Important.**Please review**'
    const mdBase = new MarkdownIt()
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const expected = mdBase.render(input)
    assert.strictEqual(mdJapanese.render(input), expected)
  }, allPassRef)

  runCase('japanese mode keeps Japanese-leading single-star pairing in plain text and inline link labels', () => {
    const plain = '*味噌汁。*umai*'
    const inlineLink = '[*味噌汁。*umai*]()'
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    assert.strictEqual(
      mdJapanese.render(plain),
      '<p><em>味噌汁。</em>umai*</p>\n'
    )
    assert.strictEqual(
      mdJapanese.render(inlineLink),
      '<p><a href=""><em>味噌汁。</em>umai*</a></p>\n'
    )
  }, allPassRef)

  runCase('japanese mode keeps punctuation-leading single-star pairing in plain text and inline link labels', () => {
    const plain = '*。*umai*'
    const inlineLink = '[*。*umai*]()'
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    assert.strictEqual(
      mdJapanese.render(plain),
      '<p><em>。</em>umai*</p>\n'
    )
    assert.strictEqual(
      mdJapanese.render(inlineLink),
      '<p><a href=""><em>。</em>umai*</a></p>\n'
    )
  }, allPassRef)

  runCase('japanese mode prefers Japanese punctuation-side pairing for mixed single-star sequence', () => {
    const plain = '日本語 *A。*B*'
    const inlineLink = '説明は[*A。*B*]()です。'
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    assert.strictEqual(
      mdJapanese.render(plain),
      '<p>日本語 <em>A。</em>B*</p>\n'
    )
    assert.strictEqual(
      mdJapanese.render(inlineLink),
      '<p>説明は<a href=""><em>A。</em>B*</a>です。</p>\n'
    )
  }, allPassRef)

  runCase('japanese mode does not degrade markdown-it-valid emphasis inside malformed link labels', () => {
    const input = '[。*a**](u)'
    const mdBase = new MarkdownIt()
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const expected = mdBase.render(input)
    assert.strictEqual(mdJapanese.render(input), expected)
  }, allPassRef)

  runCase('per-render postprocess override', () => {
    const input = '[**Text**][]'
    const md = new MarkdownIt().use(mditStrongJa, {
      mode: 'compatible',
      postprocess: false
    })
    const env = {
      references: { TEXT: { href: 'https://example.com', title: '' } },
      __strongJaTokenOpt: { mode: 'aggressive', postprocess: true }
    }
    assert.strictEqual(
      md.render(input, env),
      '<p>[<strong>Text</strong>][]</p>\n'
    )
  }, allPassRef)

  runCase('coreRulesBeforePostprocess reorder + normalize', () => {
    const md = new MarkdownIt()
    md.core.ruler.push('my_custom_rule', () => {})
    md.use(mditStrongJa, {
      coreRulesBeforePostprocess: ['  my_custom_rule  ', 'my_custom_rule']
    })
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const customIdx = names.indexOf('my_custom_rule')
    const postprocessIdx = names.indexOf('strong_ja_token_postprocess')
    assert.ok(customIdx !== -1 && postprocessIdx !== -1)
    assert.ok(customIdx < postprocessIdx)
  }, allPassRef)

  runCase('coreRulesBeforePostprocess with cjk_breaks name', () => {
    const md = new MarkdownIt()
      .use(mditCJKBreaks, { either: true })
      .use(mditStrongJa, {
        coreRulesBeforePostprocess: [' cjk_breaks ', 'cjk_breaks']
      })
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const cjkIdx = names.indexOf('cjk_breaks')
    const postprocessIdx = names.indexOf('strong_ja_token_postprocess')
    assert.ok(cjkIdx !== -1 && postprocessIdx !== -1)
    assert.ok(cjkIdx < postprocessIdx)
  }, allPassRef)

  runCase('cjk_breaks plugin order parity for basic strong-link case', () => {
    const input = '日本語**[Text](https://example.com)**\n次行です。'
    const mdStrongThenCjk = new MarkdownIt()
      .use(mditStrongJa)
      .use(mditCJKBreaks, { either: true })
    const mdCjkThenStrong = new MarkdownIt()
      .use(mditCJKBreaks, { either: true })
      .use(mditStrongJa)
    assert.strictEqual(mdStrongThenCjk.render(input), mdCjkThenStrong.render(input))
  }, allPassRef)

  runCase('cjk_breaks plugin order parity when mditAttrs is false', () => {
    const input = '日本語**[Text](https://example.com)**\n次行です。'
    const mdStrongThenCjk = new MarkdownIt()
      .use(mditStrongJa, { mditAttrs: false })
      .use(mditCJKBreaks, { either: true })
    const mdCjkThenStrong = new MarkdownIt()
      .use(mditCJKBreaks, { either: true })
      .use(mditStrongJa, { mditAttrs: false })
    assert.strictEqual(mdStrongThenCjk.render(input), mdCjkThenStrong.render(input))
  }, allPassRef)

  runCase('coreRulesBeforePostprocess still applies when postprocess is false', () => {
    const md = new MarkdownIt()
    md.core.ruler.push('my_custom_rule', () => {})
    md.use(mditStrongJa, {
      postprocess: false,
      coreRulesBeforePostprocess: ['my_custom_rule']
    })
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const customIdx = names.indexOf('my_custom_rule')
    const postprocessIdx = names.indexOf('strong_ja_token_postprocess')
    assert.ok(customIdx !== -1 && postprocessIdx !== -1)
    assert.ok(customIdx < postprocessIdx)
  }, allPassRef)

  runCase('patchCorePush true moves restore after late cjk rule', () => {
    const md = new MarkdownIt().use(mditStrongJa, {
      mditAttrs: false,
      patchCorePush: true
    })
    md.core.ruler.push('late_cjk_breaks_custom', () => {})
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const lateIdx = names.indexOf('late_cjk_breaks_custom')
    const restoreIdx = names.indexOf('strong_ja_restore_softbreaks')
    assert.ok(lateIdx !== -1 && restoreIdx !== -1)
    assert.ok(lateIdx < restoreIdx)
  }, allPassRef)

  runCase('patchCorePush false keeps restore position', () => {
    const md = new MarkdownIt().use(mditStrongJa, {
      mditAttrs: false,
      patchCorePush: false
    })
    md.core.ruler.push('late_cjk_breaks_custom', () => {})
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const lateIdx = names.indexOf('late_cjk_breaks_custom')
    const restoreIdx = names.indexOf('strong_ja_restore_softbreaks')
    assert.ok(lateIdx !== -1 && restoreIdx !== -1)
    assert.ok(restoreIdx < lateIdx)
  }, allPassRef)

  runCase('complex broken/tail outputs stay stable across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      assert.strictEqual(md.render(COMPLEX_CASE_INPUT.brokenA), COMPLEX_CASE_EXPECTED_HTML.brokenA, cfg.label)
      assert.strictEqual(md.render(COMPLEX_CASE_INPUT.brokenB), COMPLEX_CASE_EXPECTED_HTML.brokenB, cfg.label)
      assert.strictEqual(md.render(COMPLEX_CASE_INPUT.tail), COMPLEX_CASE_EXPECTED_HTML.tail, cfg.label)
    }
  }, allPassRef)

  runCase('broken segment with code_inline label stays stable across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      assert.strictEqual(md.render(BROKEN_WITH_CODE_LABEL_INPUT), BROKEN_WITH_CODE_LABEL_EXPECTED, cfg.label)
    }
  }, allPassRef)

  runCase('tail segment with code_inline keeps code content across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      const html = md.render(TAIL_WITH_CODE_INPUT)
      assert.ok(html.indexOf('<code>c*d</code>') !== -1, cfg.label)
      assert.ok(html.indexOf('`</p>') === -1, cfg.label)
    }
  }, allPassRef)

  runCase('japanese mode skips tail repair when target segment has no Japanese context', () => {
    const mdBase = new MarkdownIt()
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
    const baseHtml = mdBase.render(ENGLISH_ONLY_TAIL_INPUT)
    const japaneseHtml = mdJapanese.render(ENGLISH_ONLY_TAIL_INPUT)
    const aggressiveHtml = mdAggressive.render(ENGLISH_ONLY_TAIL_INPUT)
    assert.strictEqual(japaneseHtml, baseHtml)
    assert.notStrictEqual(aggressiveHtml, baseHtml)
    assert.ok(aggressiveHtml.indexOf('<strong>and<em>More</em>bb</strong>') !== -1)
  }, allPassRef)

  runCase('meta-bearing inline tokens do not block complex repairs across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt()
        .use(markInlineMetaPlugin)
        .use(mditStrongJa, cfg.option)
      assert.strictEqual(md.render(COMPLEX_CASE_INPUT.brokenA), COMPLEX_CASE_EXPECTED_HTML.brokenA, cfg.label)
      assert.strictEqual(md.render(COMPLEX_CASE_INPUT.brokenB), COMPLEX_CASE_EXPECTED_HTML.brokenB, cfg.label)
      assert.strictEqual(md.render(COMPLEX_CASE_INPUT.tail), COMPLEX_CASE_EXPECTED_HTML.tail, cfg.label)
    }
  }, allPassRef)

  runCase('island marker literal text survives reparse with meta-bearing tokens across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const mdPlain = new MarkdownIt().use(mditStrongJa, cfg.option)
      const mdMeta = new MarkdownIt()
        .use(markInlineMetaPlugin)
        .use(mditStrongJa, cfg.option)
      const plainHtml = mdPlain.render(TAIL_WITH_ISLAND_MARKER_INPUT)
      const metaHtml = mdMeta.render(TAIL_WITH_ISLAND_MARKER_INPUT)
      assert.strictEqual(metaHtml, plainHtml, cfg.label)
      assert.ok(metaHtml.indexOf(ISLAND_MARKER_LITERAL) !== -1, cfg.label)
    }
  }, allPassRef)

  runCase('broken segment keeps link title across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      assert.strictEqual(md.render(BROKEN_WITH_LINK_TITLE_INPUT), BROKEN_WITH_LINK_TITLE_EXPECTED, cfg.label)
    }
  }, allPassRef)

  runCase('broken segment keeps hardbreak in link label across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      assert.strictEqual(md.render(BROKEN_WITH_HARDBREAK_LINK_LABEL_INPUT), BROKEN_WITH_HARDBREAK_LINK_LABEL_EXPECTED, cfg.label)
    }
  }, allPassRef)

  runCase('unresolved collapsed refs with inline links keep balanced em/strong tags across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      for (let c = 0; c < UNRESOLVED_COLLAPSED_REF_LINK_CASES.length; c++) {
        const src = UNRESOLVED_COLLAPSED_REF_LINK_CASES[c]
        const html = md.render(src)
        const strongOpen = (html.match(/<strong>/g) || []).length
        const strongClose = (html.match(/<\/strong>/g) || []).length
        const emOpen = (html.match(/<em>/g) || []).length
        const emClose = (html.match(/<\/em>/g) || []).length
        assert.strictEqual(strongOpen, strongClose, `${cfg.label} case:${c}`)
        assert.strictEqual(emOpen, emClose, `${cfg.label} case:${c}`)
      }
    }
  }, allPassRef)

  runCase('unresolved collapsed refs with inline links match markdown-it in compatible mode', () => {
    const mdBase = new MarkdownIt()
    for (let i = 0; i < COMPAT_OPTION_MATRIX.length; i++) {
      const cfg = COMPAT_OPTION_MATRIX[i]
      const mdCompat = new MarkdownIt().use(mditStrongJa, cfg.option)
      for (let c = 0; c < UNRESOLVED_COLLAPSED_REF_LINK_CASES.length; c++) {
        const src = UNRESOLVED_COLLAPSED_REF_LINK_CASES[c]
        assert.strictEqual(mdCompat.render(src), mdBase.render(src), `${cfg.label} case:${c}`)
      }
    }
  }, allPassRef)

  runCase('compatible mode keeps markdown-it output for malformed and broken-link repairs', () => {
    const mdBase = new MarkdownIt()
    const parityCases = [
      COMPLEX_CASE_INPUT.brokenA,
      COMPLEX_CASE_INPUT.brokenB,
      COMPLEX_CASE_INPUT.tail,
      ENGLISH_ONLY_TAIL_INPUT,
      BROKEN_WITH_CODE_LABEL_INPUT,
      BROKEN_WITH_LINK_TITLE_INPUT,
      BROKEN_WITH_HARDBREAK_LINK_LABEL_INPUT,
      ...MALFORMED_NESTED_LINK_STAR_CASES
    ]
    for (let i = 0; i < COMPAT_OPTION_MATRIX.length; i++) {
      const cfg = COMPAT_OPTION_MATRIX[i]
      const mdCompat = new MarkdownIt().use(mditStrongJa, cfg.option)
      for (let c = 0; c < parityCases.length; c++) {
        const src = parityCases[c]
        assert.strictEqual(mdCompat.render(src), mdBase.render(src), `${cfg.label} case:${c}`)
      }
    }
  }, allPassRef)

  runCase('malformed link marker without references keeps markdown-it output across all mode/options', () => {
    const src = '**[**[x](v)](u)**'
    const expected = new MarkdownIt().render(src)
    const allOptions = [...REPAIR_OPTION_MATRIX, ...COMPAT_OPTION_MATRIX]
    for (let i = 0; i < allOptions.length; i++) {
      const cfg = allOptions[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      assert.strictEqual(md.render(src), expected, cfg.label)
    }
  }, allPassRef)

  runCase('malformed nested link+star inputs never emit orphan em/strong tags across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      for (let c = 0; c < MALFORMED_NESTED_LINK_STAR_CASES.length; c++) {
        const src = MALFORMED_NESTED_LINK_STAR_CASES[c]
        const html = md.render(src)
        const strongOpen = (html.match(/<strong>/g) || []).length
        const strongClose = (html.match(/<\/strong>/g) || []).length
        const emOpen = (html.match(/<em>/g) || []).length
        const emClose = (html.match(/<\/em>/g) || []).length
        assert.strictEqual(strongOpen, strongClose, `${cfg.label} malformed:${c}`)
        assert.strictEqual(emOpen, emClose, `${cfg.label} malformed:${c}`)
      }
    }
  }, allPassRef)

  runCase('parseInline reparse is used on broken segments across repair modes', () => {
    const count = withParseInlineCounter(() => {
      for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
        const cfg = REPAIR_OPTION_MATRIX[i]
        const md = new MarkdownIt().use(mditStrongJa, cfg.option)
        md.render(COMPLEX_CASE_INPUT.brokenA)
        md.render(COMPLEX_CASE_INPUT.brokenB)
        md.render(COMPLEX_CASE_INPUT.tail)
        md.render(BROKEN_WITH_CODE_LABEL_INPUT)
        md.render(BROKEN_WITH_LINK_TITLE_INPUT)
        md.render(BROKEN_WITH_HARDBREAK_LINK_LABEL_INPUT)
      }
    })
    assert.ok(count > 0)
  }, allPassRef)

  return allPassRef.value
}
