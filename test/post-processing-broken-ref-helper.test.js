import assert from 'assert'
import { pathToFileURL } from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import { buildLinkCloseMap } from '../src/token-link-utils.js'
import { rebuildInlineLevelsFrom } from '../src/token-core.js'
import { buildAsteriskWrapperPrefixStats } from '../src/token-postprocess/guards.js'
import { computeMaxBrokenRefRepairPass, runBrokenRefRepairs } from '../src/token-postprocess/broken-ref.js'

const BROKEN_REF_HELPER_INPUT = '**[a**a**[x*](u)*a**\n\n[ref]: u'

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

const summarizeTokens = (tokens) => {
  return tokens.map((token) => {
    return {
      type: token.type,
      tag: token.tag,
      nesting: token.nesting,
      content: token.content,
      markup: token.markup,
      attrs: token.attrs ? token.attrs.map((pair) => pair.slice()) : null
    }
  })
}

const summarizeBrokenRefSignals = (tokens) => {
  let hasBracketText = false
  let hasEmphasis = false
  let hasLinkClose = false
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    if (!hasBracketText && token.type === 'text' && token.content) {
      if (token.content.indexOf('[') !== -1 || token.content.indexOf(']') !== -1) {
        hasBracketText = true
      }
    }
    if (!hasEmphasis && (token.type === 'strong_open' || token.type === 'strong_close' || token.type === 'em_open' || token.type === 'em_close')) {
      if (token.markup === '*' || token.markup === '**') {
        hasEmphasis = true
      }
    }
    if (!hasLinkClose && token.type === 'link_close') {
      hasLinkClose = true
    }
    if (hasBracketText && hasEmphasis && hasLinkClose) break
  }
  return { hasBracketText, hasEmphasis, hasLinkClose }
}

const createBrokenRefFacts = () => {
  return {
    linkCloseMap: undefined,
    wrapperPrefixStats: undefined,
    rebuildLevelStart: undefined
  }
}

const createBrokenRefHooks = () => {
  return {
    ensureLinkCloseMap: (facts, tokens) => {
      if (facts.linkCloseMap === undefined) {
        facts.linkCloseMap = buildLinkCloseMap(tokens, 0, tokens.length - 1)
      }
      return facts.linkCloseMap
    },
    ensureWrapperPrefixStats: (facts, tokens) => {
      if (facts.wrapperPrefixStats === undefined) {
        facts.wrapperPrefixStats = buildAsteriskWrapperPrefixStats(tokens)
      }
      return facts.wrapperPrefixStats
    },
    invalidateDerivedCaches: (facts) => {
      facts.linkCloseMap = undefined
      facts.wrapperPrefixStats = undefined
    },
    markLevelRebuildFrom: (facts, startIdx) => {
      if (facts.rebuildLevelStart === undefined || startIdx < facts.rebuildLevelStart) {
        facts.rebuildLevelStart = startIdx
      }
    }
  }
}

export const runBrokenRefHelperTests = () => {
  let allPass = true
  const runCase = (name, fn) => {
    try {
      fn()
    } catch (err) {
      console.log(`Test [broken-ref helper, ${name}] >>>`)
      console.log(err)
      allPass = false
    }
  }

  runCase('fallback path matches orchestrator-style hooks', () => {
    const fallbackChildren = getFirstInlineChildren(BROKEN_REF_HELPER_INPUT)
    const hookedChildren = getFirstInlineChildren(BROKEN_REF_HELPER_INPUT)
    const fallbackMetrics = {}
    const hookedMetrics = {}
    const fallbackScanState = {}
    const hookedScanState = {}
    const fallbackMaxPass = computeMaxBrokenRefRepairPass(fallbackChildren, fallbackScanState)
    const hookedMaxPass = computeMaxBrokenRefRepairPass(hookedChildren, hookedScanState)
    const hookedFacts = createBrokenRefFacts()
    const hookedResult = runBrokenRefRepairs(
      hookedChildren,
      hookedMaxPass,
      hookedScanState,
      hookedMetrics,
      hookedFacts,
      createBrokenRefHooks()
    )
    const fallbackResult = runBrokenRefRepairs(
      fallbackChildren,
      fallbackMaxPass,
      fallbackScanState,
      fallbackMetrics
    )

    assert.strictEqual(fallbackResult.changed, true)
    assert.strictEqual(fallbackResult.changed, hookedResult.changed)
    assert.strictEqual(fallbackResult.hasBracketText, hookedResult.hasBracketText)
    assert.strictEqual(fallbackResult.hasEmphasis, hookedResult.hasEmphasis)
    assert.strictEqual(fallbackResult.hasLinkClose, hookedResult.hasLinkClose)
    assert.ok((fallbackMetrics.brokenRefFlow && fallbackMetrics.brokenRefFlow.repaired) > 0)
    assert.ok((hookedMetrics.brokenRefFlow && hookedMetrics.brokenRefFlow.repaired) > 0)

    if (hookedFacts.rebuildLevelStart !== undefined) {
      rebuildInlineLevelsFrom(hookedChildren, hookedFacts.rebuildLevelStart)
    }

    const fallbackSignals = summarizeBrokenRefSignals(fallbackChildren)
    const hookedSignals = summarizeBrokenRefSignals(hookedChildren)
    assert.deepStrictEqual(
      {
        hasBracketText: fallbackResult.hasBracketText,
        hasEmphasis: fallbackResult.hasEmphasis,
        hasLinkClose: fallbackResult.hasLinkClose
      },
      fallbackSignals
    )
    assert.deepStrictEqual(
      {
        hasBracketText: hookedResult.hasBracketText,
        hasEmphasis: hookedResult.hasEmphasis,
        hasLinkClose: hookedResult.hasLinkClose
      },
      hookedSignals
    )
    assert.deepStrictEqual(summarizeTokens(fallbackChildren), summarizeTokens(hookedChildren))
  })

  if (allPass) {
    console.log('Passed broken-ref helper tests.')
  }
  return allPass
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!runBrokenRefHelperTests()) {
    process.exitCode = 1
  }
}