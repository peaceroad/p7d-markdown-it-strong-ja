import { isJapaneseChar } from '../token-utils.js'

const hasMarkerChars = (text) => {
  return !!text && text.indexOf('*') !== -1
}

const contentHasMarkerCharsFrom = (content, from) => {
  if (!content) return false
  const start = from > 0 ? from : 0
  if (start === 0) return hasMarkerChars(content)
  if (start >= content.length) return false
  return content.indexOf('*', start) !== -1
}

const isAsteriskEmphasisToken = (token) => {
  if (!token || !token.type) return false
  if (token.type !== 'strong_open' &&
      token.type !== 'strong_close' &&
      token.type !== 'em_open' &&
      token.type !== 'em_close') {
    return false
  }
  if (typeof token.markup === 'string' && token.markup.indexOf('_') !== -1) return false
  return true
}

const textTokenHasMarkerChars = (token) => {
  if (!token || token.type !== 'text' || !token.content) return false
  const content = token.content
  if (token.__strongJaMarkerSource === content &&
      typeof token.__strongJaHasMarkerChars === 'boolean') {
    return token.__strongJaHasMarkerChars
  }
  const hasMarker = hasMarkerChars(content)
  token.__strongJaMarkerSource = content
  token.__strongJaHasMarkerChars = hasMarker
  return hasMarker
}

const tokenHasJapaneseChars = (token) => {
  if (!token || (token.type !== 'text' && token.type !== 'code_inline') || !token.content) {
    return false
  }
  const content = token.content
  if (token.__strongJaJapaneseSource === content &&
      typeof token.__strongJaHasJapaneseChar === 'boolean') {
    return token.__strongJaHasJapaneseChar
  }
  let hasJapanese = false
  for (let i = 0; i < content.length; i++) {
    if (isJapaneseChar(content.charCodeAt(i))) {
      hasJapanese = true
      break
    }
  }
  token.__strongJaJapaneseSource = content
  token.__strongJaHasJapaneseChar = hasJapanese
  return hasJapanese
}

const hasJapaneseContextInRange = (tokens, startIdx, endIdx) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return false
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (tokenHasJapaneseChars(token)) return true
  }
  return false
}

const hasEmphasisSignalInRange = (tokens, startIdx, endIdx) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return false
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    if (isAsteriskEmphasisToken(token)) return true
    if (textTokenHasMarkerChars(token)) return true
  }
  return false
}

const hasTextMarkerCharsInRange = (tokens, startIdx, endIdx, firstTextOffset = 0) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return false
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.type !== 'text' || !token.content) continue
    if (i === startIdx && firstTextOffset > 0) {
      if (contentHasMarkerCharsFrom(token.content, firstTextOffset)) return true
      continue
    }
    if (textTokenHasMarkerChars(token)) return true
  }
  return false
}

const isStrongRunSoftSpace = (code) => {
  return code === 0x20 || code === 0x09 || code === 0x0A || code === 0x3000
}

const isStrongRunAsciiWord = (code) => {
  return (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5A) ||
    (code >= 0x61 && code <= 0x7A)
}

const isStrongRunTextLike = (code) => {
  if (!code) return false
  return isStrongRunAsciiWord(code) || isJapaneseChar(code)
}

const countDelimiterLikeStrongRuns = (content, marker, from = 0, limit = 0) => {
  let at = from > 0 ? from : 0
  const len = content.length
  const markerCode = marker.charCodeAt(0)
  let count = 0
  while (at < len) {
    const pos = content.indexOf(marker, at)
    if (pos === -1) break
    const prevCode = pos > 0 ? content.charCodeAt(pos - 1) : 0
    const nextPos = pos + marker.length
    const nextCode = nextPos < len ? content.charCodeAt(nextPos) : 0
    const prevSameMarker = prevCode === markerCode
    const nextSameMarker = nextCode === markerCode
    if (prevSameMarker || nextSameMarker) {
      at = pos + marker.length
      continue
    }
    const prevSoft = prevCode !== 0 && isStrongRunSoftSpace(prevCode)
    const nextSoft = nextCode !== 0 && isStrongRunSoftSpace(nextCode)
    const hasPrevOrNext = prevCode !== 0 || nextCode !== 0
    const prevTextLike = isStrongRunTextLike(prevCode)
    const nextTextLike = isStrongRunTextLike(nextCode)
    const hasTextNeighbor = prevTextLike || nextTextLike
    if (!hasTextNeighbor) {
      at = pos + marker.length
      continue
    }
    const atBoundary = prevCode === 0 || nextCode === 0
    if (!atBoundary && (!prevTextLike || !nextTextLike)) {
      at = pos + marker.length
      continue
    }
    if (hasPrevOrNext && !prevSoft && !nextSoft) {
      count++
      if (limit > 0 && count >= limit) return count
    }
    at = pos + marker.length
  }
  return count
}

const countStrongMarkerRunsInTextRange = (tokens, startIdx, endIdx, firstTextOffset = 0, limit = 0) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return 0
  let total = 0
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.type !== 'text' || !token.content) continue
    const content = token.content
    const scanFrom = i === startIdx && firstTextOffset > 0 ? firstTextOffset : 0
    if (scanFrom >= content.length) continue
    const remain = limit > 0 ? (limit - total) : 0
    total += countDelimiterLikeStrongRuns(content, '**', scanFrom, remain)
    if (limit > 0 && total >= limit) {
      return total
    }
  }
  return total
}

const buildAsteriskWrapperPrefixStats = (tokens) => {
  const len = Array.isArray(tokens) ? tokens.length : 0
  const strongDepthPrefix = new Array(len + 1)
  const emDepthPrefix = new Array(len + 1)
  const strongOpenPrefix = new Array(len + 1)
  const strongClosePrefix = new Array(len + 1)
  const emOpenPrefix = new Array(len + 1)
  const emClosePrefix = new Array(len + 1)
  let strongDepth = 0
  let emDepthCount = 0
  let strongOpenCount = 0
  let strongCloseCount = 0
  let emOpenCount = 0
  let emCloseCount = 0
  strongDepthPrefix[0] = 0
  emDepthPrefix[0] = 0
  strongOpenPrefix[0] = 0
  strongClosePrefix[0] = 0
  emOpenPrefix[0] = 0
  emClosePrefix[0] = 0
  for (let i = 0; i < len; i++) {
    const token = tokens[i]
    if (token && token.type && isAsteriskEmphasisToken(token)) {
      if (token.type === 'strong_open') {
        strongDepth++
        strongOpenCount++
      } else if (token.type === 'strong_close') {
        if (strongDepth > 0) strongDepth--
        strongCloseCount++
      } else if (token.type === 'em_open') {
        emDepthCount++
        emOpenCount++
      } else if (token.type === 'em_close') {
        if (emDepthCount > 0) emDepthCount--
        emCloseCount++
      }
    }
    strongDepthPrefix[i + 1] = strongDepth
    emDepthPrefix[i + 1] = emDepthCount
    strongOpenPrefix[i + 1] = strongOpenCount
    strongClosePrefix[i + 1] = strongCloseCount
    emOpenPrefix[i + 1] = emOpenCount
    emClosePrefix[i + 1] = emCloseCount
  }
  return {
    strongDepth: strongDepthPrefix,
    emDepth: emDepthPrefix,
    strongOpen: strongOpenPrefix,
    strongClose: strongClosePrefix,
    emOpen: emOpenPrefix,
    emClose: emClosePrefix
  }
}

const createBrokenRefWrapperRangeSignals = () => {
  return {
    hasLeadingUnmatchedClose: false,
    hasImbalance: false,
    hasAsteriskEmphasisToken: false,
    hasLongStarNoise: false,
    hasUnderscoreText: false,
    hasCodeInline: false,
    hasUnderscoreEmphasisToken: false,
    strongOpenInRange: 0,
    strongCloseInRange: 0,
    emOpenInRange: 0,
    emCloseInRange: 0
  }
}

const updateBrokenRefTextRangeSignals = (signals, token, tokenIdx, startIdx, firstTextOffset) => {
  if (!token || token.type !== 'text' || !token.content) return
  const content = token.content
  // Keep this at 0 (instead of firstTextOffset) so historical fail-safe
  // behavior around noisy leading chains in the first text token stays unchanged.
  if (!signals.hasLongStarNoise && content.indexOf('***') !== -1) {
    signals.hasLongStarNoise = true
  }
  if (!signals.hasUnderscoreText) {
    const scanFrom = tokenIdx === startIdx && firstTextOffset > 0 ? firstTextOffset : 0
    if (scanFrom < content.length && content.indexOf('_', scanFrom) !== -1) {
      signals.hasUnderscoreText = true
    }
  }
}

const updateBrokenRefWrapperTokenSignals = (signals, token, isAsteriskEmphasis) => {
  if (!signals.hasCodeInline && token.type === 'code_inline') {
    signals.hasCodeInline = true
  }
  if (isAsteriskEmphasis) {
    signals.hasAsteriskEmphasisToken = true
  }
  if (!signals.hasUnderscoreEmphasisToken &&
      (token.type === 'strong_open' ||
       token.type === 'strong_close' ||
       token.type === 'em_open' ||
       token.type === 'em_close') &&
      (token.markup === '_' || token.markup === '__')) {
    signals.hasUnderscoreEmphasisToken = true
  }
}

const updateBrokenRefWrapperRangeDepthSignals = (signals, token, wrapperState, isAsteriskEmphasis) => {
  if (!isAsteriskEmphasis) return
  let depthKey = ''
  if (token.type === 'strong_open' || token.type === 'strong_close') {
    depthKey = 'strongDepth'
  } else if (token.type === 'em_open' || token.type === 'em_close') {
    depthKey = 'emDepth'
  } else {
    return
  }
  const isOpen = token.type.endsWith('_open')
  if (!wrapperState.sawWrapper) {
    wrapperState.sawWrapper = true
    if (!isOpen) signals.hasLeadingUnmatchedClose = true
  }
  if (isOpen) {
    wrapperState.sawOpen = true
    signals.hasLeadingUnmatchedClose = false
    wrapperState[depthKey]++
  } else if (wrapperState[depthKey] <= 0) {
    signals.hasImbalance = true
  } else {
    wrapperState[depthKey]--
  }
  if (token.type === 'strong_open') signals.strongOpenInRange++
  else if (token.type === 'strong_close') signals.strongCloseInRange++
  else if (token.type === 'em_open') signals.emOpenInRange++
  else if (token.type === 'em_close') signals.emCloseInRange++
}

const finalizeBrokenRefWrapperRangeSignals = (signals, wrapperState) => {
  if (!wrapperState.sawWrapper || wrapperState.sawOpen) {
    signals.hasLeadingUnmatchedClose = false
  }
  if (!signals.hasImbalance &&
      (wrapperState.strongDepth !== 0 || wrapperState.emDepth !== 0)) {
    signals.hasImbalance = true
  }
  return signals
}

const buildBrokenRefWrapperRangeSignals = (tokens, startIdx, endIdx, firstTextOffset = 0) => {
  const signals = createBrokenRefWrapperRangeSignals()
  if (!tokens || startIdx < 0 || endIdx < startIdx) return signals
  const wrapperState = { sawWrapper: false, sawOpen: false, strongDepth: 0, emDepth: 0 }
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || !token.type) continue
    const isAsteriskEmphasis = isAsteriskEmphasisToken(token)
    updateBrokenRefWrapperTokenSignals(signals, token, isAsteriskEmphasis)
    updateBrokenRefTextRangeSignals(signals, token, i, startIdx, firstTextOffset)
    updateBrokenRefWrapperRangeDepthSignals(signals, token, wrapperState, isAsteriskEmphasis)
  }
  return finalizeBrokenRefWrapperRangeSignals(signals, wrapperState)
}

const hasRangeCloseOnlyWrapperSignals = (signals) => {
  if (!signals) return false
  return (signals.strongCloseInRange > 0 && signals.strongOpenInRange === 0) ||
    (signals.emCloseInRange > 0 && signals.emOpenInRange === 0)
}

const hasPreexistingWrapperCloseOnlyInRange = (tokens, startIdx, endIdx, prefixStats = null, wrapperSignals = null) => {
  if (!tokens || startIdx <= 0 || endIdx < startIdx) return false
  const signals = wrapperSignals || buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, 0)
  if (!hasRangeCloseOnlyWrapperSignals(signals)) return false
  const needsStrongCloseOnly = signals.strongCloseInRange > 0 && signals.strongOpenInRange === 0
  const needsEmCloseOnly = signals.emCloseInRange > 0 && signals.emOpenInRange === 0

  let preStrongDepth = 0
  let preEmDepth = 0
  const hasPrefix =
    !!prefixStats &&
    Array.isArray(prefixStats.strongDepth) &&
    Array.isArray(prefixStats.emDepth) &&
    Array.isArray(prefixStats.strongOpen) &&
    Array.isArray(prefixStats.strongClose) &&
    Array.isArray(prefixStats.emOpen) &&
    Array.isArray(prefixStats.emClose)
  if (hasPrefix &&
      startIdx < prefixStats.strongDepth.length &&
      startIdx < prefixStats.emDepth.length &&
      (endIdx + 1) < prefixStats.strongOpen.length &&
      (endIdx + 1) < prefixStats.strongClose.length &&
      (endIdx + 1) < prefixStats.emOpen.length &&
      (endIdx + 1) < prefixStats.emClose.length) {
    if (needsStrongCloseOnly) {
      preStrongDepth = prefixStats.strongDepth[startIdx] || 0
      if (preStrongDepth > 0) return true
    }
    if (needsEmCloseOnly) {
      preEmDepth = prefixStats.emDepth[startIdx] || 0
      if (preEmDepth > 0) return true
    }
    return false
  }
  for (let i = 0; i < startIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || !token.type || !isAsteriskEmphasisToken(token)) continue
    if (needsStrongCloseOnly) {
      if (token.type === 'strong_open') {
        preStrongDepth++
        continue
      }
      if (token.type === 'strong_close') {
        if (preStrongDepth > 0) preStrongDepth--
        continue
      }
    }
    if (needsEmCloseOnly) {
      if (token.type === 'em_open') {
        preEmDepth++
        continue
      }
      if (token.type === 'em_close' && preEmDepth > 0) {
        preEmDepth--
      }
    }
  }
  if (needsStrongCloseOnly && preStrongDepth > 0) return true
  if (needsEmCloseOnly && preEmDepth > 0) return true
  return false
}

const hasBrokenRefLowConfidenceTextNoise = (signals) => {
  return signals.hasLongStarNoise || signals.hasUnderscoreText
}

const hasBrokenRefLowConfidenceInlineSyntax = (signals) => {
  return signals.hasCodeInline || signals.hasUnderscoreEmphasisToken
}

const hasBrokenRefLowConfidenceNoise = (signals) => {
  return hasBrokenRefLowConfidenceTextNoise(signals) || hasBrokenRefLowConfidenceInlineSyntax(signals)
}

const hasBrokenRefCloseOnlyWrapperRisk = (
  tokens,
  startIdx,
  endIdx,
  wrapperPrefixStats = null,
  wrapperSignals = null
) => {
  const signals = wrapperSignals || buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, 0)
  return hasPreexistingWrapperCloseOnlyInRange(tokens, startIdx, endIdx, wrapperPrefixStats, signals)
}

const hasBrokenRefLowConfidenceWrapperRisk = (
  tokens,
  startIdx,
  endIdx,
  wrapperPrefixStats = null,
  wrapperSignals = null
) => {
  const signals = wrapperSignals || buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, 0)
  if (signals.hasLeadingUnmatchedClose) return true
  return hasBrokenRefCloseOnlyWrapperRisk(tokens, startIdx, endIdx, wrapperPrefixStats, signals)
}

const isLowConfidenceBrokenRefRange = (tokens, startIdx, endIdx, firstTextOffset = 0, wrapperPrefixStats = null, wrapperSignals = null) => {
  const signals = wrapperSignals || buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, firstTextOffset)
  if (hasBrokenRefLowConfidenceNoise(signals)) return true
  return hasBrokenRefLowConfidenceWrapperRisk(tokens, startIdx, endIdx, wrapperPrefixStats, signals)
}

const hasBrokenRefStrongRunEvidence = (tokens, startIdx, endIdx, firstTextOffset = 0) => {
  return countStrongMarkerRunsInTextRange(tokens, startIdx, endIdx, firstTextOffset, 2) >= 2
}

const hasBrokenRefExplicitAsteriskSignal = (wrapperSignals) => {
  return wrapperSignals.hasAsteriskEmphasisToken
}

const hasBrokenRefImmediateRewriteSignal = (wrapperSignals) => {
  return wrapperSignals.hasImbalance && hasBrokenRefExplicitAsteriskSignal(wrapperSignals)
}

const shouldRejectBalancedBrokenRefRewrite = (wrapperSignals) => {
  return !wrapperSignals.hasImbalance && hasBrokenRefExplicitAsteriskSignal(wrapperSignals)
}

const shouldAttemptBrokenRefRewriteFromSignals = (tokens, startIdx, endIdx, firstTextOffset, wrapperSignals) => {
  if (hasBrokenRefImmediateRewriteSignal(wrapperSignals)) return true
  if (shouldRejectBalancedBrokenRefRewrite(wrapperSignals)) return false
  return hasBrokenRefStrongRunEvidence(tokens, startIdx, endIdx, firstTextOffset)
}

const shouldAttemptBrokenRefRewrite = (tokens, startIdx, endIdx, firstTextOffset = 0, wrapperPrefixStats = null) => {
  const wrapperSignals = buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, firstTextOffset)
  if (isLowConfidenceBrokenRefRange(tokens, startIdx, endIdx, firstTextOffset, wrapperPrefixStats, wrapperSignals)) return false
  return shouldAttemptBrokenRefRewriteFromSignals(tokens, startIdx, endIdx, firstTextOffset, wrapperSignals)
}

const scanInlinePostprocessSignals = (children) => {
  let hasEmphasis = false
  let hasLinkOpen = false
  let hasLinkClose = false
  for (let j = 0; j < children.length; j++) {
    const child = children[j]
    if (!child) continue
    if (!hasEmphasis && isAsteriskEmphasisToken(child)) {
      hasEmphasis = true
    }
    if (!hasLinkOpen && child.type === 'link_open') {
      hasLinkOpen = true
    }
    if (!hasLinkClose && child.type === 'link_close') {
      hasLinkClose = true
    }
    if (hasEmphasis && hasLinkOpen && hasLinkClose) break
  }
  return {
    hasEmphasis,
    hasLinkOpen,
    hasLinkClose
  }
}

export {
  hasMarkerChars,
  isAsteriskEmphasisToken,
  hasJapaneseContextInRange,
  hasEmphasisSignalInRange,
  hasTextMarkerCharsInRange,
  buildAsteriskWrapperPrefixStats,
  shouldAttemptBrokenRefRewrite,
  scanInlinePostprocessSignals
}
