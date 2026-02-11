import { isWhiteSpace } from 'markdown-it/lib/common/utils.mjs'
import Token from 'markdown-it/lib/token.mjs'
import {
  CHAR_ASTERISK,
  CHAR_SPACE,
  CHAR_TAB,
  CHAR_NEWLINE,
  findPrevNonSpace,
  findNextNonSpace,
  isJapaneseChar,
  resolveMode,
  getRuntimeOpt
} from './token-utils.js'

const SCAN_DELIMS_PATCHED = Symbol.for('strongJaTokenScanDelimsPatched')

const findMatchingEmOpen = (tokens, closeIdx) => {
  let depth = 0
  for (let i = closeIdx; i >= 0; i--) {
    const t = tokens[i]
    if (!t) continue
    if (t.type === 'em_close') depth++
    if (t.type === 'em_open') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

const rebuildInlineLevels = (tokens) => {
  let level = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    t.level = level
    if (t.nesting === 1) level++
    else if (t.nesting === -1) level--
  }
}

const findLinkOpen = (tokens, closeIdx) => {
  let depth = 0
  for (let i = closeIdx; i >= 0; i--) {
    const t = tokens[i]
    if (!t) continue
    if (t.type === 'link_close') depth++
    if (t.type === 'link_open') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

const nextNonEmptyIndex = (tokens, startIdx) => {
  for (let i = startIdx; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.type !== 'text') return i
    if (t.content) return i
  }
  return -1
}

const isSingleStarBoundary = (code) => {
  return code === 0 ||
    code === CHAR_SPACE ||
    code === CHAR_TAB ||
    code === CHAR_NEWLINE ||
    code === 0x28 || // (
    code === 0x5B || // [
    code === 0x7B // {
}

const hasJapaneseCharBetween = (src, start, end) => {
  if (!src || start >= end) return false
  for (let i = start; i < end; i++) {
    const code = src.charCodeAt(i)
    if (code === CHAR_NEWLINE) return false
    if (isJapaneseChar(code)) return true
  }
  return false
}

const hasPrevJapaneseSingleStarOpener = (src, start) => {
  for (let i = start - 1; i >= 0; i--) {
    const code = src.charCodeAt(i)
    if (code === CHAR_NEWLINE) break
    if (code !== CHAR_ASTERISK) continue
    const prevCode = i > 0 ? src.charCodeAt(i - 1) : 0
    const nextCode = i + 1 < src.length ? src.charCodeAt(i + 1) : 0
    if (prevCode === CHAR_ASTERISK || nextCode === CHAR_ASTERISK) return false
    if (!isSingleStarBoundary(prevCode)) return false
    if (!isSingleStarBoundary(nextCode)) {
      if (isJapaneseChar(nextCode)) return true
      if (!hasJapaneseCharBetween(src, i + 1, start)) return false
    }
    return true
  }
  return false
}

const fixTrailingStrong = (tokens) => {
  let changed = false
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.type !== 'text' || !token.content) continue
    const starIdx = token.content.indexOf('**')
    if (starIdx <= 0) continue
    if (!tokens[i - 1] || tokens[i - 1].type !== 'em_close') continue

    const closeIdx = i - 1
    const openIdx = findMatchingEmOpen(tokens, closeIdx)
    if (openIdx === -1) continue

    let hasInnerEm = false
    let emDepth = 0
    let hasStrongBetween = false
    for (let j = openIdx + 1; j < closeIdx; j++) {
      const t = tokens[j]
      if (!t) continue
      if (t.type === 'strong_open' || t.type === 'strong_close') {
        hasStrongBetween = true
        break
      }
      if (t.type === 'em_open') {
        if (emDepth === 0) hasInnerEm = true
        emDepth++
      } else if (t.type === 'em_close') {
        if (emDepth > 0) emDepth--
      }
    }
    if (hasStrongBetween || !hasInnerEm) continue

    const innerOpenIdx = openIdx + 1
    if (innerOpenIdx + 3 < closeIdx &&
        tokens[innerOpenIdx] && tokens[innerOpenIdx].type === 'em_open' &&
        tokens[innerOpenIdx + 1] && tokens[innerOpenIdx + 1].type === 'text' &&
        tokens[innerOpenIdx + 2] && tokens[innerOpenIdx + 2].type === 'em_close' &&
        tokens[innerOpenIdx + 3] && tokens[innerOpenIdx + 3].type === 'text' &&
        closeIdx === innerOpenIdx + 4) {
      tokens.splice(innerOpenIdx + 2, 1)
      tokens.splice(innerOpenIdx, 1)
      const movedOpen = new Token('em_open', 'em', 1)
      movedOpen.markup = '*'
      const movedClose = new Token('em_close', 'em', -1)
      movedClose.markup = '*'
      tokens.splice(innerOpenIdx + 1, 0, movedOpen)
      tokens.splice(innerOpenIdx + 3, 0, movedClose)
    }

    const before = token.content.slice(0, starIdx)
    const after = token.content.slice(starIdx + 2)

    tokens.splice(closeIdx, 1)
    if (closeIdx < i) i--

    const openToken = tokens[openIdx]
    if (!openToken) continue
    openToken.type = 'strong_open'
    openToken.tag = 'strong'
    openToken.markup = '**'
    openToken.nesting = 1

    if (before) {
      token.content = before
    } else {
      tokens.splice(i, 1)
      i--
    }

    const insertAt = i + 1
    const strongClose = new Token('strong_close', 'strong', -1)
    strongClose.markup = '**'
    tokens.splice(insertAt, 0, strongClose)
    if (after) {
      const tail = new Token('text', '', 0)
      tail.content = after
      tokens.splice(insertAt + 1, 0, tail)
    }
    changed = true
  }
  return changed
}

function fixEmOuterStrongSequence(tokens) {
  let changed = false
  let i = 0
  while (i < tokens.length) {
    const idx0 = nextNonEmptyIndex(tokens, i)
    if (idx0 === -1) break
    const t0 = tokens[idx0]
    if (!t0 || t0.type !== 'em_open') {
      i = idx0 + 1
      continue
    }
    const idx1 = nextNonEmptyIndex(tokens, idx0 + 1)
    const idx2 = idx1 === -1 ? -1 : nextNonEmptyIndex(tokens, idx1 + 1)
    const idx3 = idx2 === -1 ? -1 : nextNonEmptyIndex(tokens, idx2 + 1)
    const idx4 = idx3 === -1 ? -1 : nextNonEmptyIndex(tokens, idx3 + 1)
    const idx5 = idx4 === -1 ? -1 : nextNonEmptyIndex(tokens, idx4 + 1)
    const idx6 = idx5 === -1 ? -1 : nextNonEmptyIndex(tokens, idx5 + 1)
    const idx7 = idx6 === -1 ? -1 : nextNonEmptyIndex(tokens, idx6 + 1)
    if (idx7 === -1) break

    const t1 = tokens[idx1]
    const t2 = tokens[idx2]
    const t3 = tokens[idx3]
    const t4 = tokens[idx4]
    const t5 = tokens[idx5]
    const t6 = tokens[idx6]
    const t7 = tokens[idx7]

    if (!t1 || !t2 || !t3 || !t4 || !t5 || !t6 || !t7) {
      i = idx0 + 1
      continue
    }
    if (t1.type !== 'em_open') {
      i = idx0 + 1
      continue
    }
    if (t3.type !== 'em_close' || t5.type !== 'em_close') {
      i = idx0 + 1
      continue
    }
    if (t7.type !== 'strong_open') {
      i = idx0 + 1
      continue
    }
    if (t2.type !== 'text' || !t2.content) {
      i = idx0 + 1
      continue
    }
    if (t4.type !== 'text' || !t4.content) {
      i = idx0 + 1
      continue
    }
    if (t6.type !== 'text' || !t6.content) {
      i = idx0 + 1
      continue
    }

    t0.type = 'strong_open'
    t0.tag = 'strong'
    t0.markup = '**'
    t0.nesting = 1

    const emOpen = new Token('em_open', 'em', 1)
    emOpen.markup = '*'
    const emClose = new Token('em_close', 'em', -1)
    emClose.markup = '*'
    const strongClose = new Token('strong_close', 'strong', -1)
    strongClose.markup = '**'

    tokens.splice(idx7, 1)
    tokens.splice(idx5, 1)
    tokens.splice(idx3, 1)
    tokens.splice(idx1, 1)

    const idx4AfterRemove = idx4 - 2
    const idx6AfterRemove = idx6 - 3
    tokens.splice(idx4AfterRemove, 0, emOpen)

    const idx6BeforeEmClose = idx6AfterRemove + 1
    tokens.splice(idx6BeforeEmClose, 0, emClose)

    const idx6AfterEmClose = idx6BeforeEmClose + 1
    tokens.splice(idx6AfterEmClose + 1, 0, strongClose)

    changed = true
    i = idx6AfterEmClose + 2
  }
  return changed
}

const shiftEmWithLeadingStar = (tokens, rangeStart, rangeEnd, closeIdx) => {
  let openIdx = findMatchingEmOpen(tokens, closeIdx)
  if (openIdx === -1 || openIdx < rangeStart || openIdx >= rangeEnd) return false

  for (let j = openIdx + 1; j < closeIdx; j++) {
    if (!tokens[j]) continue
    if (tokens[j].type === 'em_open' || tokens[j].type === 'em_close') return false
  }

  let starTokenIdx = -1
  let starPos = -1
  for (let i = openIdx - 1; i >= rangeStart; i--) {
    const t = tokens[i]
    if (!t || t.type !== 'text' || !t.content) continue
    const pos = t.content.lastIndexOf('*')
    if (pos <= 0) continue
    const prevCode = t.content.charCodeAt(pos - 1)
    const nextCode = pos + 1 < t.content.length ? t.content.charCodeAt(pos + 1) : 0
    if (!isWhiteSpace(prevCode)) continue
    if (!nextCode || isWhiteSpace(nextCode) || nextCode === CHAR_ASTERISK) continue
    starTokenIdx = i
    starPos = pos
    break
  }
  if (starTokenIdx === -1) return false

  const starToken = tokens[starTokenIdx]
  const before = starToken.content.slice(0, starPos)
  const after = starToken.content.slice(starPos + 1)
  let insertAt = starTokenIdx
  if (before) {
    starToken.content = before
    insertAt = starTokenIdx + 1
  } else {
    tokens.splice(starTokenIdx, 1)
    if (starTokenIdx < openIdx) {
      openIdx--
      closeIdx--
    }
  }

  const emOpen = new Token('em_open', 'em', 1)
  emOpen.markup = '*'
  tokens.splice(insertAt, 0, emOpen)
  if (insertAt <= openIdx) {
    openIdx++
    closeIdx++
  }
  if (after) {
    const afterToken = new Token('text', '', 0)
    afterToken.content = after
    tokens.splice(insertAt + 1, 0, afterToken)
    if (insertAt + 1 <= openIdx) {
      openIdx++
      closeIdx++
    }
  }

  const openToken = tokens[openIdx]
  if (!openToken) return false
  openToken.type = 'em_close'
  openToken.tag = 'em'
  openToken.markup = '*'
  openToken.nesting = -1

  tokens.splice(closeIdx, 1)
  const tailIdx = closeIdx - 1
  if (tailIdx >= 0 && tokens[tailIdx] && tokens[tailIdx].type === 'text') {
    tokens[tailIdx].content += '*'
  } else {
    const tail = new Token('text', '', 0)
    tail.content = '*'
    tokens.splice(closeIdx, 0, tail)
  }
  return true
}

const fixLeadingAsteriskEm = (tokens) => {
  let changed = false
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t || t.type !== 'em_close') continue
    const nextIdx = nextNonEmptyIndex(tokens, i + 1)
    if (nextIdx === -1 || tokens[nextIdx].type !== 'link_close') continue
    const linkCloseIdx = nextIdx
    const linkOpenIdx = findLinkOpen(tokens, linkCloseIdx)
    if (linkOpenIdx === -1) continue
    if (shiftEmWithLeadingStar(tokens, linkOpenIdx + 1, linkCloseIdx, i)) {
      changed = true
      i = linkCloseIdx
    }
  }
  return changed
}

const patchScanDelims = (md) => {
  if (!md || !md.inline || !md.inline.State || !md.inline.State.prototype) return
  const proto = md.inline.State.prototype
  if (proto[SCAN_DELIMS_PATCHED] === true) {
    return
  }
  const original = proto.scanDelims
  if (typeof original !== 'function') return

  proto.scanDelims = function strongJaTokenScanDelims(start, canSplitWord) {
    const marker = this.src.charCodeAt(start)
    if (marker !== CHAR_ASTERISK) {
      return original.call(this, start, canSplitWord)
    }
    const base = original.call(this, start, canSplitWord)

    const baseOpt = this.md ? this.md.__strongJaTokenOpt : null
    const overrideOpt = this.env && this.env.__strongJaTokenOpt
    const opt = overrideOpt ? getRuntimeOpt(this, baseOpt) : baseOpt
    if (!opt) {
      return base
    }
    const mode = resolveMode(opt)
    if (mode === 'compatible') {
      return base
    }
    const max = this.posMax
    const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20

    const count = base && base.length ? base.length : 1
    const pos = start + count

    const nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20

    const leftJapanese = isJapaneseChar(lastChar)
    const rightJapanese = isJapaneseChar(nextChar)
    const hasJapaneseContext = leftJapanese || rightJapanese
    const useRelaxed = mode === 'aggressive' || hasJapaneseContext
    if (!useRelaxed) {
      return base
    }

    let isLastWhiteSpace = isWhiteSpace(lastChar)
    let isNextWhiteSpace = isWhiteSpace(nextChar)
    if (isLastWhiteSpace && (lastChar === CHAR_SPACE || lastChar === CHAR_TAB)) {
      const prevNonSpaceLocal = findPrevNonSpace(this.src, start - 2)
      if (prevNonSpaceLocal && prevNonSpaceLocal !== CHAR_ASTERISK) {
        isLastWhiteSpace = false
      }
    }
    if (isNextWhiteSpace && (nextChar === CHAR_SPACE || nextChar === CHAR_TAB)) {
      const nextNonSpace = findNextNonSpace(this.src, pos, max)
      if (nextNonSpace && nextNonSpace !== CHAR_ASTERISK) {
        isNextWhiteSpace = false
      }
    }

    const left_flanking = !isNextWhiteSpace
    const right_flanking = !isLastWhiteSpace

    const can_open = left_flanking && (canSplitWord || !right_flanking)
    const can_close = right_flanking && (canSplitWord || !left_flanking)

    const forbidClose = lastChar === 0x5B || lastChar === 0x28
    const forbidOpen = nextChar === 0x5D || nextChar === 0x29
    let relaxedOpen = forbidOpen ? false : can_open
    let relaxedClose = forbidClose ? false : can_close
    if (mode !== 'aggressive' && count === 1) {
      // Keep local directionality to avoid degrading markdown-it-valid runs,
      // e.g. `[。*a**](u)` where the first `*` should remain opener-only.
      const rightIsBoundary =
        pos >= max ||
        nextChar === CHAR_SPACE ||
        nextChar === CHAR_TAB ||
        nextChar === 0x29 || // )
        nextChar === 0x5D || // ]
        nextChar === 0x7D // }
      const leftIsBoundary =
        start === 0 ||
        lastChar === CHAR_SPACE ||
        lastChar === CHAR_TAB ||
        lastChar === 0x28 || // (
        lastChar === 0x5B || // [
        lastChar === 0x7B // {

      if (leftJapanese && !rightJapanese && !rightIsBoundary) {
        if (!hasPrevJapaneseSingleStarOpener(this.src, start)) {
          relaxedClose = false
        }
      } else if (!leftJapanese && rightJapanese && !leftIsBoundary) {
        relaxedOpen = false
      }
    }
    return {
      can_open: (base && base.can_open) || relaxedOpen,
      can_close: (base && base.can_close) || relaxedClose,
      length: count
    }
  }
  proto[SCAN_DELIMS_PATCHED] = true
}

export {
  rebuildInlineLevels,
  findLinkOpen,
  nextNonEmptyIndex,
  fixTrailingStrong,
  fixEmOuterStrongSequence,
  fixLeadingAsteriskEm,
  patchScanDelims
}
