import assert from 'assert'
import { pathToFileURL } from 'url'
import Token from 'markdown-it/lib/token.mjs'
import {
  rebuildInlineLevelsFrom,
  fixTrailingStrong,
  fixEmOuterStrongSequence,
  fixLeadingAsteriskEm
} from '../src/token-core.js'
import { sanitizeEmStrongBalance } from '../src/token-postprocess/emphasis-balance.js'
import { scanInlinePostprocessSignals } from '../src/token-postprocess/guards.js'

const createTextToken = (content) => {
  const token = new Token('text', '', 0)
  token.content = content
  return token
}

const createWrapperToken = (type, markup) => {
  const tag = type.startsWith('strong') ? 'strong' : 'em'
  const nesting = type.endsWith('_open') ? 1 : -1
  const token = new Token(type, tag, nesting)
  token.markup = markup
  return token
}

const createLinkToken = (type) => {
  const nesting = type === 'link_open' ? 1 : -1
  return new Token(type, 'a', nesting)
}

const summarizeTokens = (tokens) => {
  return tokens.map((token) => ({
    type: token.type,
    tag: token.tag,
    nesting: token.nesting,
    level: token.level,
    markup: token.markup || '',
    content: token.content || ''
  }))
}

const trackEarliestChange = () => {
  let earliest
  const mark = (idx) => {
    if (earliest === undefined || idx < earliest) earliest = idx
  }
  return {
    mark,
    get earliest () {
      return earliest
    }
  }
}

export const runPostprocessEmphasisHelperTests = () => {
  let allPass = true
  const runCase = (name, fn) => {
    try {
      fn()
    } catch (err) {
      console.log(`Test [postprocess emphasis helper, ${name}] >>>`)
      console.log(err)
      allPass = false
    }
  }

  runCase('fixTrailingStrong promotes outer em wrapper to strong and keeps inner em span', () => {
    const tokens = [
      createWrapperToken('em_open', '*'),
      createWrapperToken('em_open', '*'),
      createTextToken('inner'),
      createWrapperToken('em_close', '*'),
      createTextToken('tail'),
      createWrapperToken('em_close', '*'),
      createTextToken('after**')
    ]
    const tracker = trackEarliestChange()

    assert.strictEqual(fixTrailingStrong(tokens, tracker.mark), true)
    assert.strictEqual(tracker.earliest, 0)
    rebuildInlineLevelsFrom(tokens, tracker.earliest)

    assert.deepStrictEqual(summarizeTokens(tokens), [
      { type: 'strong_open', tag: 'strong', nesting: 1, level: 0, markup: '**', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 1, markup: '', content: 'inner' },
      { type: 'em_open', tag: 'em', nesting: 1, level: 1, markup: '*', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 2, markup: '', content: 'tail' },
      { type: 'em_close', tag: 'em', nesting: -1, level: 2, markup: '*', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 1, markup: '', content: 'after' },
      { type: 'strong_close', tag: 'strong', nesting: -1, level: 1, markup: '**', content: '' }
    ])
  })

  runCase('fixEmOuterStrongSequence rewrites malformed em-em-strong ordering into balanced strong+em', () => {
    const tokens = [
      createWrapperToken('em_open', '*'),
      createWrapperToken('em_open', '*'),
      createTextToken('left'),
      createWrapperToken('em_close', '*'),
      createTextToken('mid'),
      createWrapperToken('em_close', '*'),
      createTextToken('right'),
      createWrapperToken('strong_open', '**')
    ]
    const tracker = trackEarliestChange()

    assert.strictEqual(fixEmOuterStrongSequence(tokens, tracker.mark), true)
    assert.strictEqual(tracker.earliest, 0)
    rebuildInlineLevelsFrom(tokens, tracker.earliest)

    assert.deepStrictEqual(summarizeTokens(tokens), [
      { type: 'strong_open', tag: 'strong', nesting: 1, level: 0, markup: '**', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 1, markup: '', content: 'left' },
      { type: 'em_open', tag: 'em', nesting: 1, level: 1, markup: '*', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 2, markup: '', content: 'mid' },
      { type: 'em_close', tag: 'em', nesting: -1, level: 2, markup: '*', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 1, markup: '', content: 'right' },
      { type: 'strong_close', tag: 'strong', nesting: -1, level: 1, markup: '**', content: '' }
    ])
  })

  runCase('fixLeadingAsteriskEm moves a qualifying leading star into the link-local emphasis span', () => {
    const tokens = [
      createLinkToken('link_open'),
      createTextToken(' *a'),
      createWrapperToken('em_open', '*'),
      createTextToken('b'),
      createWrapperToken('em_close', '*'),
      createLinkToken('link_close')
    ]
    const tracker = trackEarliestChange()

    assert.strictEqual(fixLeadingAsteriskEm(tokens, tracker.mark), true)
    assert.strictEqual(tracker.earliest, 1)
    rebuildInlineLevelsFrom(tokens, tracker.earliest)

    assert.deepStrictEqual(summarizeTokens(tokens), [
      { type: 'link_open', tag: 'a', nesting: 1, level: 0, markup: '', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 1, markup: '', content: ' ' },
      { type: 'em_open', tag: 'em', nesting: 1, level: 1, markup: '*', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 2, markup: '', content: 'a' },
      { type: 'em_close', tag: 'em', nesting: -1, level: 2, markup: '*', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 1, markup: '', content: 'b*' },
      { type: 'link_close', tag: 'a', nesting: -1, level: 1, markup: '', content: '' }
    ])
  })

  runCase('sanitizeEmStrongBalance demotes unmatched wrappers to literal marker text and keeps balanced pairs', () => {
    const tokens = [
      createWrapperToken('strong_close', '**'),
      createWrapperToken('em_open', '*'),
      createTextToken('ok'),
      createWrapperToken('em_close', '*'),
      createWrapperToken('strong_open', '**')
    ]
    const changedAt = []

    assert.strictEqual(sanitizeEmStrongBalance(tokens, (idx) => changedAt.push(idx)), true)
    rebuildInlineLevelsFrom(tokens, 0)

    assert.deepStrictEqual(changedAt, [0, 4])
    assert.deepStrictEqual(summarizeTokens(tokens), [
      { type: 'text', tag: '', nesting: 0, level: 0, markup: '', content: '**' },
      { type: 'em_open', tag: 'em', nesting: 1, level: 0, markup: '*', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 1, markup: '', content: 'ok' },
      { type: 'em_close', tag: 'em', nesting: -1, level: 1, markup: '*', content: '' },
      { type: 'text', tag: '', nesting: 0, level: 0, markup: '', content: '**' }
    ])
  })

  runCase('scanInlinePostprocessSignals keeps balanced asterisk wrappers out of sanitize-risk path', () => {
    const tokens = [
      createWrapperToken('strong_open', '**'),
      createTextToken('left'),
      createWrapperToken('em_open', '*'),
      createTextToken('mid'),
      createWrapperToken('em_close', '*'),
      createWrapperToken('strong_close', '**'),
      createLinkToken('link_open'),
      createLinkToken('link_close')
    ]

    assert.deepStrictEqual(scanInlinePostprocessSignals(tokens), {
      hasEmphasis: true,
      hasLinkOpen: true,
      hasLinkClose: true,
      hasCodeInline: false,
      hasAsteriskWrapperImbalance: false
    })
  })

  runCase('scanInlinePostprocessSignals flags cross-nested asterisk wrappers as sanitize-risk', () => {
    const tokens = [
      createWrapperToken('strong_open', '**'),
      createWrapperToken('em_open', '*'),
      createTextToken('oops'),
      createWrapperToken('strong_close', '**'),
      createWrapperToken('em_close', '*')
    ]

    assert.deepStrictEqual(scanInlinePostprocessSignals(tokens), {
      hasEmphasis: true,
      hasLinkOpen: false,
      hasLinkClose: false,
      hasCodeInline: false,
      hasAsteriskWrapperImbalance: true
    })
  })

  if (allPass) {
    console.log('Passed postprocess emphasis helper tests.')
  }
  return allPass
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!runPostprocessEmphasisHelperTests()) {
    process.exitCode = 1
  }
}
