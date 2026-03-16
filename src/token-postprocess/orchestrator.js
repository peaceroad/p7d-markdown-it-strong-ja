import Token from 'markdown-it/lib/token.mjs'
import { buildLinkCloseMap, convertCollapsedReferenceLinks, mergeBrokenMarksAroundLinks } from '../token-link-utils.js'
import { computeMaxBrokenRefRepairPass, runBrokenRefRepairs } from './broken-ref.js'
import {
  rebuildInlineLevels,
  rebuildInlineLevelsFrom,
  fixEmOuterStrongSequence,
  fixLeadingAsteriskEm,
  fixTrailingStrong
} from '../token-core.js'
import {
  getRuntimeOpt,
  hasRuntimeOverride,
  getReferenceCount
} from '../token-utils.js'
import {
  hasMarkerChars,
  hasJapaneseContextInRange,
  hasEmphasisSignalInRange,
  buildAsteriskWrapperPrefixStats,
  scanInlinePostprocessSignals
} from './guards.js'
import {
  tryFixTailPatternTokenOnly,
  tryFixTailDanglingStrongCloseTokenOnly
} from './fastpaths.js'

const fallbackMarkupByType = (type) => {
  if (type === 'strong_open' || type === 'strong_close') return '**'
  if (type === 'em_open' || type === 'em_close') return '*'
  return ''
}

const makeTokenLiteralText = (token) => {
  if (!token) return
  const literal = token.markup || fallbackMarkupByType(token.type)
  token.type = 'text'
  token.tag = ''
  token.nesting = 0
  token.content = literal
  token.markup = ''
  token.info = ''
}

const sanitizeEmStrongBalance = (tokens, onChangeStart = null) => {
  if (!tokens || tokens.length === 0) return false
  const stack = []
  let changed = false
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || !token.type) continue
    if (token.type === 'strong_open' || token.type === 'em_open') {
      stack.push({ type: token.type, idx: i })
      continue
    }
    if (token.type !== 'strong_close' && token.type !== 'em_close') continue
    const expected = token.type === 'strong_close' ? 'strong_open' : 'em_open'
    if (stack.length > 0 && stack[stack.length - 1].type === expected) {
      stack.pop()
      continue
    }
    if (onChangeStart) onChangeStart(i)
    makeTokenLiteralText(token)
    changed = true
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]
    const token = tokens[entry.idx]
    if (!token) continue
    if (onChangeStart) onChangeStart(entry.idx)
    makeTokenLiteralText(token)
    changed = true
  }
  return changed
}

const getPostprocessMetrics = (state) => {
  if (!state || !state.env) return null
  const metrics = state.env.__strongJaPostprocessMetrics
  if (!metrics || typeof metrics !== 'object') return null
  return metrics
}

const buildInlinePostprocessFacts = (children, inlineContent) => {
  const preScan = scanInlinePostprocessSignals(children)
  return {
    hasBracketText: inlineContent.indexOf('[') !== -1 || inlineContent.indexOf(']') !== -1,
    hasEmphasis: preScan.hasEmphasis,
    hasLinkOpen: preScan.hasLinkOpen,
    hasLinkClose: preScan.hasLinkClose,
    hasCodeInline: preScan.hasCodeInline,
    linkCloseMap: undefined,
    wrapperPrefixStats: undefined,
    rebuildLevelStart: undefined
  }
}

const ensureInlineLinkCloseMap = (facts, tokens) => {
  if (!tokens || tokens.length === 0) return new Map()
  if (!facts) return buildLinkCloseMap(tokens, 0, tokens.length - 1)
  if (facts.linkCloseMap === undefined) {
    facts.linkCloseMap = buildLinkCloseMap(tokens, 0, tokens.length - 1)
  }
  return facts.linkCloseMap
}

const ensureInlineWrapperPrefixStats = (facts, tokens) => {
  if (!tokens || tokens.length === 0) return null
  if (!facts) return buildAsteriskWrapperPrefixStats(tokens)
  if (facts.wrapperPrefixStats === undefined) {
    facts.wrapperPrefixStats = buildAsteriskWrapperPrefixStats(tokens)
  }
  return facts.wrapperPrefixStats
}

const invalidateInlineDerivedCaches = (facts) => {
  if (!facts) return
  facts.linkCloseMap = undefined
  facts.wrapperPrefixStats = undefined
}

const markInlineLevelRebuildFrom = (facts, startIdx) => {
  if (!facts) return
  const from = startIdx > 0 ? startIdx : 0
  if (facts.rebuildLevelStart === undefined || from < facts.rebuildLevelStart) {
    facts.rebuildLevelStart = from
  }
}

const rebuildInlineLevelsForFacts = (tokens, facts) => {
  if (!facts || facts.rebuildLevelStart === undefined) {
    rebuildInlineLevels(tokens)
  } else {
    rebuildInlineLevelsFrom(tokens, facts.rebuildLevelStart)
  }
  if (facts) {
    facts.rebuildLevelStart = undefined
  }
}

const createInlineChangeMarker = (facts) => {
  return (startIdx) => {
    markInlineLevelRebuildFrom(facts, startIdx)
  }
}

const finalizeInlineLinkRepairStage = (children, facts, markChangedFrom) => {
  invalidateInlineDerivedCaches(facts)
  if (!mergeBrokenMarksAroundLinks(children, markChangedFrom)) return false
  invalidateInlineDerivedCaches(facts)
  rebuildInlineLevelsForFacts(children, facts)
  return true
}

const BROKEN_REF_REPAIR_HOOKS = {
  ensureLinkCloseMap: ensureInlineLinkCloseMap,
  ensureWrapperPrefixStats: ensureInlineWrapperPrefixStats,
  invalidateDerivedCaches: invalidateInlineDerivedCaches,
  markLevelRebuildFrom: markInlineLevelRebuildFrom
}

const bumpPostprocessMetric = (metrics, bucket, key) => {
  if (!metrics || !bucket || !key) return
  let table = metrics[bucket]
  if (!table || typeof table !== 'object') {
    table = Object.create(null)
    metrics[bucket] = table
  }
  table[key] = (table[key] || 0) + 1
}

const scanTailRepairCandidateAfterLinkClose = (tokens, linkCloseIdx) => {
  if (!tokens || linkCloseIdx < 0 || linkCloseIdx >= tokens.length) return null
  let startIdx = -1
  let foundStrongClose = -1
  let foundStrongOpen = -1
  for (let j = linkCloseIdx + 1; j < tokens.length; j++) {
    const node = tokens[j]
    if (!node) continue
    if (node.type === 'strong_open') {
      foundStrongOpen = j
      break
    }
    if (node.type === 'strong_close') {
      foundStrongClose = j
      break
    }
    if (node.type === 'text' && node.content && startIdx === -1) {
      startIdx = j
    }
  }
  if (foundStrongClose === -1 || foundStrongOpen !== -1) return null
  if (startIdx === -1) startIdx = foundStrongClose
  return { startIdx, strongCloseIdx: foundStrongClose }
}

const tryRepairTailCandidate = (tokens, candidate, isJapaneseMode, metrics = null, onChangeStart = null) => {
  if (!tokens || !candidate) return false
  const startIdx = candidate.startIdx
  const strongCloseIdx = candidate.strongCloseIdx
  const endIdx = tokens.length - 1
  if (isJapaneseMode && !hasJapaneseContextInRange(tokens, startIdx, endIdx)) return false
  if (!hasEmphasisSignalInRange(tokens, startIdx, endIdx)) return false
  if (tryFixTailPatternTokenOnly(tokens, startIdx, endIdx)) {
    if (onChangeStart) onChangeStart(startIdx)
    bumpPostprocessMetric(metrics, 'tailFastPaths', 'tail-pattern')
    return true
  }
  if (tryFixTailDanglingStrongCloseTokenOnly(tokens, startIdx, strongCloseIdx)) {
    if (onChangeStart) onChangeStart(startIdx)
    bumpPostprocessMetric(metrics, 'tailFastPaths', 'tail-dangling-strong-close')
    return true
  }
  return false
}

const fixTailAfterLinkStrongClose = (tokens, isJapaneseMode, metrics = null, onChangeStart = null) => {
  let strongDepth = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.type === 'strong_open') strongDepth++
    if (t.type === 'strong_close') {
      if (strongDepth > 0) strongDepth--
    }
    if (t.type !== 'link_close') continue
    if (strongDepth !== 0) continue
    const candidate = scanTailRepairCandidateAfterLinkClose(tokens, i)
    if (!candidate) continue
    if (tryRepairTailCandidate(tokens, candidate, isJapaneseMode, metrics, onChangeStart)) return true
  }
  return false
}

const cloneMap = (map) => {
  if (!map || !Array.isArray(map)) return null
  return [map[0], map[1]]
}

const cloneTextToken = (source, content) => {
  const token = new Token('text', '', 0)
  Object.assign(token, source)
  token.content = content
  if (source.meta) token.meta = { ...source.meta }
  return token
}

const isSoftSpaceCode = (code) => {
  return code === 0x20 || code === 0x09 || code === 0x3000
}

const CHAR_ASTERISK = 0x2A // *
const CHAR_BACKSLASH = 0x5C // \

const isAsciiWordCode = (code) => {
  return (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5A) ||
    (code >= 0x61 && code <= 0x7A)
}

const textEndsAsciiWord = (text) => {
  if (!text || text.length === 0) return false
  return isAsciiWordCode(text.charCodeAt(text.length - 1))
}

const textStartsAsciiWord = (text) => {
  if (!text || text.length === 0) return false
  return isAsciiWordCode(text.charCodeAt(0))
}

const isEscapedMarkerAt = (content, index) => {
  let slashCount = 0
  for (let i = index - 1; i >= 0 && content.charCodeAt(i) === CHAR_BACKSLASH; i--) {
    slashCount++
  }
  return (slashCount % 2) === 1
}

const findLastStandaloneStrongMarker = (content) => {
  if (!content || content.length < 2) return -1
  for (let pos = content.length - 2; pos >= 0; pos--) {
    if (content.charCodeAt(pos) !== CHAR_ASTERISK ||
        content.charCodeAt(pos + 1) !== CHAR_ASTERISK) {
      continue
    }
    const prev = pos > 0 ? content.charCodeAt(pos - 1) : 0
    const next = pos + 2 < content.length ? content.charCodeAt(pos + 2) : 0
    if (prev === CHAR_ASTERISK || next === CHAR_ASTERISK) continue
    if (prev === CHAR_BACKSLASH && isEscapedMarkerAt(content, pos)) continue
    return pos
  }
  return -1
}

const hasLeadingStandaloneStrongMarker = (content) => {
  if (!content || content.length < 2) return false
  if (content.charCodeAt(0) !== CHAR_ASTERISK || content.charCodeAt(1) !== CHAR_ASTERISK) return false
  if (content.length > 2 && content.charCodeAt(2) === CHAR_ASTERISK) return false
  return true
}

const tryPromoteStrongAroundInlineLink = (tokens, strictAsciiStrongGuard = false, facts = null) => {
  if (!tokens || tokens.length < 3) return false
  let changed = false
  for (let i = 1; i < tokens.length - 1; i++) {
    const linkOpen = tokens[i]
    if (!linkOpen || linkOpen.type !== 'link_open') continue
    const linkCloseMap = ensureInlineLinkCloseMap(facts, tokens)
    const closeIdx = linkCloseMap.get(i) ?? -1
    if (closeIdx === -1 || closeIdx + 1 >= tokens.length) continue

    const left = tokens[i - 1]
    const right = tokens[closeIdx + 1]
    if (!left || left.type !== 'text' || !left.content) {
      i = closeIdx
      continue
    }
    if (!right || right.type !== 'text' || !right.content) {
      i = closeIdx
      continue
    }
    if (!hasLeadingStandaloneStrongMarker(right.content)) {
      i = closeIdx
      continue
    }
    const markerPos = findLastStandaloneStrongMarker(left.content)
    if (markerPos === -1) {
      i = closeIdx
      continue
    }

    const prefix = left.content.slice(0, markerPos)
    const leftInner = left.content.slice(markerPos + 2)
    if (leftInner && isSoftSpaceCode(leftInner.charCodeAt(0))) {
      i = closeIdx
      continue
    }
    const rightTail = right.content.slice(2)
    if (strictAsciiStrongGuard &&
        (textEndsAsciiWord(prefix) || textStartsAsciiWord(rightTail))) {
      i = closeIdx
      continue
    }

    const replacement = []
    if (prefix) replacement.push(cloneTextToken(left, prefix))

    const strongOpen = new Token('strong_open', 'strong', 1)
    strongOpen.markup = '**'
    strongOpen.map = cloneMap(left.map) || cloneMap(linkOpen.map) || cloneMap(right.map) || null
    replacement.push(strongOpen)

    if (leftInner) replacement.push(cloneTextToken(left, leftInner))
    for (let j = i; j <= closeIdx; j++) replacement.push(tokens[j])

    const strongClose = new Token('strong_close', 'strong', -1)
    strongClose.markup = '**'
    strongClose.map = cloneMap(right.map) || cloneMap(linkOpen.map) || cloneMap(left.map) || null
    replacement.push(strongClose)

    if (rightTail) replacement.push(cloneTextToken(right, rightTail))

    tokens.splice(i - 1, closeIdx - i + 3, ...replacement)
    changed = true
    invalidateInlineDerivedCaches(facts)
    markInlineLevelRebuildFrom(facts, i - 1)
    i = i - 1 + replacement.length - 1
  }
  return changed
}

const tryPromoteStrongAroundInlineCode = (
  tokens,
  strictAsciiCodeGuard = false,
  strictAsciiStrongGuard = false,
  facts = null
) => {
  if (!tokens || tokens.length < 3) return false
  let changed = false
  for (let i = 0; i <= tokens.length - 3; i++) {
    const left = tokens[i]
    const code = tokens[i + 1]
    const right = tokens[i + 2]
    if (!left || !code || !right) continue
    if (left.type !== 'text' || !left.content) continue
    if (code.type !== 'code_inline') continue
    if (right.type !== 'text' || !right.content) continue
    if (!hasLeadingStandaloneStrongMarker(right.content)) continue
    const markerPos = findLastStandaloneStrongMarker(left.content)
    if (markerPos === -1) continue

    const prefix = left.content.slice(0, markerPos)
    const leftInner = left.content.slice(markerPos + 2)
    const rightTail = right.content.slice(2)
    if (strictAsciiStrongGuard &&
        (textEndsAsciiWord(prefix) || textStartsAsciiWord(rightTail))) {
      continue
    }
    if (strictAsciiCodeGuard &&
        leftInner &&
        isSoftSpaceCode(leftInner.charCodeAt(0)) &&
        code.content &&
        isAsciiWordCode(code.content.charCodeAt(0))) {
      continue
    }

    const replacement = []
    if (prefix) replacement.push(cloneTextToken(left, prefix))

    const strongOpen = new Token('strong_open', 'strong', 1)
    strongOpen.markup = '**'
    strongOpen.map = cloneMap(left.map) || cloneMap(code.map) || cloneMap(right.map) || null
    replacement.push(strongOpen)

    if (leftInner) replacement.push(cloneTextToken(left, leftInner))
    replacement.push(code)

    const strongClose = new Token('strong_close', 'strong', -1)
    strongClose.markup = '**'
    strongClose.map = cloneMap(right.map) || cloneMap(code.map) || cloneMap(left.map) || null
    replacement.push(strongClose)

    if (rightTail) replacement.push(cloneTextToken(right, rightTail))

    tokens.splice(i, 3, ...replacement)
    changed = true
    invalidateInlineDerivedCaches(facts)
    markInlineLevelRebuildFrom(facts, i)
    i += replacement.length - 1
  }
  return changed
}

const tryActivateInlineEmphasis = (
  children,
  facts,
  strictAsciiCodeGuard,
  strictAsciiStrongGuard
) => {
  if (!facts || facts.hasEmphasis) return false
  if (facts.hasLinkOpen &&
      facts.hasLinkClose &&
      tryPromoteStrongAroundInlineLink(children, strictAsciiStrongGuard, facts)) {
    facts.hasEmphasis = true
    return true
  }
  if (facts.hasBracketText || facts.hasLinkOpen || facts.hasLinkClose) return false
  if (!facts.hasCodeInline) return false
  if (tryPromoteStrongAroundInlineCode(children, strictAsciiCodeGuard, strictAsciiStrongGuard, facts)) {
    facts.hasEmphasis = true
    return true
  }
  return false
}

const shouldRunInlineBrokenRefRepair = (facts, inlineContent, state) => {
  if (!facts || !facts.hasLinkOpen || !facts.hasLinkClose || !facts.hasBracketText) return false
  if (inlineContent.indexOf('***') !== -1) return false
  return getReferenceCount(state) > 0
}

const applyBrokenRefRepairFacts = (facts, repairs) => {
  if (!facts || !repairs) return
  facts.hasBracketText = repairs.hasBracketText
  facts.hasEmphasis = repairs.hasEmphasis
  facts.hasLinkClose = repairs.hasLinkClose
}

const createBrokenRefScanState = () => {
  return { depth: 0, brokenEnd: false, tailOpen: -1 }
}

const runInlineBrokenRefRepairStage = (children, facts, inlineContent, state) => {
  if (!shouldRunInlineBrokenRefRepair(facts, inlineContent, state)) return false
  const scanState = createBrokenRefScanState()
  const maxRepairPass = computeMaxBrokenRefRepairPass(children, scanState)
  if (maxRepairPass <= 0) return false
  const repairs = runBrokenRefRepairs(
    children,
    maxRepairPass,
    scanState,
    getPostprocessMetrics(state),
    facts,
    BROKEN_REF_REPAIR_HOOKS
  )
  applyBrokenRefRepairFacts(facts, repairs)
  return repairs.changed
}

const runInlineEmphasisRepairStage = (children, facts, state, isJapaneseMode) => {
  if (!facts.hasEmphasis) return false
  let changed = false
  const markChangedFrom = createInlineChangeMarker(facts)
  if (fixEmOuterStrongSequence(children, markChangedFrom)) changed = true
  if (facts.hasLinkClose) {
    const metrics = getPostprocessMetrics(state)
    if (fixTailAfterLinkStrongClose(children, isJapaneseMode, metrics, markChangedFrom)) changed = true
    if (fixLeadingAsteriskEm(children, markChangedFrom)) changed = true
  }
  if (fixTrailingStrong(children, markChangedFrom)) changed = true
  if (sanitizeEmStrongBalance(children, markChangedFrom)) changed = true
  return changed
}

const shouldRunInlineCollapsedRefRepair = (facts, state) => {
  if (!facts || !facts.hasBracketText) return false
  return getReferenceCount(state) > 0
}

const applyCollapsedRefRepairFacts = (facts) => {
  if (!facts) return
  facts.hasLinkOpen = true
  facts.hasLinkClose = true
}

const rewriteInlineCollapsedReferences = (children, facts, state, markChangedFrom) => {
  const changed = convertCollapsedReferenceLinks(
    children,
    state,
    facts,
    markChangedFrom
  )
  if (!changed) return false
  applyCollapsedRefRepairFacts(facts)
  return true
}

const runInlineCollapsedRefStage = (children, facts, state) => {
  if (!shouldRunInlineCollapsedRefRepair(facts, state)) return false
  const markChangedFrom = createInlineChangeMarker(facts)
  if (!rewriteInlineCollapsedReferences(children, facts, state, markChangedFrom)) return false
  finalizeInlineLinkRepairStage(children, facts, markChangedFrom)
  return true
}

const shouldSkipInlinePostprocessToken = (children, facts, isJapaneseMode) => {
  if (!facts.hasEmphasis &&
      !facts.hasBracketText &&
      !facts.hasLinkOpen &&
      !facts.hasLinkClose &&
      !facts.hasCodeInline) {
    return true
  }
  if (isJapaneseMode &&
      !hasJapaneseContextInRange(children, 0, children.length - 1)) {
    return true
  }
  return false
}

const runInlineCoreRepairStages = (
  children,
  facts,
  inlineContent,
  state,
  isJapaneseMode,
  strictAsciiCodeGuard,
  strictAsciiStrongGuard
) => {
  let changed = false
  if (!facts.hasEmphasis && tryActivateInlineEmphasis(
    children,
    facts,
    strictAsciiCodeGuard,
    strictAsciiStrongGuard
  )) {
    changed = true
  } else if (!facts.hasEmphasis && !facts.hasBracketText) {
    return false
  }
  if (runInlineBrokenRefRepairStage(children, facts, inlineContent, state)) changed = true
  if (runInlineEmphasisRepairStage(children, facts, state, isJapaneseMode)) changed = true
  return changed
}

const processInlinePostprocessToken = (
  token,
  inlineContent,
  state,
  isJapaneseMode,
  strictAsciiCodeGuard,
  strictAsciiStrongGuard
) => {
  if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) return
  const children = token.children
  const facts = buildInlinePostprocessFacts(children, inlineContent)
  if (shouldSkipInlinePostprocessToken(children, facts, isJapaneseMode)) return
  const changed = runInlineCoreRepairStages(
    children,
    facts,
    inlineContent,
    state,
    isJapaneseMode,
    strictAsciiCodeGuard,
    strictAsciiStrongGuard
  )
  if (changed) rebuildInlineLevelsForFacts(children, facts)
  runInlineCollapsedRefStage(children, facts, state)
}

const processInlinePostprocessStateTokens = (
  state,
  isJapaneseMode,
  strictAsciiCodeGuard,
  strictAsciiStrongGuard
) => {
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i]
    if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) continue
    const inlineContent = typeof token.content === 'string' ? token.content : ''
    if (!hasMarkerChars(inlineContent)) continue
    processInlinePostprocessToken(
      token,
      inlineContent,
      state,
      isJapaneseMode,
      strictAsciiCodeGuard,
      strictAsciiStrongGuard
    )
  }
}

const registerTokenPostprocess = (md, baseOpt) => {
  if (md.__strongJaTokenPostprocessRegistered) return
  md.__strongJaTokenPostprocessRegistered = true
  md.core.ruler.after('inline', 'strong_ja_token_postprocess', (state) => {
    if (!state || !state.tokens) return
    const overrideOpt = state.env && state.env.__strongJaTokenOpt
    const opt = hasRuntimeOverride(overrideOpt) ? getRuntimeOpt(state, baseOpt) : baseOpt
    if (!opt.__strongJaPostprocessActive) return
    const isJapaneseMode = opt.__strongJaIsJapaneseMode
    const strictAsciiCodeGuard = opt.__strongJaStrictAsciiCodeGuard
    const strictAsciiStrongGuard = opt.__strongJaStrictAsciiStrongGuard
    processInlinePostprocessStateTokens(
      state,
      isJapaneseMode,
      strictAsciiCodeGuard,
      strictAsciiStrongGuard
    )
  })
}

export { registerTokenPostprocess }
