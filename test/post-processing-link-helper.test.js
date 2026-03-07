import assert from 'assert'
import { pathToFileURL } from 'url'
import MarkdownIt from 'markdown-it'
import Token from 'markdown-it/lib/token.mjs'
import mditStrongJa from '../index.js'
import { convertCollapsedReferenceLinks, mergeBrokenMarksAroundLinks } from '../src/token-link-utils.js'

const getFirstInlineChildren = (markdown) => {
  const md = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive', postprocess: false })
  const tokens = md.parse(markdown, {})
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token && token.type === 'inline' && token.children) {
      return token.children
    }
  }
  throw new Error('inline token not found')
}

const createCollapsedRefState = (references) => {
  return {
    env: { references },
    md: new MarkdownIt()
  }
}

const setAllTokenMaps = (children, map) => {
  for (let i = 0; i < children.length; i++) {
    children[i].map = [map[0], map[1]]
  }
}

const createTextToken = (content, map = null) => {
  const token = new Token('text', '', 0)
  token.content = content
  if (map) token.map = [map[0], map[1]]
  return token
}

const createWrapperToken = (type, markup, nesting, map = null) => {
  const token = new Token(type, type.startsWith('strong') ? 'strong' : 'em', nesting)
  token.markup = markup
  if (map) token.map = [map[0], map[1]]
  return token
}

export const runLinkHelperTests = () => {
  let allPass = true
  const runCase = (name, fn) => {
    try {
      fn()
    } catch (err) {
      console.log('Test [link helper, ' + name + '] >>>')
      console.log(err)
      allPass = false
    }
  }

  runCase('collapsed-ref helper preserves injected line maps on whole-range rewrite', () => {
    const children = getFirstInlineChildren('[**寿司**][]')
    setAllTokenMaps(children, [4, 5])
    const changed = convertCollapsedReferenceLinks(children, createCollapsedRefState({
      '**寿司**': { href: 'https://example.com', title: 'T' }
    }))

    assert.strictEqual(changed, true)
    assert.deepStrictEqual(
      children.map((token) => token.type),
      ['link_open', 'strong_open', 'text', 'strong_close', 'link_close']
    )
    assert.deepStrictEqual(children[0].attrs, [['href', 'https://example.com'], ['title', 'T']])
    assert.deepStrictEqual(children[0].map, [4, 5])
    assert.deepStrictEqual(children[2].map, [4, 5])
    assert.deepStrictEqual(children[4].map, [4, 5])
    assert.strictEqual(children[2].content, '寿司')
  })

  runCase('collapsed-ref helper falls back to nearby maps when label tokens are unmapped', () => {
    const children = getFirstInlineChildren('前 [**寿司**][] 後')
    children[0].map = [9, 10]
    children[children.length - 1].map = [9, 10]
    const changed = convertCollapsedReferenceLinks(children, createCollapsedRefState({
      '**寿司**': { href: 'https://example.com/fallback', title: '' }
    }))

    assert.strictEqual(changed, true)
    assert.strictEqual(children[0].content, '前 ')
    assert.deepStrictEqual(children[1].attrs, [['href', 'https://example.com/fallback']])
    assert.deepStrictEqual(children[1].map, [9, 10])
    assert.deepStrictEqual(children[5].map, [9, 10])
    assert.strictEqual(children[6].content, ' 後')
  })

  runCase('collapsed-ref helper keeps nested wrapper maps on rewrite', () => {
    const children = getFirstInlineChildren('[***寿司***][]')
    setAllTokenMaps(children, [7, 8])
    const changed = convertCollapsedReferenceLinks(children, createCollapsedRefState({
      '***寿司***': { href: 'https://example.com/nested', title: '' }
    }))

    assert.strictEqual(changed, true)
    assert.deepStrictEqual(
      children.map((token) => token.type),
      ['link_open', 'em_open', 'text', 'strong_open', 'text', 'strong_close', 'text', 'em_close', 'link_close']
    )
    assert.deepStrictEqual(children[0].attrs, [['href', 'https://example.com/nested']])
    assert.deepStrictEqual(children[0].map, [7, 8])
    assert.deepStrictEqual(children[1].map, [7, 8])
    assert.deepStrictEqual(children[3].map, [7, 8])
    assert.deepStrictEqual(children[4].map, [7, 8])
    assert.deepStrictEqual(children[5].map, [7, 8])
    assert.deepStrictEqual(children[7].map, [7, 8])
    assert.deepStrictEqual(children[8].map, [7, 8])
    assert.strictEqual(children[4].content, '寿司')
  })

  runCase('collapsed-ref helper preserves maps across split-bracket rewrite paths', () => {
    const children = getFirstInlineChildren('前[**寿司**][]後')
    setAllTokenMaps(children, [15, 16])
    const changed = convertCollapsedReferenceLinks(children, createCollapsedRefState({
      '**寿司**': { href: 'https://example.com/split', title: '' }
    }))

    assert.strictEqual(changed, true)
    assert.deepStrictEqual(
      children.map((token) => token.type),
      ['text', 'link_open', 'strong_open', 'text', 'strong_close', 'link_close', 'text']
    )
    assert.strictEqual(children[0].content, '前')
    assert.strictEqual(children[6].content, '後')
    assert.deepStrictEqual(children[0].map, [15, 16])
    assert.deepStrictEqual(children[1].map, [15, 16])
    assert.deepStrictEqual(children[5].map, [15, 16])
    assert.deepStrictEqual(children[6].map, [15, 16])
  })

  runCase('collapsed-ref helper falls back to label maps for unmapped outer wrapper pairs', () => {
    const children = [
      createWrapperToken('strong_close', '**', -1),
      createTextToken('[', [17, 18]),
      createWrapperToken('strong_open', '**', 1, [17, 18]),
      createTextToken('寿司', [17, 18]),
      createWrapperToken('strong_close', '**', -1, [17, 18]),
      createTextToken(']', [17, 18]),
      createTextToken('[]', [17, 18]),
      createWrapperToken('strong_open', '**', 1)
    ]
    const changed = convertCollapsedReferenceLinks(children, createCollapsedRefState({
      '**寿司**': { href: 'https://example.com/pair-fallback', title: '' }
    }))

    assert.strictEqual(changed, true)
    assert.deepStrictEqual(
      children.map((token) => token.type),
      ['link_open', 'strong_open', 'strong_open', 'text', 'strong_close', 'strong_close', 'link_close']
    )
    assert.deepStrictEqual(children[0].map, [17, 18])
    assert.deepStrictEqual(children[1].map, [17, 18])
    assert.deepStrictEqual(children[5].map, [17, 18])
    assert.deepStrictEqual(children[6].map, [17, 18])
  })

  runCase('collapsed-ref helper preserves maps on split-only no-rewrite paths', () => {
    const children = getFirstInlineChildren('**[寿司][]**')
    setAllTokenMaps(children, [19, 20])
    const changed = convertCollapsedReferenceLinks(children, createCollapsedRefState({
      '寿司': { href: 'https://example.com/noop', title: '' }
    }))

    assert.strictEqual(changed, false)
    assert.deepStrictEqual(
      children.map((token) => token.type),
      ['text', 'strong_open', 'text', 'text', 'text', 'text', 'strong_close', 'text']
    )
    assert.strictEqual(children[2].content, '[')
    assert.strictEqual(children[4].content, ']')
    assert.strictEqual(children[5].content, '[]')
    assert.deepStrictEqual(children[2].map, [19, 20])
    assert.deepStrictEqual(children[4].map, [19, 20])
    assert.deepStrictEqual(children[5].map, [19, 20])
  })

  runCase('merge helper collapses flagged strong wrappers around a link', () => {
    const children = getFirstInlineChildren('**店**[x](u)**東京**')
    setAllTokenMaps(children, [11, 12])
    for (let i = 0; i < children.length; i++) {
      if (children[i].type === 'link_open' || children[i].type === 'link_close') {
        children[i].__strongJaMergeMarksAroundLink = true
      }
    }
    const changed = mergeBrokenMarksAroundLinks(children)

    assert.strictEqual(changed, true)
    assert.strictEqual(children.filter((token) => token.type === 'strong_open').length, 1)
    assert.strictEqual(children.filter((token) => token.type === 'strong_close').length, 1)
    assert.strictEqual(children[1].type, 'strong_open')
    assert.strictEqual(children[4].type, 'link_open')
    assert.strictEqual(children[6].type, 'link_close')
    assert.strictEqual(children[9].type, 'strong_close')
    assert.strictEqual(children[2].content, '店')
    assert.strictEqual(children[8].content, '東京')
    assert.deepStrictEqual(children[4].map, [11, 12])
    assert.deepStrictEqual(children[6].map, [11, 12])
  })

  runCase('merge helper keeps unflagged strong wrappers around a link unchanged', () => {
    const children = getFirstInlineChildren('**店**[x](u)**東京**')
    const before = children.map((token) => token.type)
    const changed = mergeBrokenMarksAroundLinks(children)

    assert.strictEqual(changed, false)
    assert.deepStrictEqual(children.map((token) => token.type), before)
  })

  runCase('merge helper keeps bridge whitespace while collapsing flagged strong wrappers', () => {
    const children = getFirstInlineChildren('**店** [x](u) **東京**')
    setAllTokenMaps(children, [13, 14])
    for (let i = 0; i < children.length; i++) {
      if (children[i].type === 'link_open' || children[i].type === 'link_close') {
        children[i].__strongJaMergeMarksAroundLink = true
      }
    }
    const changed = mergeBrokenMarksAroundLinks(children)

    assert.strictEqual(changed, true)
    assert.strictEqual(children[3].content, ' ')
    assert.strictEqual(children[7].content, ' ')
    assert.strictEqual(children[4].type, 'link_open')
    assert.strictEqual(children[6].type, 'link_close')
    assert.deepStrictEqual(children[4].map, [13, 14])
    assert.deepStrictEqual(children[6].map, [13, 14])
  })

  if (allPass) {
    console.log('Passed link helper tests.')
  }
  return allPass
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!runLinkHelperTests()) {
    process.exitCode = 1
  }
}
