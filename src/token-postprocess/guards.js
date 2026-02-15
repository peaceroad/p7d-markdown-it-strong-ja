import { isJapaneseChar, getInlineWrapperBase } from '../token-utils.js'

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

const buildBrokenRefWrapperRangeSignals = (tokens, startIdx, endIdx, firstTextOffset = 0) => {
  const out = {
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
  if (!tokens || startIdx < 0 || endIdx < startIdx) return out
  const depthMap = new Map()
  let sawWrapper = false
  let sawOpen = false
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || !token.type) continue
    if (!out.hasCodeInline && token.type === 'code_inline') {
      out.hasCodeInline = true
    }
    const isAsteriskEmphasis = isAsteriskEmphasisToken(token)
    if (isAsteriskEmphasis) out.hasAsteriskEmphasisToken = true
    if (!out.hasUnderscoreEmphasisToken &&
        (token.type === 'strong_open' ||
         token.type === 'strong_close' ||
         token.type === 'em_open' ||
         token.type === 'em_close') &&
        (token.markup === '_' || token.markup === '__')) {
      out.hasUnderscoreEmphasisToken = true
    }
    if (token.type === 'text' && token.content) {
      const content = token.content
      // Keep this at 0 (instead of firstTextOffset) so historical fail-safe
      // behavior around noisy leading chains in the first text token stays unchanged.
      if (!out.hasLongStarNoise && content.indexOf('***') !== -1) {
        out.hasLongStarNoise = true
      }
      if (!out.hasUnderscoreText) {
        const scanFrom = i === startIdx && firstTextOffset > 0 ? firstTextOffset : 0
        if (scanFrom < content.length && content.indexOf('_', scanFrom) !== -1) {
          out.hasUnderscoreText = true
        }
      }
    }
    if ((token.type === 'strong_open' || token.type === 'strong_close' || token.type === 'em_open' || token.type === 'em_close') &&
        !isAsteriskEmphasis) {
      continue
    }
    const base = getInlineWrapperBase(token.type)
    if (!base) continue
    const isOpen = token.type.endsWith('_open')
    if (!sawWrapper) {
      sawWrapper = true
      if (!isOpen) out.hasLeadingUnmatchedClose = true
    }
    if (isOpen) {
      sawOpen = true
      out.hasLeadingUnmatchedClose = false
      depthMap.set(base, (depthMap.get(base) || 0) + 1)
    } else {
      const prev = depthMap.get(base) || 0
      if (prev <= 0) {
        out.hasImbalance = true
      } else {
        depthMap.set(base, prev - 1)
      }
    }
    if (token.type === 'strong_open') out.strongOpenInRange++
    else if (token.type === 'strong_close') out.strongCloseInRange++
    else if (token.type === 'em_open') out.emOpenInRange++
    else if (token.type === 'em_close') out.emCloseInRange++
  }
  if (!sawWrapper || sawOpen) out.hasLeadingUnmatchedClose = false
  if (!out.hasImbalance) {
    for (const depth of depthMap.values()) {
      if (depth !== 0) {
        out.hasImbalance = true
        break
      }
    }
  }
  return out
}

const hasPreexistingWrapperCloseOnlyInRange = (tokens, startIdx, endIdx, prefixStats = null, wrapperSignals = null) => {
  if (!tokens || startIdx <= 0 || endIdx < startIdx) return false
  const signals = wrapperSignals || buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, 0)

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
    preStrongDepth = prefixStats.strongDepth[startIdx] || 0
    preEmDepth = prefixStats.emDepth[startIdx] || 0
    if (preStrongDepth > 0) {
      const strongOpensInRange = signals.strongOpenInRange
      const strongClosesInRange = signals.strongCloseInRange
      if (strongClosesInRange > 0 && strongOpensInRange === 0) return true
    }
    if (preEmDepth > 0) {
      const emOpensInRange = signals.emOpenInRange
      const emClosesInRange = signals.emCloseInRange
      if (emClosesInRange > 0 && emOpensInRange === 0) return true
    }
    return false
  } else {
    for (let i = 0; i < startIdx && i < tokens.length; i++) {
      const token = tokens[i]
      if (!token || !token.type || !isAsteriskEmphasisToken(token)) continue
      if (token.type === 'strong_open') {
        preStrongDepth++
        continue
      }
      if (token.type === 'strong_close') {
        if (preStrongDepth > 0) preStrongDepth--
        continue
      }
      if (token.type === 'em_open') {
        preEmDepth++
        continue
      }
      if (token.type === 'em_close') {
        if (preEmDepth > 0) preEmDepth--
      }
    }
  }
  if (preStrongDepth > 0 && signals.strongCloseInRange > 0 && signals.strongOpenInRange === 0) return true
  if (preEmDepth > 0 && signals.emCloseInRange > 0 && signals.emOpenInRange === 0) return true
  return false
}

const isLowConfidenceBrokenRefRange = (tokens, startIdx, endIdx, firstTextOffset = 0, wrapperPrefixStats = null, wrapperSignals = null) => {
  const signals = wrapperSignals || buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, firstTextOffset)
  if (signals.hasLongStarNoise) return true
  if (signals.hasUnderscoreText || signals.hasCodeInline || signals.hasUnderscoreEmphasisToken) return true
  if (signals.hasLeadingUnmatchedClose) return true
  if (hasPreexistingWrapperCloseOnlyInRange(tokens, startIdx, endIdx, wrapperPrefixStats, signals)) return true
  return false
}

const shouldAttemptBrokenRefRewrite = (tokens, startIdx, endIdx, firstTextOffset = 0, wrapperPrefixStats = null) => {
  const wrapperSignals = buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, firstTextOffset)
  if (isLowConfidenceBrokenRefRange(tokens, startIdx, endIdx, firstTextOffset, wrapperPrefixStats, wrapperSignals)) return false
  if (wrapperSignals.hasImbalance) {
    if (wrapperSignals.hasAsteriskEmphasisToken) return true
    return countStrongMarkerRunsInTextRange(tokens, startIdx, endIdx, firstTextOffset, 2) >= 2
  }
  if (wrapperSignals.hasAsteriskEmphasisToken) return false
  return countStrongMarkerRunsInTextRange(tokens, startIdx, endIdx, firstTextOffset, 2) >= 2
}

const scanInlinePostprocessSignals = (children, hasBracketTextInContent = false) => {
  let hasBracketText = hasBracketTextInContent
  let hasEmphasis = false
  let hasLinkOpen = false
  let hasLinkClose = false
  let hasCodeInline = false
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
    if (!hasCodeInline && child.type === 'code_inline') {
      hasCodeInline = true
    }
    if (hasBracketText || child.type !== 'text' || !child.content) continue
    if (child.content.indexOf('[') !== -1 || child.content.indexOf(']') !== -1) {
      hasBracketText = true
    }
    if (hasEmphasis && hasBracketText && hasLinkOpen && hasLinkClose) break
  }
  return {
    hasBracketText,
    hasEmphasis,
    hasLinkOpen,
    hasLinkClose,
    hasCodeInline
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
