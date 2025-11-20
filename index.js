import Token from 'markdown-it/lib/token.mjs'

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

const REG_ASTERISKS = /^\*+$/
const REG_ATTRS = /{[^{}\n!@#%^&*()]+?}$/
const REG_PUNCTUATION = /[!-/:-@[-`{-~ ]/
const REG_JAPANESE = /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}|\p{General_Category=Punctuation}|\p{General_Category=Symbol}|\p{General_Category=Format}|\p{Emoji}/u // ひらがな|カタカナ|漢字|句読点|記号|フォーマット文字|絵文字

const REG_MARKDOWN_HTML = /^\[[^\[\]]+\]\([^)]+\)$|^<([a-zA-Z][a-zA-Z0-9]*)[^>]*>([^<]+<\/\1>)$|^`[^`]+`$|^\$[^$]+\$$/ // for mixed-language context detection

const hasBackslash = (state, start) => {
  let slashNum = 0
  let i = start - 1
  const src = state.src
  // Early exit if no backslash at all
  if (i < 0 || src.charCodeAt(i) !== CHAR_BACKSLASH) {
    return false
  }
  // Count consecutive backslashes efficiently
  while (i >= 0 && src.charCodeAt(i) === CHAR_BACKSLASH) {
    slashNum++
    i--
  }
  return slashNum % 2 === 1
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

const findRefRangeIndex = (pos, refRanges) => {
  if (!refRanges || refRanges.length === 0) return -1
  for (let i = 0; i < refRanges.length; i++) {
    const range = refRanges[i]
    if (pos >= range.start && pos <= range.end) return i
  }
  return -1
}

// Detect reference-link label ranges within the current inline slice
const computeReferenceRanges = (state, start, max) => {
  const src = state.src
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
            ranges.push({ start: pos, end: labelClose })
            pos = labelClose
          }
        }
      }
    }
    pos++
  }
  return ranges
}

const copyInlineTokenFields = (dest, src) => {
  dest.attrs = src.attrs
  dest.map = src.map
  dest.level = src.level
  dest.children = src.children
  dest.content = src.content
  dest.markup = src.markup
  dest.info = src.info
  dest.meta = src.meta
  dest.block = src.block
  dest.hidden = src.hidden
}

const inlineHasCollapsedRef = (state) => {
  if (state.__strongJaHasCollapsedRefs === undefined) {
    state.__strongJaHasCollapsedRefs = state.src.includes('[]')
  }
  return state.__strongJaHasCollapsedRefs
}

const registerCollapsedRefTarget = (state) => {
  const env = state.env
  if (!env.__strongJaCollapsedTargets) {
    env.__strongJaCollapsedTargets = []
    env.__strongJaCollapsedTargetSet = typeof WeakSet !== 'undefined' ? new WeakSet() : null
  }
  const targets = env.__strongJaCollapsedTargets
  const targetSet = env.__strongJaCollapsedTargetSet
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

const setStrong = (state, inlines, marks, n, memo, opt, nestTracker, refRanges) => {
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

    const closeRange = findRefRangeIndex(inlines[i].s, refRanges)
    if (strongOpenRange !== closeRange) { i++; continue }

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
        const [newN, newNest] = setEm(state, inlines, marks, n, memo, opt, null, nestTracker, refRanges)
        n = newN
        nest = newNest
      }
    }
    let strongNum = Math.trunc(Math.min(inlines[n].len, inlines[i].len) / 2)

    if (inlines[i].len > 1) {
      if (hasPunctuationOrNonJapanese(state, inlines, n, i, opt)) {
        if (memo.inlineMarkEnd) {
          marks.push(...createMarks(state, inlines, i, inlinesLength - 1, memo, opt, refRanges))
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
      const [newN, newNest] = setEm(state, inlines, marks, n, memo, opt, nest, nestTracker, refRanges)
      n = newN
      nest = newNest
    }

    i++
  }

  if (n == 0 && memo.inlineMarkEnd) {
    marks.push(...createMarks(state, inlines, n + 1, inlinesLength - 1, memo, opt, refRanges))
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

const hasPunctuationOrNonJapanese = (state, inlines, n, i, opt) => {
  const src = state.src
  const openPrevChar = src[inlines[n].s - 1] || ''
  const openNextChar = src[inlines[n].e + 1]  || ''
  const checkOpenNextChar = isPunctuation(openNextChar)
  const closePrevChar = src[inlines[i].s - 1] || ''
  const checkClosePrevChar = isPunctuation(closePrevChar)
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

const setEm = (state, inlines, marks, n, memo, opt, sNest, nestTracker, refRanges) => {
  const emOpenRange = findRefRangeIndex(inlines[n].s, refRanges)
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
      inlines.check = true
      insideTagsIsClose = checkInsideTags(inlines, i, memo)
      if (insideTagsIsClose === -1) return [n, nest]
      if (insideTagsIsClose === 0) { i++; continue }
    }
    if (inlines[i].type !== '') { i++; continue }

    const closeRange = findRefRangeIndex(inlines[i].s, refRanges)
    if (emOpenRange !== closeRange) {
      i++
      continue
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
      if (hasPunctuationOrNonJapanese(state, inlines, n, i, opt)) {
        if (memo.inlineMarkEnd) {
          marks.push(...createMarks(state, inlines, i, inlinesLength - 1, memo, opt, refRanges))

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

const createMarks = (state, inlines, start, end, memo, opt, refRanges) => {
  let marks = []
  let n = start
  const nestTracker = createNestTracker()
  
  while (n < end) {
    if (inlines[n].type !== '') { n++; continue }
    let nest = 0
    
    if (inlines[n].len > 1) {
      const [newN, newNest] = setStrong(state, inlines, marks, n, memo, opt, nestTracker, refRanges)
      n = newN
      nest = newNest
    }
    if (inlines[n].len !== 0) {
      const [newN2, newNest2] = setEm(state, inlines, marks, n, memo, opt, null, nestTracker, refRanges)
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

  const refRanges = computeReferenceRanges(state, start, max)
  let inlines = createInlines(state, start, max, opt)

  const memo = {
    html: state.md.options.html,
    htmlTags: {},
    inlineMarkStart: src.charCodeAt(0) === CHAR_ASTERISK,
    inlineMarkEnd: src.charCodeAt(max - 1) === CHAR_ASTERISK,
  }

  let marks = createMarks(state, inlines, 0, inlines.length, memo, opt, refRanges)

  inlines = mergeInlinesAndMarks(inlines, marks)

  setToken(state, inlines, opt)

  if (inlineHasCollapsedRef(state) && !state.__strongJaCollapsedRefRegistered) {
    registerCollapsedRefTarget(state)
    state.__strongJaCollapsedRefRegistered = true
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
const splitBracketTextTokens = (tokens) => {
  let hasBracket = false
  for (const token of tokens) {
    if (token && token.type === 'text' && token.content &&
        (token.content.indexOf('[') !== -1 || token.content.indexOf(']') !== -1)) {
      hasBracket = true
      break
    }
  }
  if (!hasBracket) return

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    if (!token || token.type !== 'text' ||
        (token.content.indexOf('[') === -1 && token.content.indexOf(']') === -1)) {
      i++
      continue
    }
    const segments = []
    let buffer = ''
    const content = token.content
    let pos = 0
    while (pos < content.length) {
      if (content.startsWith('[]', pos)) {
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
      token.content = segments[0] || ''
      i++
      continue
    }
    token.content = segments[0]
    let insertIdx = i + 1
    for (let s = 1; s < segments.length; s++) {
      const newToken = cloneTextToken(token, segments[s])
      tokens.splice(insertIdx, 0, newToken)
      insertIdx++
    }
    i = insertIdx
  }
}

const isBracketToken = (token, bracket) => {
  return token && token.type === 'text' && token.content === bracket
}

const convertCollapsedReferenceLinks = (tokens, state) => {
  const references = state.env && state.env.references
  if (!references || Object.keys(references).length === 0) return

  splitBracketTextTokens(tokens)

  let i = 0
  while (i < tokens.length) {
    if (!isBracketToken(tokens[i], '[')) {
      i++
      continue
    }

    let closeIdx = i + 1
    while (closeIdx < tokens.length && !isBracketToken(tokens[closeIdx], ']')) {
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

    const emptyRefIdx = closeIdx + 1
    if (!isBracketToken(tokens[emptyRefIdx], '[]')) {
      i++
      continue
    }

    if (closeIdx === i + 1) {
      i++
      continue
    }

    const labelTokens = tokens.slice(i + 1, closeIdx)
    if (process.env.DEBUG_COLLAPSED === '1') {
      const context = tokens.slice(Math.max(0, i - 2), Math.min(tokens.length, closeIdx + 3))
      console.log('[collapsed-ref] context:',
        context.map((t) => t.type + ':' + (t.content || '')))
    }
    const labelText = buildReferenceLabel(labelTokens)
    const normalizedLabel = normalizeRefKey(state, cleanLabelText(labelText))
    const ref = references[normalizedLabel]
    if (!ref) {
      i++
      continue
    }

    tokens.splice(emptyRefIdx, 1)
    tokens.splice(closeIdx, 1)
    tokens.splice(i, 1)

    let labelStartIdx = i
    let labelEndIdx = i + labelTokens.length - 1
    if (labelStartIdx > labelEndIdx) {
      i++
      continue
    }

    const wrapperPairs = []
    while (labelStartIdx > 0) {
      const prevToken = tokens[labelStartIdx - 1]
      const nextToken = tokens[labelEndIdx + 1]
      if (!prevToken || !nextToken) break
      if (!/_close$/.test(prevToken.type)) break
      const expectedOpen = prevToken.type.replace('_close', '_open')
      if (nextToken.type !== expectedOpen) break
      if (process.env.DEBUG_COLLAPSED === '1') {
        console.log('[collapsed-ref] wrapper pair:', prevToken.type, nextToken.type)
      }
      wrapperPairs.push({
        base: prevToken.type.replace('_close', ''),
        tag: prevToken.tag,
        markup: prevToken.markup
      })
      tokens.splice(labelEndIdx + 1, 1)
      tokens.splice(labelStartIdx - 1, 1)
      labelStartIdx -= 1
      labelEndIdx -= 1
    }

    if (labelStartIdx > labelEndIdx) {
      i++
      continue
    }

    let labelLength = labelEndIdx - labelStartIdx + 1
    const firstLabelToken = tokens[labelStartIdx]
    const linkLevel = firstLabelToken ? Math.max(firstLabelToken.level - 1, 0) : 0

    const linkOpen = new Token('link_open', 'a', 1)
    linkOpen.attrs = [['href', ref.href]]
    if (ref.title) linkOpen.attrPush(['title', ref.title])
    linkOpen.level = linkLevel
    linkOpen.markup = '[]'
    linkOpen.info = 'auto'
    tokens.splice(labelStartIdx, 0, linkOpen)

    const linkClose = new Token('link_close', 'a', -1)
    linkClose.level = linkLevel
    linkClose.markup = '[]'
    linkClose.info = 'auto'
    tokens.splice(labelStartIdx + labelLength + 1, 0, linkClose)

    adjustTokenLevels(tokens, labelStartIdx + 1, labelStartIdx + labelLength + 1, 1)

    if (wrapperPairs.length > 0) {
      let insertIdx = labelStartIdx + 1
      for (let wp = 0; wp < wrapperPairs.length; wp++) {
        const pair = wrapperPairs[wp]
        const innerOpen = new Token(pair.base + '_open', pair.tag, 1)
        innerOpen.markup = pair.markup
        innerOpen.level = linkLevel + 1 + wp
        tokens.splice(insertIdx, 0, innerOpen)
        insertIdx++
        labelLength++
      }
      let linkClosePos = labelStartIdx + labelLength + 1
      for (let wp = wrapperPairs.length - 1; wp >= 0; wp--) {
        const pair = wrapperPairs[wp]
        const innerClose = new Token(pair.base + '_close', pair.tag, -1)
        innerClose.markup = pair.markup
        innerClose.level = linkLevel + 1 + wp
        tokens.splice(linkClosePos, 0, innerClose)
        labelLength++
      }
    }

    i = labelStartIdx + labelLength + 2
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

  md.core.ruler.after('inline', 'strong_ja_collapsed_refs', (state) => {
    const targets = state.env.__strongJaCollapsedTargets
    if (!targets || targets.length === 0) return
    for (const tokens of targets) {
      if (!tokens || !tokens.length) continue
      convertCollapsedReferenceLinks(tokens, state)
      mergeBrokenMarksAroundLinks(tokens)
    }
    delete state.env.__strongJaCollapsedTargets
    delete state.env.__strongJaCollapsedTargetSet
  })
}

export default mditStrongJa
