import { isWhiteSpace } from 'markdown-it/lib/common/utils.mjs'
import Token from 'markdown-it/lib/token.mjs'
import {
  CHAR_ASTERISK,
  CHAR_SPACE,
  CHAR_TAB,
  CHAR_NEWLINE,
  CHAR_IDEOGRAPHIC_SPACE,
  isJapaneseChar,
  MODE_FLAG_COMPATIBLE,
  MODE_FLAG_AGGRESSIVE,
  MODE_FLAG_JAPANESE_PLUS,
  getRuntimeOpt
} from './token-utils.js'

const SCAN_DELIMS_PATCHED = Symbol.for('strongJaTokenScanDelimsPatched')
const SINGLE_STAR_LOOKAROUND_MAX = 16
const PREV_STAR_HAS_OPENER = 1
const PREV_STAR_HAS_JP_BETWEEN = 2

const isSoftSpaceCode = (code) => {
  return code === CHAR_SPACE || code === CHAR_TAB || code === CHAR_IDEOGRAPHIC_SPACE
}

const isPlusQuoteWrapperOpen = (code) => {
  return code === 0x2018 || // ‘
    code === 0x201C || // “
    code === 0x301D || // 〝
    code === 0x00AB // «
}

const isPlusQuoteWrapperClose = (code) => {
  return code === 0x2019 || // ’
    code === 0x201D || // ”
    code === 0x301E || // 〞
    code === 0x301F || // 〟
    code === 0x00BB // »
}

const isBacktick = (code) => code === 0x60 // `

const isOpeningBracketLike = (code) => {
  switch (code) {
    // ASCII
    case 0x28: // (
    case 0x5B: // [
    case 0x7B: // {
    // Fullwidth/halfwidth commonly used in JP text
    case 0xFF08: // （
    case 0xFF3B: // ［
    case 0xFF5B: // ｛
    case 0xFF5F: // ｟
    case 0xFF62: // ｢
    case 0xFF1C: // ＜
    // CJK punctuation brackets/quotes
    case 0x3008: // 〈
    case 0x300A: // 《
    case 0x300C: // 「
    case 0x300E: // 『
    case 0x3010: // 【
    case 0x3014: // 〔
    case 0x3016: // 〖
    case 0x3018: // 〘
    case 0x301A: // 〚
    // Mathematical/typographic angle brackets used in docs
    case 0x27E6: // ⟦
    case 0x27E8: // ⟨
    case 0x27EA: // ⟪
    case 0x27EC: // ⟬
    case 0x27EE: // ⟮
    case 0x2985: // ⦅
    case 0x2987: // ⦇
    case 0x2989: // ⦉
    case 0x298B: // ⦋
    case 0x298D: // ⦍
    case 0x298F: // ⦏
    case 0x2991: // ⦑
    case 0x2993: // ⦓
    case 0x2995: // ⦕
    case 0x2997: // ⦗
    case 0x29D8: // ⧘
    case 0x29DA: // ⧚
    case 0x29FC: // ⧼
    // Vertical/small presentation forms found in JP publishing text
    case 0xFE35: // ︵
    case 0xFE37: // ︷
    case 0xFE39: // ︹
    case 0xFE3B: // ︻
    case 0xFE3D: // ︽
    case 0xFE3F: // ︿
    case 0xFE41: // ﹁
    case 0xFE43: // ﹃
    case 0xFE47: // ﹇
    case 0xFE59: // ﹙
    case 0xFE5B: // ﹛
    case 0xFE5D: // ﹝
      return true
    default:
      return false
  }
}

const isClosingBracketLike = (code) => {
  switch (code) {
    // ASCII
    case 0x29: // )
    case 0x5D: // ]
    case 0x7D: // }
    // Fullwidth/halfwidth commonly used in JP text
    case 0xFF09: // ）
    case 0xFF3D: // ］
    case 0xFF5D: // ｝
    case 0xFF60: // ｠
    case 0xFF63: // ｣
    case 0xFF1E: // ＞
    // CJK punctuation brackets/quotes
    case 0x3009: // 〉
    case 0x300B: // 》
    case 0x300D: // 」
    case 0x300F: // 』
    case 0x3011: // 】
    case 0x3015: // 〕
    case 0x3017: // 〗
    case 0x3019: // 〙
    case 0x301B: // 〛
    // Mathematical/typographic angle brackets used in docs
    case 0x27E7: // ⟧
    case 0x27E9: // ⟩
    case 0x27EB: // ⟫
    case 0x27ED: // ⟭
    case 0x27EF: // ⟯
    case 0x2986: // ⦆
    case 0x2988: // ⦈
    case 0x298A: // ⦊
    case 0x298C: // ⦌
    case 0x298E: // ⦎
    case 0x2990: // ⦐
    case 0x2992: // ⦒
    case 0x2994: // ⦔
    case 0x2996: // ⦖
    case 0x2998: // ⦘
    case 0x29D9: // ⧙
    case 0x29DB: // ⧛
    case 0x29FD: // ⧽
    // Vertical/small presentation forms found in JP publishing text
    case 0xFE36: // ︶
    case 0xFE38: // ︸
    case 0xFE3A: // ︺
    case 0xFE3C: // ︼
    case 0xFE3E: // ︾
    case 0xFE40: // ﹀
    case 0xFE42: // ﹂
    case 0xFE44: // ﹄
    case 0xFE48: // ﹈
    case 0xFE5A: // ﹚
    case 0xFE5C: // ﹜
    case 0xFE5E: // ﹞
      return true
    default:
      return false
  }
}

const isWrapperOpenLike = (code) => {
  return isOpeningBracketLike(code) || isPlusQuoteWrapperOpen(code) || isBacktick(code)
}

const isWrapperCloseLike = (code) => {
  return isClosingBracketLike(code) || isPlusQuoteWrapperClose(code) || isBacktick(code)
}

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
    isSoftSpaceCode(code) ||
    code === CHAR_NEWLINE ||
    isOpeningBracketLike(code)
}

const isSingleStarClosingBoundary = (code) => {
  return code === 0 ||
    isSoftSpaceCode(code) ||
    code === CHAR_NEWLINE ||
    isClosingBracketLike(code)
}

const isAsciiAlphaNum = (code) => {
  return (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5A) ||
    (code >= 0x61 && code <= 0x7A)
}

const isAsciiGuardOpenWrapper = (code) => {
  return code === 0x22 || // "
    code === 0x27 || // '
    code === 0x28 || // (
    code === 0x5B || // [
    code === 0x7B || // {
    code === 0x3C || // <
    code === 0x60 // `
}

const isAsciiGuardCloseWrapper = (code) => {
  return code === 0x22 || // "
    code === 0x27 || // '
    code === 0x29 || // )
    code === 0x5D || // ]
    code === 0x7D || // }
    code === 0x3E || // >
    code === 0x60 // `
}

const findPrevNonSpaceIndex = (src, start) => {
  for (let i = start; i >= 0; i--) {
    const code = src.charCodeAt(i)
    if (code === CHAR_NEWLINE) return -1
    if (isSoftSpaceCode(code)) continue
    return i
  }
  return -1
}

const findNextNonSpaceIndex = (src, start, max) => {
  for (let i = start; i < max; i++) {
    const code = src.charCodeAt(i)
    if (code === CHAR_NEWLINE) return -1
    if (isSoftSpaceCode(code)) continue
    return i
  }
  return -1
}

const hasAsciiStartAfterOptionalOpenWrappers = (src, index, max) => {
  let i = index
  // Two wrappers are enough for common shapes: * [ "word" ]*
  for (let wrappers = 0; wrappers < 2 && i >= 0 && i < max; wrappers++) {
    const code = src.charCodeAt(i)
    if (!isAsciiGuardOpenWrapper(code)) break
    i = findNextNonSpaceIndex(src, i + 1, max)
    if (i === -1) return false
  }
  if (i < 0 || i >= max) return false
  return isAsciiAlphaNum(src.charCodeAt(i))
}

const hasAsciiEndBeforeOptionalCloseWrappers = (src, index) => {
  let i = index
  // Two wrappers are enough for common shapes: *["word"] *
  for (let wrappers = 0; wrappers < 2 && i >= 0; wrappers++) {
    const code = src.charCodeAt(i)
    if (!isAsciiGuardCloseWrapper(code)) break
    i = findPrevNonSpaceIndex(src, i - 1)
    if (i === -1) return false
  }
  if (i < 0) return false
  return isAsciiAlphaNum(src.charCodeAt(i))
}

const isMarkdownStructuralOpenWrapper = (code) => {
  return code === 0x28 || // (
    code === 0x5B || // [
    code === 0x7B // {
}

const isExtraSingleStarClosePunct = (code) => {
  return code === 0x3F || // ?
    code === 0x203C || // ‼
    code === 0x2047 || // ⁇
    code === 0x2048 || // ⁈
    code === 0x2049 // ⁉
}

const isSentenceBoundaryStop = (code) => {
  return code === 0x3002 || // 。
    code === 0xFF01 || // ！
    code === 0xFF1F || // ？
    code === 0x2E || // .
    code === 0x21 || // !
    code === 0x3F || // ?
    code === 0x203C || // ‼
    code === 0x2047 || // ⁇
    code === 0x2048 || // ⁈
    code === 0x2049 // ⁉
}

const findPrevNonSpaceLimited = (src, start, maxLook) => {
  let looked = 0
  for (let i = start; i >= 0; i--) {
    if (looked >= maxLook) break
    const code = src.charCodeAt(i)
    looked++
    if (code === CHAR_NEWLINE) return 0
    if (isSoftSpaceCode(code)) continue
    return code
  }
  return 0
}

const findNextNonSpaceLimited = (src, start, max, maxLook) => {
  let looked = 0
  for (let i = start; i < max; i++) {
    if (looked >= maxLook) break
    const code = src.charCodeAt(i)
    looked++
    if (code === CHAR_NEWLINE) return 0
    if (isSoftSpaceCode(code)) continue
    return code
  }
  return 0
}

const hasJapaneseContextForBracketWrapper = (src, start, pos, max, lastChar, nextChar) => {
  if (isWrapperOpenLike(nextChar)) {
    const right = findNextNonSpaceLimited(src, pos, max, SINGLE_STAR_LOOKAROUND_MAX)
    if (isJapaneseChar(right)) return true
  }
  if (isWrapperCloseLike(lastChar)) {
    const left = findPrevNonSpaceLimited(src, start - 2, SINGLE_STAR_LOOKAROUND_MAX)
    if (isJapaneseChar(left)) return true
  }
  return false
}

const scanPrevSingleStarContextFlags = (src, start) => {
  let hasJapaneseBetween = false
  for (let i = start - 1; i >= 0; i--) {
    const code = src.charCodeAt(i)
    if (code === CHAR_NEWLINE) break
    if (isSentenceBoundaryStop(code) && i < start - 1) break
    if (code !== CHAR_ASTERISK) {
      if (!hasJapaneseBetween && isJapaneseChar(code)) hasJapaneseBetween = true
      continue
    }
    let backslashCount = 0
    for (let b = i - 1; b >= 0 && src.charCodeAt(b) === 0x5C; b--) {
      backslashCount++
    }
    if ((backslashCount % 2) === 1) continue
    const prevCode = i > 0 ? src.charCodeAt(i - 1) : 0
    const nextCode = i + 1 < src.length ? src.charCodeAt(i + 1) : 0
    if (prevCode === CHAR_ASTERISK || nextCode === CHAR_ASTERISK) continue
    return hasJapaneseBetween ? PREV_STAR_HAS_OPENER | PREV_STAR_HAS_JP_BETWEEN : PREV_STAR_HAS_OPENER
  }
  return 0
}

const ensurePrevStarFlags = (src, start, prevStarFlags) => {
  return prevStarFlags >= 0 ? prevStarFlags : scanPrevSingleStarContextFlags(src, start)
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
    const src = this.src
    const marker = src.charCodeAt(start)
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
    const modeFlags = opt.__strongJaModeFlags
    if (modeFlags & MODE_FLAG_COMPATIBLE) {
      return base
    }
    const plusMode = (modeFlags & MODE_FLAG_JAPANESE_PLUS) !== 0
    const aggressiveMode = (modeFlags & MODE_FLAG_AGGRESSIVE) !== 0
    const max = this.posMax
    const lastChar = start > 0 ? src.charCodeAt(start - 1) : 0x20

    const count = base && base.length ? base.length : 1
    const pos = start + count

    const nextChar = pos < max ? src.charCodeAt(pos) : 0x20
    let prevStarFlags = -1

    const leftJapanese = isJapaneseChar(lastChar)
    const rightJapanese = isJapaneseChar(nextChar)
    let hasJapaneseContext = leftJapanese || rightJapanese
    if (!hasJapaneseContext && count === 1) {
      hasJapaneseContext = hasJapaneseContextForBracketWrapper(src, start, pos, max, lastChar, nextChar)
    }
    if (!hasJapaneseContext && count === 1 && isExtraSingleStarClosePunct(lastChar)) {
      prevStarFlags = ensurePrevStarFlags(src, start, prevStarFlags)
      hasJapaneseContext = (prevStarFlags & PREV_STAR_HAS_JP_BETWEEN) !== 0
    }
    const useRelaxed = aggressiveMode || hasJapaneseContext
    if (!useRelaxed) {
      return base
    }

    // 1) Normalize soft-space neighborhood around the current delimiter run.
    let isLastWhiteSpace = isWhiteSpace(lastChar) || isSoftSpaceCode(lastChar)
    let isNextWhiteSpace = isWhiteSpace(nextChar) || isSoftSpaceCode(nextChar)
    if (isLastWhiteSpace && isSoftSpaceCode(lastChar)) {
      const prevNonSpaceIdx = findPrevNonSpaceIndex(src, start - 2)
      if (prevNonSpaceIdx !== -1) {
        const prevNonSpaceLocal = src.charCodeAt(prevNonSpaceIdx)
        const plusStrictAsciiBoundary = plusMode &&
          hasAsciiEndBeforeOptionalCloseWrappers(src, prevNonSpaceIdx)
        if (prevNonSpaceLocal !== CHAR_ASTERISK && !plusStrictAsciiBoundary) {
          isLastWhiteSpace = false
        }
      }
    }
    if (isNextWhiteSpace && isSoftSpaceCode(nextChar)) {
      const nextNonSpaceIdx = findNextNonSpaceIndex(src, pos, max)
      if (nextNonSpaceIdx !== -1) {
        const nextNonSpace = src.charCodeAt(nextNonSpaceIdx)
        const plusStrictAsciiBoundary = plusMode &&
          hasAsciiStartAfterOptionalOpenWrappers(src, nextNonSpaceIdx, max)
        if (nextNonSpace !== CHAR_ASTERISK && !plusStrictAsciiBoundary) {
          isNextWhiteSpace = false
        }
      }
    }

    // 2) Compute markdown-it compatible flanking sides from normalized whitespace.
    const left_flanking = !isNextWhiteSpace
    const right_flanking = !isLastWhiteSpace
    const can_open = left_flanking && (canSplitWord || !right_flanking)
    const can_close = right_flanking && (canSplitWord || !left_flanking)

    const forbidClose = isOpeningBracketLike(lastChar)
    const forbidOpen = isClosingBracketLike(nextChar)
    let relaxedOpen = forbidOpen ? false : can_open
    let relaxedClose = forbidClose ? false : can_close
    let forceOpen = null
    let forceClose = null
    if (!aggressiveMode && count === 1) {
      // Keep local directionality to avoid degrading markdown-it-valid runs,
      // e.g. `[。*a**](u)` where the first `*` should remain opener-only.
      const rightIsBoundary = isSingleStarClosingBoundary(nextChar) || isWrapperOpenLike(nextChar)
      const leftIsBoundary = isSingleStarBoundary(lastChar) || isWrapperCloseLike(lastChar)
      if (leftJapanese && !rightJapanese && !rightIsBoundary) {
        prevStarFlags = ensurePrevStarFlags(src, start, prevStarFlags)
        if ((prevStarFlags & PREV_STAR_HAS_OPENER) === 0) {
          relaxedClose = false
        }
      } else if (!leftJapanese && rightJapanese && !leftIsBoundary) {
        relaxedOpen = false
      }
      const rightIsOpenWrapper = isWrapperOpenLike(nextChar)
      const leftIsCloseWrapper = isWrapperCloseLike(lastChar)
      prevStarFlags = ensurePrevStarFlags(src, start, prevStarFlags)
      const hasPrevJapaneseOpener = (prevStarFlags & PREV_STAR_HAS_OPENER) !== 0
      const hasJapaneseSincePrevStar = (prevStarFlags & PREV_STAR_HAS_JP_BETWEEN) !== 0
      const leftIsExtraClosePunct = isExtraSingleStarClosePunct(lastChar)
      const canForceCloseByPunct = leftIsExtraClosePunct && hasJapaneseSincePrevStar
      if (leftJapanese &&
          rightIsOpenWrapper &&
          !hasPrevJapaneseOpener &&
          !isMarkdownStructuralOpenWrapper(nextChar)) {
        forceOpen = true
        forceClose = false
      } else if (leftIsCloseWrapper && rightJapanese && hasPrevJapaneseOpener) {
        forceOpen = false
        forceClose = true
      } else if ((leftIsCloseWrapper || canForceCloseByPunct) &&
          !rightJapanese &&
          !rightIsBoundary &&
          hasPrevJapaneseOpener) {
        forceOpen = false
        forceClose = true
      }
    }
    const finalOpen = forceOpen === null ? ((base && base.can_open) || relaxedOpen) : forceOpen
    const finalClose = forceClose === null ? ((base && base.can_close) || relaxedClose) : forceClose
    return {
      can_open: finalOpen,
      can_close: finalClose,
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
