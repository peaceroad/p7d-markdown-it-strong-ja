import Token from 'markdown-it/lib/token.mjs'
import { parseLinkDestination, parseLinkTitle } from 'markdown-it/lib/helpers/index.mjs'
import { isSpace } from 'markdown-it/lib/common/utils.mjs'

const CHAR_ASTERISK = 0x2A    // *
//const CHAR_UNDERSCORE = 0x5F  // _
const CHAR_BACKSLASH = 0x5C   // \
const CHAR_BACKTICK = 0x60    // `
const CHAR_DOLLAR = 0x24      // $
const CHAR_LT = 0x3C          // <
const CHAR_GT = 0x3E          // >
const CHAR_SLASH = 0x2F       // /
const CHAR_SPACE = 0x20       // ' ' (space)
const CHAR_OPEN_BRACKET = 0x5B // [
const CHAR_CLOSE_BRACKET = 0x5D // ]
const CHAR_OPEN_PAREN = 0x28 // (
const CHAR_CLOSE_PAREN = 0x29 // )

const REG_ASTERISKS = /^\*+$/
const REG_ATTRS = /{[^{}\n!@#%^&*()]+?}$/
const REG_PUNCTUATION = /[!-/:-@[-`{-~ ]/
const REG_JAPANESE = /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}|\p{General_Category=Punctuation}|\p{General_Category=Symbol}|\p{General_Category=Format}|\p{Emoji}/u // ひらがな|カタカナ|漢字|句読点|記号|フォーマット文字|絵文字

const REG_MARKDOWN_HTML = /^\[[^\[\]]+\]\([^)]+\)$|^<([a-zA-Z][a-zA-Z0-9]*)[^>]*>([^<]+<\/\1>)$|^`[^`]+`$|^\$[^$]+\$$/ // for mixed-language context detection

const hasBackslash = (state, start) => {
  if (start <= 0) return false
  const cache = state.__strongJaBackslashCache
  if (cache && cache.has(start)) {
    return cache.get(start)
  }
  let slashNum = 0
  let i = start - 1
  const src = state.src
  if (i < 0 || src.charCodeAt(i) !== CHAR_BACKSLASH) {
    return false
  }
  while (i >= 0 && src.charCodeAt(i) === CHAR_BACKSLASH) {
    slashNum++
    i--
  }
  const isEscaped = slashNum % 2 === 1
  if (cache) {
    cache.set(start, isEscaped)
  } else {
    state.__strongJaBackslashCache = new Map([[start, isEscaped]])
  }
  return isEscaped
}

const findMatchingBracket = (state, start, max, openChar, closeChar) => {
  let depth = 1
  let pos = start + 1
  const src = state.src
  while (pos < max) {
    const ch = src.charCodeAt(pos)
    if (ch === openChar && !hasBackslash(state, pos)) {
      depth++
    } else if (ch === closeChar && !hasBackslash(state, pos)) {
      depth--
      if (depth === 0) return pos
    }
    pos++
  }
  return -1
}

const getInlineLabelRanges = (inlineLinkRanges) => {
  if (!inlineLinkRanges || inlineLinkRanges.length === 0) return null
  return inlineLinkRanges.__labelRanges
}

const hasInlineLinkLabelCrossing = (inlineLinkRanges, from, to) => {
  if (from >= to) return false
  const labelRanges = getInlineLabelRanges(inlineLinkRanges)
  if (!labelRanges || labelRanges.length === 0) return false
  if (labelRanges.length <= 8) {
    for (let idx = 0; idx < labelRanges.length; idx++) {
      const range = labelRanges[idx]
      if (range.start >= to) break
      if (range.start >= from && range.end >= to) return true
    }
    return false
  }
  let left = 0
  let right = labelRanges.length - 1
  let firstIdx = labelRanges.length
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2)
    if (labelRanges[mid].start < from) {
      left = mid + 1
    } else {
      firstIdx = mid
      right = mid - 1
    }
  }
  for (let idx = firstIdx; idx < labelRanges.length; idx++) {
    const range = labelRanges[idx]
    if (range.start >= to) break
    if (range.end >= to) return true
  }
  return false
}

const findRefRangeIndex = (pos, refRanges) => {
  if (!refRanges || refRanges.length === 0) return -1

  const tryIndex = (idx) => {
    if (idx < 0 || idx >= refRanges.length) return -1
    const range = refRanges[idx]
    if (pos >= range.start && pos <= range.end) {
      return range.hasReference ? idx : -1
    }
    return null
  }

  const tracker = refRanges.__lastIndexState || (refRanges.__lastIndexState = { idx: 0 })
  let idx = tracker.idx
  if (idx >= refRanges.length) idx = refRanges.length - 1
  let result = tryIndex(idx)
  if (result !== null) {
    tracker.idx = idx
    return result
  }

  if (pos < refRanges[idx].start) {
    while (idx > 0 && pos < refRanges[idx].start) {
      idx--
      result = tryIndex(idx)
      if (result !== null) {
        tracker.idx = idx
        return result
      }
    }
  } else {
    while (idx < refRanges.length - 1 && pos > refRanges[idx].end) {
      idx++
      result = tryIndex(idx)
      if (result !== null) {
        tracker.idx = idx
        return result
      }
    }
  }

  let left = 0
  let right = refRanges.length - 1
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2)
    const range = refRanges[mid]
    if (pos < range.start) {
      right = mid - 1
    } else if (pos > range.end) {
      left = mid + 1
    } else {
      tracker.idx = mid
      return range.hasReference ? mid : -1
    }
  }
  return -1
}

// Detect reference-link label ranges within the current inline slice
const computeReferenceRanges = (state, start, max) => {
  const src = state.src
  const references = state.env && state.env.references
  const referenceCount = state.__strongJaReferenceCount
  const hasReferences = references && (referenceCount !== undefined
    ? referenceCount > 0
    : Object.keys(references).length > 0)
  if (!hasReferences) return []
  const firstBracket = src.indexOf('[', start)
  if (firstBracket === -1 || firstBracket >= max) return []
  const ranges = []
  let pos = start
  while (pos < max) {
    if (src.charCodeAt(pos) === CHAR_OPEN_BRACKET && !hasBackslash(state, pos)) {
      const labelClose = findMatchingBracket(state, pos, max, CHAR_OPEN_BRACKET, CHAR_CLOSE_BRACKET)
      if (labelClose !== -1) {
        const nextPos = labelClose + 1
        if (nextPos < max && src.charCodeAt(nextPos) === CHAR_OPEN_BRACKET && !hasBackslash(state, nextPos)) {
          const refClose = findMatchingBracket(state, nextPos, max, CHAR_OPEN_BRACKET, CHAR_CLOSE_BRACKET)
          if (refClose !== -1) {
            let hasReference = false
            if (refClose === nextPos + 1) {
              const labelRaw = src.slice(pos + 1, labelClose)
              const normalizedLabel = normalizeReferenceCandidate(state, labelRaw, { useClean: true })
              hasReference = !!references[normalizedLabel]
            } else {
              const refRaw = src.slice(nextPos + 1, refClose)
              const normalizedRef = normalizeReferenceCandidate(state, refRaw)
              hasReference = !!references[normalizedRef]
            }
            if (hasReference) {
              ranges.push({ start: pos, end: labelClose, hasReference: true })
              ranges.push({ start: nextPos, end: refClose, hasReference: true })
            }
            pos = refClose
            continue
          }
        }
      }
    }
    pos++
  }
  if (ranges.length) {
    ranges.__cache = new Map()
  }
  return ranges
}

const computeInlineLinkRanges = (state, start, max) => {
  const src = state.src
  const ranges = []
  const labelRanges = []
  let pos = start
  let rangeId = 0
  while (pos < max) {
    if (src.charCodeAt(pos) === CHAR_OPEN_BRACKET && !hasBackslash(state, pos)) {
      const labelClose = findMatchingBracket(state, pos, max, CHAR_OPEN_BRACKET, CHAR_CLOSE_BRACKET)
      if (labelClose === -1) break
      let destStart = labelClose + 1
      while (destStart < max) {
        const ch = src.charCodeAt(destStart)
        if (ch !== CHAR_SPACE && ch !== 0x0A && ch !== 0x09) break
        destStart++
      }
      if (destStart < max && src.charCodeAt(destStart) === CHAR_OPEN_PAREN && !hasBackslash(state, destStart)) {
        const destClose = findMatchingBracket(state, destStart, max, CHAR_OPEN_PAREN, CHAR_CLOSE_PAREN)
        if (destClose !== -1) {
          const labelRange = { start: pos, end: labelClose, kind: 'label', id: rangeId }
          ranges.push(labelRange)
          labelRanges.push(labelRange)
          ranges.push({ start: destStart, end: destClose, kind: 'dest', id: rangeId })
          rangeId++
          pos = destClose + 1
          continue
        }
      }
      pos = labelClose + 1
      continue
    }
    pos++
  }
  if (ranges.length && labelRanges.length) {
    ranges.__labelRanges = labelRanges
  }
  return ranges
}

const getInlineRangeCacheMap = (ranges, kind, create) => {
  const prop = kind ? `__cache_${kind}` : '__cache_any'
  let cache = ranges[prop]
  if (!cache && create) {
    cache = new Map()
    ranges[prop] = cache
  }
  return cache
}

const findInlineLinkRange = (pos, ranges, kind) => {
  if (!ranges || ranges.length === 0) return null
  const cache = getInlineRangeCacheMap(ranges, kind, false)
  if (cache && cache.has(pos)) return cache.get(pos)
  let left = 0
  let right = ranges.length - 1
  let found = null
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2)
    const range = ranges[mid]
    if (pos < range.start) {
      right = mid - 1
    } else if (pos > range.end) {
      left = mid + 1
    } else {
      if (!kind || range.kind === kind) {
        found = range
      }
      break
    }
  }
  const storeCache = getInlineRangeCacheMap(ranges, kind, true)
  storeCache.set(pos, found)
  return found
}

const copyInlineTokenFields = (dest, src) => {
  if (src.attrs) dest.attrs = src.attrs
  if (src.map) dest.map = src.map
  dest.level = src.level
  if (src.children) dest.children = src.children
  dest.content = src.content
  dest.markup = src.markup
  if (src.info) dest.info = src.info
  if (src.meta) dest.meta = src.meta
  dest.block = src.block
  dest.hidden = src.hidden
}

const registerPostProcessTarget = (state) => {
  const env = state.env
  if (!env.__strongJaPostProcessTargets) {
    env.__strongJaPostProcessTargets = []
    env.__strongJaPostProcessTargetSet = typeof WeakSet !== 'undefined' ? new WeakSet() : null
  }
  const targets = env.__strongJaPostProcessTargets
  const targetSet = env.__strongJaPostProcessTargetSet
  if (targetSet) {
    if (targetSet.has(state.tokens)) return
    targetSet.add(state.tokens)
  } else if (targets.includes(state.tokens)) {
    return
  }
  targets.push(state.tokens)
}

const setToken = (state, inlines, opt) => {
  const src = state.src
  let i = 0
  let attrsIsText = {
    val: false,
    tag: '',
  }
  while (i < inlines.length) {
    let type = inlines[i].type
    const tag = type.replace(/(?:_open|_close)$/, '')

    if (/_open$/.test(type)) {
      const startToken = state.push(type, tag, 1)
      startToken.markup = tag === 'strong' ? '**' : '*'
      attrsIsText = {
        val: true,
        tag: tag,
      }
    }

    if (type === 'html_inline') {
      type = 'text'
    }
    if (type === 'text') {
      let content = src.slice(inlines[i].s, inlines[i].e + 1)
      if (REG_ASTERISKS.test(content)) {
        const asteriskToken = state.push(type, '', 0)
        asteriskToken.content = content
        i++
        continue
      }
      if (opt.mditAttrs && attrsIsText.val && i + 1 < inlines.length) {
        const hasImmediatelyAfterAsteriskClose = inlines[i+1].type === attrsIsText.tag + '_close'
        if (hasImmediatelyAfterAsteriskClose && REG_ATTRS.test(content)) {
          const attrsToken = state.push(type, '', 0)

          const hasBackslashBeforeCurlyAttribute = content.match(/(\\+){/)
          if (hasBackslashBeforeCurlyAttribute) {
            if (hasBackslashBeforeCurlyAttribute[1].length === 1) {
              attrsToken.content = content.replace(/\\{/, '{')
            } else {
              let backSlashNum = Math.floor(hasBackslashBeforeCurlyAttribute[1].length / 2)
              let k = 0
              let backSlash = ''
              while (k < backSlashNum) {
                backSlash +=  '\\'
                k++
              }
              attrsToken.content = content.replace(/\\+{/, backSlash + '{')
            }
          } else {
            attrsToken.content = content
          }
          attrsIsText.val = false
          i++
          continue
        }
      }

      const childTokens = state.md.parseInline(content, state.env)
      if (childTokens[0] && childTokens[0].children) {
        let j = 0
        while (j < childTokens[0].children.length) {
          const t = childTokens[0].children[j]
          if (t.type === 'softbreak' && !opt.mdBreaks) {
            t.type = 'text'
            t.tag = ''
            t.content = '\n'
          }
          if (!opt.mditAttrs && t.tag === 'br') {
            t.tag = ''
            t.content = '\n'
          }
          const token = state.push(t.type, t.tag, t.nesting)
          copyInlineTokenFields(token, t)
          j++
        }
      }
    }

    if (/_close$/.test(type)) {
      const closeToken = state.push(type, tag, -1)
      closeToken.markup = tag === 'strong' ? '**' : '*'
      attrsIsText = {
        val: false,
        tag: '',
      }
    }

    i++
  }
}

const pushInlines = (inlines, s, e, len, type, tag, tagType) => {
  const inline = {
    s: s,
    sp: s,
    e: e,
    ep: e,
    len: len,
    type: type,
    check: type === 'text',
  }
  if (tag) inline.tag = [tag, tagType]
  inlines.push(inline)
}

const findNextSymbolPos = (state, n, max, symbol) => {
  const src = state.src
  if (src.charCodeAt(n) !== symbol || hasBackslash(state, n)) return -1
  for (let i = n + 1; i < max; i++) {
    if (src.charCodeAt(i) === symbol && !hasBackslash(state, i)) {
      return i
    }
  }
  return -1
}

const processSymbolPair = (state, n, srcLen, symbol, noMark, textStart, pushInlines) => {
  const nextSymbolPos = findNextSymbolPos(state, n, srcLen, symbol)
  if (nextSymbolPos === -1) {
    return { shouldBreak: false, shouldContinue: false, newN: n, newNoMark: noMark }
  }
  const src = state.src
  const innerText = src.slice(n + 1, nextSymbolPos)
  const markup = src.slice(n, nextSymbolPos + 1)
  const newNoMark = noMark + innerText + markup
  if (nextSymbolPos === srcLen - 1) {
    pushInlines(textStart, nextSymbolPos, nextSymbolPos - textStart + 1, 'text')
    return { shouldBreak: true, newN: nextSymbolPos + 1, newNoMark }
  }
  return { shouldBreak: false, shouldContinue: true, newN: nextSymbolPos + 1, newNoMark }
}

const processTextSegment = (inlines, textStart, n, noMark) => {
  if (n !== 0 && noMark.length !== 0) {
    pushInlines(inlines, textStart, n - 1, n - textStart, 'text')
    return ''
  }
  return noMark
}

const createInlines = (state, start, max, opt) => {
  const src = state.src
  const srcLen = max
  const htmlEnabled = state.md.options.html
  let n = start
  let inlines = []
  let noMark = ''
  let textStart = n
  
  // Infinite loop prevention
  const maxIterations = srcLen * 2 // Safe upper bound
  let iterations = 0
  
  while (n < srcLen) {
    // Prevent infinite loops
    iterations++
    if (iterations > maxIterations) {
      // Add remaining text as-is and exit safely
      if (textStart < srcLen) {
        pushInlines(inlines, textStart, srcLen - 1, srcLen - textStart, 'text')
      }
      break
    }
    
    const currentChar = src.charCodeAt(n)
    
    // Unified escape check
    let isEscaped = false
    if (currentChar === CHAR_ASTERISK || currentChar === CHAR_BACKTICK || 
        (opt.dollarMath && currentChar === CHAR_DOLLAR) || 
        (htmlEnabled && currentChar === CHAR_LT)) {
      isEscaped = hasBackslash(state, n)
    }

    // Asterisk handling
    if (currentChar === CHAR_ASTERISK) {
      if (!isEscaped) {
        noMark = processTextSegment(inlines, textStart, n, noMark)
        if (n === srcLen - 1) {
          pushInlines(inlines, n, n, 1, '')
          break
        }
        let i = n + 1
        while (i < srcLen && src.charCodeAt(i) === CHAR_ASTERISK) {
          i++
        }
        if (i === srcLen) {
          pushInlines(inlines, n, i - 1, i - n, '')
        } else {
          pushInlines(inlines, n, i - 1, i - n, '')
          textStart = i
        }
        n = i
        continue
      }
    }

    // Inline code (backticks)
    if (currentChar === CHAR_BACKTICK) {
      if (!isEscaped) {
        const result = processSymbolPair(state, n, srcLen, CHAR_BACKTICK, noMark, textStart, 
          (start, end, len, type) => pushInlines(inlines, start, end, len, type))
        if (result.shouldBreak) break
        if (result.shouldContinue) {
          n = result.newN
          noMark = result.newNoMark
          continue
        }
        noMark = result.newNoMark
      }
    }

    // Inline math ($...$)
    if (opt.dollarMath && currentChar === CHAR_DOLLAR) {
      if (!isEscaped) {
        const result = processSymbolPair(state, n, srcLen, CHAR_DOLLAR, noMark, textStart, 
          (start, end, len, type) => pushInlines(inlines, start, end, len, type))
        if (result.shouldBreak) break
        if (result.shouldContinue) {
          n = result.newN
          noMark = result.newNoMark
          continue
        }
        noMark = result.newNoMark
      }
    }

    // HTML tags
    if (htmlEnabled && currentChar === CHAR_LT) {
      if (!isEscaped) {
        let foundClosingTag = false
        for (let i = n + 1; i < srcLen; i++) {
          if (src.charCodeAt(i) === CHAR_GT && !hasBackslash(state, i)) {
            noMark = processTextSegment(inlines, textStart, n, noMark)
            let tag = src.slice(n + 1, i)
            let tagType
            if (tag.charCodeAt(0) === CHAR_SLASH) {
              tag = tag.slice(1)
              tagType = 'close'
            } else {
              tagType = 'open'
            }
            pushInlines(inlines, n, i, i - n + 1, 'html_inline', tag, tagType)
            textStart = i + 1
            n = i + 1
            foundClosingTag = true
            break
          }
        }
        if (foundClosingTag) {
          continue
        }
        // If no closing tag found, treat as regular character to prevent infinite loops
      }
    }

    // Regular character
    noMark += src[n]
    if (n === srcLen - 1) {
      pushInlines(inlines, textStart, n, n - textStart + 1, 'text')
      break
    }
    n++
  }
  return inlines
}

const pushMark = (marks, opts) => {
  // Maintain sorted order during insertion
  const newMark = {
    nest: opts.nest,
    s: opts.s,
    e: opts.e,
    len: opts.len,
    oLen: opts.oLen,
    type: opts.type
  }
  // Binary search for insertion point to maintain sorted order
  let left = 0
  let right = marks.length
  while (left < right) {
    const mid = Math.floor((left + right) / 2)
    if (marks[mid].s <= newMark.s) {
      left = mid + 1
    } else {
      right = mid
    }
  }
  
  marks.splice(left, 0, newMark)
}

const setStrong = (state, inlines, marks, n, memo, opt, nestTracker, refRanges, inlineLinkRanges) => {
  if (opt.disallowMixed === true) {
    let i = n + 1
    const inlinesLength = inlines.length
    while (i < inlinesLength) {
      if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
      if (inlines[i].type !== '') { i++; continue }
      
      if (inlines[i].len > 1) {
        const mixedCheck = checkMixedLanguagePattern(state, inlines, n, i, opt)
        if (mixedCheck.shouldBlock) {
          return [n, 0]
        }
        break
      }
      i++
    }
  }
  
  const strongOpenRange = findRefRangeIndex(inlines[n].s, refRanges)
  const openLinkRange = findInlineLinkRange(inlines[n].s, inlineLinkRanges)
  let i = n + 1
  let j = 0
  let nest = 0
  let insideTagsIsClose = 1
  const inlinesLength = inlines.length
  while (i < inlinesLength) {
    if (inlines[i].type !== '') { i++; continue }
    if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
    if (inlines[i].type === 'html_inline') {
      inlines[i].check = true
      insideTagsIsClose = checkInsideTags(inlines, i, memo)
      if (insideTagsIsClose === -1) return [n, nest]
      if (insideTagsIsClose === 0) { i++; continue }
    }

    if (inlineLinkRanges && inlineLinkRanges.length > 0 &&
        hasInlineLinkLabelCrossing(inlineLinkRanges, inlines[n].ep + 1, inlines[i].sp)) {
      i++
      continue
    }

    const closeRange = findRefRangeIndex(inlines[i].s, refRanges)
    if (strongOpenRange !== closeRange) { i++; continue }

    const closeLinkRange = findInlineLinkRange(inlines[i].s, inlineLinkRanges)
    if (openLinkRange || closeLinkRange) {
      if (!openLinkRange || !closeLinkRange || openLinkRange.id !== closeLinkRange.id || openLinkRange.kind !== closeLinkRange.kind) {
        i++
        continue
      }
    }

    nest = checkNest(inlines, marks, n, i, nestTracker)
    if (nest === -1) return [n, nest]

    if (inlines[i].len === 1 && inlines[n].len > 2) {
      pushMark(marks, {
        nest: nest,
        s: inlines[n].ep,
        e: inlines[n].ep,
        len: 1,
        oLen: inlines[n].len - 1,
        type: 'em_open'
      })
      pushMark(marks, {
        nest: nest,
        s: inlines[i].sp,
        e: inlines[i].ep,
        len: 1,
        oLen: inlines[i].len - 1,
        type: 'em_close'
      })
      inlines[n].len -= 1
      inlines[n].ep -= 1
      inlines[i].len -= 1
      if (inlines[i].len > 0) inlines[i].sp += 1
      if (insideTagsIsClose === 1) {
        const [newN, newNest] = setEm(state, inlines, marks, n, memo, opt, null, nestTracker, refRanges, inlineLinkRanges)
        n = newN
        nest = newNest
      }
    }
    let strongNum = Math.trunc(Math.min(inlines[n].len, inlines[i].len) / 2)

    if (inlines[i].len > 1) {
      if (hasPunctuationOrNonJapanese(state, inlines, n, i, opt, refRanges)) {
        if (memo.inlineMarkEnd) {
          marks.push(...createMarks(state, inlines, i, inlinesLength - 1, memo, opt, refRanges, inlineLinkRanges))
          if (inlines[i].len === 0) { i++; continue }
        } else {
          return [n, nest]
        }
      }

      j = 0
      while (j < strongNum) {
        pushMark(marks, {
          nest: nest + strongNum - 1 - j,
          s: inlines[n].ep - 1,
          e: inlines[n].ep,
          len: 2,
          oLen: inlines[n].len - 2,
          type: 'strong_open'
        })
        inlines[n].ep -= 2
        inlines[n].len -= 2
        pushMark(marks, {
          nest: nest + strongNum - 1 - j,
          s: inlines[i].sp,
          e: inlines[i].sp + 1,
          len: 2,
          oLen: inlines[i].len - 2,
          type: 'strong_close'
        })
        inlines[i].sp += 2
        inlines[i].len -= 2
        j++
      }
      if (inlines[n].len === 0) return [n, nest]
    }

    if (inlines[n].len === 1 && inlines[i].len > 0) {
      nest++
      const [newN, newNest] = setEm(state, inlines, marks, n, memo, opt, nest, nestTracker, refRanges, inlineLinkRanges)
      n = newN
      nest = newNest
    }

    i++
  }

  if (n == 0 && memo.inlineMarkEnd) {
    marks.push(...createMarks(state, inlines, n + 1, inlinesLength - 1, memo, opt, refRanges, inlineLinkRanges))
  }
  return [n, nest]
}

const checkInsideTags = (inlines, i, memo) => {
  if (inlines[i].tag === undefined) return 0
  const tagName = inlines[i].tag[0].toLowerCase()
  if (memo.htmlTags[tagName] === undefined) {
    memo.htmlTags[tagName] = 0
  }
  if (inlines[i].tag[1] === 'open') {
    memo.htmlTags[tagName] += 1
  }
  if (inlines[i].tag[1] === 'close') {
    memo.htmlTags[tagName] -= 1
  }
  if (memo.htmlTags[tagName] < 0) {
    return -1
  }
  
  // Direct check instead of Object.values().every()
  for (const count of Object.values(memo.htmlTags)) {
    if (count !== 0) return 0
  }
  return 1
}

// Check if character is ASCII punctuation or space
// Covers: !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~ and space
const isPunctuation = (ch) => {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  // ASCII punctuation: !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~
  return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) || 
         (code >= 91 && code <= 96) || (code >= 123 && code <= 126) || code === 32
}

// Check if character is Japanese (hiragana, katakana, kanji, punctuation, symbols, format chars, emoji)
// Uses fast Unicode range checks for common cases, falls back to REG_JAPANESE for complex Unicode
const isJapanese = (ch) => {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  // Fast ASCII check first
  if (code < 128) return false
  // Hiragana: U+3040-U+309F, Katakana: U+30A0-U+30FF, Kanji: U+4E00-U+9FAF
  return (code >= 0x3040 && code <= 0x309F) || 
         (code >= 0x30A0 && code <= 0x30FF) || 
         (code >= 0x4E00 && code <= 0x9FAF) ||
         // Fallback to regex for complex Unicode cases
         REG_JAPANESE.test(ch)
}

// Check if character is English (letters, numbers) or other non-Japanese characters
// Uses REG_JAPANESE and REG_PUNCTUATION to exclude Japanese and punctuation characters
const isEnglish = (ch) => {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
    return true
  }
  if (code < 128) {
    return code === CHAR_SPACE || (code > 126)
  }
  return !REG_JAPANESE.test(ch) && !REG_PUNCTUATION.test(ch)
}

const checkMixedLanguagePattern = (state, inlines, n, i, opt) => {
  const src = state.src
  const openPrevChar = src[inlines[n].s - 1] || ''
  const closeNextChar = src[inlines[i].e + 1] || ''
  
  const isEnglishPrefix = isEnglish(openPrevChar)
  const isEnglishSuffix = isEnglish(closeNextChar)
  if (!isEnglishPrefix && !isEnglishSuffix) {
    return { hasEnglishContext: false, hasMarkdownOrHtml: false, shouldBlock: false }
  }
  
  const contentBetween = src.slice(inlines[n].e + 1, inlines[i].s)
  const hasMarkdownOrHtml = REG_MARKDOWN_HTML.test(contentBetween)
  
  return {
    hasEnglishContext: true,
    hasMarkdownOrHtml,
    shouldBlock: hasMarkdownOrHtml
  }
}

const hasPunctuationOrNonJapanese = (state, inlines, n, i, opt, refRanges) => {
  const src = state.src
  const openPrevChar = src[inlines[n].s - 1] || ''
  const openNextChar = src[inlines[n].e + 1]  || ''
  let checkOpenNextChar = isPunctuation(openNextChar)
  if (checkOpenNextChar && (openNextChar === '[' || openNextChar === ']')) {
    const openNextRange = findRefRangeIndex(inlines[n].e + 1, refRanges)
    if (openNextRange !== -1) {
      checkOpenNextChar = false
    }
  }
  const closePrevChar = src[inlines[i].s - 1] || ''
  let checkClosePrevChar = isPunctuation(closePrevChar)
  if (checkClosePrevChar && (closePrevChar === '[' || closePrevChar === ']')) {
    const closePrevRange = findRefRangeIndex(inlines[i].s - 1, refRanges)
    if (closePrevRange !== -1) {
      checkClosePrevChar = false
    }
  }
  const closeNextChar = src[inlines[i].e + 1] || ''
  const checkCloseNextChar = (isPunctuation(closeNextChar) || i === inlines.length - 1)

  if (opt.disallowMixed === false) {
    if (isEnglish(openPrevChar) || isEnglish(closeNextChar)) {
      const contentBetween = src.slice(inlines[n].e + 1, inlines[i].s)
      if (REG_MARKDOWN_HTML.test(contentBetween)) {
        return false
      }
    }
  }

  const result = (checkOpenNextChar || checkClosePrevChar) && !checkCloseNextChar && !(isJapanese(openPrevChar) || isJapanese(closeNextChar))
  return result
}

const setEm = (state, inlines, marks, n, memo, opt, sNest, nestTracker, refRanges, inlineLinkRanges) => {
  const emOpenRange = findRefRangeIndex(inlines[n].s, refRanges)
  const openLinkRange = findInlineLinkRange(inlines[n].s, inlineLinkRanges)
  if (opt.disallowMixed === true && !sNest) {
    let i = n + 1
    const inlinesLength = inlines.length
    while (i < inlinesLength) {
      if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
      if (inlines[i].type !== '') { i++; continue }
      
      if (inlines[i].len > 0) {
        const mixedCheck = checkMixedLanguagePattern(state, inlines, n, i, opt)
        if (mixedCheck.shouldBlock) {
          return [n, 0]
        }
        break
      }
      i++
    }
  }
  
  let i = n + 1
  let nest = 0
  let strongPNum = 0
  let insideTagsIsClose = 1
  const inlinesLength = inlines.length
  while (i < inlinesLength) {
    if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
    if (!sNest && inlines[i].type === 'html_inline') {
      inlines[i].check = true
      insideTagsIsClose = checkInsideTags(inlines, i, memo)
      if (insideTagsIsClose === -1) return [n, nest]
      if (insideTagsIsClose === 0) { i++; continue }
    }
    if (inlines[i].type !== '') { i++; continue }

    if (inlineLinkRanges && inlineLinkRanges.length > 0 &&
        hasInlineLinkLabelCrossing(inlineLinkRanges, inlines[n].ep + 1, inlines[i].sp)) {
      i++
      continue
    }

    const closeRange = findRefRangeIndex(inlines[i].s, refRanges)
    if (emOpenRange !== closeRange) {
      i++
      continue
    }

    const closeLinkRange = findInlineLinkRange(inlines[i].s, inlineLinkRanges)
    if (openLinkRange || closeLinkRange) {
      if (!openLinkRange || !closeLinkRange || openLinkRange.id !== closeLinkRange.id || openLinkRange.kind !== closeLinkRange.kind) {
        i++
        continue
      }
    }

    const emNum = Math.min(inlines[n].len, inlines[i].len)

    if (!sNest && emNum !== 1) return [n, sNest, memo]

    const hasMarkersAtStartAndEnd = (i) => {
      let flag =  memo.inlineMarkStart
      if (!flag) return false
      inlinesLength - 1 === i ? flag = true : flag = false
      if (!flag) return false
      inlines[i].len > 1 ? flag = true : flag = false
      return flag
    }
    if (!sNest && inlines[i].len === 2 && !hasMarkersAtStartAndEnd(i)) {
      strongPNum++
      i++
      continue
    }

    if (sNest) {
      nest  = sNest - 1
    } else {
      nest = checkNest(inlines, marks, n, i, nestTracker)
    }
    if (nest === -1) return [n, nest]

    if (emNum === 1) {
      if (hasPunctuationOrNonJapanese(state, inlines, n, i, opt, refRanges)) {
        if (memo.inlineMarkEnd) {
          marks.push(...createMarks(state, inlines, i, inlinesLength - 1, memo, opt, refRanges, inlineLinkRanges))

          if (inlines[i].len === 0) { i++; continue }
        } else {
          return [n, nest]
        }
      }
      if (inlines[i].len < 1) {
        i++; continue;
      }

      pushMark(marks, {
        nest: nest,
        s: inlines[n].ep,
        e: inlines[n].ep,
        len: 1,
        oLen: inlines[n].len - 1,
        type: 'em_open'
      })
      inlines[n].ep -= 1
      inlines[n].len -= 1

      if (strongPNum % 2 === 0 || inlines[i].len < 2) {
        pushMark(marks, {
          nest: nest,
          s: inlines[i].sp,
          e: inlines[i].sp,
          len: 1,
          oLen: inlines[i].len - 1,
          type: 'em_close'
        })
        inlines[i].sp += 1
      } else {
        pushMark(marks, {
          nest: nest,
          s: inlines[i].ep,
          e: inlines[i].ep,
          len: 1,
          oLen: inlines[i].len - 1,
          type: 'em_close'
        })
        inlines[i].sp = inlines[i].ep - 1
        inlines[i].ep -= 1
      }
      inlines[i].len -= 1
      if (inlines[n].len === 0) return [n, nest]
    }

    i++
  }
  return [n, nest]
}

const setText = (inlines, marks, n, nest) => {
  pushMark(marks, {
    nest: nest,
    s: inlines[n].sp,
    e: inlines[n].ep,
    len: inlines[n].len,
    oLen: -1,
    type: 'text'
  })
  inlines[n].len = 0
}

// Nest state management
const createNestTracker = () => {
  return {
    strongNest: 0,
    emNest: 0,
    markIndex: 0
  }
}

const updateNestTracker = (tracker, marks, targetPos) => {
  while (tracker.markIndex < marks.length && marks[tracker.markIndex].s <= targetPos) {
    const mark = marks[tracker.markIndex]
    if (mark.type === 'strong_open') tracker.strongNest++
    else if (mark.type === 'strong_close') tracker.strongNest--
    else if (mark.type === 'em_open') tracker.emNest++
    else if (mark.type === 'em_close') tracker.emNest--
    tracker.markIndex++
  }
}

const checkNest = (inlines, marks, n, i, nestTracker) => {
  if (marks.length === 0) return 1
  // Update nest state up to current position
  updateNestTracker(nestTracker, marks, inlines[n].s)

  const parentNest = nestTracker.strongNest + nestTracker.emNest
  // Check if there's a conflicting close mark before the end position
  let parentCloseN = nestTracker.markIndex
  while (parentCloseN < marks.length) {
    if (marks[parentCloseN].nest === parentNest) break
    parentCloseN++
  }
  if (parentCloseN < marks.length && marks[parentCloseN].s < inlines[i].s) {
    return -1
  }
  return parentNest + 1
}

const createMarks = (state, inlines, start, end, memo, opt, refRanges, inlineLinkRanges) => {
  let marks = []
  let n = start
  const nestTracker = createNestTracker()
  
  while (n < end) {
    if (inlines[n].type !== '') { n++; continue }
    let nest = 0
    
    if (inlines[n].len > 1) {
      const [newN, newNest] = setStrong(state, inlines, marks, n, memo, opt, nestTracker, refRanges, inlineLinkRanges)
      n = newN
      nest = newNest
    }
    if (inlines[n].len !== 0) {
      const [newN2, newNest2] = setEm(state, inlines, marks, n, memo, opt, null, nestTracker, refRanges, inlineLinkRanges)
      n = newN2
      nest = newNest2
    }
    if (inlines[n].len !== 0) {
      setText(inlines, marks, n, nest)
    }
    n++
  }
  return marks
}

const mergeInlinesAndMarks = (inlines, marks) => {
  // marks array is already sorted, skip sorting
  const merged = []
  let markIndex = 0
  for (const token of inlines) {
    if (token.type === '') {
      while (markIndex < marks.length && marks[markIndex].s >= token.s && marks[markIndex].e <= token.e) {
        merged.push(marks[markIndex])
        markIndex++
      }
    } else {
      merged.push(token)
    }
  }
  while (markIndex < marks.length) {
    merged.push(marks[markIndex++])
  }
  return merged
}

const isWhitespaceToken = (token) => token && token.type === 'text' && token.content.trim() === ''

const strongJa = (state, silent, opt) => {
  if (silent) return false
  const start = state.pos
  let max = state.posMax
  const src = state.src
  let attributesSrc
  if (start > max) return false
  if (src.charCodeAt(start) !== CHAR_ASTERISK) return false
  if (hasBackslash(state, start)) return false

  if (start === 0) {
    state.__strongJaRefRangeCache = null
    state.__strongJaInlineLinkRangeCache = null
    state.__strongJaBackslashCache = undefined
  }

  if (opt.mditAttrs) {
    attributesSrc = src.match(/((\n)? *){([^{}\n!@#%^&*()]+?)} *$/)
    if (attributesSrc && attributesSrc[3] !== '.') {
      max = src.slice(0, attributesSrc.index).length
      if (attributesSrc[2] === '\n') {
        max = src.slice(0, attributesSrc.index - 1).length
      }
      if(hasBackslash(state, attributesSrc.index) && attributesSrc[2] === '' && attributesSrc[1].length === 0) {
        max = state.posMax
      }
    } else {
      let endCurlyKet = src.match(/(\n *){([^{}\n!@#%^&*()]*?)}.*(} *?)$/)
      if (endCurlyKet) {
        max -= endCurlyKet[3].length
      }
    }
  }

  if (state.__strongJaHasCollapsedRefs === undefined) {
    state.__strongJaHasCollapsedRefs = /\[[^\]]*\]\s*\[[^\]]*\]/.test(state.src)
  }

  if (state.__strongJaReferenceCount === undefined) {
    const references = state.env && state.env.references
    state.__strongJaReferenceCount = references ? Object.keys(references).length : 0
  }

  let refRanges
  const refCache = state.__strongJaRefRangeCache
  if (refCache && refCache.max === max && refCache.start <= start) {
    refRanges = refCache.ranges
  } else {
    refRanges = computeReferenceRanges(state, start, max)
    state.__strongJaRefRangeCache = { start, max, ranges: refRanges }
  }
  if (refRanges.length > 0) {
    state.__strongJaHasCollapsedRefs = true
  }

  let inlineLinkRanges = null
  const inlineLinkCandidatePos = state.src.indexOf('](', start)
  const hasInlineLinkCandidate = inlineLinkCandidatePos !== -1 && inlineLinkCandidatePos < max
  if (hasInlineLinkCandidate) {
    const inlineCache = state.__strongJaInlineLinkRangeCache
    if (inlineCache && inlineCache.max === max && inlineCache.start <= start) {
      inlineLinkRanges = inlineCache.ranges
    } else {
      inlineLinkRanges = computeInlineLinkRanges(state, start, max)
      state.__strongJaInlineLinkRangeCache = { start, max, ranges: inlineLinkRanges }
    }
    if (inlineLinkRanges.length > 0) {
      state.__strongJaHasInlineLinks = true
    }
  }
  let inlines = createInlines(state, start, max, opt)

  const memo = {
    html: state.md.options.html,
    htmlTags: {},
    inlineMarkStart: src.charCodeAt(0) === CHAR_ASTERISK,
    inlineMarkEnd: src.charCodeAt(max - 1) === CHAR_ASTERISK,
  }

  let marks = createMarks(state, inlines, 0, inlines.length, memo, opt, refRanges, inlineLinkRanges)

  inlines = mergeInlinesAndMarks(inlines, marks)

  setToken(state, inlines, opt)

  if (inlineLinkRanges && inlineLinkRanges.length > 0) {
    const labelSources = []
    for (let idx = 0; idx < inlineLinkRanges.length; idx++) {
      const range = inlineLinkRanges[idx]
      if (range.kind !== 'label') continue
      labelSources.push(src.slice(range.start + 1, range.end))
    }
    if (labelSources.length > 0) {
      state.tokens.__strongJaInlineLabelSources = labelSources
      state.tokens.__strongJaInlineLabelIndex = 0
    }
  }

  const needsInlineLinkFix = state.__strongJaHasInlineLinks === true
  const needsCollapsedRefFix = state.__strongJaHasCollapsedRefs === true
  if ((needsCollapsedRefFix || needsInlineLinkFix) && !state.__strongJaPostProcessRegistered) {
    registerPostProcessTarget(state)
    state.__strongJaPostProcessRegistered = true
  }

  if (opt.mditAttrs && max !== state.posMax) {
    if (!attributesSrc) {
      state.pos = max
      return true
    }
    state.pos = attributesSrc[1].length > 1 ? max + attributesSrc[1].length : max
    return true
  }
  state.pos = max
  return true
}

// Collapsed reference helpers
const buildReferenceLabel = (tokens) => {
  let label = ''
  for (const token of tokens) {
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
  return label.replace(/^[*_]+/, '').replace(/[*_]+$/, '')
}

const normalizeReferenceCandidate = (state, text, { useClean = false } = {}) => {
  const source = useClean ? cleanLabelText(text) : text.replace(/\s+/g, ' ').trim()
  return normalizeRefKey(state, source)
}

const normalizeRefKey = (state, label) => {
  const normalize = state.md && state.md.utils && state.md.utils.normalizeReference
    ? state.md.utils.normalizeReference
    : (str) => str.trim().replace(/\s+/g, ' ').toUpperCase()
  return normalize(label)
}

const adjustTokenLevels = (tokens, startIdx, endIdx, delta) => {
  for (let i = startIdx; i < endIdx; i++) {
    if (tokens[i]) tokens[i].level += delta
  }
}

const cloneTextToken = (source, content) => {
  const newToken = new Token('text', '', 0)
  newToken.content = content
  newToken.level = source.level
  newToken.markup = source.markup
  newToken.info = source.info
  newToken.meta = source.meta ? {...source.meta} : null
  newToken.block = source.block
  newToken.hidden = source.hidden
  return newToken
}

// Split only text tokens that actually contain bracket characters
const splitBracketToken = (tokens, index, options) => {
  const token = tokens[index]
  if (!token || token.type !== 'text') return false
  const content = token.content
  if (!content || (content.indexOf('[') === -1 && content.indexOf(']') === -1)) {
    return false
  }
  const splitEmptyPair = options && options.splitEmptyPair
  const segments = []
  let buffer = ''
  let pos = 0
  while (pos < content.length) {
    if (!splitEmptyPair && content.startsWith('[]', pos)) {
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
  if (segments.length <= 1) return false
  token.content = segments[0]
  let insertIdx = index + 1
  for (let s = 1; s < segments.length; s++) {
    const newToken = cloneTextToken(token, segments[s])
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
      markup: prevToken.markup
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

const removeGhostLabelText = (tokens, linkCloseToken, labelText) => {
  if (!labelText) return
  const closeIdx = tokens.indexOf(linkCloseToken)
  if (closeIdx === -1) return
  let idx = closeIdx + 1
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

const convertInlineLinks = (tokens, state) => {
  if (!tokens || tokens.length === 0) return
  const labelSources = tokens.__strongJaInlineLabelSources
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
    while (tailIdx < tokens.length) {
      if (splitBracketToken(tokens, tailIdx, INLINE_LINK_BRACKET_SPLIT_OPTIONS)) {
        continue
      }
      const tailToken = tokens[tailIdx]
      if (tailToken.type !== 'text' || !tailToken.content) {
        break
      }
      tailContent += tailToken.content
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
    if (needsPlaceholder && currentLabelSource) {
      removeGhostLabelText(tokens, linkCloseToken, currentLabelSource)
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

    const labelTokens = tokens.slice(i + 1, closeIdx)
    const labelText = buildReferenceLabel(labelTokens)
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
      const refTokens = tokens.slice(refRemoveStart + 1, refCloseIdx)
      if (refTokens.length === 0) {
        refKey = normalizeReferenceCandidate(state, cleanedLabel)
      } else {
        const refLabelText = buildReferenceLabel(refTokens)
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

    const nextIndex = wrapLabelTokensWithLink(tokens, i, i + labelTokens.length - 1, linkOpenToken, linkCloseToken)
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


const mditStrongJa = (md, option) => {
  const opt = {
    dollarMath: true, //inline math $...$
    mditAttrs: true, //markdown-it-attrs
    mdBreaks: md.options.breaks,
    disallowMixed: false, //Non-Japanese text handling
  }
  if (option) Object.assign(opt, option)

  md.inline.ruler.before('emphasis', 'strong_ja', (state, silent) => {
    return strongJa(state, silent, opt)
  })

  md.core.ruler.after('inline', 'strong_ja_postprocess', (state) => {
    const targets = state.env.__strongJaPostProcessTargets
    if (!targets || targets.length === 0) return
    for (const tokens of targets) {
      if (!tokens || !tokens.length) continue
      convertInlineLinks(tokens, state)
      convertCollapsedReferenceLinks(tokens, state)
      mergeBrokenMarksAroundLinks(tokens)
      delete tokens.__strongJaInlineLabelSources
      delete tokens.__strongJaInlineLabelIndex
    }
    delete state.env.__strongJaPostProcessTargets
    delete state.env.__strongJaPostProcessTargetSet
  })
}

export default mditStrongJa
