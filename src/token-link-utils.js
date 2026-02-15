import Token from 'markdown-it/lib/token.mjs'
import { isWhiteSpace } from 'markdown-it/lib/common/utils.mjs'

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

const adjustTokenLevels = (tokens, startIdx, endIdx, delta) => {
  for (let i = startIdx; i < endIdx; i++) {
    if (tokens[i]) tokens[i].level += delta
  }
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
  if (seg === '[' || seg === ']') {
    token.__strongJaHasBracket = true
    token.__strongJaBracketAtomic = true
  } else if (seg === '[]') {
    token.__strongJaHasBracket = true
    token.__strongJaBracketAtomic = false
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

const wrapLabelTokensWithLink = (tokens, labelStartIdx, labelEndIdx, linkOpenToken, linkCloseToken) => {
  const wrapperPairs = []
  let startIdx = labelStartIdx
  let endIdx = labelEndIdx
  while (startIdx > 0) {
    const prevToken = tokens[startIdx - 1]
    const nextToken = tokens[endIdx + 1]
    if (!prevToken || !nextToken) break
    if (!prevToken.type || !prevToken.type.endsWith('_close')) break
    const expectedOpen = prevToken.type.replace('_close', '_open')
    if (nextToken.type !== expectedOpen) break
    wrapperPairs.push({
      base: prevToken.type.replace('_close', ''),
      tag: prevToken.tag,
      markup: prevToken.markup,
      openMap: cloneMap(nextToken.map),
      closeMap: cloneMap(prevToken.map)
    })
    tokens.splice(endIdx + 1, 1)
    tokens.splice(startIdx - 1, 1)
    startIdx -= 1
    endIdx -= 1
  }

  if (startIdx > endIdx) return startIdx

  let labelLength = endIdx - startIdx + 1
  const firstLabelToken = tokens[startIdx]
  const linkLevel = firstLabelToken ? Math.max(firstLabelToken.level - 1, 0) : 0
  linkOpenToken.level = linkLevel
  linkCloseToken.level = linkLevel
  const labelMap = getMapFromTokenRange(tokens, startIdx, endIdx) || getNearbyMap(tokens, startIdx, endIdx)
  if (labelMap) {
    if (!linkOpenToken.map) linkOpenToken.map = cloneMap(labelMap)
    if (!linkCloseToken.map) linkCloseToken.map = cloneMap(labelMap)
  }
  tokens.splice(startIdx, 0, linkOpenToken)
  tokens.splice(startIdx + labelLength + 1, 0, linkCloseToken)

  adjustTokenLevels(tokens, startIdx + 1, startIdx + labelLength + 1, 1)

  if (wrapperPairs.length > 0) {
    let insertIdx = startIdx + 1
    for (let wp = 0; wp < wrapperPairs.length; wp++) {
      const pair = wrapperPairs[wp]
      const innerOpen = new Token(pair.base + '_open', pair.tag, 1)
      innerOpen.markup = pair.markup
      innerOpen.level = linkLevel + 1 + wp
      if (pair.openMap && !innerOpen.map) innerOpen.map = cloneMap(pair.openMap)
      tokens.splice(insertIdx, 0, innerOpen)
      insertIdx++
      labelLength++
    }
    let linkClosePos = startIdx + labelLength + 1
    for (let wp = wrapperPairs.length - 1; wp >= 0; wp--) {
      const pair = wrapperPairs[wp]
      const innerClose = new Token(pair.base + '_close', pair.tag, -1)
      innerClose.markup = pair.markup
      innerClose.level = linkLevel + 1 + wp
      if (pair.closeMap && !innerClose.map) innerClose.map = cloneMap(pair.closeMap)
      tokens.splice(linkClosePos, 0, innerClose)
      labelLength++
    }
  }

  return startIdx + labelLength + 2
}

const convertCollapsedReferenceLinks = (tokens, state) => {
  const references = state.env && state.env.references
  if (!references) return
  let referenceCount = state.__strongJaReferenceCount
  if (referenceCount === undefined) {
    referenceCount = Object.keys(references).length
    state.__strongJaReferenceCount = referenceCount
  }
  if (referenceCount === 0) {
    return
  }

  let i = 0
  let linkCloseMap = null
  while (i < tokens.length) {
    if (splitBracketToken(tokens, i)) {
      linkCloseMap = null
      continue
    }
    if (!isBracketToken(tokens[i], '[')) {
      i++
      continue
    }
    let closeIdx = i + 1
    while (closeIdx < tokens.length && !isBracketToken(tokens[closeIdx], ']')) {
      const closeToken = tokens[closeIdx]
      if (closeToken && closeToken.type === 'text' && splitBracketToken(tokens, closeIdx)) {
        linkCloseMap = null
        continue
      }
      if (closeToken && closeToken.type === 'link_open') {
        closeIdx = -1
        break
      }
      closeIdx++
    }
    if (closeIdx === -1 || closeIdx >= tokens.length) {
      i++
      continue
    }

    if (closeIdx === i + 1) {
      i++
      continue
    }

    const labelStart = i + 1
    const labelEnd = closeIdx - 1
    const labelLength = closeIdx - i - 1
    const labelText = buildReferenceLabelRange(tokens, labelStart, labelEnd)
    if (labelText.indexOf('*') === -1 && labelText.indexOf('_') === -1) {
      i++
      continue
    }
    const whitespaceStart = closeIdx + 1
    let refRemoveStart = whitespaceStart
    while (refRemoveStart < tokens.length && isWhitespaceToken(tokens[refRemoveStart])) {
      refRemoveStart++
    }
    const refStartToken = tokens[refRemoveStart]
    if (refStartToken && refStartToken.type === 'text' && splitBracketToken(tokens, refRemoveStart)) {
      linkCloseMap = null
      continue
    }
    const whitespaceCount = refRemoveStart - whitespaceStart
    let refKey = null
    let refRemoveCount = 0
    let existingLinkOpen = null
    let existingLinkClose = null
    const nextToken = tokens[refRemoveStart]
    if (isBracketToken(nextToken, '[]')) {
      refKey = normalizeReferenceCandidate(state, labelText)
      refRemoveCount = 1
    } else if (isBracketToken(nextToken, '[')) {
      let refCloseIdx = refRemoveStart + 1
      while (refCloseIdx < tokens.length && !isBracketToken(tokens[refCloseIdx], ']')) {
        refCloseIdx++
      }
      if (refCloseIdx >= tokens.length) {
        i++
        continue
      }
      const refStart = refRemoveStart + 1
      const refEnd = refCloseIdx - 1
      if (refStart > refEnd) {
        refKey = normalizeReferenceCandidate(state, labelText)
      } else {
        const refLabelText = buildReferenceLabelRange(tokens, refStart, refEnd)
        refKey = normalizeReferenceCandidate(state, refLabelText)
      }
      refRemoveCount = refCloseIdx - refRemoveStart + 1
    } else if (nextToken && nextToken.type === 'link_open') {
      if (linkCloseMap === null) {
        linkCloseMap = buildLinkCloseMap(tokens, refRemoveStart, tokens.length - 1)
      }
      const linkCloseIdx = linkCloseMap.get(refRemoveStart) ?? -1
      if (linkCloseIdx === -1) {
        i++
        continue
      }
      existingLinkOpen = tokens[refRemoveStart]
      existingLinkClose = tokens[linkCloseIdx]
      refRemoveCount = linkCloseIdx - refRemoveStart + 1
    } else {
      i++
      continue
    }
    let linkOpenToken = null
    let linkCloseToken = null
    if (existingLinkOpen && existingLinkClose) {
      linkCloseMap = null
      if (whitespaceCount > 0) {
        tokens.splice(whitespaceStart, whitespaceCount)
        refRemoveStart -= whitespaceCount
      }
      if (refRemoveCount > 0) {
        tokens.splice(refRemoveStart, refRemoveCount)
      }
      linkOpenToken = existingLinkOpen
      linkCloseToken = existingLinkClose
    } else {
      if (!refKey) {
        i++
        continue
      }
      const ref = references[refKey]
      if (!ref) {
        i++
        continue
      }
      linkCloseMap = null
      if (whitespaceCount > 0) {
        tokens.splice(whitespaceStart, whitespaceCount)
        refRemoveStart -= whitespaceCount
      }
      if (refRemoveCount > 0) {
        tokens.splice(refRemoveStart, refRemoveCount)
      }
      linkOpenToken = new Token('link_open', 'a', 1)
      linkOpenToken.attrs = [['href', ref.href]]
      if (ref.title) linkOpenToken.attrPush(['title', ref.title])
      linkOpenToken.markup = '[]'
      linkOpenToken.info = 'auto'
      linkCloseToken = new Token('link_close', 'a', -1)
      linkCloseToken.markup = '[]'
      linkCloseToken.info = 'auto'
    }
    tokens.splice(closeIdx, 1)
    tokens.splice(i, 1)

    const nextIndex = wrapLabelTokensWithLink(tokens, i, i + labelLength - 1, linkOpenToken, linkCloseToken)
    i = nextIndex
  }
}

const mergeBrokenMarksAroundLinks = (tokens) => {
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
    if (j >= tokens.length || tokens[j].type !== 'link_open') {
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
    tokens.splice(j, 1)
    tokens.splice(i, 1)
  }
}

export {
  normalizeReferenceCandidate,
  buildLinkCloseMap,
  convertCollapsedReferenceLinks,
  mergeBrokenMarksAroundLinks,
  getMapFromTokenRange
}
