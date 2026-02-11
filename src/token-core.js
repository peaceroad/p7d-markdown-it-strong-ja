import { isWhiteSpace } from 'markdown-it/lib/common/utils.mjs'
import Token from 'markdown-it/lib/token.mjs'
import {
  CHAR_ASTERISK,
  CHAR_SPACE,
  CHAR_TAB,
  findPrevNonSpace,
  findNextNonSpace,
  resolveMode,
  shouldUseJapaneseRule,
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

const findLinkClose = (tokens, startIdx) => {
  let depth = 0
  for (let i = startIdx; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.type === 'link_open') depth++
    if (t.type === 'link_close') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
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

    const removeIndices = [idx7, idx5, idx3, idx1].sort((a, b) => b - a)
    for (const removeIdx of removeIndices) {
      if (removeIdx >= 0 && removeIdx < tokens.length) {
        tokens.splice(removeIdx, 1)
      }
    }

    const idxT4 = tokens.indexOf(t4)
    if (idxT4 === -1) {
      changed = true
      i = idx0 + 1
      continue
    }
    tokens.splice(idxT4, 0, emOpen)

    let idxT6 = tokens.indexOf(t6)
    if (idxT6 === -1) {
      changed = true
      i = idx0 + 1
      continue
    }
    tokens.splice(idxT6, 0, emClose)

    idxT6 = tokens.indexOf(t6)
    if (idxT6 === -1) {
      changed = true
      i = idx0 + 1
      continue
    }
    tokens.splice(idxT6 + 1, 0, strongClose)

    changed = true
    i = idxT6 + 2
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
    const prevChar = t.content.charAt(pos - 1)
    const nextChar = pos + 1 < t.content.length ? t.content.charAt(pos + 1) : ''
    if (!/\s/.test(prevChar)) continue
    if (!nextChar || /\s/.test(nextChar) || nextChar === '*') continue
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
    md.__strongJaTokenScanDelimsPatched = true
    return
  }
  const original = proto.scanDelims
  if (typeof original !== 'function') return

  proto.scanDelims = function strongJaTokenScanDelims(start, canSplitWord) {
    const marker = this.src.charCodeAt(start)
    if (marker !== CHAR_ASTERISK) {
      return original.call(this, start, canSplitWord)
    }

    const baseOpt = this.md && this.md.__strongJaTokenOpt ? this.md.__strongJaTokenOpt : null
    const opt = getRuntimeOpt(this, baseOpt)
    if (!opt) {
      return original.call(this, start, canSplitWord)
    }
    const mode = resolveMode(opt)
    const useJapaneseRule = shouldUseJapaneseRule(this, opt, mode)
    if (!useJapaneseRule) {
      return original.call(this, start, canSplitWord)
    }

    const max = this.posMax
    const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20

    let pos = start
    while (pos < max && this.src.charCodeAt(pos) === marker) { pos++ }
    const count = pos - start

    const nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20

    const isLastPunctChar = false
    const isNextPunctChar = false

    let isLastWhiteSpace = isWhiteSpace(lastChar)
    let isNextWhiteSpace = isWhiteSpace(nextChar)
    if (useJapaneseRule) {
      if (isLastWhiteSpace && (lastChar === CHAR_SPACE || lastChar === CHAR_TAB)) {
        const prevNonSpace = findPrevNonSpace(this.src, start - 2)
        if (prevNonSpace && prevNonSpace !== CHAR_ASTERISK) {
          isLastWhiteSpace = false
        }
      }
      if (isNextWhiteSpace && (nextChar === CHAR_SPACE || nextChar === CHAR_TAB)) {
        const nextNonSpace = findNextNonSpace(this.src, pos, max)
        if (nextNonSpace && nextNonSpace !== CHAR_ASTERISK) {
          isNextWhiteSpace = false
        }
      }
    }

    const left_flanking =
      !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar)
    const right_flanking =
      !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar)

    const can_open = left_flanking && (canSplitWord || !right_flanking || isLastPunctChar)
    const can_close = right_flanking && (canSplitWord || !left_flanking || isNextPunctChar)

    const forbidClose = lastChar === 0x5B || lastChar === 0x28
    const forbidOpen = nextChar === 0x5D || nextChar === 0x29
    return {
      can_open: forbidOpen ? false : can_open,
      can_close: forbidClose ? false : can_close,
      length: count
    }
  }
  proto[SCAN_DELIMS_PATCHED] = true
  md.__strongJaTokenScanDelimsPatched = true
}

export {
  rebuildInlineLevels,
  findLinkClose,
  findLinkOpen,
  nextNonEmptyIndex,
  fixTrailingStrong,
  fixEmOuterStrongSequence,
  fixLeadingAsteriskEm,
  patchScanDelims
}
