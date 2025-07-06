// Character code constants
const CHAR_ASTERISK = 0x2A    // *
const CHAR_UNDERSCORE = 0x5F  // _
const CHAR_BACKSLASH = 0x5C   // \
const CHAR_BACKTICK = 0x60    // `
const CHAR_DOLLAR = 0x24      // $
const CHAR_LT = 0x3C          // <
const CHAR_GT = 0x3E          // >
const CHAR_SLASH = 0x2F       // /
const CHAR_SPACE = 0x20       // ' ' (space)

const REG_ASTERISKS = /^\*+$/
const REG_ATTRS = /{[^{}\n!@#%^&*()]+?}$/
const REG_PUNCTUATION = /[!-/:-@[-`{-~ ]/
const REG_JAPANESE = /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}|\p{General_Category=Punctuation}|\p{General_Category=Symbol}|\p{General_Category=Format}|\p{Emoji}/u // ひらがな|カタカナ|漢字|句読点|記号|フォーマット文字|絵文字

const REG_MARKDOWN_HTML = /^\[[^\[\]]+\]\([^)]+\)$|^<([a-zA-Z][a-zA-Z0-9]*)[^>]*>([^<]+<\/\1>)$|^`[^`]+`$|^\$[^$]+\$$/ // for mixed-language context detection

const hasBackslash = (state, start) => {
  let slashNum = 0
  let i = start - 1
  const src = state.src
  while(i >= 0) {
    if (src.charCodeAt(i) === CHAR_BACKSLASH) { slashNum++; i--; continue }
    break
  }
  return slashNum % 2 === 1
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
          token.attrs = t.attrs
          token.map = t.map
          token.level = t.level
          token.children = t.children
          token.content = t.content
          token.markup = t.markup
          token.info = t.info
          token.meta = t.meta
          token.block = t.block
          token.hidden = t.hidden
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

const hasNextSymbol = (state, n, max, symbol, noMark) => {
  let nextSymbolPos = -1
  const src = state.src
  if (src.charCodeAt(n) === symbol && !hasBackslash(state, n)) {
    for (let i = n + 1; i < max; i++) {
      noMark += src[i]
      if (src.charCodeAt(i) === symbol && !hasBackslash(state, i)) {
        noMark += src.substring(n, i + 1)
        nextSymbolPos = i
        break
      }
    }
  }
  return [nextSymbolPos, noMark]
}

const createInlines = (state, start, max, opt) => {
  const src = state.src
  const srcLen = max
  const htmlEnabled = state.md.options.html
  let n = start
  let inlines = []
  let noMark = ''
  let textStart = n
  
  while (n < srcLen) {
    const currentChar = src.charCodeAt(n)
    let nextSymbolPos = -1

    // Inline code (backticks)
    if (currentChar === CHAR_BACKTICK && !hasBackslash(state, n)) {
      [nextSymbolPos, noMark] = hasNextSymbol(state, n, srcLen, CHAR_BACKTICK, noMark)
      if (nextSymbolPos !== -1) {
        if (nextSymbolPos === srcLen - 1) {
          pushInlines(inlines, textStart, nextSymbolPos, nextSymbolPos - textStart + 1, 'text')
          break
        }
        n = nextSymbolPos + 1
        continue
      }
    }

    // Inline math ($...$)
    if (opt.dollarMath && currentChar === CHAR_DOLLAR && !hasBackslash(state, n)) {
      [nextSymbolPos, noMark] = hasNextSymbol(state, n, srcLen, CHAR_DOLLAR, noMark)
      if (nextSymbolPos !== -1) {
        if (nextSymbolPos === srcLen - 1) {
          pushInlines(inlines, textStart, nextSymbolPos, nextSymbolPos - textStart + 1, 'text')
          break
        }
        n = nextSymbolPos + 1
        continue
      }
    }

    // HTML tags
    if (htmlEnabled && currentChar === CHAR_LT && !hasBackslash(state, n)) {
      for (let i = n + 1; i < srcLen; i++) {
        if (src.charCodeAt(i) === CHAR_GT && !hasBackslash(state, i)) {
          if (noMark.length !== 0) {
            pushInlines(inlines, textStart, n - 1, n - textStart, 'text')
            noMark = ''
          }
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
          break
        }
      }
      continue
    }

    // Asterisk handling
    if (currentChar === CHAR_ASTERISK && !hasBackslash(state, n)) {
      if (n !== 0 && noMark.length !== 0) {
        pushInlines(inlines, textStart, n - 1, n - textStart, 'text')
        noMark = ''
      }
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
  let left = 0, right = marks.length
  while (left < right) {
    const mid = (left + right) >> 1
    if (marks[mid].s > opts.s) {
      right = mid
    } else {
      left = mid + 1
    }
  }
  marks.splice(left, 0, { ...opts });
}

const setStrong = (state, inlines, marks, n, memo, opt) => {
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

    nest = checkNest(inlines, marks, n, i)
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
        const [newN, newNest] = setEm(state, inlines, marks, n, memo, opt)
        n = newN
        nest = newNest
      }
    }
    let strongNum = Math.trunc(Math.min(inlines[n].len, inlines[i].len) / 2)

    if (inlines[i].len > 1) {
      if (hasPunctuationOrNonJapanese(state, inlines, n, i, opt)) {
        if (memo.inlineMarkEnd) {
          marks.push(...createMarks(state, inlines, i, inlinesLength - 1, memo, opt))
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
      const [newN, newNest] = setEm(state, inlines, marks, n, memo, opt, nest)
      n = newN
      nest = newNest
    }

    i++
  }

  if (n == 0 && memo.inlineMarkEnd) {
    marks.push(...createMarks(state, inlines, n + 1, inlinesLength - 1, memo, opt))
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
  const closeAllTags = Object.values(memo.htmlTags).every(val => val === 0)
  if (closeAllTags) return 1
  return 0
}

const isPunctuation = (ch) => {
  return REG_PUNCTUATION.test(ch)
}
const isJapanese = (ch) => {
  return REG_JAPANESE.test(ch)
}

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
    const openPrevChar = src[inlines[n].s - 1] || ''
    const closeNextChar = src[inlines[i].e + 1] || ''
    
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

const setEm = (state, inlines, marks, n, memo, opt, sNest) => {
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
      nest = checkNest(inlines, marks, n, i)
    }
    if (nest === -1) return [n, nest]

    if (emNum === 1) {
      if (hasPunctuationOrNonJapanese(state, inlines, n, i, opt)) {
        if (memo.inlineMarkEnd) {
          marks.push(...createMarks(state, inlines, i, inlinesLength - 1, memo, opt))

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

const checkNest = (inlines, marks, n, i) => {
  let nest = 1
  let isRange = true
  if (marks.length === 0) return nest
  let strongNest = 0
  let emNest = 0
  let j = 0
  const marksLength = marks.length
  while (j < marksLength) {
    if (marks[j].s <= inlines[n].s) {
      if (marks[j].type === 'strong_open') strongNest++
      if (marks[j].type === 'strong_close') strongNest--
      if (marks[j].type === 'em_open') emNest++
      if (marks[j].type === 'em_close') emNest--
    } else { break }
    j++
  }
  let parentNest = strongNest + emNest
  let parentCloseN = j
  if (parentCloseN < marksLength) {
    while (parentCloseN < marksLength) {
      if (marks[parentCloseN].nest === parentNest) break
      parentCloseN++
    }
    if (parentCloseN > marksLength - 1) {
      isRange = true
    } else {
      if (marks[parentCloseN].s < inlines[i].s) isRange = false
    }
  }

  if (isRange) {
    nest = parentNest + 1
  } else {
    nest = -1
  }
  return nest
}

const createMarks = (state, inlines, start, end, memo, opt) => {
  let marks = []
  let n = start
  
  while (n < end) {
    if (inlines[n].type !== '') { n++; continue }
    let nest = 0
    
    if (inlines[n].len > 1) {
      const [newN, newNest] = setStrong(state, inlines, marks, n, memo, opt)
      n = newN
      nest = newNest
    }
    if (inlines[n].len !== 0) {
      const [newN2, newNest2] = setEm(state, inlines, marks, n, memo, opt)
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
  marks.sort((a, b) => a.s - b.s)
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

  let inlines = createInlines(state, start, max, opt)

  const memo = {
    html: state.md.options.html,
    htmlTags: {},
    inlineMarkStart: src.charCodeAt(0) === CHAR_ASTERISK,
    inlineMarkEnd: src.charCodeAt(max - 1) === CHAR_ASTERISK,
  }

  let marks = createMarks(state, inlines, 0, inlines.length, memo, opt)

  inlines = mergeInlinesAndMarks(inlines, marks)

  setToken(state, inlines, opt)

  if (opt.mditAttrs && max !== state.posMax) {
    if (!attributesSrc) {
      state.pos = max
      return true
    }
    if (attributesSrc[1].length > 1) {
      state.pos = max + attributesSrc[1].length
    } else {
      state.pos = max
    }
  } else {
    state.pos = max
  }
  return true
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
}
  export default mditStrongJa