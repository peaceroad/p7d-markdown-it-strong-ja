import assert from 'assert'
import MarkdownIt from 'markdown-it'
import Token from 'markdown-it/lib/token.mjs'
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

const markUnsafeLinkAttrsPlugin = (md) => {
  md.core.ruler.after('inline', 'strong_ja_test_mark_link_attrs', (state) => {
    if (!state || !state.tokens) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children) continue
      for (let j = 0; j < token.children.length; j++) {
        const child = token.children[j]
        if (!child || child.type !== 'link_open') continue
        child.attrPush(['data-probe', 'x'])
      }
    }
  })
}

const markMalformedHrefAttrPlugin = (md) => {
  md.core.ruler.after('inline', 'strong_ja_test_mark_malformed_href_attr', (state) => {
    if (!state || !state.tokens) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children) continue
      for (let j = 0; j < token.children.length; j++) {
        const child = token.children[j]
        if (!child || child.type !== 'link_open') continue
        child.attrs = [['href']]
      }
    }
  })
}

const markCustomWrapperTokensPlugin = (md) => {
  md.core.ruler.after('inline', 'strong_ja_test_custom_wrapper_tokens', (state) => {
    if (!state || !state.tokens) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children) continue
      const children = token.children
      for (let j = 0; j < children.length; j++) {
        const child = children[j]
        if (!child || child.type !== 'link_open') continue
        let depth = 1
        let closeIdx = -1
        for (let k = j + 1; k < children.length; k++) {
          if (children[k].type === 'link_open') depth++
          if (children[k].type === 'link_close') depth--
          if (depth === 0) {
            closeIdx = k
            break
          }
        }
        if (closeIdx === -1) continue
        const closeWrapper = new Token('custom_close', 'x', -1)
        closeWrapper.level = child.level
        const openWrapper = new Token('custom_open', 'x', 1)
        openWrapper.level = child.level
        children.splice(closeIdx + 1, 0, openWrapper)
        children.splice(j, 0, closeWrapper)
        break
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

const getInlineParseCallCount = (option, markdown) => {
  const md = new MarkdownIt().use(mditStrongJa, { ...(option || {}) })
  const original = md.inline.parse
  let count = 0
  md.inline.parse = function countedInlineParse(src, parserMd, env, outTokens) {
    count++
    return original.call(this, src, parserMd, env, outTokens)
  }
  try {
    md.render(markdown)
  } finally {
    md.inline.parse = original
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
  { label: 'japanese-boundary-guard', option: { mode: 'japanese-boundary-guard' } },
  { label: 'aggressive', option: { mode: 'aggressive' } },
  { label: 'japanese+mditAttrs:false', option: { mditAttrs: false } },
  { label: 'japanese-boundary-guard+mditAttrs:false', option: { mode: 'japanese-boundary-guard', mditAttrs: false } },
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
const TAIL_WITH_DANGLING_STRONG_CLOSE_INPUT = '[aa**aa***Text***と*More*bb**bb][]参照[line  \nbreak](u)aa**aa***Text***と*More*bb**bb。a_[line  \nbreak](u)x***'
const UNDERSCORE_ONLY_MALFORMED_INPUT = '[a__a__](u)[x](u)_とa [a__a__](u)a[a](v)yyb[ya__[a](v)[line  \nbreak](u)[a__a__](u)[]\n\n[ref]: https://example.com/ref*star'
const BROKEN_REF_NO_EMPHASIS_SEGMENT_INPUT = '**前文** 壊れた[参照ラベル と [plain](https://example.com/p) の続き\n\n[ref]: https://example.com/ref'
const MARKER_LITERAL = '\uE000SJI0\uE001'
const TAIL_WITH_MARKER_LITERAL_INPUT = `aa**aa***Text***と*More*bb**bbテストは[aa**aa***Text***と*More*bb**bb][]です。${MARKER_LITERAL}aa**aa***Text***と*More*bb**bb\n\n[aa**aa***Text***と*More*bb**bb]: https://example.net/`

const BROKEN_WITH_LINK_TITLE_INPUT = '**崩れた[参照*リンクラベル][ref-star と [inline*link*broken](https://example.com/in*complete "T") と [urlwithstar](https://example.com/path*with) の組み合わせ**\n\n[ref-star]: https://example.com/ref*star'
const BROKEN_WITH_LINK_TITLE_EXPECTED = '<p><strong>崩れた[参照*リンクラベル][ref-star と <a href="https://example.com/in*complete" title="T">inline<em>link</em>broken</a> と <a href="https://example.com/path*with">urlwithstar</a> の組み合わせ</strong></p>\n'

const BROKEN_WITH_HARDBREAK_LINK_LABEL_INPUT = '**崩れた[参照*リンクラベル][ref-star と [line  \nbreak*label*](https://example.com/in*complete) と [urlwithstar](https://example.com/path*with) の組み合わせ**\n\n[ref-star]: https://example.com/ref*star'
const BROKEN_WITH_HARDBREAK_LINK_LABEL_EXPECTED = '<p><strong>崩れた[参照*リンクラベル][ref-star と <a href="https://example.com/in*complete">line<br>\nbreak<em>label</em></a> と <a href="https://example.com/path*with">urlwithstar</a> の組み合わせ</strong></p>\n'
const BROKEN_WITH_CONTINUED_STRONG_LABEL_INPUT = '**崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**[line  \nbreak*label*](u)text[line  \nbreak](u)__)**崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**  ラベル\n\n[ref]: https://example.com/ref*star'
const BROKEN_WITH_UNDERSCORE_TAIL_FUZZ_INPUT = '[a**a**](u)[x](u)_とa [a**a**](u)a[a](v)yyb[ya__[a](v)[line  \nbreak](u)[a**a**](u)[]\n\n[ref]: https://example.com/ref*star'
const BROKEN_WITH_ISOLATED_STRONG_WRAPPER_BEFORE_LINK_INPUT = '[*)[line  \nbreak](u)(。z*参照[line  \nbreak](u)x[line  \nbreak](u)z)b参照]b崩れ参照 [a](v)**[と **崩れ[参照*ラベル][ref と [x](v) の組み合わせ**\n\n[ref]: u'
const BROKEN_WITH_LEADING_CLOSE_THEN_INNER_STRONG_BEFORE_LINK_INPUT = '[line  \nbreak](u)[]__`c*d`**z[x](u)_z(y_と[line  \nbreak](u)[ **崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**\n\n[ref]: u'
const BROKEN_WITH_LEADING_UNMATCHED_STRONG_CLOSE_FUZZ_INPUT = '___崩れ[x](u)[a](v)[a](v)a**z[a](v)__a[ **崩れ[参照*ラベル][ref と [x](v) の組み合わせ**\n\n[ref]: u'
const BROKEN_WITH_LEADING_OPEN_CLOSE_ONLY_RANGE_INPUT = '*(崩れと__[*__zbx **崩れ[参照*ラベル][ref と [x](v) の組み合わせ**\n\n[ref]: u'
const BROKEN_WITH_PREDEPTH_STRONG_AND_INRANGE_CLOSE_ONLY_INPUT = '**aa [ *x* [ **崩れ[参照*ラベル][ref と [x](v) の組み合わせ**\n\n[ref]: u'
const BROKEN_WITH_MIXED_UNDERSCORE_EMPH_TOKENS_INPUT = ')_a**y)b[y**x崩れ。__参照_* **崩れ[参照*ラベル][ref と [x](v) の組み合わせ**\n\n[ref]: u'
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

  runCase('mode alias japanese -> japanese-boundary-guard', () => {
    const input = '*味噌汁。*umai*'
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const mdPlusCanonical = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    assert.strictEqual(mdJapanese.render(input), mdPlusCanonical.render(input))
  }, allPassRef)

  runCase('unknown legacy modes throw', () => {
    assert.throws(() => new MarkdownIt().use(mditStrongJa, { mode: 'japanese-base' }), /unknown mode/i)
    assert.throws(() => new MarkdownIt().use(mditStrongJa, { mode: 'japanese-plus' }), /unknown mode/i)
    assert.throws(() => new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-safe' }), /unknown mode/i)
    assert.throws(() => new MarkdownIt().use(mditStrongJa, { mode: 'japanese-only' }), /unknown mode/i)
    assert.throws(() => new MarkdownIt().use(mditStrongJa, { mode: 'japanese-beta' }), /unknown mode/i)
  }, allPassRef)

  runCase('mode japanese-boundary-guard keeps single-star Japanese local pairing', () => {
    const input = '*味噌汁。*umai*'
    const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    assert.strictEqual(
      mdPlus.render(input),
      '<p><em>味噌汁。</em>umai*</p>\n'
    )
  }, allPassRef)

  runCase('double-star code/link wrappers stay conservative on adjacent ASCII in japanese modes', () => {
    const modeOptions = [
      { mode: 'japanese-boundary' },
      { mode: 'japanese-boundary-guard' }
    ]
    for (let i = 0; i < modeOptions.length; i++) {
      const md = new MarkdownIt().use(mditStrongJa, modeOptions[i])
      assert.strictEqual(md.render('a**`x`**和'), '<p>a**<code>x</code>**和</p>\n')
      assert.strictEqual(md.render('和**`x`**a'), '<p>和**<code>x</code>**a</p>\n')
      assert.strictEqual(md.render('a**[x](u)**和'), '<p>a**<a href="u">x</a>**和</p>\n')
      assert.strictEqual(md.render('和**[x](u)**a'), '<p>和**<a href="u">x</a>**a</p>\n')
      assert.strictEqual(md.render('和**`x`**和'), '<p>和<strong><code>x</code></strong>和</p>\n')
      assert.strictEqual(md.render('和**[x](u)**和'), '<p>和<strong><a href="u">x</a></strong>和</p>\n')
      assert.strictEqual(md.render('a*[x](u)*和'), '<p>a*<a href="u">x</a>*和</p>\n')
    }
    const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
    assert.strictEqual(mdAggressive.render('a**`x`**和'), '<p>a<strong><code>x</code></strong>和</p>\n')
    assert.strictEqual(mdAggressive.render('a**[x](u)**和'), '<p>a<strong><a href="u">x</a></strong>和</p>\n')
  }, allPassRef)

  runCase('japanese-boundary-guard keeps space-adjacent ASCII single-star strict, but keeps no-space emphasis', () => {
    const mdBase = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
    const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })

    const spacedSingle = '日本語です。* Japanese food culture* です。'
    const spacedDouble = '日本語です。** Japanese food culture** です。'
    const noSpaceSingle = '日本語です。*Japanese food culture* です。'
    const noSpaceDouble = '日本語です。**Japanese food culture** です。'

    assert.strictEqual(mdPlus.render(spacedSingle), '<p>日本語です。* Japanese food culture* です。</p>\n')
    assert.strictEqual(mdPlus.render(spacedDouble), '<p>日本語です。** Japanese food culture** です。</p>\n')
    assert.strictEqual(mdPlus.render(noSpaceSingle), mdBase.render(noSpaceSingle))
    assert.strictEqual(mdPlus.render(noSpaceDouble), mdBase.render(noSpaceDouble))
  }, allPassRef)

  runCase('japanese-boundary-guard keeps space-adjacent ASCII multi-star strict, but keeps no-space multi-star emphasis', () => {
    const mdBase = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
    const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })

    const spacedTriple = '日本語です。*** Japanese food culture*** です。'
    const spacedQuad = '日本語です。**** Japanese food culture**** です。'
    const noSpaceTriple = '日本語です。***Japanese food culture*** です。'
    const noSpaceQuad = '日本語です。****Japanese food culture**** です。'

    assert.strictEqual(mdPlus.render(spacedTriple), '<p>日本語です。*** Japanese food culture*** です。</p>\n')
    assert.strictEqual(mdPlus.render(spacedQuad), '<p>日本語です。**** Japanese food culture**** です。</p>\n')
    assert.strictEqual(mdPlus.render(noSpaceTriple), mdBase.render(noSpaceTriple))
    assert.strictEqual(mdPlus.render(noSpaceQuad), mdBase.render(noSpaceQuad))
  }, allPassRef)

  runCase('japanese-boundary-guard keeps higher multi-star runs deterministic (3-10)', () => {
    const mdBase = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
    const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })

    for (let count = 3; count <= 10; count++) {
      const marker = '*'.repeat(count)
      const spaced = `日本語です。${marker} Japanese food culture${marker} です。`
      const noSpace = `日本語です。${marker}Japanese food culture${marker} です。`
      assert.strictEqual(mdPlus.render(spaced), `<p>日本語です。${marker} Japanese food culture${marker} です。</p>\n`, `count=${count} spaced`)
      assert.strictEqual(mdPlus.render(noSpace), mdBase.render(noSpace), `count=${count} no-space`)
    }
  }, allPassRef)

  runCase('japanese-boundary-guard keeps space-adjacent ASCII wrapper starts strict for 1-10 runs', () => {
    const mdBase = new MarkdownIt()
    const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    for (let count = 1; count <= 10; count++) {
      const marker = '*'.repeat(count)
      const withDoubleQuote = `日本語です。${marker} "English"${marker} です。`
      const withSingleQuote = `日本語です。${marker} 'English'${marker} です。`
      const withLink = `日本語です。${marker} [English](u)${marker} です。`
      const withCode = `日本語です。${marker} \`English\`${marker} です。`
      const withNoSpaceLink = `日本語です。${marker}[English](u)${marker} です。`
      assert.strictEqual(mdPlus.render(withDoubleQuote), mdBase.render(withDoubleQuote), `count=${count} quote`)
      assert.strictEqual(mdPlus.render(withSingleQuote), mdBase.render(withSingleQuote), `count=${count} apostrophe`)
      assert.strictEqual(mdPlus.render(withLink), mdBase.render(withLink), `count=${count} link-space`)
      assert.strictEqual(mdPlus.render(withCode), mdBase.render(withCode), `count=${count} code-space`)
      assert.strictEqual(mdPlus.render(withNoSpaceLink), mdBase.render(withNoSpaceLink), `count=${count} link-nospace`)
    }
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

  runCase('japanese-boundary keeps single-star pairing around broad bracket wrappers', () => {
    const bracketPairs = [
      // Curly/smart and guillemet quotes
      ['‘', '’'],
      ['“', '”'],
      ['«', '»'],
      // ASCII / fullwidth / halfwidth
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
      ['（', '）'],
      ['［', '］'],
      ['｛', '｝'],
      ['｟', '｠'],
      ['｢', '｣'],
      ['＜', '＞'],
      // CJK
      ['「', '」'],
      ['『', '』'],
      ['〈', '〉'],
      ['《', '》'],
      ['【', '】'],
      ['〔', '〕'],
      ['〖', '〗'],
      ['〘', '〙'],
      ['〚', '〛'],
      // Mathematical/typographic
      ['⟦', '⟧'],
      ['⟨', '⟩'],
      ['⟪', '⟫'],
      ['⟬', '⟭'],
      ['⟮', '⟯'],
      ['⦅', '⦆'],
      ['⦇', '⦈'],
      ['⦉', '⦊'],
      ['⦋', '⦌'],
      ['⦍', '⦎'],
      ['⦏', '⦐'],
      ['⦑', '⦒'],
      ['⦓', '⦔'],
      ['⦕', '⦖'],
      ['⦗', '⦘'],
      ['⧘', '⧙'],
      ['⧚', '⧛'],
      ['⧼', '⧽'],
      // Vertical/small presentation forms
      ['︵', '︶'],
      ['︷', '︸'],
      ['︹', '︺'],
      ['︻', '︼'],
      ['︽', '︾'],
      ['︿', '﹀'],
      ['﹁', '﹂'],
      ['﹃', '﹄'],
      ['﹇', '﹈'],
      ['﹙', '﹚'],
      ['﹛', '﹜'],
      ['﹝', '﹞']
    ]
    const mdBaseMode = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
    const mdPlusMode = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    for (let i = 0; i < bracketPairs.length; i++) {
      const pair = bracketPairs[i]
      const input = `説明は*${pair[0]}寿司${pair[1]}*umami*です。`
      const expected = `<p>説明は<em>${pair[0]}寿司${pair[1]}</em>umami*です。</p>\n`
      assert.strictEqual(mdBaseMode.render(input), expected)
      assert.strictEqual(mdPlusMode.render(input), expected)
    }
  }, allPassRef)

  runCase('japanese-boundary-guard keeps single-star pairing around curly and prime quote wrappers', () => {
    const quotePairs = [
      ['“', '”'],
      ['〝', '〟'],
      ['«', '»']
    ]
    const mdPlusMode = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    for (let i = 0; i < quotePairs.length; i++) {
      const pair = quotePairs[i]
      const input = `説明は*${pair[0]}寿司${pair[1]}*umami*です。`
      const expected = `<p>説明は<em>${pair[0]}寿司${pair[1]}</em>umami*です。</p>\n`
      assert.strictEqual(mdPlusMode.render(input), expected)
    }
  }, allPassRef)

  runCase('japanese-boundary-guard keeps single-star pairing around inline link/ref/code wrappers with Japanese right context', () => {
    const mdPlusMode = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    assert.strictEqual(
      mdPlusMode.render('日本語*[x](u)*日本語'),
      '<p>日本語<em><a href="u">x</a></em>日本語</p>\n'
    )
    assert.strictEqual(
      mdPlusMode.render('日本語*[x][r]*日本語\n\n[r]: u'),
      '<p>日本語<em><a href="u">x</a></em>日本語</p>\n'
    )
    assert.strictEqual(
      mdPlusMode.render('日本語*`code`*日本語'),
      '<p>日本語<em><code>code</code></em>日本語</p>\n'
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

  runCase('sentence boundary punctuation limits previous-star spillover context', () => {
    const inputA = '前文*寿司*? 後文*味噌。*umami*'
    const inputB = '前文*寿司*。後文*味噌。*umami*'
    const expectedA = '<p>前文<em>寿司</em>? 後文<em>味噌。</em>umami*</p>\n'
    const expectedB = '<p>前文<em>寿司</em>。後文<em>味噌。</em>umami*</p>\n'
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    assert.strictEqual(mdJapanese.render(inputA), expectedA)
    assert.strictEqual(mdPlus.render(inputA), expectedA)
    assert.strictEqual(mdJapanese.render(inputB), expectedB)
    assert.strictEqual(mdPlus.render(inputB), expectedB)
  }, allPassRef)

  runCase('adjacent punctuation still allows local Japanese single-star correction', () => {
    const input = '*味噌。*umami*'
    const expected = '<p><em>味噌。</em>umami*</p>\n'
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    assert.strictEqual(mdJapanese.render(input), expected)
    assert.strictEqual(mdPlus.render(input), expected)
  }, allPassRef)

  runCase('japanese modes support single-star close-side punctuation variants (?, ‼, ⁇, ⁈, ⁉)', () => {
    const puncts = ['?', '‼', '⁇', '⁈', '⁉']
    const mdBaseMode = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
    const mdPlusMode = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    for (let i = 0; i < puncts.length; i++) {
      const p = puncts[i]
      const input = `説明は*寿司${p}*umami*です。`
      const expected = `<p>説明は<em>寿司${p}</em>umami*です。</p>\n`
      assert.strictEqual(mdBaseMode.render(input), expected)
      assert.strictEqual(mdPlusMode.render(input), expected)
    }
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

  runCase('broken-ref segment without emphasis signals skips segment rewrite', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      let html = ''
      const count = withParseInlineCounter(() => {
        const md = new MarkdownIt().use(mditStrongJa, cfg.option)
        html = md.render(BROKEN_REF_NO_EMPHASIS_SEGMENT_INPUT)
      })
      assert.strictEqual(count, 0, cfg.label)
      assert.ok(html.indexOf('<a href="https://example.com/p">plain</a>') !== -1, cfg.label)
    }
  }, allPassRef)

  runCase('tail segment with code_inline keeps code content across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      const html = md.render(TAIL_WITH_CODE_INPUT)
      assert.ok(html.indexOf('<code>c*d</code>') !== -1, cfg.label)
      assert.ok(html.indexOf('`</p>') === -1, cfg.label)
      const countOn = getInlineParseCallCount(cfg.option, TAIL_WITH_CODE_INPUT)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, TAIL_WITH_CODE_INPUT)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('tail canonical repair does not add extra inline.parse passes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const countOn = getInlineParseCallCount(cfg.option, COMPLEX_CASE_INPUT.tail)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, COMPLEX_CASE_INPUT.tail)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('tail dangling-strong-close case does not add extra inline.parse passes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const countOn = getInlineParseCallCount(cfg.option, TAIL_WITH_DANGLING_STRONG_CLOSE_INPUT)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, TAIL_WITH_DANGLING_STRONG_CLOSE_INPUT)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('japanese mode skips tail repair when target segment has no Japanese context', () => {
    const mdBase = new MarkdownIt()
    const mdJapanese = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })
    const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
    const baseHtml = mdBase.render(ENGLISH_ONLY_TAIL_INPUT)
    const japaneseHtml = mdJapanese.render(ENGLISH_ONLY_TAIL_INPUT)
    const plusHtml = mdPlus.render(ENGLISH_ONLY_TAIL_INPUT)
    const aggressiveHtml = mdAggressive.render(ENGLISH_ONLY_TAIL_INPUT)
    assert.strictEqual(japaneseHtml, baseHtml)
    assert.strictEqual(plusHtml, baseHtml)
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

  runCase('unsafe link attrs do not block complex repairs across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt()
        .use(markUnsafeLinkAttrsPlugin)
        .use(mditStrongJa, cfg.option)
      const expected = COMPLEX_CASE_EXPECTED_HTML.brokenA.replaceAll('">', '" data-probe="x">')
      assert.strictEqual(md.render(COMPLEX_CASE_INPUT.brokenA), expected, cfg.label)
    }
  }, allPassRef)

  runCase('malformed link attrs are preserved safely during repairs', () => {
    const input = COMPLEX_CASE_INPUT.brokenA
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const count = withParseInlineCounter(() => {
        const md = new MarkdownIt()
          .use(markMalformedHrefAttrPlugin)
          .use(mditStrongJa, cfg.option)
        const html = md.render(input)
        assert.ok(html.indexOf('href="undefined"') !== -1, cfg.label)
        assert.ok(html.indexOf('<em>link</em>') !== -1, cfg.label)
      })
      assert.strictEqual(count, 0, cfg.label)
    }
  }, allPassRef)

  runCase('underscore-only malformed inputs stay markdown-it-compatible and do not add extra inline.parse passes', () => {
    const src = UNDERSCORE_ONLY_MALFORMED_INPUT
    const baseline = new MarkdownIt().render(src)
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const md = new MarkdownIt().use(mditStrongJa, cfg.option)
      assert.strictEqual(md.render(src), baseline, cfg.label)
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('postprocess does not merge non-emphasis custom wrappers around links', () => {
    const input = '前*寿司*[x](u)*出汁*後'
    const md = new MarkdownIt()
      .use(markCustomWrapperTokensPlugin)
      .use(mditStrongJa, { mode: 'japanese-boundary-guard' })
    const html = md.render(input)
    assert.ok(html.indexOf('</x><a href="u">x</a><x>') !== -1)
  }, allPassRef)

  runCase('marker-literal text survives rewrite with meta-bearing tokens across repair modes', () => {
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const mdPlain = new MarkdownIt().use(mditStrongJa, cfg.option)
      const mdMeta = new MarkdownIt()
        .use(markInlineMetaPlugin)
        .use(mditStrongJa, cfg.option)
      const plainHtml = mdPlain.render(TAIL_WITH_MARKER_LITERAL_INPUT)
      const metaHtml = mdMeta.render(TAIL_WITH_MARKER_LITERAL_INPUT)
      assert.strictEqual(metaHtml, plainHtml, cfg.label)
      assert.ok(metaHtml.indexOf(MARKER_LITERAL) !== -1, cfg.label)
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

  runCase('unresolved collapsed ref canonical case does not add extra inline.parse passes', () => {
    const src = '[**a[x](v)**][]\n\n[nohit]: https://example.com'
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref complex canonical cases do not add extra inline.parse passes', () => {
    const sources = [
      COMPLEX_CASE_INPUT.brokenA,
      BROKEN_WITH_CODE_LABEL_INPUT,
      BROKEN_WITH_HARDBREAK_LINK_LABEL_INPUT
    ]
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      for (let s = 0; s < sources.length; s++) {
        const src = sources[s]
        const countOn = getInlineParseCallCount(cfg.option, src)
        const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
        assert.strictEqual(countOn, countOff, `${cfg.label} src:${s}`)
      }
    }
  }, allPassRef)

  runCase('malformed nested broken-ref case does not add extra inline.parse passes', () => {
    const src = MALFORMED_NESTED_LINK_STAR_CASES[3]
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('malformed nested broken-ref case does not add extra inline.parse in japanese-boundary mode', () => {
    const src = MALFORMED_NESTED_LINK_STAR_CASES[3]
    const matrix = [
      { label: 'japanese-boundary', option: { mode: 'japanese-boundary' } },
      { label: 'japanese-boundary+mditAttrs:false', option: { mode: 'japanese-boundary', mditAttrs: false } }
    ]
    for (let i = 0; i < matrix.length; i++) {
      const cfg = matrix[i]
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref continued-strong+link-label case does not add extra inline.parse passes', () => {
    const src = BROKEN_WITH_CONTINUED_STRONG_LABEL_INPUT
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref underscore-tail fuzz case does not add extra inline.parse passes', () => {
    const src = BROKEN_WITH_UNDERSCORE_TAIL_FUZZ_INPUT
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref isolated strong-wrapper-before-link case does not add extra inline.parse passes', () => {
    const src = BROKEN_WITH_ISOLATED_STRONG_WRAPPER_BEFORE_LINK_INPUT
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
      const htmlOn = new MarkdownIt().use(mditStrongJa, cfg.option).render(src)
      const htmlOff = new MarkdownIt().use(mditStrongJa, { ...cfg.option, postprocess: false }).render(src)
      assert.strictEqual(htmlOn, htmlOff, cfg.label)
      assert.ok(htmlOn.indexOf('<a href="v">x</a> の組み合わせ**') !== -1, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref leading unmatched-strong-close fuzz case keeps postprocess-off output and does not add extra inline.parse passes', () => {
    const src = BROKEN_WITH_LEADING_UNMATCHED_STRONG_CLOSE_FUZZ_INPUT
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const htmlOn = new MarkdownIt().use(mditStrongJa, cfg.option).render(src)
      const htmlOff = new MarkdownIt().use(mditStrongJa, { ...cfg.option, postprocess: false }).render(src)
      assert.strictEqual(htmlOn, htmlOff, cfg.label)
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref leading close + inner strong-before-link case does not add extra inline.parse passes', () => {
    const src = BROKEN_WITH_LEADING_CLOSE_THEN_INNER_STRONG_BEFORE_LINK_INPUT
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
      const html = new MarkdownIt().use(mditStrongJa, cfg.option).render(src)
      assert.ok(html.indexOf('<strong>崩れ[参照*ラベル][ref と [a</strong>a**<a href="v">x</a>') !== -1, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref leading-open close-only range case keeps postprocess-off output and does not add extra inline.parse passes', () => {
    const src = BROKEN_WITH_LEADING_OPEN_CLOSE_ONLY_RANGE_INPUT
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const htmlOn = new MarkdownIt().use(mditStrongJa, cfg.option).render(src)
      const htmlOff = new MarkdownIt().use(mditStrongJa, { ...cfg.option, postprocess: false }).render(src)
      assert.strictEqual(htmlOn, htmlOff, cfg.label)
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref pre-depth strong with in-range close-only case keeps postprocess-off output and does not add extra inline.parse passes', () => {
    const src = BROKEN_WITH_PREDEPTH_STRONG_AND_INRANGE_CLOSE_ONLY_INPUT
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const htmlOn = new MarkdownIt().use(mditStrongJa, cfg.option).render(src)
      const htmlOff = new MarkdownIt().use(mditStrongJa, { ...cfg.option, postprocess: false }).render(src)
      assert.strictEqual(htmlOn, htmlOff, cfg.label)
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
    }
  }, allPassRef)

  runCase('broken-ref mixed underscore-emphasis token case keeps postprocess-off output and does not add extra inline.parse passes', () => {
    const src = BROKEN_WITH_MIXED_UNDERSCORE_EMPH_TOKENS_INPUT
    for (let i = 0; i < REPAIR_OPTION_MATRIX.length; i++) {
      const cfg = REPAIR_OPTION_MATRIX[i]
      const htmlOn = new MarkdownIt().use(mditStrongJa, cfg.option).render(src)
      const htmlOff = new MarkdownIt().use(mditStrongJa, { ...cfg.option, postprocess: false }).render(src)
      assert.strictEqual(htmlOn, htmlOff, cfg.label)
      const countOn = getInlineParseCallCount(cfg.option, src)
      const countOff = getInlineParseCallCount({ ...cfg.option, postprocess: false }, src)
      assert.strictEqual(countOn, countOff, cfg.label)
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

  runCase('parseInline is not used on broken segments across repair modes', () => {
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
    assert.strictEqual(count, 0)
  }, allPassRef)

  return allPassRef.value
}
