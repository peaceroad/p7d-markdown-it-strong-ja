import Token from 'markdown-it/lib/token.mjs'
import { isWhiteSpace } from 'markdown-it/lib/common/utils.mjs'
import { getReferenceCount } from './token-utils.js'

const CHAR_OPEN_BRACKET = 0x5B // [
const CHAR_CLOSE_BRACKET = 0x5D // ]

const isWhitespaceToken = (token) => {
  if (!token || token.type !== 'text') return false
  const content = token.content
  if (token.__strongJaWhitespaceSource === content &&
      typeof token.__strongJaIsWhitespace === 'boolean') {
    return token.__strongJaIsWhitespace
  }
  if (!content) {
    token.__strongJaWhitespaceSource = content
    token.__strongJaIsWhitespace = true
    return true
  }
  let isWhitespace = true
  for (let i = 0; i < content.length; i++) {
    if (!isWhiteSpace(content.charCodeAt(i))) {
      isWhitespace = false
      break
    }
  }
  token.__strongJaWhitespaceSource = content
  token.__strongJaIsWhitespace = isWhitespace
  return isWhitespace
}

const hasReferenceLabelMarkerRange = (tokens, startIdx, endIdx) => {
  if (startIdx > endIdx) return false
  for (let idx = startIdx; idx <= endIdx; idx++) {
    const token = tokens[idx]
    if (!token || !token.type) continue
    if (token.type === 'text' || token.type === 'code_inline') {
      const content = token.content
      if (content && (content.indexOf('*') !== -1 || content.indexOf('_') !== -1)) return true
      continue
    }
    if (token.type === 'softbreak' || token.type === 'hardbreak') continue
    if (token.markup &&
        (token.type.endsWith('_open') || token.type.endsWith('_close')) &&
        (token.markup.indexOf('*') !== -1 || token.markup.indexOf('_') !== -1)) {
      return true
    }
  }
  return false
}

const buildReferenceLabelRange = (tokens, startIdx, endIdx) => {
  if (startIdx > endIdx) return ''
  let label = ''
  for (let idx = startIdx; idx <= endIdx; idx++) {
    const token = tokens[idx]
    if (!token) continue
    if (token.type === 'text' || token.type === 'code_inline') {
      label += token.content
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      label += ' '
    } else if (token.type && token.markup && (token.type.endsWith('_open') || token.type.endsWith('_close'))) {
      label += token.markup
    }
  }
  return label
}

const normalizeReferenceCandidate = (state, text) => {
  return getNormalizeRef(state)(text)
}

const getNormalizeRef = (state) => {
  if (state.__strongJaNormalizeRef) return state.__strongJaNormalizeRef
  const normalize = state.md && state.md.utils && state.md.utils.normalizeReference
    ? state.md.utils.normalizeReference
    : (str) => str.trim().replace(/\s+/g, ' ').toUpperCase()
  state.__strongJaNormalizeRef = normalize
  return normalize
}


const cloneMap = (map) => {
  if (!map || !Array.isArray(map)) return null
  return [map[0], map[1]]
}

const getMapFromTokenRange = (tokens, startIdx, endIdx) => {
  if (!tokens || startIdx > endIdx) return null
  let startLine = null
  let endLine = null
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || !token.map || !Array.isArray(token.map)) continue
    const map = token.map
    if (startLine === null || map[0] < startLine) startLine = map[0]
    if (endLine === null || map[1] > endLine) endLine = map[1]
  }
  if (startLine === null || endLine === null) return null
  return [startLine, endLine]
}

const getNearbyMap = (tokens, startIdx, endIdx) => {
  if (!tokens) return null
  for (let i = startIdx - 1; i >= 0; i--) {
    if (tokens[i] && tokens[i].map) return cloneMap(tokens[i].map)
  }
  for (let i = endIdx + 1; i < tokens.length; i++) {
    if (tokens[i] && tokens[i].map) return cloneMap(tokens[i].map)
  }
  return null
}

const cloneTextToken = (source, content) => {
  const newToken = new Token('text', '', 0)
  Object.assign(newToken, source)
  newToken.content = content
  if (source.meta) newToken.meta = { ...source.meta }
  return newToken
}

const applyBracketSegmentFlags = (token, seg) => {
  if (seg === '[' || seg === ']' || seg === '[]') {
    token.__strongJaHasBracket = true
    token.__strongJaBracketAtomic = true
  } else {
    token.__strongJaHasBracket = false
    token.__strongJaBracketAtomic = false
  }
}

const splitBracketToken = (tokens, index) => {
  const token = tokens[index]
  if (!token || token.type !== 'text') return false
  if (token.__strongJaBracketAtomic) return false
  if (token.__strongJaHasBracket === false) return false
  const content = token.content
  if (!content) {
    token.__strongJaHasBracket = false
    token.__strongJaBracketAtomic = false
    return false
  }
  if (token.__strongJaHasBracket !== true) {
    if (content.indexOf('[') === -1 && content.indexOf(']') === -1) {
      token.__strongJaHasBracket = false
      token.__strongJaBracketAtomic = false
      return false
    }
    token.__strongJaHasBracket = true
  }
  const segments = []
  const contentLen = content.length
  let pos = 0
  let segmentStart = 0
  while (pos < contentLen) {
    const code = content.charCodeAt(pos)
    if (code === CHAR_OPEN_BRACKET &&
        content.charCodeAt(pos + 1) === CHAR_CLOSE_BRACKET) {
      if (segmentStart < pos) {
        segments.push(content.slice(segmentStart, pos))
      }
      segments.push('[]')
      pos += 2
      segmentStart = pos
      continue
    }
    if (code === CHAR_OPEN_BRACKET || code === CHAR_CLOSE_BRACKET) {
      if (segmentStart < pos) {
        segments.push(content.slice(segmentStart, pos))
      }
      segments.push(code === CHAR_OPEN_BRACKET ? '[' : ']')
      pos++
      segmentStart = pos
      continue
    }
    pos++
  }
  if (segmentStart < contentLen) segments.push(content.slice(segmentStart))
  if (segments.length <= 1) {
    applyBracketSegmentFlags(token, segments[0])
    return false
  }

  token.content = segments[0]
  applyBracketSegmentFlags(token, token.content)

  const replacements = [token]
  for (let s = 1; s < segments.length; s++) {
    const newToken = cloneTextToken(token, segments[s])
    applyBracketSegmentFlags(newToken, segments[s])
    replacements.push(newToken)
  }
  tokens.splice(index, 1, ...replacements)
  return true
}

const isBracketToken = (token, bracket) => {
  return token && token.type === 'text' && token.content === bracket
}

const buildLinkCloseMap = (tokens, startIdx, endIdx) => {
  const closeMap = new Map()
  const stack = []
  const max = tokens ? tokens.length - 1 : -1
  const from = startIdx > 0 ? startIdx : 0
  const to = endIdx < max ? endIdx : max
  for (let i = from; i <= to; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.type === 'link_open') {
      stack.push(i)
      continue
    }
    if (token.type !== 'link_close' || stack.length === 0) continue
    closeMap.set(stack.pop(), i)
  }
  return closeMap
}

const collectWrappedLabelPairs = (tokens, collapsedStartIdx, collapsedEndIdx) => {
  const wrapperPairs = []
  while (true) {
    const wrapperOffset = wrapperPairs.length
    const closeIdx = collapsedStartIdx - 1 - wrapperOffset
    const openIdx = collapsedEndIdx + 1 + wrapperOffset
    if (closeIdx < 0 || openIdx >= tokens.length) break
    const prevToken = tokens[closeIdx]
    const nextToken = tokens[openIdx]
    if (!prevToken || !nextToken) break
    if (!prevToken.type || !prevToken.type.endsWith('_close')) break
    const expectedOpen = prevToken.type.replace('_close', '_open')
    if (nextToken.type !== expectedOpen) break
    wrapperPairs.push({
      base: prevToken.type.replace('_close', ''),
      tag: prevToken.tag,
      markup: prevToken.markup,
      openMap: cloneMap(nextToken.map),
      closeMap: cloneMap(prevToken.map),
      closeIdx,
      openIdx
    })
  }
  return wrapperPairs
}

const resolveWrappedLabelReplaceRange = (wrapperPairs, collapsedStartIdx, collapsedEndIdx) => {
  if (wrapperPairs.length === 0) {
    return {
      replaceStart: collapsedStartIdx,
      replaceEnd: collapsedEndIdx
    }
  }
  const outerPair = wrapperPairs[wrapperPairs.length - 1]
  return {
    replaceStart: outerPair.closeIdx,
    replaceEnd: outerPair.openIdx
  }
}

const resolveInsertedWrapperMap = (pairMap, labelMap) => {
  return pairMap || labelMap
}

const buildWrappedLabelReplacement = (labelTokens, linkOpenToken, linkCloseToken, wrapperPairs, labelMap) => {
  const firstLabelToken = labelTokens[0]
  const linkLevel = firstLabelToken ? Math.max(firstLabelToken.level - 1, 0) : 0
  linkOpenToken.level = linkLevel
  linkCloseToken.level = linkLevel
  if (labelMap) {
    if (!linkOpenToken.map) linkOpenToken.map = cloneMap(labelMap)
    if (!linkCloseToken.map) linkCloseToken.map = cloneMap(labelMap)
  }
  for (let idx = 0; idx < labelTokens.length; idx++) {
    if (labelTokens[idx]) labelTokens[idx].level += 1
  }

  const replacement = [linkOpenToken]
  for (let wp = 0; wp < wrapperPairs.length; wp++) {
    const pair = wrapperPairs[wp]
    const innerOpen = new Token(pair.base + '_open', pair.tag, 1)
    innerOpen.markup = pair.markup
    innerOpen.level = linkLevel + 1 + wp
    const openMap = resolveInsertedWrapperMap(pair.openMap, labelMap)
    if (openMap && !innerOpen.map) innerOpen.map = cloneMap(openMap)
    replacement.push(innerOpen)
  }
  replacement.push(...labelTokens)
  for (let wp = 0; wp < wrapperPairs.length; wp++) {
    const pair = wrapperPairs[wp]
    const innerClose = new Token(pair.base + '_close', pair.tag, -1)
    innerClose.markup = pair.markup
    innerClose.level = linkLevel + 1 + wp
    const closeMap = resolveInsertedWrapperMap(pair.closeMap, labelMap)
    if (closeMap && !innerClose.map) innerClose.map = cloneMap(closeMap)
    replacement.push(innerClose)
  }
  replacement.push(linkCloseToken)
  return replacement
}

const wrapLabelTokensWithLink = (
  tokens,
  collapsedStartIdx,
  collapsedEndIdx,
  labelStartIdx,
  labelEndIdx,
  linkOpenToken,
  linkCloseToken
) => {
  if (labelStartIdx > labelEndIdx) return collapsedStartIdx
  const labelTokens = tokens.slice(labelStartIdx, labelEndIdx + 1)
  const wrapperPairs = collectWrappedLabelPairs(tokens, collapsedStartIdx, collapsedEndIdx)
  const { replaceStart, replaceEnd } = resolveWrappedLabelReplaceRange(
    wrapperPairs,
    collapsedStartIdx,
    collapsedEndIdx
  )
  const labelMap = getMapFromTokenRange(tokens, labelStartIdx, labelEndIdx) || getNearbyMap(tokens, replaceStart, replaceEnd)
  const replacement = buildWrappedLabelReplacement(
    labelTokens,
    linkOpenToken,
    linkCloseToken,
    wrapperPairs,
    labelMap
  )
  tokens.splice(replaceStart, replaceEnd - replaceStart + 1, ...replacement)
  return replaceStart + replacement.length
}

const resolveCollapsedReferenceTarget = (
  tokens,
  state,
  refRemoveStart,
  getLabelText,
  getLinkCloseMap
) => {
  let refKey = null
  let refRemoveCount = 0
  let existingLinkOpen = null
  let existingLinkClose = null
  const nextToken = tokens[refRemoveStart]
  if (isBracketToken(nextToken, '[]')) {
    refKey = normalizeReferenceCandidate(state, getLabelText())
    refRemoveCount = 1
  } else if (isBracketToken(nextToken, '[')) {
    let refCloseIdx = refRemoveStart + 1
    while (refCloseIdx < tokens.length && !isBracketToken(tokens[refCloseIdx], ']')) {
      refCloseIdx++
    }
    if (refCloseIdx >= tokens.length) return null
    const refStart = refRemoveStart + 1
    const refEnd = refCloseIdx - 1
    if (refStart > refEnd) {
      refKey = normalizeReferenceCandidate(state, getLabelText())
    } else {
      const refLabelText = buildReferenceLabelRange(tokens, refStart, refEnd)
      refKey = normalizeReferenceCandidate(state, refLabelText)
    }
    refRemoveCount = refCloseIdx - refRemoveStart + 1
  } else if (nextToken && nextToken.type === 'link_open') {
    const linkCloseMap = getLinkCloseMap(refRemoveStart)
    const linkCloseIdx = linkCloseMap.get(refRemoveStart) ?? -1
    if (linkCloseIdx === -1) return null
    existingLinkOpen = tokens[refRemoveStart]
    existingLinkClose = tokens[linkCloseIdx]
    refRemoveCount = linkCloseIdx - refRemoveStart + 1
  } else {
    return null
  }
  return {
    refKey,
    refRemoveCount,
    existingLinkOpen,
    existingLinkClose
  }
}

const buildAutoCollapsedReferenceLinkPair = (ref) => {
  if (!ref) return null
  const linkOpenToken = new Token('link_open', 'a', 1)
  linkOpenToken.attrs = [['href', ref.href]]
  if (ref.title) linkOpenToken.attrPush(['title', ref.title])
  linkOpenToken.markup = '[]'
  linkOpenToken.info = 'auto'

  const linkCloseToken = new Token('link_close', 'a', -1)
  linkCloseToken.markup = '[]'
  linkCloseToken.info = 'auto'
  return { linkOpenToken, linkCloseToken }
}

const resolveCollapsedReferenceLinkPair = (references, target) => {
  if (!target) return null
  if (target.existingLinkOpen && target.existingLinkClose) {
    return {
      linkOpenToken: target.existingLinkOpen,
      linkCloseToken: target.existingLinkClose
    }
  }
  if (!target.refKey) return null
  return buildAutoCollapsedReferenceLinkPair(references[target.refKey])
}

const applyCollapsedReferenceRewrite = (
  tokens,
  startIdx,
  labelStart,
  labelEnd,
  suffixRemoveCount,
  linkOpenToken,
  linkCloseToken
) => {
  const labelLength = labelEnd - labelStart + 1
  const collapsedReplaceCount = labelLength + 2 + suffixRemoveCount
  const collapsedEnd = startIdx + collapsedReplaceCount - 1
  linkOpenToken.__strongJaMergeMarksAroundLink = true
  linkCloseToken.__strongJaMergeMarksAroundLink = true
  return wrapLabelTokensWithLink(
    tokens,
    startIdx,
    collapsedEnd,
    labelStart,
    labelEnd,
    linkOpenToken,
    linkCloseToken
  )
}

const COLLAPSED_REFERENCE_SCAN_RETRY = Symbol('collapsed-reference-scan-retry')
const COLLAPSED_REFERENCE_SCAN_SKIP = Symbol('collapsed-reference-scan-skip')

const createCollapsedReferenceLinkCloseMapAccessors = (tokens, cache = null) => {
  let linkCloseMap = null
  const getLinkCloseMap = (startIdx = 0) => {
    if (cache) {
      if (cache.linkCloseMap === undefined) {
        cache.linkCloseMap = buildLinkCloseMap(tokens, 0, tokens.length - 1)
      }
      return cache.linkCloseMap
    }
    if (linkCloseMap === null) {
      linkCloseMap = buildLinkCloseMap(tokens, startIdx, tokens.length - 1)
    }
    return linkCloseMap
  }
  const invalidateLinkCloseMap = () => {
    linkCloseMap = null
    if (cache) cache.linkCloseMap = undefined
  }
  return { getLinkCloseMap, invalidateLinkCloseMap }
}

const findCollapsedReferenceLabelClose = (tokens, startIdx, invalidateLinkCloseMap) => {
  let closeIdx = startIdx + 1
  while (closeIdx < tokens.length) {
    if (isBracketToken(tokens[closeIdx], ']')) return closeIdx
    const closeToken = tokens[closeIdx]
    if (closeToken && closeToken.type === 'text' && splitBracketToken(tokens, closeIdx)) {
      invalidateLinkCloseMap()
      return COLLAPSED_REFERENCE_SCAN_RETRY
    }
    if (closeToken && closeToken.type === 'link_open') return -1
    closeIdx++
  }
  return -1
}

const buildCollapsedReferenceCandidate = (
  tokens,
  state,
  startIdx,
  closeIdx,
  getLinkCloseMap,
  invalidateLinkCloseMap
) => {
  if (closeIdx === startIdx + 1) return null

  const labelStart = startIdx + 1
  const labelEnd = closeIdx - 1
  if (!hasReferenceLabelMarkerRange(tokens, labelStart, labelEnd)) return null

  let labelText = null
  const getLabelText = () => {
    if (labelText === null) labelText = buildReferenceLabelRange(tokens, labelStart, labelEnd)
    return labelText
  }

  const whitespaceStart = closeIdx + 1
  let refRemoveStart = whitespaceStart
  while (refRemoveStart < tokens.length && isWhitespaceToken(tokens[refRemoveStart])) {
    refRemoveStart++
  }
  const refStartToken = tokens[refRemoveStart]
  if (refStartToken && refStartToken.type === 'text' && splitBracketToken(tokens, refRemoveStart)) {
    invalidateLinkCloseMap()
    return COLLAPSED_REFERENCE_SCAN_RETRY
  }

  const target = resolveCollapsedReferenceTarget(
    tokens,
    state,
    refRemoveStart,
    getLabelText,
    getLinkCloseMap
  )
  if (!target) return null

  return {
    labelStart,
    labelEnd,
    suffixRemoveCount: (refRemoveStart - whitespaceStart) + target.refRemoveCount,
    target
  }
}

const tryConvertCollapsedReferenceAt = (
  tokens,
  state,
  references,
  startIdx,
  getLinkCloseMap,
  invalidateLinkCloseMap,
  onChangeStart = null
) => {
  if (splitBracketToken(tokens, startIdx)) {
    invalidateLinkCloseMap()
    return COLLAPSED_REFERENCE_SCAN_RETRY
  }
  if (!isBracketToken(tokens[startIdx], '[')) return COLLAPSED_REFERENCE_SCAN_SKIP

  const closeIdx = findCollapsedReferenceLabelClose(tokens, startIdx, invalidateLinkCloseMap)
  if (closeIdx === COLLAPSED_REFERENCE_SCAN_RETRY) return COLLAPSED_REFERENCE_SCAN_RETRY
  if (closeIdx === -1) return COLLAPSED_REFERENCE_SCAN_SKIP

  const candidate = buildCollapsedReferenceCandidate(
    tokens,
    state,
    startIdx,
    closeIdx,
    getLinkCloseMap,
    invalidateLinkCloseMap
  )
  if (candidate === COLLAPSED_REFERENCE_SCAN_RETRY) return COLLAPSED_REFERENCE_SCAN_RETRY
  if (!candidate) return COLLAPSED_REFERENCE_SCAN_SKIP

  const linkPair = resolveCollapsedReferenceLinkPair(references, candidate.target)
  if (!linkPair) return COLLAPSED_REFERENCE_SCAN_SKIP

  if (onChangeStart) onChangeStart(startIdx)
  invalidateLinkCloseMap()
  return applyCollapsedReferenceRewrite(
    tokens,
    startIdx,
    candidate.labelStart,
    candidate.labelEnd,
    candidate.suffixRemoveCount,
    linkPair.linkOpenToken,
    linkPair.linkCloseToken
  )
}

const convertCollapsedReferenceLinks = (tokens, state, cache = null, onChangeStart = null) => {
  const references = state.env && state.env.references
  if (!references) return false
  if (getReferenceCount(state) === 0) {
    return false
  }

  let changed = false
  let i = 0
  const { getLinkCloseMap, invalidateLinkCloseMap } = createCollapsedReferenceLinkCloseMapAccessors(tokens, cache)
  while (i < tokens.length) {
    const nextIndex = tryConvertCollapsedReferenceAt(
      tokens,
      state,
      references,
      i,
      getLinkCloseMap,
      invalidateLinkCloseMap,
      onChangeStart
    )
    if (nextIndex === COLLAPSED_REFERENCE_SCAN_RETRY) continue
    if (nextIndex === COLLAPSED_REFERENCE_SCAN_SKIP) {
      i++
      continue
    }
    changed = true
    i = nextIndex
  }
  return changed
}

const collectBrokenMarkLinkMergeRemovals = (tokens) => {
  const removals = []
  let i = 0
  while (i < tokens.length) {
    const closeToken = tokens[i]
    if (!closeToken || !closeToken.type ||
        (closeToken.type !== 'em_close' && closeToken.type !== 'strong_close')) {
      i++
      continue
    }
    const openType = closeToken.type.replace('_close', '_open')
    let j = i + 1
    while (j < tokens.length && isWhitespaceToken(tokens[j])) j++
    if (j >= tokens.length ||
        tokens[j].type !== 'link_open' ||
        tokens[j].__strongJaMergeMarksAroundLink !== true) {
      i++
      continue
    }
    let linkDepth = 1
    j++
    while (j < tokens.length && linkDepth > 0) {
      if (tokens[j].type === 'link_open') linkDepth++
      if (tokens[j].type === 'link_close') linkDepth--
      j++
    }
    if (linkDepth !== 0) {
      i++
      continue
    }
    while (j < tokens.length && isWhitespaceToken(tokens[j])) j++
    if (j >= tokens.length) {
      i++
      continue
    }
    const reopenToken = tokens[j]
    if (reopenToken.type !== openType || reopenToken.level !== closeToken.level) {
      i++
      continue
    }
    removals.push({ closeIdx: i, reopenIdx: j })
    i = j + 1
  }
  return removals
}

const applyBrokenMarkLinkMergeRemovals = (tokens, removals, onChangeStart = null) => {
  if (!removals || removals.length === 0) return false
  for (let idx = removals.length - 1; idx >= 0; idx--) {
    if (onChangeStart) onChangeStart(removals[idx].closeIdx)
  }
  const kept = []
  let removalIdx = 0
  let nextRemoval = removals[removalIdx]
  for (let idx = 0; idx < tokens.length; idx++) {
    if (nextRemoval && (idx === nextRemoval.closeIdx || idx === nextRemoval.reopenIdx)) {
      if (idx === nextRemoval.reopenIdx) {
        removalIdx++
        nextRemoval = removals[removalIdx]
      }
      continue
    }
    kept.push(tokens[idx])
  }
  tokens.splice(0, tokens.length, ...kept)
  return true
}

const mergeBrokenMarksAroundLinks = (tokens, onChangeStart = null) => {
  return applyBrokenMarkLinkMergeRemovals(tokens, collectBrokenMarkLinkMergeRemovals(tokens), onChangeStart)
}

export {
  normalizeReferenceCandidate,
  buildLinkCloseMap,
  convertCollapsedReferenceLinks,
  mergeBrokenMarksAroundLinks,
  getMapFromTokenRange
}
