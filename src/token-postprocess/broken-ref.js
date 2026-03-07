import { buildLinkCloseMap } from '../token-link-utils.js'
import {
  isAsteriskEmphasisToken,
  hasTextMarkerCharsInRange,
  buildAsteriskWrapperPrefixStats,
  shouldAttemptBrokenRefRewrite
} from './guards.js'
import {
  BROKEN_REF_FAST_PATH_RESULT_NO_ACTIVE_SIGNATURE,
  BROKEN_REF_FAST_PATH_RESULT_NO_MATCH,
  applyBrokenRefTokenOnlyFastPath
} from './fastpaths.js'

const scanBrokenRefState = (text, out) => {
  if (!text || text.indexOf('[') === -1) {
    out.depth = 0
    out.brokenEnd = false
    out.tailOpen = -1
    return out
  }
  let depth = 0
  let lastOpen = -1
  let lastClose = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (ch === 0x5B) {
      depth++
      lastOpen = i
    } else if (ch === 0x5D) {
      if (depth > 0) depth--
      lastClose = i
    }
  }
  out.depth = depth
  out.brokenEnd = depth > 0 && lastOpen > lastClose
  out.tailOpen = out.brokenEnd ? lastOpen : -1
  return out
}

const resetBrokenRefScanState = (scanState) => {
  if (!scanState) return scanState
  scanState.depth = 0
  scanState.brokenEnd = false
  scanState.tailOpen = -1
  return scanState
}

const updateBracketDepth = (text, depth) => {
  if (!text || depth <= 0) return depth
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (ch === 0x5B) {
      depth++
    } else if (ch === 0x5D) {
      if (depth > 0) {
        depth--
        if (depth === 0) return 0
      }
    }
  }
  return depth
}

const createBrokenRefWrapperBalance = () => {
  return {
    strong: 0,
    em: 0,
    total: 0
  }
}

const updateBrokenRefWrapperBalance = (token, balance) => {
  if (!token || !token.type) return
  if ((token.type === 'strong_open' || token.type === 'strong_close' || token.type === 'em_open' || token.type === 'em_close') &&
      !isAsteriskEmphasisToken(token)) {
    return
  }
  if (token.type === 'strong_open') {
    balance.strong++
    balance.total++
    return
  }
  if (token.type === 'em_open') {
    balance.em++
    balance.total++
    return
  }
  if (token.type === 'strong_close') {
    if (balance.strong > 0) {
      balance.strong--
      balance.total--
    }
    return
  }
  if (token.type === 'em_close' && balance.em > 0) {
    balance.em--
    balance.total--
  }
}

const expandSegmentEndForWrapperBalance = (tokens, startIdx, endIdx) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return endIdx
  const balance = createBrokenRefWrapperBalance()
  let expandedEnd = endIdx

  for (let i = startIdx; i <= expandedEnd; i++) {
    updateBrokenRefWrapperBalance(tokens[i], balance)
  }

  while (balance.total > 0 && expandedEnd + 1 < tokens.length) {
    expandedEnd++
    updateBrokenRefWrapperBalance(tokens[expandedEnd], balance)
  }

  return balance.total > 0 ? -1 : expandedEnd
}

const bumpBrokenRefMetric = (metrics, bucket, key) => {
  if (!metrics || !bucket || !key) return
  let table = metrics[bucket]
  if (!table || typeof table !== 'object') {
    table = Object.create(null)
    metrics[bucket] = table
  }
  table[key] = (table[key] || 0) + 1
}

const ensureBrokenRefLinkCloseMap = (tokens, facts = null, hooks = null, fallbackCache = null) => {
  if (hooks && typeof hooks.ensureLinkCloseMap === 'function') {
    return hooks.ensureLinkCloseMap(facts, tokens)
  }
  if (fallbackCache && fallbackCache.linkCloseMap !== undefined) {
    return fallbackCache.linkCloseMap
  }
  const linkCloseMap = (!tokens || tokens.length === 0)
    ? new Map()
    : buildLinkCloseMap(tokens, 0, tokens.length - 1)
  if (fallbackCache) {
    fallbackCache.linkCloseMap = linkCloseMap
  }
  return linkCloseMap
}

const ensureBrokenRefWrapperPrefixStats = (tokens, facts = null, hooks = null, fallbackCache = null) => {
  if (hooks && typeof hooks.ensureWrapperPrefixStats === 'function') {
    return hooks.ensureWrapperPrefixStats(facts, tokens)
  }
  if (fallbackCache && fallbackCache.wrapperPrefixStats !== undefined) {
    return fallbackCache.wrapperPrefixStats
  }
  const wrapperPrefixStats = (!tokens || tokens.length === 0)
    ? null
    : buildAsteriskWrapperPrefixStats(tokens)
  if (fallbackCache) {
    fallbackCache.wrapperPrefixStats = wrapperPrefixStats
  }
  return wrapperPrefixStats
}

const invalidateBrokenRefDerivedCaches = (facts = null, hooks = null, fallbackCache = null) => {
  if (fallbackCache) {
    fallbackCache.linkCloseMap = undefined
    fallbackCache.wrapperPrefixStats = undefined
  }
  if (hooks && typeof hooks.invalidateDerivedCaches === 'function') {
    hooks.invalidateDerivedCaches(facts)
  }
}

const markBrokenRefLevelRebuildFrom = (facts = null, startIdx = 0, hooks = null) => {
  if (hooks && typeof hooks.markLevelRebuildFrom === 'function') {
    hooks.markLevelRebuildFrom(facts, startIdx)
  }
}

const BROKEN_REF_FLOW_SKIP_NO_TEXT_MARKER = 'skip-no-text-marker'
const BROKEN_REF_FLOW_SKIP_GUARD = 'skip-guard'
const BROKEN_REF_FLOW_SKIP_NO_ACTIVE_SIGNATURE = 'skip-no-active-signature'
const BROKEN_REF_FLOW_SKIP_NO_FASTPATH_MATCH = 'skip-no-fastpath-match'
const BROKEN_REF_FLOW_REPAIRED = 'repaired'

const resolveBrokenRefSegmentEnd = (children, brokenRefCandidate, closeIdx, metrics = null) => {
  let segmentEnd = expandSegmentEndForWrapperBalance(children, brokenRefCandidate.start, closeIdx)
  if (segmentEnd !== -1) return segmentEnd
  bumpBrokenRefMetric(metrics, 'brokenRefFlow', 'wrapper-expand-fallback')
  return closeIdx
}

const resolveBrokenRefCandidateGuardFlow = (
  children,
  brokenRefCandidate,
  segmentEnd,
  facts = null,
  hooks = null,
  fallbackCache = null
) => {
  if (!hasTextMarkerCharsInRange(children, brokenRefCandidate.start, segmentEnd, brokenRefCandidate.startTextOffset)) {
    return BROKEN_REF_FLOW_SKIP_NO_TEXT_MARKER
  }
  const wrapperPrefixStats = ensureBrokenRefWrapperPrefixStats(children, facts, hooks, fallbackCache)
  if (!shouldAttemptBrokenRefRewrite(
    children,
    brokenRefCandidate.start,
    segmentEnd,
    brokenRefCandidate.startTextOffset,
    wrapperPrefixStats
  )) {
    return BROKEN_REF_FLOW_SKIP_GUARD
  }
  return null
}

const resolveBrokenRefFastPathFlow = (
  children,
  brokenRefCandidate,
  segmentEnd,
  linkCloseMap,
  metrics = null
) => {
  const fastPathResult = applyBrokenRefTokenOnlyFastPath(
    children,
    brokenRefCandidate.start,
    segmentEnd,
    linkCloseMap,
    metrics,
    bumpBrokenRefMetric
  )
  if (fastPathResult === BROKEN_REF_FAST_PATH_RESULT_NO_ACTIVE_SIGNATURE) {
    return BROKEN_REF_FLOW_SKIP_NO_ACTIVE_SIGNATURE
  }
  if (fastPathResult === BROKEN_REF_FAST_PATH_RESULT_NO_MATCH) {
    return BROKEN_REF_FLOW_SKIP_NO_FASTPATH_MATCH
  }
  return BROKEN_REF_FLOW_REPAIRED
}

const runBrokenRefCandidateRewrite = (
  children,
  brokenRefCandidate,
  closeIdx,
  linkCloseMap,
  metrics = null,
  facts = null,
  hooks = null,
  fallbackCache = null
) => {
  const segmentEnd = resolveBrokenRefSegmentEnd(children, brokenRefCandidate, closeIdx, metrics)
  const guardFlow = resolveBrokenRefCandidateGuardFlow(
    children,
    brokenRefCandidate,
    segmentEnd,
    facts,
    hooks,
    fallbackCache
  )
  if (guardFlow) return guardFlow
  const fastPathFlow = resolveBrokenRefFastPathFlow(
    children,
    brokenRefCandidate,
    segmentEnd,
    linkCloseMap,
    metrics
  )
  if (fastPathFlow !== BROKEN_REF_FLOW_REPAIRED) return fastPathFlow
  invalidateBrokenRefDerivedCaches(facts, hooks, fallbackCache)
  markBrokenRefLevelRebuildFrom(facts, brokenRefCandidate.start, hooks)
  return BROKEN_REF_FLOW_REPAIRED
}

const resetBrokenRefCandidateState = (candidateState) => {
  candidateState.start = -1
  candidateState.depth = 0
  candidateState.startTextOffset = 0
  return candidateState
}

const startBrokenRefCandidateState = (candidateState, tokenIdx, scan) => {
  candidateState.start = tokenIdx
  candidateState.depth = scan.depth
  candidateState.startTextOffset = scan.tailOpen > 0 ? scan.tailOpen : 0
  return candidateState
}

const createBrokenRefSignalSeed = (facts = null) => {
  return {
    hasBracketText: !!(facts && facts.hasBracketText),
    hasEmphasis: !!(facts && facts.hasEmphasis),
    hasLinkClose: !!(facts && facts.hasLinkClose)
  }
}

const createBrokenRefPassSignals = (seedSignals = null) => {
  const seed = seedSignals || {}
  return {
    hasBracketText: !!seed.hasBracketText,
    hasEmphasis: !!seed.hasEmphasis,
    hasLinkClose: !!seed.hasLinkClose
  }
}

const observeBrokenRefTextToken = (passSignals, candidateState, text, tokenIdx, scanState) => {
  const hasOpenBracket = text.indexOf('[') !== -1
  const hasCloseBracket = text.indexOf(']') !== -1
  if (!passSignals.hasBracketText && (hasOpenBracket || hasCloseBracket)) {
    passSignals.hasBracketText = true
  }
  if (candidateState.start === -1) {
    if (!hasOpenBracket) return
    const scan = scanBrokenRefState(text, scanState)
    if (scan.brokenEnd) {
      startBrokenRefCandidateState(candidateState, tokenIdx, scan)
    }
    return
  }
  if (!hasOpenBracket && !hasCloseBracket) return
  candidateState.depth = updateBracketDepth(text, candidateState.depth)
  if (candidateState.depth <= 0) {
    resetBrokenRefCandidateState(candidateState)
  }
}

const observeBrokenRefPassTokenFlags = (passSignals, child) => {
  if (!passSignals.hasEmphasis && isAsteriskEmphasisToken(child)) {
    passSignals.hasEmphasis = true
  }
  if (!passSignals.hasLinkClose && child.type === 'link_close') {
    passSignals.hasLinkClose = true
  }
}

const buildBrokenRefRepairPassResult = (didRepair, passSignals) => {
  return {
    didRepair,
    hasBracketText: passSignals.hasBracketText,
    hasEmphasis: passSignals.hasEmphasis,
    hasLinkClose: passSignals.hasLinkClose
  }
}

const collectBrokenRefPassSignals = (children, seedSignals = null) => {
  const passSignals = createBrokenRefPassSignals(seedSignals)
  if (!children || children.length === 0) return passSignals
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!child) continue
    if (!passSignals.hasBracketText && child.type === 'text' && child.content) {
      if (child.content.indexOf('[') !== -1 || child.content.indexOf(']') !== -1) {
        passSignals.hasBracketText = true
      }
    }
    observeBrokenRefPassTokenFlags(passSignals, child)
    if (passSignals.hasBracketText && passSignals.hasEmphasis && passSignals.hasLinkClose) {
      break
    }
  }
  return passSignals
}

const tryRepairBrokenRefCandidateAtLinkOpen = (
  children,
  child,
  childIdx,
  brokenRefCandidate,
  passSignals,
  metrics = null,
  facts = null,
  hooks = null,
  fallbackCache = null
) => {
  if (!child || child.type !== 'link_open' || brokenRefCandidate.start === -1) return null
  if (brokenRefCandidate.depth <= 0) {
    resetBrokenRefCandidateState(brokenRefCandidate)
    return null
  }
  const linkCloseMap = ensureBrokenRefLinkCloseMap(children, facts, hooks, fallbackCache)
  const closeIdx = linkCloseMap.get(childIdx) ?? -1
  if (closeIdx === -1) return null
  bumpBrokenRefMetric(metrics, 'brokenRefFlow', 'candidate')
  const flowResult = runBrokenRefCandidateRewrite(
    children,
    brokenRefCandidate,
    closeIdx,
    linkCloseMap,
    metrics,
    facts,
    hooks,
    fallbackCache
  )
  if (flowResult !== BROKEN_REF_FLOW_REPAIRED) {
    bumpBrokenRefMetric(metrics, 'brokenRefFlow', flowResult)
    resetBrokenRefCandidateState(brokenRefCandidate)
    return null
  }
  bumpBrokenRefMetric(metrics, 'brokenRefFlow', BROKEN_REF_FLOW_REPAIRED)
  return buildBrokenRefRepairPassResult(true, passSignals)
}

const runBrokenRefRepairPass = (children, scanState, metrics = null, facts = null, hooks = null) => {
  resetBrokenRefScanState(scanState)
  const brokenRefCandidate = resetBrokenRefCandidateState({ start: -1, depth: 0, startTextOffset: 0 })
  const passSignals = createBrokenRefPassSignals(createBrokenRefSignalSeed(facts))
  const fallbackCache = {
    linkCloseMap: undefined,
    wrapperPrefixStats: undefined
  }

  for (let j = 0; j < children.length; j++) {
    const child = children[j]
    if (!child) continue

    if (child.type === 'text' && child.content) {
      observeBrokenRefTextToken(passSignals, brokenRefCandidate, child.content, j, scanState)
    }

    observeBrokenRefPassTokenFlags(passSignals, child)
    const repaired = tryRepairBrokenRefCandidateAtLinkOpen(
      children,
      child,
      j,
      brokenRefCandidate,
      passSignals,
      metrics,
      facts,
      hooks,
      fallbackCache
    )
    if (repaired) return repaired
  }

  return buildBrokenRefRepairPassResult(false, passSignals)
}

const computeMaxBrokenRefRepairPass = (children, scanState) => {
  resetBrokenRefScanState(scanState)
  let maxRepairPass = 0
  for (let j = 0; j < children.length; j++) {
    const child = children[j]
    if (!child || child.type !== 'text' || !child.content) continue
    if (child.content.indexOf('[') === -1) continue
    if (scanBrokenRefState(child.content, scanState).brokenEnd) {
      maxRepairPass++
    }
  }
  return maxRepairPass
}

const runBrokenRefRepairs = (children, maxRepairPass, scanState, metrics = null, facts = null, hooks = null) => {
  let repairPassCount = 0
  let changed = false
  while (repairPassCount < maxRepairPass) {
    const pass = runBrokenRefRepairPass(children, scanState, metrics, facts, hooks)
    if (!pass.didRepair) {
      return {
        changed,
        hasBracketText: pass.hasBracketText,
        hasEmphasis: pass.hasEmphasis,
        hasLinkClose: pass.hasLinkClose
      }
    }
    changed = true
    repairPassCount++
  }
  const finalSignals = collectBrokenRefPassSignals(children, createBrokenRefSignalSeed(facts))
  return {
    changed,
    hasBracketText: finalSignals.hasBracketText,
    hasEmphasis: finalSignals.hasEmphasis,
    hasLinkClose: finalSignals.hasLinkClose
  }
}

export {
  computeMaxBrokenRefRepairPass,
  runBrokenRefRepairs
}
