import Token from 'markdown-it/lib/token.mjs'
import { buildLinkCloseMap, convertCollapsedReferenceLinks, mergeBrokenMarksAroundLinks } from '../token-link-utils.js'
import {
  rebuildInlineLevels,
  fixEmOuterStrongSequence,
  fixLeadingAsteriskEm,
  fixTrailingStrong
} from '../token-core.js'
import {
  getInlineWrapperBase,
  getRuntimeOpt,
  MODE_FLAG_COMPATIBLE,
  MODE_FLAG_AGGRESSIVE,
  MODE_FLAG_JAPANESE_PLUS,
  MODE_FLAG_JAPANESE_ANY
} from '../token-utils.js'
import {
  hasMarkerChars,
  isAsteriskEmphasisToken,
  hasJapaneseContextInRange,
  hasEmphasisSignalInRange,
  hasTextMarkerCharsInRange,
  buildAsteriskWrapperPrefixStats,
  shouldAttemptBrokenRefRewrite,
  scanInlinePostprocessSignals
} from './guards.js'
import {
  BROKEN_REF_FAST_PATH_RESULT_NO_ACTIVE_SIGNATURE,
  BROKEN_REF_FAST_PATH_RESULT_NO_MATCH,
  applyBrokenRefTokenOnlyFastPath,
  tryFixTailPatternTokenOnly,
  tryFixTailDanglingStrongCloseTokenOnly
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

const expandSegmentEndForWrapperBalance = (tokens, startIdx, endIdx) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return endIdx
  const depthMap = new Map()
  let openDepthTotal = 0
  let expandedEnd = endIdx

  for (let i = startIdx; i <= expandedEnd; i++) {
    const token = tokens[i]
    if (!token || !token.type) continue
    if ((token.type === 'strong_open' || token.type === 'strong_close' || token.type === 'em_open' || token.type === 'em_close') &&
        !isAsteriskEmphasisToken(token)) {
      continue
    }
    const base = getInlineWrapperBase(token.type)
    if (!base) continue
    if (token.type.endsWith('_open')) {
      depthMap.set(base, (depthMap.get(base) || 0) + 1)
      openDepthTotal++
      continue
    }
    const prev = depthMap.get(base) || 0
    if (prev > 0) {
      depthMap.set(base, prev - 1)
      openDepthTotal--
    }
  }

  while (openDepthTotal > 0 && expandedEnd + 1 < tokens.length) {
    expandedEnd++
    const token = tokens[expandedEnd]
    if (!token || !token.type) continue
    if ((token.type === 'strong_open' || token.type === 'strong_close' || token.type === 'em_open' || token.type === 'em_close') &&
        !isAsteriskEmphasisToken(token)) {
      continue
    }
    const base = getInlineWrapperBase(token.type)
    if (!base) continue
    if (token.type.endsWith('_open')) {
      depthMap.set(base, (depthMap.get(base) || 0) + 1)
      openDepthTotal++
      continue
    }
    const prev = depthMap.get(base) || 0
    if (prev > 0) {
      depthMap.set(base, prev - 1)
      openDepthTotal--
    }
  }

  return openDepthTotal > 0 ? -1 : expandedEnd
}

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

const sanitizeEmStrongBalance = (tokens) => {
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
    makeTokenLiteralText(token)
    changed = true
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]
    const token = tokens[entry.idx]
    if (!token) continue
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

const bumpPostprocessMetric = (metrics, bucket, key) => {
  if (!metrics || !bucket || !key) return
  let table = metrics[bucket]
  if (!table || typeof table !== 'object') {
    table = Object.create(null)
    metrics[bucket] = table
  }
  table[key] = (table[key] || 0) + 1
}

const runBrokenRefRepairPass = (children, scanState, metrics = null) => {
  resetBrokenRefScanState(scanState)
  let wrapperPrefixStats = null
  let brokenRefStart = -1
  let brokenRefDepth = 0
  let brokenRefStartTextOffset = 0
  let linkCloseMap = null
  let hasBracketText = false
  let hasEmphasis = false
  let hasLinkClose = false

  for (let j = 0; j < children.length; j++) {
    const child = children[j]
    if (!child) continue

    if (child.type === 'text' && child.content) {
      const text = child.content
      const hasOpenBracket = text.indexOf('[') !== -1
      const hasCloseBracket = text.indexOf(']') !== -1
      if (!hasBracketText && (hasOpenBracket || hasCloseBracket)) {
        hasBracketText = true
      }
      if (brokenRefStart === -1) {
        if (hasOpenBracket) {
          const scan = scanBrokenRefState(text, scanState)
          if (scan.brokenEnd) {
            brokenRefStart = j
            brokenRefDepth = scan.depth
            brokenRefStartTextOffset = scan.tailOpen > 0 ? scan.tailOpen : 0
            continue
          }
        }
      } else if (hasOpenBracket || hasCloseBracket) {
        brokenRefDepth = updateBracketDepth(text, brokenRefDepth)
        if (brokenRefDepth <= 0) {
          brokenRefStart = -1
          brokenRefDepth = 0
          brokenRefStartTextOffset = 0
        }
      }
    }

    if (!hasEmphasis && isAsteriskEmphasisToken(child)) {
      hasEmphasis = true
    }
    if (!hasLinkClose && child.type === 'link_close') {
      hasLinkClose = true
    }
    if (brokenRefStart === -1 || child.type !== 'link_open') continue
    if (brokenRefDepth <= 0) {
      brokenRefStart = -1
      brokenRefDepth = 0
      brokenRefStartTextOffset = 0
      continue
    }
    if (linkCloseMap === null) {
      linkCloseMap = buildLinkCloseMap(children, 0, children.length - 1)
    }
    const closeIdx = linkCloseMap.get(j) ?? -1
    if (closeIdx === -1) continue
    bumpPostprocessMetric(metrics, 'brokenRefFlow', 'candidate')
    let segmentEnd = expandSegmentEndForWrapperBalance(children, brokenRefStart, closeIdx)
    if (segmentEnd === -1) {
      bumpPostprocessMetric(metrics, 'brokenRefFlow', 'wrapper-expand-fallback')
      segmentEnd = closeIdx
    }
    if (!hasTextMarkerCharsInRange(children, brokenRefStart, segmentEnd, brokenRefStartTextOffset)) {
      bumpPostprocessMetric(metrics, 'brokenRefFlow', 'skip-no-text-marker')
      brokenRefStart = -1
      brokenRefDepth = 0
      brokenRefStartTextOffset = 0
      continue
    }
    if (wrapperPrefixStats === null) {
      wrapperPrefixStats = buildAsteriskWrapperPrefixStats(children)
    }
    if (!shouldAttemptBrokenRefRewrite(
      children,
      brokenRefStart,
      segmentEnd,
      brokenRefStartTextOffset,
      wrapperPrefixStats
    )) {
      bumpPostprocessMetric(metrics, 'brokenRefFlow', 'skip-guard')
      brokenRefStart = -1
      brokenRefDepth = 0
      brokenRefStartTextOffset = 0
      continue
    }
    const fastPathResult = applyBrokenRefTokenOnlyFastPath(
      children,
      brokenRefStart,
      segmentEnd,
      linkCloseMap,
      metrics,
      bumpPostprocessMetric
    )
    if (fastPathResult === BROKEN_REF_FAST_PATH_RESULT_NO_ACTIVE_SIGNATURE) {
      bumpPostprocessMetric(metrics, 'brokenRefFlow', 'skip-no-active-signature')
      brokenRefStart = -1
      brokenRefDepth = 0
      brokenRefStartTextOffset = 0
      continue
    }
    if (fastPathResult === BROKEN_REF_FAST_PATH_RESULT_NO_MATCH) {
      bumpPostprocessMetric(metrics, 'brokenRefFlow', 'skip-no-fastpath-match')
      brokenRefStart = -1
      brokenRefDepth = 0
      brokenRefStartTextOffset = 0
      continue
    }
    bumpPostprocessMetric(metrics, 'brokenRefFlow', 'repaired')
    return {
      didRepair: true,
      hasBracketText,
      hasEmphasis,
      hasLinkClose
    }
  }

  return {
    didRepair: false,
    hasBracketText,
    hasEmphasis,
    hasLinkClose
  }
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

const runBrokenRefRepairs = (children, maxRepairPass, scanState, metrics = null) => {
  let repairPassCount = 0
  let changed = false
  let hasBracketText = false
  let hasEmphasis = false
  let hasLinkClose = false
  while (repairPassCount < maxRepairPass) {
    const pass = runBrokenRefRepairPass(children, scanState, metrics)
    hasBracketText = pass.hasBracketText
    hasEmphasis = pass.hasEmphasis
    hasLinkClose = pass.hasLinkClose
    if (!pass.didRepair) break
    changed = true
    repairPassCount++
  }
  return {
    changed,
    hasBracketText,
    hasEmphasis,
    hasLinkClose
  }
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

const tryRepairTailCandidate = (tokens, candidate, isJapaneseMode, metrics = null) => {
  if (!tokens || !candidate) return false
  const startIdx = candidate.startIdx
  const strongCloseIdx = candidate.strongCloseIdx
  const endIdx = tokens.length - 1
  if (isJapaneseMode && !hasJapaneseContextInRange(tokens, startIdx, endIdx)) return false
  if (!hasEmphasisSignalInRange(tokens, startIdx, endIdx)) return false
  if (tryFixTailPatternTokenOnly(tokens, startIdx, endIdx)) {
    bumpPostprocessMetric(metrics, 'tailFastPaths', 'tail-pattern')
    return true
  }
  if (tryFixTailDanglingStrongCloseTokenOnly(tokens, startIdx, strongCloseIdx)) {
    bumpPostprocessMetric(metrics, 'tailFastPaths', 'tail-dangling-strong-close')
    return true
  }
  return false
}

const fixTailAfterLinkStrongClose = (tokens, isJapaneseMode, metrics = null) => {
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
    if (tryRepairTailCandidate(tokens, candidate, isJapaneseMode, metrics)) return true
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
  for (let i = index - 1; i >= 0 && content.charCodeAt(i) === 0x5C; i--) {
    slashCount++
  }
  return (slashCount % 2) === 1
}

const findLastStandaloneStrongMarker = (content) => {
  if (!content || content.length < 2) return -1
  let pos = content.lastIndexOf('**')
  while (pos !== -1) {
    const prev = pos > 0 ? content.charCodeAt(pos - 1) : 0
    const next = pos + 2 < content.length ? content.charCodeAt(pos + 2) : 0
    if (prev !== 0x2A &&
        next !== 0x2A &&
        !isEscapedMarkerAt(content, pos)) {
      return pos
    }
    pos = content.lastIndexOf('**', pos - 1)
  }
  return -1
}

const hasLeadingStandaloneStrongMarker = (content) => {
  if (!content || content.length < 2) return false
  if (content.charCodeAt(0) !== 0x2A || content.charCodeAt(1) !== 0x2A) return false
  if (content.length > 2 && content.charCodeAt(2) === 0x2A) return false
  return true
}

const tryPromoteStrongAroundInlineLink = (tokens, strictAsciiStrongGuard = false) => {
  if (!tokens || tokens.length < 3) return false
  let changed = false
  let linkCloseMap = null
  for (let i = 1; i < tokens.length - 1; i++) {
    const linkOpen = tokens[i]
    if (!linkOpen || linkOpen.type !== 'link_open') continue
    if (linkCloseMap === null) {
      linkCloseMap = buildLinkCloseMap(tokens, 0, tokens.length - 1)
    }
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
    // Token indices changed; invalidate map for the next candidate.
    linkCloseMap = null
    i = i - 1 + replacement.length - 1
  }
  return changed
}

const tryPromoteStrongAroundInlineCode = (
  tokens,
  strictAsciiCodeGuard = false,
  strictAsciiStrongGuard = false
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
    i += replacement.length - 1
  }
  return changed
}

const processInlinePostprocessToken = (
  token,
  inlineContent,
  state,
  isJapaneseMode,
  strictAsciiCodeGuard,
  strictAsciiStrongGuard,
  referenceCount,
  metrics = null
) => {
  if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) return
  const children = token.children
  const hasBracketTextInContent = inlineContent.indexOf('[') !== -1 || inlineContent.indexOf(']') !== -1
  const preScan = scanInlinePostprocessSignals(children, hasBracketTextInContent)
  let hasBracketText = preScan.hasBracketText
  let hasEmphasis = preScan.hasEmphasis
  const hasLinkOpen = preScan.hasLinkOpen
  let hasLinkClose = preScan.hasLinkClose
  const hasCodeInline = preScan.hasCodeInline
  if (!hasEmphasis && !hasBracketText && !hasLinkOpen && !hasLinkClose && !hasCodeInline) {
    return
  }
  if (isJapaneseMode &&
      !hasJapaneseContextInRange(children, 0, children.length - 1)) {
    return
  }
  let changed = false
  if (!hasEmphasis) {
    if (hasLinkOpen &&
        hasLinkClose &&
        tryPromoteStrongAroundInlineLink(children, strictAsciiStrongGuard)) {
      hasEmphasis = true
      changed = true
    } else if (!hasBracketText) {
      if (!hasLinkOpen &&
          !hasLinkClose &&
          tryPromoteStrongAroundInlineCode(children, strictAsciiCodeGuard, strictAsciiStrongGuard)) {
        hasEmphasis = true
        changed = true
      } else {
        return
      }
    }
  }
  let shouldTryBrokenRefRepair = hasLinkOpen && hasLinkClose && hasBracketText && referenceCount > 0
  if (shouldTryBrokenRefRepair && inlineContent.indexOf('***') !== -1) {
    shouldTryBrokenRefRepair = false
  }
  if (shouldTryBrokenRefRepair) {
    const scanState = { depth: 0, brokenEnd: false, tailOpen: -1 }
    const maxRepairPass = computeMaxBrokenRefRepairPass(children, scanState)
    if (maxRepairPass > 0) {
      const repairs = runBrokenRefRepairs(children, maxRepairPass, scanState, metrics)
      hasBracketText = repairs.hasBracketText
      hasEmphasis = repairs.hasEmphasis
      hasLinkClose = repairs.hasLinkClose
      if (repairs.changed) changed = true
    }
  }
  if (hasEmphasis) {
    if (fixEmOuterStrongSequence(children)) changed = true
    if (hasLinkClose && fixTailAfterLinkStrongClose(children, isJapaneseMode, metrics)) changed = true
    if (hasLinkClose && fixLeadingAsteriskEm(children)) changed = true
    if (fixTrailingStrong(children)) changed = true
    if (sanitizeEmStrongBalance(children)) changed = true
  }
  if (changed) rebuildInlineLevels(children)
  if (!hasBracketText) return
  if (referenceCount > 0) convertCollapsedReferenceLinks(children, state)
  if (referenceCount === 0 && !hasLinkClose) return
  mergeBrokenMarksAroundLinks(children)
}

const registerTokenPostprocess = (md, baseOpt) => {
  if (md.__strongJaTokenPostprocessRegistered) return
  md.__strongJaTokenPostprocessRegistered = true
  md.core.ruler.after('inline', 'strong_ja_token_postprocess', (state) => {
    if (!state || !state.tokens) return
    const opt = getRuntimeOpt(state, baseOpt)
    const modeFlags = opt.__strongJaModeFlags
    const isJapaneseMode = (modeFlags & MODE_FLAG_JAPANESE_ANY) !== 0
    const strictAsciiCodeGuard = (modeFlags & MODE_FLAG_JAPANESE_PLUS) !== 0
    const strictAsciiStrongGuard = (modeFlags & MODE_FLAG_AGGRESSIVE) === 0
    if (modeFlags & MODE_FLAG_COMPATIBLE) return
    if (opt.postprocess === false) return
    const references = state.env && state.env.references ? state.env.references : null
    if (state.__strongJaReferenceCount === undefined) {
      state.__strongJaReferenceCount = references ? Object.keys(references).length : 0
    }
    const referenceCount = state.__strongJaReferenceCount
    const metrics = getPostprocessMetrics(state)
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
        strictAsciiStrongGuard,
        referenceCount,
        metrics
      )
    }
  })
}

export { registerTokenPostprocess }
