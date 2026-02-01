import Token from 'markdown-it/lib/token.mjs'
import { parseLinkDestination, parseLinkTitle } from 'markdown-it/lib/helpers/index.mjs'
import { isSpace, isWhiteSpace } from 'markdown-it/lib/common/utils.mjs'

const CHAR_OPEN_BRACKET = 0x5B // [
const CHAR_CLOSE_BRACKET = 0x5D // ]
const CHAR_OPEN_PAREN = 0x28 // (
const CHAR_CLOSE_PAREN = 0x29 // )

const isWhitespaceToken = (token) => {
  if (!token || token.type !== 'text') return false
  const content = token.content
  if (!content) return true
  for (let i = 0; i < content.length; i++) {
    if (!isWhiteSpace(content.charCodeAt(i))) return false
  }
  return true
}

// Collapsed reference helpers
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
    } else if (token.type && token.type.endsWith('_open') && token.markup) {
      label += token.markup
    } else if (token.type && token.type.endsWith('_close') && token.markup) {
      label += token.markup
    }
  }
  return label
}

const cleanLabelText = (label) => {
  if (label.indexOf('*') === -1 && label.indexOf('_') === -1) return label
  return label.replace(/^[*_]+/, '').replace(/[*_]+$/, '')
}

const normalizeReferenceCandidate = (state, text, { useClean = false } = {}) => {
  const source = useClean ? cleanLabelText(text) : text
  return normalizeRefKey(state, source)
}

const getNormalizeRef = (state) => {
  if (state.__strongJaNormalizeRef) return state.__strongJaNormalizeRef
  const normalize = state.md && state.md.utils && state.md.utils.normalizeReference
    ? state.md.utils.normalizeReference
    : (str) => str.trim().replace(/\s+/g, ' ').toUpperCase()
  state.__strongJaNormalizeRef = normalize
  return normalize
}

const normalizeRefKey = (state, label) => {
  return getNormalizeRef(state)(label)
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
  if (source.map) newToken.map = source.map
  return newToken
}

// Split only text tokens that actually contain bracket characters
const splitBracketToken = (tokens, index, options) => {
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
  const splitEmptyPair = options && options.splitEmptyPair
  const segments = []
  let buffer = ''
  let pos = 0
  while (pos < content.length) {
    if (!splitEmptyPair &&
        content.charCodeAt(pos) === CHAR_OPEN_BRACKET &&
        content.charCodeAt(pos + 1) === CHAR_CLOSE_BRACKET) {
      if (buffer) {
        segments.push(buffer)
        buffer = ''
      }
      segments.push('[]')
      pos += 2
      continue
    }
    const ch = content[pos]
    if (ch === '[' || ch === ']') {
      if (buffer) {
        segments.push(buffer)
        buffer = ''
      }
      segments.push(ch)
      pos++
      continue
    }
    buffer += ch
    pos++
  }
  if (buffer) segments.push(buffer)
  if (segments.length <= 1) {
    if (segments.length === 0) {
      token.__strongJaHasBracket = false
      token.__strongJaBracketAtomic = false
    } else {
      const seg = segments[0]
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
    return false
  }
  token.content = segments[0]
  if (token.content === '[' || token.content === ']') {
    token.__strongJaHasBracket = true
    token.__strongJaBracketAtomic = true
  } else if (token.content === '[]') {
    token.__strongJaHasBracket = true
    token.__strongJaBracketAtomic = false
  } else {
    token.__strongJaHasBracket = false
    token.__strongJaBracketAtomic = false
  }
  let insertIdx = index + 1
  for (let s = 1; s < segments.length; s++) {
    const newToken = cloneTextToken(token, segments[s])
    if (segments[s] === '[' || segments[s] === ']') {
      newToken.__strongJaHasBracket = true
      newToken.__strongJaBracketAtomic = true
    } else if (segments[s] === '[]') {
      newToken.__strongJaHasBracket = true
      newToken.__strongJaBracketAtomic = false
    } else {
      newToken.__strongJaHasBracket = false
      newToken.__strongJaBracketAtomic = false
    }
    tokens.splice(insertIdx, 0, newToken)
    insertIdx++
  }
  return true
}

const isBracketToken = (token, bracket) => {
  return token && token.type === 'text' && token.content === bracket
}

const findLinkCloseIndex = (tokens, startIdx) => {
  let depth = 0
  for (let idx = startIdx; idx < tokens.length; idx++) {
    const token = tokens[idx]
    if (token.type === 'link_open') depth++
    if (token.type === 'link_close') {
      depth--
      if (depth === 0) return idx
    }
  }
  return -1
}

const consumeCharactersFromTokens = (tokens, startIdx, count) => {
  let remaining = count
  let idx = startIdx
  while (idx < tokens.length && remaining > 0) {
    const token = tokens[idx]
    if (!token || token.type !== 'text') {
      return false
    }
    const len = token.content.length
    if (remaining >= len) {
      remaining -= len
      tokens.splice(idx, 1)
      continue
    }
    token.content = token.content.slice(remaining)
    remaining = 0
  }
  return remaining === 0
}

const wrapLabelTokensWithLink = (tokens, labelStartIdx, labelEndIdx, linkOpenToken, linkCloseToken, labelSource) => {
  const wrapperPairs = []
  let startIdx = labelStartIdx
  let endIdx = labelEndIdx
  while (startIdx > 0) {
    const prevToken = tokens[startIdx - 1]
    const nextToken = tokens[endIdx + 1]
    if (!prevToken || !nextToken) break
    if (!/_close$/.test(prevToken.type)) break
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

  if (startIdx > endIdx) {
    if (labelSource !== undefined && labelSource !== null) {
      const placeholder = new Token('text', '', 0)
      placeholder.content = labelSource
      placeholder.level = linkOpenToken.level + 1
      tokens.splice(startIdx, 0, placeholder)
      endIdx = startIdx
    } else {
      return startIdx
    }
  }

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

const parseInlineLinkTail = (content, md) => {
  if (!content || content.charCodeAt(0) !== CHAR_OPEN_PAREN) return null
  const max = content.length
  let pos = 1
  while (pos < max) {
    const code = content.charCodeAt(pos)
    if (!isSpace(code) && code !== 0x0A) break
    pos++
  }
  if (pos >= max) return null

  let href = ''
  let destPos = pos
  if (pos < max && content.charCodeAt(pos) === CHAR_CLOSE_PAREN) {
    href = ''
  } else {
    const dest = parseLinkDestination(content, pos, max)
    if (!dest.ok) return null
    href = md.normalizeLink(dest.str)
    if (!md.validateLink(href)) {
      return null
    }
    pos = dest.pos
    destPos = dest.pos
  }

  while (pos < max) {
    const code = content.charCodeAt(pos)
    if (!isSpace(code) && code !== 0x0A) break
    pos++
  }

  let title = ''
  const titleRes = parseLinkTitle(content, pos, max)
  if (pos < max && pos !== destPos && titleRes.ok) {
    title = titleRes.str
    pos = titleRes.pos
    while (pos < max) {
      const code = content.charCodeAt(pos)
      if (!isSpace(code) && code !== 0x0A) break
      pos++
    }
  }

  if (pos >= max || content.charCodeAt(pos) !== CHAR_CLOSE_PAREN) {
    return null
  }
  pos++
  return { href, title, consumed: pos }
}

const INLINE_LINK_BRACKET_SPLIT_OPTIONS = { splitEmptyPair: true }

const removeGhostLabelText = (tokens, linkCloseIndex, labelText) => {
  if (!labelText) return
  if (linkCloseIndex === null || linkCloseIndex === undefined) return
  if (linkCloseIndex < 0 || linkCloseIndex >= tokens.length) return
  const closeToken = tokens[linkCloseIndex]
  if (!closeToken || closeToken.type !== 'link_close') return
  let idx = linkCloseIndex + 1
  while (idx < tokens.length) {
    const token = tokens[idx]
    if (!token) {
      idx++
      continue
    }
    if (token.type === 'text') {
      if (token.content.startsWith(labelText)) {
        if (token.content.length === labelText.length) {
          tokens.splice(idx, 1)
        } else {
          token.content = token.content.slice(labelText.length)
        }
      }
      break
    }
    if (!/_close$/.test(token.type)) {
      break
    }
    idx++
  }
}

const restoreLabelWhitespace = (tokens, labelSources) => {
  if (!tokens || !labelSources || labelSources.length === 0) return
  let labelIdx = 0
  for (let i = 0; i < tokens.length && labelIdx < labelSources.length; i++) {
    if (tokens[i].type !== 'link_open') continue
    const closeIdx = findLinkCloseIndex(tokens, i)
    if (closeIdx === -1) continue
    const labelSource = labelSources[labelIdx] || ''
    if (!labelSource) {
      labelIdx++
      continue
    }
    let cursor = 0
    for (let pos = i + 1; pos < closeIdx; pos++) {
      const t = tokens[pos]
      const markup = t.markup || ''
      const text = t.content || ''
      const startPos = cursor
      if (t.type === 'text') {
        cursor += text.length
      } else if (t.type === 'code_inline') {
        cursor += markup.length + text.length + markup.length
      } else if (markup) {
        cursor += markup.length
      }
      if ((t.type === 'strong_open' || t.type === 'em_open') && startPos > 0) {
        const prevToken = tokens[pos - 1]
        if (prevToken && prevToken.type === 'text' && prevToken.content && !prevToken.content.endsWith(' ')) {
          const hasSpaceBefore = startPos - 1 >= 0 && startPos - 1 < labelSource.length && labelSource[startPos - 1] === ' '
          const hasSpaceAt = startPos >= 0 && startPos < labelSource.length && labelSource[startPos] === ' '
          if (hasSpaceBefore || hasSpaceAt) {
            prevToken.content += ' '
          }
        }
      }
    }
    labelIdx++
  }
}

const convertInlineLinks = (tokens, state) => {
  if (!tokens || tokens.length === 0) return
  let labelSources = tokens.__strongJaInlineLabelSources
  if ((!labelSources || labelSources.length === 0) && state && state.env && Array.isArray(state.env.__strongJaInlineLabelSourceList) && state.env.__strongJaInlineLabelSourceList.length > 0) {
    labelSources = state.env.__strongJaInlineLabelSourceList.shift()
  }
  let labelSourceIndex = tokens.__strongJaInlineLabelIndex || 0
  let i = 0
  while (i < tokens.length) {
    if (splitBracketToken(tokens, i, INLINE_LINK_BRACKET_SPLIT_OPTIONS)) {
      continue
    }
    if (!isBracketToken(tokens[i], '[')) {
      i++
      continue
    }
    let closeIdx = i + 1
    let invalid = false
    while (closeIdx < tokens.length && !isBracketToken(tokens[closeIdx], ']')) {
      if (splitBracketToken(tokens, closeIdx, INLINE_LINK_BRACKET_SPLIT_OPTIONS)) {
        continue
      }
      if (tokens[closeIdx].type === 'link_open') {
        invalid = true
        break
      }
      closeIdx++
    }
    if (invalid || closeIdx >= tokens.length) {
      i++
      continue
    }
    const currentLabelSource = labelSources && labelSourceIndex < labelSources.length
      ? labelSources[labelSourceIndex]
      : undefined

    const labelLength = closeIdx - i - 1
    const needsPlaceholder = labelLength <= 0
    if (needsPlaceholder && !currentLabelSource) {
      i++
      continue
    }

    let tailIdx = closeIdx + 1
    let tailContent = ''
    let parsedTail = null
    let tailHasCloseParen = false
    while (tailIdx < tokens.length) {
      if (splitBracketToken(tokens, tailIdx, INLINE_LINK_BRACKET_SPLIT_OPTIONS)) {
        continue
      }
      const tailToken = tokens[tailIdx]
      if (tailToken.type !== 'text' || !tailToken.content) {
        break
      }
      tailContent += tailToken.content
      if (!tailHasCloseParen) {
        if (tailToken.content.indexOf(')') === -1) {
          tailIdx++
          continue
        }
        tailHasCloseParen = true
      }
      parsedTail = parseInlineLinkTail(tailContent, state.md)
      if (parsedTail) break
      tailIdx++
    }

    if (!parsedTail) {
      i++
      continue
    }

    if (!consumeCharactersFromTokens(tokens, closeIdx + 1, parsedTail.consumed)) {
      i++
      continue
    }

    tokens.splice(closeIdx, 1)
    tokens.splice(i, 1)

    const linkOpenToken = new Token('link_open', 'a', 1)
    linkOpenToken.attrs = [['href', parsedTail.href]]
    if (parsedTail.title) linkOpenToken.attrPush(['title', parsedTail.title])
    linkOpenToken.markup = '[]()'
    linkOpenToken.info = 'auto'
    const linkCloseToken = new Token('link_close', 'a', -1)
    linkCloseToken.markup = '[]()'
    linkCloseToken.info = 'auto'

    const nextIndex = wrapLabelTokensWithLink(tokens, i, i + labelLength - 1, linkOpenToken, linkCloseToken, currentLabelSource)
    if (nextIndex === i) {
      i++
      continue
    }
    if (currentLabelSource) {
      const linkCloseIdx = findLinkCloseIndex(tokens, i)
      if (linkCloseIdx !== -1) {
        let cursor = 0
        for (let pos = i + 1; pos < linkCloseIdx; pos++) {
          const t = tokens[pos]
          const markup = t.markup || ''
          const text = t.content || ''
          const startPos = cursor
          if (t.type === 'text') {
            cursor += text.length
          } else if (t.type === 'code_inline') {
            cursor += markup.length + text.length + markup.length
          } else if (markup) {
            cursor += markup.length
          }
          if ((t.type === 'strong_open' || t.type === 'em_open') && startPos > 0) {
            const prevToken = tokens[pos - 1]
            if (prevToken && prevToken.type === 'text' && prevToken.content && !prevToken.content.endsWith(' ')) {
              const labelHasSpaceBefore = startPos - 1 >= 0 && startPos - 1 < currentLabelSource.length && currentLabelSource[startPos - 1] === ' '
              const labelHasSpaceAt = startPos >= 0 && startPos < currentLabelSource.length && currentLabelSource[startPos] === ' '
              if (labelHasSpaceBefore || labelHasSpaceAt) {
                prevToken.content += ' '
              }
            }
          }
        }
      }
    }
    if (needsPlaceholder && currentLabelSource) {
      removeGhostLabelText(tokens, nextIndex - 1, currentLabelSource)
    }

    if (labelSources && labelSources.length > 0) {
      if (labelSourceIndex < labelSources.length) {
        labelSourceIndex++
      }
    }
    i = nextIndex
  }
  if (labelSources) {
    tokens.__strongJaInlineLabelIndex = labelSourceIndex
  }
}

const convertCollapsedReferenceLinks = (tokens, state) => {
  const references = state.env && state.env.references
  if (!references) return
  const referenceCount = state.__strongJaReferenceCount
  if (referenceCount !== undefined) {
    if (referenceCount === 0) return
  } else if (Object.keys(references).length === 0) {
    return
  }

  let i = 0
  while (i < tokens.length) {
    if (splitBracketToken(tokens, i)) {
      continue
    }
    if (!isBracketToken(tokens[i], '[')) {
      i++
      continue
    }
    let closeIdx = i + 1
    while (closeIdx < tokens.length && !isBracketToken(tokens[closeIdx], ']')) {
      if (splitBracketToken(tokens, closeIdx)) {
        continue
      }
      if (tokens[closeIdx].type === 'link_open') {
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
    const cleanedLabel = cleanLabelText(labelText)
    const whitespaceStart = closeIdx + 1
    let refRemoveStart = whitespaceStart
    while (refRemoveStart < tokens.length && isWhitespaceToken(tokens[refRemoveStart])) {
      refRemoveStart++
    }
    if (splitBracketToken(tokens, refRemoveStart)) {
      continue
    }
    const whitespaceCount = refRemoveStart - whitespaceStart
    let refKey = null
    let refRemoveCount = 0
    let existingLinkOpen = null
    let existingLinkClose = null
    const nextToken = tokens[refRemoveStart]
    if (isBracketToken(nextToken, '[]')) {
      refKey = normalizeReferenceCandidate(state, cleanedLabel)
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
        refKey = normalizeReferenceCandidate(state, cleanedLabel)
      } else {
        const refLabelText = buildReferenceLabelRange(tokens, refStart, refEnd)
        refKey = normalizeReferenceCandidate(state, refLabelText)
      }
      refRemoveCount = refCloseIdx - refRemoveStart + 1
    } else if (nextToken && nextToken.type === 'link_open') {
      const linkCloseIdx = findLinkCloseIndex(tokens, refRemoveStart)
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

// Link cleanup helpers
const mergeBrokenMarksAroundLinks = (tokens) => {
  let i = 0
  while (i < tokens.length) {
    const closeToken = tokens[i]
    if (!closeToken || !/_close$/.test(closeToken.type)) {
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
  restoreLabelWhitespace,
  convertInlineLinks,
  convertCollapsedReferenceLinks,
  mergeBrokenMarksAroundLinks,
  getMapFromTokenRange
}
