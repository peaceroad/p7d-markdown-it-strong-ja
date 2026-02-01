import { normalizeReferenceCandidate, restoreLabelWhitespace, convertInlineLinks, convertCollapsedReferenceLinks, mergeBrokenMarksAroundLinks } from './link-utils.js'

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
const CHAR_NEWLINE = 0x0A     // \n
const CHAR_TAB = 0x09        // tab
//const CHAR_OPEN_CURLY = 0x7B // {
const CHAR_CLOSE_CURLY = 0x7D // }

const REG_ATTRS = /{[^{}\n!@#%^&*()]+?}$/
const REG_ASCII_PUNCT = /[!-/:-@[-`{-~]/g
const REG_JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]/u // ひらがな|カタカナ|漢字|CJK句読点・全角形状（絵文字は除外）

const REG_MARKDOWN_HTML = /^\[[^\[\]]+\]\([^)]+\)$|^<([a-zA-Z][a-zA-Z0-9]*)[^>]*>([^<]+<\/\1>)$|^`[^`]+`$|^\$[^$]+\$$/ // for mixed-language context detection

const hasCjkBreaksRule = (md) => {
  if (!md || !md.core || !md.core.ruler || !Array.isArray(md.core.ruler.__rules__)) return false
  if (md.__strongJaHasCjkBreaks === true) return true
  const found = md.core.ruler.__rules__.some((rule) => rule && typeof rule.name === 'string' && rule.name.indexOf('cjk_breaks') !== -1)
  if (found) md.__strongJaHasCjkBreaks = true
  return found
}

const hasBackslash = (state, start) => {
  if (start <= 0) return false
  if (state.__strongJaHasBackslash === false) return false
  if (state.__strongJaHasBackslash === undefined) {
    state.__strongJaHasBackslash = state.src.indexOf('\\') !== -1
    if (!state.__strongJaHasBackslash) return false
  }
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
  let pos = src.indexOf('[', start)
  if (pos === -1 || pos >= max) return []
  const ranges = []
  while (pos !== -1 && pos < max) {
    if (!hasBackslash(state, pos)) {
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
            pos = src.indexOf('[', refClose + 1)
            continue
          }
        }
      }
    }
    pos = src.indexOf('[', pos + 1)
  }
  return ranges
}

const computeInlineLinkRanges = (state, start, max) => {
  const src = state.src
  const ranges = []
  const labelRanges = []
  let pos = src.indexOf('[', start)
  if (pos === -1 || pos >= max) return []
  let rangeId = 0
  while (pos !== -1 && pos < max) {
    if (!hasBackslash(state, pos)) {
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
          pos = src.indexOf('[', destClose + 1)
          continue
        }
      }
      pos = src.indexOf('[', labelClose + 1)
      continue
    }
    pos = src.indexOf('[', pos + 1)
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
  const useCache = ranges.length > 32
  const cache = useCache ? getInlineRangeCacheMap(ranges, kind, false) : null
  if (cache && cache.has(pos)) return cache.get(pos)
  const first = ranges[0]
  const last = ranges[ranges.length - 1]
  if (pos < first.start || pos > last.end) {
    if (useCache) {
      const storeCache = getInlineRangeCacheMap(ranges, kind, true)
      storeCache.set(pos, null)
    }
    return null
  }
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
  if (useCache) {
    const storeCache = getInlineRangeCacheMap(ranges, kind, true)
    storeCache.set(pos, found)
  }
  return found
}

const copyInlineTokenFields = (dest, src) => {
  Object.assign(dest, src)
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

const hasMditAttrs = (state) => {
  if (state.__strongJaHasAttrs !== undefined) return state.__strongJaHasAttrs
  const rules = state.md && state.md.core && state.md.core.ruler && state.md.core.ruler.__rules__
  if (!rules || !Array.isArray(rules)) {
    state.__strongJaHasAttrs = false
    return false
  }
  for (let i = 0; i < rules.length; i++) {
    if (rules[i].name === 'curly_attributes') {
      state.__strongJaHasAttrs = true
      return true
    }
  }
  state.__strongJaHasAttrs = false
  return false
}

const isAllAsterisks = (content) => {
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) !== CHAR_ASTERISK) return false
  }
  return true
}

function isPlainTextContent(content) {
  for (let idx = 0; idx < content.length; idx++) {
    const code = content.charCodeAt(idx)
    if (code === CHAR_BACKSLASH || code === CHAR_NEWLINE || code === CHAR_TAB) {
      return false
    }
    if (code === CHAR_BACKTICK || code === CHAR_DOLLAR || code === CHAR_LT || code === CHAR_GT) {
      return false
    }
    if (code === CHAR_OPEN_BRACKET || code === CHAR_CLOSE_BRACKET || code === CHAR_OPEN_PAREN || code === CHAR_CLOSE_PAREN) {
      return false
    }
    if (code === 0x5E || code === 0x7E) {
      return false
    }
  }
  return true
}

// Cache newline positions for lightweight map generation
const getLineOffsets = (state) => {
  if (state.__strongJaLineOffsets) return state.__strongJaLineOffsets
  const offsets = []
  const src = state.src || ''
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === CHAR_NEWLINE) offsets.push(i)
  }
  state.__strongJaLineOffsets = offsets
  return offsets
}

const createLineMapper = (state) => {
  const offsets = getLineOffsets(state)
  let idx = 0
  const maxIdx = offsets.length
  return (startPos, endPos) => {
    const start = startPos === undefined || startPos === null ? 0 : startPos
    const end = endPos === undefined || endPos === null ? start : endPos
    while (idx < maxIdx && offsets[idx] < start) idx++
    const startLine = idx
    let endIdx = idx
    while (endIdx < maxIdx && offsets[endIdx] < end) endIdx++
    return [startLine, endIdx]
  }
}

const setToken = (state, inlines, opt, attrsEnabled) => {
  const src = state.src
  const mapFromPos = createLineMapper(state)
  let i = 0
  let lastTextToken = null
  while (i < inlines.length) {
    let type = inlines[i].type
    let tag = ''
    let isOpen = false
    let isClose = false
    if (type.length > 5 && type.endsWith('_open')) {
      isOpen = true
      tag = type.slice(0, -5)
    } else if (type.length > 6 && type.endsWith('_close')) {
      isClose = true
      tag = type.slice(0, -6)
    }

    if (isOpen) {
      const startToken = state.push(type, tag, 1)
      startToken.markup = tag === 'strong' ? '**' : '*'
      startToken.map = mapFromPos(inlines[i].s, inlines[i].e)
    }

    if (type === 'html_inline') {
      const content = src.slice(inlines[i].s, inlines[i].e + 1)
      if (lastTextToken && inlines[i].s > 0) {
        const prevChar = src.charAt(inlines[i].s - 1)
        if (prevChar === ' ' || prevChar === '\t') {
          if (!lastTextToken.content.endsWith(prevChar)) {
            lastTextToken.content += prevChar
          }
        }
      }
      const htmlToken = state.push('html_inline', '', 0)
      htmlToken.content = content
      htmlToken.map = mapFromPos(inlines[i].s, inlines[i].e)
      i++
      continue
    }
    if (type === 'text') {
      let content = src.slice(inlines[i].s, inlines[i].e + 1)
      if (content.length > 0 && content.charCodeAt(0) === CHAR_ASTERISK) {
        if (isAllAsterisks(content)) {
          const asteriskToken = state.push(type, '', 0)
          asteriskToken.content = content
          asteriskToken.map = mapFromPos(inlines[i].s, inlines[i].e)
          i++
          continue
        }
      }
      const attrMatch = attrsEnabled && content.length > 0 && content.charCodeAt(content.length - 1) === CHAR_CLOSE_CURLY && REG_ATTRS.test(content)
        ? content.match(/^(.*?)(\s+{[^{}\n!@#%^&*()]+?})$/)
        : null
      if (attrMatch) {
        const textPart = attrMatch[1] ? attrMatch[1].replace(/[ \t]+$/, '') : ''
        const attrPart = attrMatch[2]
        if (textPart && textPart.length > 0) {
          const textToken = state.push(type, '', 0)
          textToken.content = textPart
          textToken.map = mapFromPos(inlines[i].s, inlines[i].s + textPart.length)
          lastTextToken = textToken
        }
        const attrsToken = state.push(type, '', 0)
        let attrsContent = attrPart.replace(/^\s+/, '')
        if (attrsContent.indexOf('\\') !== -1) {
          const hasBackslashBeforeCurlyAttribute = attrsContent.match(/(\\+){/)
          if (hasBackslashBeforeCurlyAttribute) {
            if (hasBackslashBeforeCurlyAttribute[1].length === 1) {
              attrsContent = attrsContent.replace(/\\{/, '{')
            } else {
              let backSlashNum = Math.floor(hasBackslashBeforeCurlyAttribute[1].length / 2)
              let k = 0
              let backSlash = ''
              while (k < backSlashNum) {
                backSlash +=  '\\'
                k++
              }
              attrsContent = attrsContent.replace(/\\+{/, backSlash + '{')
            }
          }
        }
        attrsToken.content = attrsContent
        attrsToken.map = mapFromPos(inlines[i].s + content.length - attrPart.length, inlines[i].e)
        i++
        continue
      }
      if (isPlainTextContent(content)) {
        const textToken = state.push(type, '', 0)
        textToken.content = content
        textToken.map = mapFromPos(inlines[i].s, inlines[i].e)
        lastTextToken = textToken
        i++
        continue
      }

      const hasOnlySimpleNewline = attrsEnabled && (content.indexOf('{') !== -1 || content.indexOf('}') !== -1) &&
        content.indexOf('\n') !== -1 &&
        content.indexOf('`') === -1 &&
        content.indexOf('$') === -1 &&
        content.indexOf('<') === -1 &&
        content.indexOf('>') === -1 &&
        content.indexOf('[') === -1 &&
        content.indexOf(']') === -1 &&
        content.indexOf('(') === -1 &&
        content.indexOf(')') === -1 &&
        content.indexOf('^') === -1 &&
        content.indexOf('~') === -1 &&
        content.indexOf('\\') === -1

      if (hasOnlySimpleNewline) {
        const textToken = state.push(type, '', 0)
        textToken.content = content
        textToken.map = mapFromPos(inlines[i].s, inlines[i].e)
        lastTextToken = textToken
        i++
        continue
      }

      const childTokens = []
      state.md.inline.parse(content, state.md, state.env, childTokens)
      let j = 0
      while (j < childTokens.length) {
        const t = childTokens[j]
        if (t.type === 'softbreak' && !opt.mdBreaks) {
          const hasCjk = opt.hasCjkBreaks === true
          if (hasCjk) {
            const prevToken = childTokens[j - 1]
            const nextToken = childTokens[j + 1]
            const prevChar = prevToken && prevToken.content ? prevToken.content.slice(-1) : ''
            const nextChar = nextToken && nextToken.content ? nextToken.content.charAt(0) : ''
            const isAsciiWord = nextChar >= '0' && nextChar <= 'z' && /[A-Za-z0-9]/.test(nextChar)
            if (isAsciiWord && isJapanese(prevChar) && !isJapanese(nextChar)) {
              t.type = 'text'
              t.tag = ''
              t.content = ' '
            }
          }
        }
        if (!attrsEnabled && t.tag === 'br') {
          t.tag = ''
          t.content = '\n'
        }
        const token = state.push(t.type, t.tag, t.nesting)
        copyInlineTokenFields(token, t)
        if (t.type === 'text') {
          lastTextToken = token
        }
        j++
      }
    }

    if (isClose) {
      const closeToken = state.push(type, tag, -1)
      closeToken.markup = tag === 'strong' ? '**' : '*'
      closeToken.map = mapFromPos(inlines[i].s, inlines[i].e)
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
    check: false
  }
  if (tag) inline.tag = [tag, tagType]
  inlines.push(inline)
}

const findNextAsciiPunctuation = (src, start, max) => {
  REG_ASCII_PUNCT.lastIndex = start
  const match = REG_ASCII_PUNCT.exec(src)
  if (!match || match.index >= max) return -1
  return match.index
}

const findNextSymbolPos = (state, n, max, symbol, symbolChar) => {
  const src = state.src
  if (src.charCodeAt(n) !== symbol || hasBackslash(state, n)) return -1
  let i = src.indexOf(symbolChar, n + 1)
  while (i !== -1 && i < max) {
    if (!hasBackslash(state, i)) return i
    i = src.indexOf(symbolChar, i + 1)
  }
  return -1
}

const processSymbolPair = (state, n, srcLen, symbol, symbolChar, hasText, textStart, pushInlines) => {
  const nextSymbolPos = findNextSymbolPos(state, n, srcLen, symbol, symbolChar)
  if (nextSymbolPos === -1) {
    return { shouldBreak: false, shouldContinue: false, newN: n, hasText: hasText }
  }
  if (nextSymbolPos === srcLen - 1) {
    pushInlines(textStart, nextSymbolPos, nextSymbolPos - textStart + 1, 'text')
    return { shouldBreak: true, newN: nextSymbolPos + 1, hasText: true }
  }
  return { shouldBreak: false, shouldContinue: true, newN: nextSymbolPos + 1, hasText: true }
}

const processTextSegment = (inlines, textStart, n, hasText) => {
  if (n !== 0 && hasText) {
    pushInlines(inlines, textStart, n - 1, n - textStart, 'text')
    return false
  }
  return hasText
}

const createInlines = (state, start, max, opt) => {
  const src = state.src
  const srcLen = max
  const htmlEnabled = state.md.options.html
  const dollarMath = opt.dollarMath
  let n = start
  let inlines = []
  let hasText = false
  let textStart = n
  
  while (n < srcLen) {
    let currentChar = src.charCodeAt(n)

    if (!isAsciiPunctuationCode(currentChar)) {
      const nextPunc = findNextAsciiPunctuation(src, n, srcLen)
      if (nextPunc === -1) {
        if (textStart < srcLen) {
          pushInlines(inlines, textStart, srcLen - 1, srcLen - textStart, 'text')
        }
        break
      }
      if (nextPunc > n) {
        hasText = true
        n = nextPunc
        currentChar = src.charCodeAt(n)
      }
    }
    
    // Unified escape check
    let isEscaped = false
    if (currentChar === CHAR_ASTERISK || currentChar === CHAR_BACKTICK || 
        (dollarMath && currentChar === CHAR_DOLLAR) || 
        (htmlEnabled && currentChar === CHAR_LT)) {
      isEscaped = hasBackslash(state, n)
    }

    // Asterisk handling
    if (currentChar === CHAR_ASTERISK) {
      if (!isEscaped) {
        hasText = processTextSegment(inlines, textStart, n, hasText)
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
          hasText = false
        }
        n = i
        continue
      }
    }

    // Inline code (backticks)
    if (currentChar === CHAR_BACKTICK) {
      if (!isEscaped) {
        const result = processSymbolPair(state, n, srcLen, CHAR_BACKTICK, '`', hasText, textStart,
          (start, end, len, type) => pushInlines(inlines, start, end, len, type))
        if (result.shouldBreak) break
        if (result.shouldContinue) {
          n = result.newN
          hasText = result.hasText
          continue
        }
        hasText = result.hasText
      }
    }

    // Inline math ($...$)
    if (dollarMath && currentChar === CHAR_DOLLAR) {
      if (!isEscaped) {
        const result = processSymbolPair(state, n, srcLen, CHAR_DOLLAR, '$', hasText, textStart,
          (start, end, len, type) => pushInlines(inlines, start, end, len, type))
        if (result.shouldBreak) break
        if (result.shouldContinue) {
          n = result.newN
          hasText = result.hasText
          continue
        }
        hasText = result.hasText
      }
    }

    // HTML tags
    if (htmlEnabled && currentChar === CHAR_LT) {
      if (!isEscaped) {
        const guardHtml = srcLen - n > 8192
        const maxScanEnd = guardHtml ? Math.min(srcLen, n + 8192) : srcLen
        let foundClosingTag = false
        let i = n + 1
        while (i < srcLen) {
          i = src.indexOf('>', i)
          if (i === -1 || i >= maxScanEnd) break
          if (!hasBackslash(state, i)) {
            hasText = processTextSegment(inlines, textStart, n, hasText)
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
            hasText = false
            n = i + 1
            foundClosingTag = true
            break
          }
          i += 1
        }
        if (foundClosingTag) {
          continue
        }
        // If no closing tag found, treat as regular character to prevent infinite loops
      }
    }

    // Regular character
    hasText = true
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
  if (marks.length === 0 || marks[marks.length - 1].s <= newMark.s) {
    marks.push(newMark)
    return
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
  const hasInlineLinkRanges = inlineLinkRanges && inlineLinkRanges.length > 0
  const hasRefRanges = refRanges && refRanges.length > 0
  const inlinesLength = inlines.length
  const leadingCompat = opt.leadingAsterisk === false
  const conservativePunctuation = opt.disallowMixed === true
  if (opt.disallowMixed === true) {
    let i = n + 1
    while (i < inlinesLength) {
      if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
      if (inlines[i].type !== '') { i++; continue }
      
      if (inlines[i].len > 1) {
        if (shouldBlockMixedLanguage(state, inlines, n, i)) {
          return [n, 0]
        }
        break
      }
      i++
    }
  }
  
  const strongOpenRange = hasRefRanges ? findRefRangeIndex(inlines[n].s, refRanges) : -1
  const openLinkRange = hasInlineLinkRanges ? findInlineLinkRange(inlines[n].s, inlineLinkRanges) : null
  let i = n + 1
  let j = 0
  let nest = 0
  while (i < inlinesLength) {
    if (inlines[i].type !== '') { i++; continue }
    if (inlines[i].len === 0 || inlines[i].check) { i++; continue }

    if (hasInlineLinkRanges &&
        hasInlineLinkLabelCrossing(inlineLinkRanges, inlines[n].ep + 1, inlines[i].sp)) {
      i++
      continue
    }

    const closeRange = hasRefRanges ? findRefRangeIndex(inlines[i].s, refRanges) : -1
    if (strongOpenRange !== closeRange) { i++; continue }

    const closeLinkRange = hasInlineLinkRanges ? findInlineLinkRange(inlines[i].s, inlineLinkRanges) : null
    if (openLinkRange || closeLinkRange) {
      if (!openLinkRange || !closeLinkRange || openLinkRange.id !== closeLinkRange.id || openLinkRange.kind !== closeLinkRange.kind) {
        i++
        continue
      }
    }

    if (state.md && state.md.options && state.md.options.html && hasCodeTagInside(state, inlines, n, i)) {
      return [n, nest]
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
      const [newN, newNest] = setEm(state, inlines, marks, n, memo, opt, null, nestTracker, refRanges, inlineLinkRanges)
      n = newN
      nest = newNest
    }
    let strongNum = Math.trunc(Math.min(inlines[n].len, inlines[i].len) / 2)

    if (inlines[i].len > 1) {
      const hasJapaneseContext = isJapanese(state.src[inlines[n].s - 1] || '') || isJapanese(state.src[inlines[i].e + 1] || '')
      const needsPunctuationCheck = (conservativePunctuation && !hasJapaneseContext) || hasHtmlLikePunctuation(state, inlines, n, i) || hasAngleBracketInside(state, inlines, n, i)
      if (needsPunctuationCheck && hasPunctuationOrNonJapanese(state, inlines, n, i, opt, refRanges, hasRefRanges)) {
        if (leadingCompat) {
          return [n, nest]
        }
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
  const tagType = inlines[i].tag[1]
  if (tagType === 'open') {
    memo.htmlTags[tagName] += 1
    memo.htmlTagDepth += 1
  }
  if (tagType === 'close') {
    memo.htmlTags[tagName] -= 1
    memo.htmlTagDepth -= 1
  }
  if (memo.htmlTags[tagName] < 0 || memo.htmlTagDepth < 0) {
    return -1
  }
  return memo.htmlTagDepth === 0 ? 1 : 0
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

const isAsciiPunctuationCode = (code) => {
  if (code < 33 || code > 126) return false
  return (code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123)
}

const isUnicodePunctuation = (ch) => {
  if (!ch) return false
  return /\p{P}/u.test(ch)
}

// Check if character is Japanese (hiragana, katakana, kanji, CJK punctuation/fullwidth)
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

const hasJapaneseText = (str) => {
  if (!str) return false
  return REG_JAPANESE.test(str)
}

const resolveLeadingAsterisk = (state, opt, start, max) => {
  const modeRaw = opt.mode || 'japanese-only'
  const mode = typeof modeRaw === 'string' ? modeRaw.toLowerCase() : 'japanese-only'
  if (mode === 'aggressive') return true
  if (mode === 'compatible') return false
  let hasJapanese = state.__strongJaHasJapanese
  if (hasJapanese === undefined) {
    hasJapanese = hasJapaneseText(state.src.slice(0, max))
    state.__strongJaHasJapanese = hasJapanese
  }
  if (opt.disallowMixed === true) return hasJapanese

  return hasJapanese
}

// Check if character is English (letters, numbers) or other non-Japanese characters
// Uses REG_JAPANESE to exclude Japanese characters
const isEnglish = (ch) => {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
    return true
  }
  if (code < 128) {
    return code === CHAR_SPACE || (code > 126)
  }
  return !REG_JAPANESE.test(ch)
}

const shouldBlockMixedLanguage = (state, inlines, n, i) => {
  const src = state.src
  const openPrevChar = src[inlines[n].s - 1] || ''
  const closeNextChar = src[inlines[i].e + 1] || ''
  
  const isEnglishPrefix = isEnglish(openPrevChar)
  const isEnglishSuffix = isEnglish(closeNextChar)
  if (!isEnglishPrefix && !isEnglishSuffix) {
    return false
  }
  return hasMarkdownHtmlPattern(src, inlines[n].e + 1, inlines[i].s)
}

const hasPunctuationOrNonJapanese = (state, inlines, n, i, opt, refRanges, hasRefRanges) => {
  const src = state.src
  const openPrevChar = src[inlines[n].s - 1] || ''
  const openNextChar = src[inlines[n].e + 1]  || ''
  let checkOpenNextChar = isPunctuation(openNextChar)
  if (!checkOpenNextChar && opt.leadingAsterisk === false && isUnicodePunctuation(openNextChar)) {
    checkOpenNextChar = true
  }
  if (hasRefRanges && checkOpenNextChar && (openNextChar === '[' || openNextChar === ']')) {
    const openNextRange = findRefRangeIndex(inlines[n].e + 1, refRanges)
    if (openNextRange !== -1) {
      checkOpenNextChar = false
    }
  }
  const closePrevChar = src[inlines[i].s - 1] || ''
  let checkClosePrevChar = isPunctuation(closePrevChar)
  if (!checkClosePrevChar && opt.leadingAsterisk === false && isUnicodePunctuation(closePrevChar)) {
    checkClosePrevChar = true
  }
  if (hasRefRanges && checkClosePrevChar && (closePrevChar === '[' || closePrevChar === ']')) {
    const closePrevRange = findRefRangeIndex(inlines[i].s - 1, refRanges)
    if (closePrevRange !== -1) {
      checkClosePrevChar = false
    }
  }
  const closeNextChar = src[inlines[i].e + 1] || ''
  const isLastInline = i === inlines.length - 1
  let checkCloseNextChar = isLastInline || isPunctuation(closeNextChar) || closeNextChar === '\n'
  if (!checkCloseNextChar && opt.leadingAsterisk === false && isUnicodePunctuation(closeNextChar)) {
    checkCloseNextChar = true
  }

  if (opt.disallowMixed === false) {
    if (isEnglish(openPrevChar) || isEnglish(closeNextChar)) {
      if (hasMarkdownHtmlPattern(src, inlines[n].e + 1, inlines[i].s)) {
        return false
      }
    }
  }

  const result = (checkOpenNextChar || checkClosePrevChar) && !checkCloseNextChar && !(isJapanese(openPrevChar) || isJapanese(closeNextChar))
  return result
}

const hasHtmlLikePunctuation = (state, inlines, n, i) => {
  const src = state.src
  const chars = [
    src[inlines[n].e + 1] || '',
    src[inlines[i].s - 1] || '',
    src[inlines[i].e + 1] || ''
  ]
  for (let idx = 0; idx < chars.length; idx++) {
    const ch = chars[idx]
    if (ch === '<' || ch === '>') return true
  }
  return false
}

const hasAngleBracketInside = (state, inlines, n, i) => {
  const src = state.src
  const start = inlines[n].s
  const end = inlines[i].e
  const ltPos = src.indexOf('<', start)
  if (ltPos !== -1 && ltPos <= end) return true
  const gtPos = src.indexOf('>', start)
  return gtPos !== -1 && gtPos <= end
}

const hasCodeTagInside = (state, inlines, n, i) => {
  const src = state.src
  const start = inlines[n].s
  const end = inlines[i].e
  const codeOpen = src.indexOf('<code', start)
  if (codeOpen !== -1 && codeOpen <= end) return true
  const codeClose = src.indexOf('</code', start)
  if (codeClose !== -1 && codeClose <= end) return true
  const preOpen = src.indexOf('<pre', start)
  if (preOpen !== -1 && preOpen <= end) return true
  const preClose = src.indexOf('</pre', start)
  return preClose !== -1 && preClose <= end
}

const setEm = (state, inlines, marks, n, memo, opt, sNest, nestTracker, refRanges, inlineLinkRanges) => {
  const hasInlineLinkRanges = inlineLinkRanges && inlineLinkRanges.length > 0
  const hasRefRanges = refRanges && refRanges.length > 0
  const inlinesLength = inlines.length
  const emOpenRange = hasRefRanges ? findRefRangeIndex(inlines[n].s, refRanges) : -1
  const openLinkRange = hasInlineLinkRanges ? findInlineLinkRange(inlines[n].s, inlineLinkRanges) : null
  const leadingCompat = opt.leadingAsterisk === false
  const conservativePunctuation = leadingCompat || opt.disallowMixed === true
  if (opt.disallowMixed === true && !sNest) {
    let i = n + 1
    while (i < inlinesLength) {
      if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
      if (inlines[i].type !== '') { i++; continue }
      
      if (inlines[i].len > 0) {
        if (shouldBlockMixedLanguage(state, inlines, n, i)) {
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
  while (i < inlinesLength) {
    if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
    if (!sNest && inlines[i].type === 'html_inline') {
      inlines[i].check = true
      insideTagsIsClose = checkInsideTags(inlines, i, memo)
      if (insideTagsIsClose === -1) return [n, nest]
      if (insideTagsIsClose === 0) { i++; continue }
    }
    if (inlines[i].type !== '') { i++; continue }

    if (hasInlineLinkRanges &&
        hasInlineLinkLabelCrossing(inlineLinkRanges, inlines[n].ep + 1, inlines[i].sp)) {
      i++
      continue
    }

    const closeRange = hasRefRanges ? findRefRangeIndex(inlines[i].s, refRanges) : -1
    if (emOpenRange !== closeRange) {
      i++
      continue
    }

    const closeLinkRange = hasInlineLinkRanges ? findInlineLinkRange(inlines[i].s, inlineLinkRanges) : null
    if (openLinkRange || closeLinkRange) {
      if (!openLinkRange || !closeLinkRange || openLinkRange.id !== closeLinkRange.id || openLinkRange.kind !== closeLinkRange.kind) {
        i++
        continue
      }
    }

    if (state.md && state.md.options && state.md.options.html && hasCodeTagInside(state, inlines, n, i)) {
      return [n, nest]
    }

    const emNum = Math.min(inlines[n].len, inlines[i].len)

    if (!sNest && emNum !== 1) return [n, sNest, memo]

    const isMarkerAtStartAndEnd = memo.inlineMarkStart &&
      i === inlinesLength - 1 &&
      inlines[i].len > 1
    if (!sNest && inlines[i].len === 2 && !isMarkerAtStartAndEnd) {
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
      const needsPunctuationCheckClose = conservativePunctuation || hasHtmlLikePunctuation(state, inlines, n, i) || hasAngleBracketInside(state, inlines, n, i)
      if (needsPunctuationCheckClose && hasPunctuationOrNonJapanese(state, inlines, n, i, opt, refRanges, hasRefRanges)) {
        if (leadingCompat) {
          return [n, nest]
        }
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

const hasMarkdownHtmlPattern = (src, start, end) => {
  if (start >= end) return false
  const first = src.charCodeAt(start)
  const last = src.charCodeAt(end - 1)
  if (first === CHAR_OPEN_BRACKET) {
    if (last !== CHAR_CLOSE_PAREN) return false
  } else if (first === CHAR_LT) {
    if (last !== CHAR_GT) return false
  } else if (first === CHAR_BACKTICK) {
    if (last !== CHAR_BACKTICK) return false
  } else if (first === CHAR_DOLLAR) {
    if (last !== CHAR_DOLLAR) return false
  } else {
    return false
  }
  return REG_MARKDOWN_HTML.test(src.slice(start, end))
}

const strongJa = (state, silent, opt) => {
  if (silent) return false
  const start = state.pos
  let max = state.posMax
  const originalMax = max
  const src = state.src
  let attributesSrc
  if (start > max) return false
  if (src.charCodeAt(start) !== CHAR_ASTERISK) return false
  if (hasBackslash(state, start)) return false

  const attrsEnabled = opt.mditAttrs && hasMditAttrs(state)
  if (opt.hasCjkBreaks !== true && state.md) {
    opt.hasCjkBreaks = hasCjkBreaksRule(state.md)
  }

  const leadingAsterisk = resolveLeadingAsterisk(state, opt, start, originalMax)

  if (leadingAsterisk === false) {
    return false
  }

  const runtimeOpt = leadingAsterisk === opt.leadingAsterisk
    ? opt
    : { ...opt, leadingAsterisk }

  if (start === 0) {
    state.__strongJaRefRangeCache = null
    state.__strongJaInlineLinkRangeCache = null
    state.__strongJaBackslashCache = undefined
    state.__strongJaHasBackslash = undefined
  }

  if (attrsEnabled) {
    let attrCandidate = false
    let probe = originalMax - 1
    while (probe >= start) {
      const code = src.charCodeAt(probe)
      if (code === CHAR_CLOSE_CURLY) {
        attrCandidate = true
        break
      }
      if (code === CHAR_SPACE || code === CHAR_TAB || code === CHAR_NEWLINE) {
        probe--
        continue
      }
      break
    }

    if (attrCandidate) {
      const attrScanTarget = originalMax === src.length ? src : src.slice(0, originalMax)
      attributesSrc = attrScanTarget.match(/((\n)? *){([^{}\n!@#%^&*()]+?)} *$/)
      if (attributesSrc && attributesSrc[3] !== '.') {
        max = attrScanTarget.slice(0, attributesSrc.index).length
        if (attributesSrc[2] === '\n') {
          max = attrScanTarget.slice(0, attributesSrc.index - 1).length
        }
        if (hasBackslash(state, attributesSrc.index) && attributesSrc[2] === '' && attributesSrc[1].length === 0) {
          max = state.posMax
        }
      } else {
        const endCurlyKet = attrScanTarget.match(/(\n *){([^{}\n!@#%^&*()]*?)}.*(} *?)$/)
        if (endCurlyKet) {
          max -= endCurlyKet[3].length
        }
      }
    }
  }

  if (state.__strongJaHasCollapsedRefs === undefined) {
    state.__strongJaHasCollapsedRefs = src.indexOf('[') !== -1 &&
      /\[[^\]]*\]\s*\[[^\]]*\]/.test(src)
  }

  if (state.__strongJaReferenceCount === undefined) {
    const references = state.env && state.env.references
    state.__strongJaReferenceCount = references ? Object.keys(references).length : 0
  }

  let refRanges = []
  const hasReferenceDefinitions = state.__strongJaReferenceCount > 0
  const refScanStart = 0
  if (hasReferenceDefinitions) {
    const firstRefBracket = state.src.indexOf('[', refScanStart)
    if (firstRefBracket !== -1 && firstRefBracket < max) {
      const refCache = state.__strongJaRefRangeCache
      if (refCache && refCache.max === max && refCache.start === refScanStart) {
        refRanges = refCache.ranges
      } else {
        refRanges = computeReferenceRanges(state, refScanStart, max)
        state.__strongJaRefRangeCache = { start: refScanStart, max, ranges: refRanges }
      }
      if (refRanges.length > 0) {
        state.__strongJaHasCollapsedRefs = true
      }
    }
  }

  let inlineLinkRanges = null
  const inlineLinkScanStart = 0
  const inlineLinkCandidatePos = state.src.indexOf('](', inlineLinkScanStart)
  const hasInlineLinkCandidate = inlineLinkCandidatePos !== -1 && inlineLinkCandidatePos < max
  if (hasInlineLinkCandidate) {
    const inlineCache = state.__strongJaInlineLinkRangeCache
    if (inlineCache && inlineCache.max === max && inlineCache.start === inlineLinkScanStart) {
      inlineLinkRanges = inlineCache.ranges
    } else {
      inlineLinkRanges = computeInlineLinkRanges(state, inlineLinkScanStart, max)
      state.__strongJaInlineLinkRangeCache = { start: inlineLinkScanStart, max, ranges: inlineLinkRanges }
    }
    if (inlineLinkRanges.length > 0) {
      state.__strongJaHasInlineLinks = true
    }
  }
  let inlines = createInlines(state, start, max, runtimeOpt)

  const memo = {
    html: state.md.options.html,
    htmlTags: {},
    htmlTagDepth: 0,
    inlineMarkStart: src.charCodeAt(0) === CHAR_ASTERISK,
    inlineMarkEnd: src.charCodeAt(max - 1) === CHAR_ASTERISK,
  }

  let marks = createMarks(state, inlines, 0, inlines.length, memo, runtimeOpt, refRanges, inlineLinkRanges)

  inlines = mergeInlinesAndMarks(inlines, marks)

  setToken(state, inlines, runtimeOpt, attrsEnabled)

  if (opt.postprocess !== false && inlineLinkRanges && inlineLinkRanges.length > 0) {
    const labelSources = []
    for (let idx = 0; idx < inlineLinkRanges.length; idx++) {
      const range = inlineLinkRanges[idx]
      if (range.kind !== 'label') continue
      labelSources.push(src.slice(range.start + 1, range.end))
    }
    if (labelSources.length > 0) {
      restoreLabelWhitespace(state.tokens, labelSources)
      state.tokens.__strongJaInlineLabelSources = labelSources
      state.tokens.__strongJaInlineLabelIndex = 0
      if (state.env) {
        if (!state.env.__strongJaInlineLabelSourceList) {
          state.env.__strongJaInlineLabelSourceList = []
        }
        state.env.__strongJaInlineLabelSourceList.push(labelSources)
      }
    }
  }

  if (opt.postprocess !== false) {
    const needsInlineLinkFix = state.__strongJaHasInlineLinks === true
    const needsCollapsedRefFix = state.__strongJaHasCollapsedRefs === true
    if ((needsCollapsedRefFix || needsInlineLinkFix) && !state.__strongJaPostProcessRegistered) {
      registerPostProcessTarget(state)
      state.__strongJaPostProcessRegistered = true
    }
  }

  if (attrsEnabled && max !== state.posMax) {
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

const mditStrongJa = (md, option) => {
  const opt = {
    dollarMath: true, //inline math $...$
    mditAttrs: true, //markdown-it-attrs
    mdBreaks: md.options.breaks,
    disallowMixed: false, //Non-Japanese text handling
    mode: 'japanese-only', // 'japanese-only' | 'aggressive' | 'compatible'
    coreRulesBeforePostprocess: [], // e.g. ['cjk_breaks'] when CJK line-break plugins are active
    postprocess: true, // enable link/ref reconstruction and link mark cleanup
    patchCorePush: true // allow patching core.ruler.push to track late cjk_breaks
  }
  if (option) Object.assign(opt, option)
  opt.hasCjkBreaks = hasCjkBreaksRule(md)
  const rawCoreRules = opt.coreRulesBeforePostprocess
  const hasCoreRuleConfig = Array.isArray(rawCoreRules)
    ? rawCoreRules.length > 0
    : !!rawCoreRules
  const coreRulesBeforePostprocess = hasCoreRuleConfig
    ? normalizeCoreRulesBeforePostprocess(rawCoreRules)
    : []

  md.inline.ruler.before('emphasis', 'strong_ja', (state, silent) => {
    return strongJa(state, silent, opt)
  })

  // Trim trailing spaces that remain after markdown-it-attrs strips `{...}`
  // Trim trailing spaces only at the very end of inline content (after attrs/core rules have run).
  const trimInlineTrailingSpaces = (state) => {
    if (!state || !state.tokens) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) continue
      let idx = token.children.length - 1
      while (idx >= 0 && (!token.children[idx] || (token.children[idx].type === 'text' && token.children[idx].content === ''))) {
        idx--
      }
      if (idx < 0) continue
      const tail = token.children[idx]
      if (!tail || tail.type !== 'text' || !tail.content) continue
      const trimmed = tail.content.replace(/[ \t]+$/, '')
      if (trimmed !== tail.content) {
        tail.content = trimmed
      }
    }
  }
  const hasTextJoinRule = Array.isArray(md.core?.ruler?.__rules__)
    ? md.core.ruler.__rules__.some((rule) => rule && rule.name === 'text_join')
    : false
  if (hasTextJoinRule) {
    md.core.ruler.after('text_join', 'strong_ja_trim_trailing_spaces', trimInlineTrailingSpaces)
  } else {
    md.core.ruler.after('inline', 'strong_ja_trim_trailing_spaces', trimInlineTrailingSpaces)
  }

  const normalizeSoftbreakSpacing = (state) => {
    if (!state) return
    if (opt.hasCjkBreaks !== true && state.md) {
      opt.hasCjkBreaks = hasCjkBreaksRule(state.md)
    }
    if (opt.hasCjkBreaks !== true) return
    if (!state.tokens || state.tokens.length === 0) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) continue
      for (let j = 0; j < token.children.length; j++) {
        const child = token.children[j]
        if (!child || child.type !== 'text' || !child.content) continue
        if (child.content.indexOf('\n') === -1) continue
        let normalized = ''
        for (let idx = 0; idx < child.content.length; idx++) {
          const ch = child.content[idx]
          if (ch === '\n') {
            const prevChar = idx > 0 ? child.content[idx - 1] : ''
            const nextChar = idx + 1 < child.content.length ? child.content[idx + 1] : ''
            const isAsciiWord = nextChar && nextChar >= '0' && nextChar <= 'z' && /[A-Za-z0-9]/.test(nextChar)
            const shouldReplace = isAsciiWord && nextChar !== '{' && nextChar !== '\\' && isJapanese(prevChar) && !isJapanese(nextChar)
            if (shouldReplace) {
              normalized += ' '
              continue
            }
          }
          normalized += ch
        }
        if (normalized !== child.content) {
          child.content = normalized
        }
      }
    }
  }
  if (hasTextJoinRule) {
    md.core.ruler.after('text_join', 'strong_ja_softbreak_spacing', normalizeSoftbreakSpacing)
  } else {
    md.core.ruler.after('inline', 'strong_ja_softbreak_spacing', normalizeSoftbreakSpacing)
  }

  const restoreSoftbreaksAfterCjk = (state) => {
    if (!state) return
    if (!state.md || state.md.__strongJaRestoreSoftbreaksForAttrs !== true) return
    if (opt.hasCjkBreaks !== true && state.md) {
      opt.hasCjkBreaks = hasCjkBreaksRule(state.md)
    }
    if (opt.hasCjkBreaks !== true) return
    if (!state.tokens || state.tokens.length === 0) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) continue
      const children = token.children
      for (let j = 0; j < children.length; j++) {
        const child = children[j]
        if (!child || child.type !== 'text' || child.content !== '') continue
        // Find previous non-empty text content to inspect the trailing character.
        let prevChar = ''
        for (let k = j - 1; k >= 0; k--) {
          const prev = children[k]
          if (prev && prev.type === 'text' && prev.content) {
            prevChar = prev.content.charAt(prev.content.length - 1)
            break
          }
        }
        if (!prevChar || !isJapanese(prevChar)) continue
        const next = children[j + 1]
        if (!next || next.type !== 'text' || !next.content) continue
        const nextChar = next.content.charAt(0)
        if (nextChar !== '{') continue
        child.type = 'softbreak'
        child.tag = ''
        child.content = '\n'
        child.markup = ''
        child.info = ''
      }
    }
  }

  const registerRestoreSoftbreaks = () => {
    if (opt.mditAttrs !== false) return
    if (md.__strongJaRestoreRegistered) return
    const anchorRule = hasTextJoinRule ? 'text_join' : 'inline'
    const added = md.core.ruler.after(anchorRule, 'strong_ja_restore_softbreaks', restoreSoftbreaksAfterCjk)
    if (added !== false) {
      md.__strongJaRestoreRegistered = true
      md.__strongJaRestoreSoftbreaksForAttrs = opt.mditAttrs === false
      if (opt.hasCjkBreaks) {
        moveRuleAfter(md.core.ruler, 'strong_ja_restore_softbreaks', 'cjk_breaks')
        md.__strongJaRestoreReordered = true
      }
      if (opt.patchCorePush !== false && !md.__strongJaPatchCorePush) {
        md.__strongJaPatchCorePush = true
        const originalPush = md.core.ruler.push.bind(md.core.ruler)
        md.core.ruler.push = (name, fn, options) => {
          const res = originalPush(name, fn, options)
          if (name && name.indexOf && name.indexOf('cjk_breaks') !== -1) {
            opt.hasCjkBreaks = true
            moveRuleAfter(md.core.ruler, 'strong_ja_restore_softbreaks', name)
            md.__strongJaRestoreReordered = true
          }
          return res
        }
      }
      if (opt.hasCjkBreaks) {
        moveRuleAfter(md.core.ruler, 'strong_ja_restore_softbreaks', 'cjk_breaks')
        md.__strongJaRestoreReordered = true
      }
    }
  }
  registerRestoreSoftbreaks()

  if (opt.postprocess !== false) {
    md.core.ruler.after('inline', 'strong_ja_postprocess', (state) => {
      const targets = state.env.__strongJaPostProcessTargets
      if (!targets || targets.length === 0) return
      for (const tokens of targets) {
        if (!tokens || !tokens.length) continue
        let hasBracketText = false
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i]
          if (!token || token.type !== 'text') continue
          const content = token.content
          if (!content) continue
          if (content.indexOf('[') !== -1 || content.indexOf(']') !== -1) {
            hasBracketText = true
            break
          }
        }
        if (!hasBracketText) {
          delete tokens.__strongJaInlineLabelSources
          delete tokens.__strongJaInlineLabelIndex
          continue
        }
        convertInlineLinks(tokens, state)
        convertCollapsedReferenceLinks(tokens, state)
        mergeBrokenMarksAroundLinks(tokens)
        delete tokens.__strongJaInlineLabelSources
        delete tokens.__strongJaInlineLabelIndex
      }
      if (state.env && state.env.__strongJaInlineLabelSourceList) {
        delete state.env.__strongJaInlineLabelSourceList
      }
      delete state.env.__strongJaPostProcessTargets
      delete state.env.__strongJaPostProcessTargetSet
    })
  }

  if (coreRulesBeforePostprocess.length > 0) {
    ensureCoreRuleOrder(md, coreRulesBeforePostprocess)
  }
}

export default mditStrongJa

export {
  convertCollapsedReferenceLinks,
  mergeBrokenMarksAroundLinks
}


function normalizeCoreRulesBeforePostprocess(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  const normalized = []
  const seen = new Set()
  for (let idx = 0; idx < list.length; idx++) {
    const raw = list[idx]
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}


function ensureCoreRuleOrder(md, ruleNames) {
  if (!md || !md.core || !md.core.ruler) return
  if (!ruleNames || ruleNames.length === 0) return
  for (let idx = 0; idx < ruleNames.length; idx++) {
    moveRuleBefore(md.core.ruler, ruleNames[idx], 'strong_ja_postprocess')
  }
}


function moveRuleBefore(ruler, ruleName, beforeName) {
  if (!ruler || !ruler.__rules__) return
  const rules = ruler.__rules__
  let fromIdx = -1
  let beforeIdx = -1
  for (let idx = 0; idx < rules.length; idx++) {
    if (rules[idx].name === ruleName) fromIdx = idx
    if (rules[idx].name === beforeName) beforeIdx = idx
    if (fromIdx !== -1 && beforeIdx !== -1) break
  }
  if (fromIdx === -1 || beforeIdx === -1 || fromIdx < beforeIdx) return

  const rule = rules.splice(fromIdx, 1)[0]
  rules.splice(beforeIdx, 0, rule)
  ruler.__cache__ = null
}

function moveRuleAfter(ruler, ruleName, afterName) {
  if (!ruler || !ruler.__rules__) return
  const rules = ruler.__rules__
  let fromIdx = -1
  let afterIdx = -1
  for (let idx = 0; idx < rules.length; idx++) {
    if (rules[idx].name === ruleName) fromIdx = idx
    if (rules[idx].name === afterName) afterIdx = idx
    if (fromIdx !== -1 && afterIdx !== -1) break
  }
  if (fromIdx === -1 || afterIdx === -1 || fromIdx === afterIdx + 1) return

  const rule = rules.splice(fromIdx, 1)[0]
  const targetIdx = fromIdx < afterIdx ? afterIdx - 1 : afterIdx
  rules.splice(targetIdx + 1, 0, rule)
  ruler.__cache__ = null
}

