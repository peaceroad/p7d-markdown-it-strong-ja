import Token from 'markdown-it/lib/token.mjs'

const cloneMap = (map) => {
  if (!map || !Array.isArray(map)) return null
  return [map[0], map[1]]
}

const cloneTextLike = (source, content) => {
  const token = new Token('text', '', 0)
  Object.assign(token, source)
  token.content = content
  if (source.meta) token.meta = { ...source.meta }
  return token
}

const toStrongToken = (token, isOpen) => {
  if (!token) return
  token.type = isOpen ? 'strong_open' : 'strong_close'
  token.tag = 'strong'
  token.nesting = isOpen ? 1 : -1
  token.markup = '**'
}

const createStrongBoundaryToken = (isOpen, mapToken) => {
  const token = new Token(isOpen ? 'strong_open' : 'strong_close', 'strong', isOpen ? 1 : -1)
  token.markup = '**'
  const map = mapToken && mapToken.map ? cloneMap(mapToken.map) : null
  if (map) token.map = map
  return token
}

const isTextToken = (token, requireContent = false) => {
  if (!token || token.type !== 'text') return false
  return !requireContent || !!token.content
}

const tryFixTailPatternTokenOnly = (tokens, startIdx, endIdx) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return false
  if ((endIdx - startIdx) < 14) return false

  const t0 = tokens[startIdx]
  const t1 = tokens[startIdx + 1]
  const t2 = tokens[startIdx + 2]
  const t3 = tokens[startIdx + 3]
  const t4 = tokens[startIdx + 4]
  const t5 = tokens[startIdx + 5]
  const t6 = tokens[startIdx + 6]
  const t7 = tokens[startIdx + 7]
  const t8 = tokens[startIdx + 8]
  const t9 = tokens[startIdx + 9]
  const t10 = tokens[startIdx + 10]
  const t11 = tokens[startIdx + 11]
  const t12 = tokens[startIdx + 12]
  const t13 = tokens[startIdx + 13]
  const t14 = tokens[startIdx + 14]

  if (!isTextToken(t0)) return false
  if (!t1 || t1.type !== 'strong_close') return false
  if (!isTextToken(t2, true)) return false
  if (!t3 || t3.type !== 'em_open') return false
  if (!isTextToken(t4)) return false
  if (!t5 || t5.type !== 'strong_open') return false
  if (!isTextToken(t6, true)) return false
  if (!t7 || t7.type !== 'strong_close') return false
  if (!isTextToken(t8)) return false
  if (!t9 || t9.type !== 'em_close') return false
  if (!isTextToken(t10, true)) return false
  if (!t11 || t11.type !== 'em_open') return false
  if (!isTextToken(t12, true)) return false
  if (!t13 || t13.type !== 'em_close') return false
  if (!isTextToken(t14, true)) return false

  const splitPos = t14.content.indexOf('**')
  if (splitPos <= 0) return false
  const beforeTailMarker = t14.content.slice(0, splitPos)
  const afterTailMarker = t14.content.slice(splitPos + 2)
  if (!beforeTailMarker) return false

  // Keep this fast path scoped to local malformed emphasis tails only.
  for (let i = startIdx; i <= startIdx + 14 && i <= endIdx; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.type === 'link_open' || token.type === 'link_close') return false
  }

  toStrongToken(t1, true)
  t14.content = beforeTailMarker

  const replacement = [
    t0,
    t1,
    t2,
    createStrongBoundaryToken(false, t2),
    t3,
    t4,
    t6,
    t8,
    t9,
    createStrongBoundaryToken(true, t10),
    t10,
    t11,
    t12,
    t13,
    t14,
    createStrongBoundaryToken(false, t14)
  ]
  if (afterTailMarker) replacement.push(cloneTextLike(t14, afterTailMarker))
  for (let i = startIdx + 15; i <= endIdx; i++) replacement.push(tokens[i])

  tokens.splice(startIdx, endIdx - startIdx + 1, ...replacement)
  return true
}

const tryFixTailDanglingStrongCloseTokenOnly = (tokens, startIdx, strongCloseIdx) => {
  if (!tokens || startIdx < 0 || strongCloseIdx <= startIdx || strongCloseIdx >= tokens.length) return false
  if (strongCloseIdx !== startIdx + 1) return false
  const head = tokens[startIdx]
  const close = tokens[strongCloseIdx]
  if (!head || head.type !== 'text') return false
  if (!close || close.type !== 'strong_close') return false
  if (close.markup && close.markup !== '**') return false

  const tail = tokens[strongCloseIdx + 1]
  const closeMarkup = close.markup || '**'
  const tailText = tail && tail.type === 'text' ? (tail.content || '') : ''
  head.content = (head.content || '') + closeMarkup + tailText

  if (tail && tail.type === 'text') {
    tokens.splice(strongCloseIdx, 2)
  } else {
    tokens.splice(strongCloseIdx, 1)
  }
  return true
}

const tryFixBrokenRefStrongAroundLinkTokenOnly = (tokens, startIdx, endIdx, linkCloseMap) => {
  if (!tokens || startIdx < 1 || endIdx <= startIdx + 6) return false

  const outerOpen = tokens[startIdx - 1]
  const headText = tokens[startIdx]
  const earlyStrongClose = tokens[startIdx + 1]
  const middleText = tokens[startIdx + 2]
  const innerStrongOpen = tokens[startIdx + 3]
  const linkOpen = tokens[startIdx + 4]

  if (!outerOpen || outerOpen.type !== 'strong_open') return false
  if (!headText || headText.type !== 'text' || !headText.content) return false
  if (!earlyStrongClose || earlyStrongClose.type !== 'strong_close') return false
  if (!middleText || middleText.type !== 'text' || !middleText.content) return false
  if (!innerStrongOpen || innerStrongOpen.type !== 'strong_open') return false
  if (!linkOpen || linkOpen.type !== 'link_open') return false

  if ((earlyStrongClose.markup && earlyStrongClose.markup !== '**') ||
      (innerStrongOpen.markup && innerStrongOpen.markup !== '**')) {
    return false
  }

  const linkOpenIdx = startIdx + 4
  const closeIdx = linkCloseMap ? (linkCloseMap.get(linkOpenIdx) ?? -1) : -1
  if (closeIdx === -1) return false

  const tailTextIdx = closeIdx + 1
  const tailStrongCloseIdx = closeIdx + 2
  if (tailStrongCloseIdx !== endIdx) return false

  const tailText = tokens[tailTextIdx]
  const tailStrongClose = tokens[tailStrongCloseIdx]
  if (!tailText || tailText.type !== 'text') return false
  if (!tailStrongClose || tailStrongClose.type !== 'strong_close') return false
  if (tailStrongClose.markup && tailStrongClose.markup !== '**') return false

  tailText.content = (tailText.content || '') + '**'
  const spacer = cloneTextLike(middleText, '')
  const replacement = [
    headText,
    innerStrongOpen,
    middleText,
    tailStrongClose,
    spacer,
    ...tokens.slice(linkOpenIdx, closeIdx + 1),
    tailText
  ]
  tokens.splice(startIdx, endIdx - startIdx + 1, ...replacement)
  return true
}

const tryFixBrokenRefLeadingCloseThenInnerStrongBeforeLinkTokenOnly = (tokens, startIdx, endIdx, linkCloseMap) => {
  if (!tokens || startIdx < 0 || endIdx <= startIdx + 6) return false

  const leadText = tokens[startIdx]
  const leadingStrongClose = tokens[startIdx + 1]
  const headText = tokens[startIdx + 2]
  const innerStrongOpen = tokens[startIdx + 3]
  const innerText = tokens[startIdx + 4]
  const innerStrongClose = tokens[startIdx + 5]

  if (!leadText || leadText.type !== 'text' || !leadText.content) return false
  if (leadText.content.indexOf('[') === -1) return false
  if (!leadingStrongClose || leadingStrongClose.type !== 'strong_close') return false
  if (!headText || headText.type !== 'text' || !headText.content) return false
  if (headText.content.indexOf('[') === -1) return false
  if (!innerStrongOpen || innerStrongOpen.type !== 'strong_open') return false
  if (!innerText || innerText.type !== 'text') return false
  if (!innerStrongClose || innerStrongClose.type !== 'strong_close') return false

  if ((leadingStrongClose.markup && leadingStrongClose.markup !== '**') ||
      (innerStrongOpen.markup && innerStrongOpen.markup !== '**') ||
      (innerStrongClose.markup && innerStrongClose.markup !== '**')) {
    return false
  }

  let linkOpenIdx = -1
  for (let i = startIdx + 6; i <= endIdx; i++) {
    const token = tokens[i]
    if (!token || token.type === 'text') continue
    if (token.type !== 'link_open') return false
    linkOpenIdx = i
    break
  }
  if (linkOpenIdx === -1) return false

  const closeIdx = linkCloseMap ? (linkCloseMap.get(linkOpenIdx) ?? -1) : -1
  if (closeIdx === -1 || closeIdx !== endIdx) return false

  for (let i = startIdx + 6; i <= endIdx; i++) {
    const token = tokens[i]
    if (!token || !token.type) continue
    if (token.type === 'em_open' ||
        token.type === 'em_close' ||
        token.type === 'strong_open' ||
        token.type === 'strong_close') {
      return false
    }
  }

  toStrongToken(leadingStrongClose, true)
  toStrongToken(innerStrongOpen, false)
  innerText.content = (innerText.content || '') + (innerStrongClose.markup || '**')

  const replacement = [
    leadText,
    leadingStrongClose,
    headText,
    innerStrongOpen,
    innerText,
    ...tokens.slice(linkOpenIdx, closeIdx + 1)
  ]
  tokens.splice(startIdx, endIdx - startIdx + 1, ...replacement)
  return true
}

const hasStrongAroundLinkFastPathSignature = (tokens, startIdx, endIdx, linkCloseMap) => {
  if (!tokens || startIdx < 1 || endIdx <= startIdx + 6) return false
  const outerOpen = tokens[startIdx - 1]
  const headText = tokens[startIdx]
  const earlyStrongClose = tokens[startIdx + 1]
  const middleText = tokens[startIdx + 2]
  const innerStrongOpen = tokens[startIdx + 3]
  const linkOpen = tokens[startIdx + 4]
  if (!outerOpen || outerOpen.type !== 'strong_open') return false
  if (!headText || headText.type !== 'text' || !headText.content) return false
  if (!earlyStrongClose || earlyStrongClose.type !== 'strong_close') return false
  if (!middleText || middleText.type !== 'text' || !middleText.content) return false
  if (!innerStrongOpen || innerStrongOpen.type !== 'strong_open') return false
  if (!linkOpen || linkOpen.type !== 'link_open') return false
  const linkOpenIdx = startIdx + 4
  const closeIdx = linkCloseMap ? (linkCloseMap.get(linkOpenIdx) ?? -1) : -1
  if (closeIdx === -1) return false
  const tailTextIdx = closeIdx + 1
  const tailStrongCloseIdx = closeIdx + 2
  if (tailStrongCloseIdx !== endIdx) return false
  const tailText = tokens[tailTextIdx]
  const tailStrongClose = tokens[tailStrongCloseIdx]
  if (!tailText || tailText.type !== 'text') return false
  if (!tailStrongClose || tailStrongClose.type !== 'strong_close') return false
  return true
}

const hasLeadingCloseThenInnerStrongFastPathSignature = (tokens, startIdx, endIdx, linkCloseMap) => {
  if (!tokens || startIdx < 0 || endIdx <= startIdx + 6) return false
  const leadText = tokens[startIdx]
  const leadingStrongClose = tokens[startIdx + 1]
  const headText = tokens[startIdx + 2]
  const innerStrongOpen = tokens[startIdx + 3]
  const innerText = tokens[startIdx + 4]
  const innerStrongClose = tokens[startIdx + 5]
  if (!leadText || leadText.type !== 'text' || !leadText.content || leadText.content.indexOf('[') === -1) return false
  if (!leadingStrongClose || leadingStrongClose.type !== 'strong_close') return false
  if (!headText || headText.type !== 'text' || !headText.content || headText.content.indexOf('[') === -1) return false
  if (!innerStrongOpen || innerStrongOpen.type !== 'strong_open') return false
  if (!innerText || innerText.type !== 'text') return false
  if (!innerStrongClose || innerStrongClose.type !== 'strong_close') return false
  let linkOpenIdx = -1
  for (let i = startIdx + 6; i <= endIdx; i++) {
    const token = tokens[i]
    if (!token || token.type === 'text') continue
    if (token.type !== 'link_open') return false
    linkOpenIdx = i
    break
  }
  if (linkOpenIdx === -1) return false
  const closeIdx = linkCloseMap ? (linkCloseMap.get(linkOpenIdx) ?? -1) : -1
  if (closeIdx === -1 || closeIdx !== endIdx) return false
  return true
}

const BROKEN_REF_FAST_PATH_RESULT_NO_ACTIVE_SIGNATURE = 0
const BROKEN_REF_FAST_PATH_RESULT_NO_MATCH = -1

const BROKEN_REF_TOKEN_ONLY_FAST_PATHS = [
  {
    name: 'strong-around-link',
    hasSignature: hasStrongAroundLinkFastPathSignature,
    apply: tryFixBrokenRefStrongAroundLinkTokenOnly
  },
  {
    name: 'leading-close-then-inner-strong-before-link',
    hasSignature: hasLeadingCloseThenInnerStrongFastPathSignature,
    apply: tryFixBrokenRefLeadingCloseThenInnerStrongBeforeLinkTokenOnly
  }
]

const applyBrokenRefTokenOnlyFastPath = (tokens, startIdx, endIdx, linkCloseMap, metrics = null, bumpMetric = null) => {
  let hasActiveSignature = false
  for (let i = 0; i < BROKEN_REF_TOKEN_ONLY_FAST_PATHS.length; i++) {
    const fastPath = BROKEN_REF_TOKEN_ONLY_FAST_PATHS[i]
    if (!fastPath) continue
    if (typeof fastPath.hasSignature === 'function') {
      if (!fastPath.hasSignature(tokens, startIdx, endIdx, linkCloseMap)) continue
    }
    hasActiveSignature = true
    if (typeof fastPath.apply !== 'function') continue
    if (!fastPath.apply(tokens, startIdx, endIdx, linkCloseMap)) continue
    if (typeof bumpMetric === 'function') {
      bumpMetric(metrics, 'brokenRefFastPaths', fastPath.name)
    }
    return 1
  }
  if (!hasActiveSignature) return BROKEN_REF_FAST_PATH_RESULT_NO_ACTIVE_SIGNATURE
  return BROKEN_REF_FAST_PATH_RESULT_NO_MATCH
}

export {
  BROKEN_REF_FAST_PATH_RESULT_NO_ACTIVE_SIGNATURE,
  BROKEN_REF_FAST_PATH_RESULT_NO_MATCH,
  applyBrokenRefTokenOnlyFastPath,
  tryFixTailPatternTokenOnly,
  tryFixTailDanglingStrongCloseTokenOnly
}
