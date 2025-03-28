const REG_ASTERISKS = /^\*+$/
const REG_ATTRS = /{[^{}\n!@#%^&*()]+?}$/
const REG_PUNCTUATION = /[!-/:-@[-`{-~ ]/

const hasBackslash = (state, start) => {
  let slashNum = 0
  let i = start - 1
  const src = state.src
  while(i >= 0) {
    if (src.charCodeAt(i) === 0x5C) { slashNum++; i--; continue }
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
    //console.log(i, type)
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
      //console.log('content: ' + content)
      if (REG_ASTERISKS.test(content)) {
        //console.log('asterisk process::')
        const asteriskToken = state.push(type, '', 0)
        asteriskToken.content = content
        i++
        continue
      }
      if (opt.mditAttrs && attrsIsText.val && i + 1 < inlines.length) {
        const hasImmediatelyAfterAsteriskClose = inlines[i+1].type === attrsIsText.tag + '_close'
        //console.log(hasImmediatelyAfterAsteriskClose, inlines[i+1].type, /^[\s\S]*{[^{}\n!@#%^&*()]+?}$/.test(content))
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
              //console.log(backSlashNum, backSlash)
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
      //console.log(childTokens)
      //console.log(childTokens[0].children)
      if (childTokens[0] && childTokens[0].children) {
        let j = 0
        while (j < childTokens[0].children.length) {
          const t = childTokens[0].children[j]
          if (t.type === 'softbreak') {
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
    check: type === 'text' ? true : false,
  }
  if (tag) inline.tag = [tag, tagType]
  inlines.push(inline)
}

const hasNextSymbol = (state, n, max, symbol, noMark) => {
  let nextSymbolPos = -1
  const src = state.src
  if (src.charCodeAt(n) === symbol && !hasBackslash(state, n)) {
    let i = n + 1
    let tempNoMark = noMark
    while (i < max) {
      tempNoMark += src[i]
      if (src.charCodeAt(i) === symbol && !hasBackslash(state, i)) {
        noMark += src.substring(n, i + 1)
        nextSymbolPos = i
        break
      }
      i++
    }
  }
  return [nextSymbolPos, noMark]
}

const createInlines = (state, start, max, opt) => {
  const src = state.src
  const srcLen = max;
  let n = start
  let inlines = []
  let noMark = ''
  let textStart = n
  while (n < srcLen) {
    //console.log('n: ' + n + ', state.src[n]: ' + state.src[n] + ', noMark: ' + noMark)
    let nextSymbolPos = -1;
    [nextSymbolPos, noMark] = hasNextSymbol(state, n, srcLen, 0x60, noMark)  // '`'
    if (nextSymbolPos !== -1) {
      if (nextSymbolPos === srcLen - 1) {
        pushInlines(inlines, textStart, nextSymbolPos, nextSymbolPos - textStart + 1, 'text')
        break
      }
      n = nextSymbolPos + 1
      continue
    }
    if (opt.dollarMath) {
      [nextSymbolPos, noMark] = hasNextSymbol(state, n, srcLen, 0x24, noMark)  // '$'
      if (nextSymbolPos !== -1) {
        if (nextSymbolPos === srcLen - 1) {
          pushInlines(inlines, textStart, nextSymbolPos, nextSymbolPos - textStart + 1, 'text')
          break
        }
        n = nextSymbolPos + 1
        continue
      }
    }

    if (state.md.options.html) {
      if (src.charCodeAt(n) === 0x3C && !hasBackslash(state, n)) { // '<'
        let i = n + 1
        while (i < srcLen) {
          if (src.charCodeAt(i) === 0x3E && !hasBackslash(state, i)) { // '>'
            if (noMark.length !== 0) {
              pushInlines(inlines, textStart, n - 1, n - textStart, 'text')
              noMark = ''
            }
            let tag = src.slice(n + 1, i)
            let tagType = ''
            if (/^\//.test(tag)) {
              tag = tag.slice(1)
              tagType = 'close'
            } else {
              tagType = 'open'
            }
            pushInlines(inlines, n, i, i - n + 1, 'html_inline', tag, tagType)
            textStart = i + 1
            break
          }
          i++
        }
        n = i + 1
        continue
      }
    }

    if (src.charCodeAt(n) === 0x2A && !hasBackslash(state, n)) { // '*'
      if (n !== 0 && noMark.length !== 0) {
        pushInlines(inlines, textStart, n - 1, n - textStart, 'text')
        noMark = ''
      }
      if (n === srcLen - 1) {
        pushInlines(inlines, n,  n, 1 , '')
        break
      }
      let i = n + 1
      while (i < srcLen) {
        if (src.charCodeAt(i) === 0x2A) {
          if (i === srcLen - 1) pushInlines(inlines, n,  i, i - n + 1 , '')
          i++
          continue
        }
        pushInlines(inlines, n,  i - 1, i - n, '')
        textStart = i
        break
      }
      n = i
      continue
    }

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
  //binary search
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
  let i = n + 1
  let j = 0
  let nest = 0
  let insideTagsIsClose = 1 // 1: closed, 0: open still, -1: error
  while (i < inlines.length) {
   //console.log('[strong] i: ' + i + ', inlines[i].len: ' + inlines[i].len + ', inlines[i].type: ' + inlines[i].type)
    if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
    if (inlines[i].type === 'html_inline') {
      inlines[i].check = true
      insideTagsIsClose = checkInsideTags(inlines, i, memo)
      //console.log('    nest: ' + nest + ', insideTagsIsClose: ' + insideTagsIsClose )
      if (insideTagsIsClose === -1) return n, nest
      if (insideTagsIsClose === 0) { i++; continue }
    }
    if (inlines[i].type !== '') { i++; continue }

    nest = checkNest(inlines, marks, n, i)
    //console.log('    check nest: ' + nest)
    if (nest === -1) return n, nest

    if (inlines[i].len === 1 && inlines[n].len > 2) {
     //console.log('    check em inside strong:: i: ' + i)
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
        n, nest = setEm(state, inlines, marks, n, memo, opt)
      }
      //console.log(marks)
    }
    //console.log('    check len:: inlines[n].len: ' + inlines[n].len + ', inlines[i].len: ' + inlines[i].len)
    let strongNum = Math.trunc(Math.min(inlines[n].len, inlines[i].len) / 2)

    if (inlines[i].len > 1) {
     //console.log('    hasPunctuation: ' + hasPunctuation(state, inlines, n, i) + ', memo.inlineMarkEnd: ' + memo.inlineMarkEnd)
      if (hasPunctuation(state, inlines, n, i)) {
        if (memo.inlineMarkEnd) {
         //console.log('check nest em.')
         //console.log('~~~~~~~~~~~~~~~~~')
          marks.push(...createMarks(state, inlines, i, inlines.length - 1, memo, opt))
         //console.log('~~~~~~~~~~~~~~~~~')
          if (inlines[i].len === 0) { i++; continue }
        } else {
          return n, nest
        }
      }
     //console.log('    ===> strong normal push. n: ' + n + ', i: ' + i +  ' , nest: ' + nest + ',strongNum: ' + strongNum)

      j = 0
      while (j < strongNum) {
        //console.log('    - j: ' + j + ', inlines[i].sp: ' + inlines[i].sp)
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
      if (inlines[n].len === 0) return n, nest
    }

    if (inlines[n].len === 1 && inlines[i].len > 0) {
     //console.log('    check em that warp strong.')
      nest++
      n, nest = setEm(state, inlines, marks, n, memo, opt, nest)
    }

    i++
  }

  if (n == 0 && memo.inlineMarkEnd) {
   //console.log('check nest em(inlineMarkEnd).')
    //console.log('===============================')
    marks.push(...createMarks(state, inlines, n + 1 , inlines.length - 1, memo, opt))
    //console.log(marks)
    //console.log('===============================')
  }
  return n, nest
}

const checkInsideTags = (inlines, i, memo) => {
  //console.log('isJumTag before::memo.htmlTags: ' + JSON.stringify(memo.htmlTags))
  if (inlines[i].tag === undefined) return 0
  const tagName = inlines[i].tag[0].toLowerCase()
  if (memo.htmlTags[tagName] === undefined) {
    memo.htmlTags[tagName] = 0
  }
  //console.log('memo.htmlTags: ' + JSON.stringify(memo.htmlTags) + ', inlines[i]: ' + JSON.stringify(inlines[i]) + ', inlines[i]')
  if (inlines[i].tag[1] === 'open') {
    memo.htmlTags[tagName] += 1
  }
  if (inlines[i].tag[1] === 'close') {
    memo.htmlTags[tagName] -= 1
  }
  //console.log('    i: ' + i + ', tagName: ' + tagName + ', memo.htmlTags[tagName]: ' + memo.htmlTags[tagName] + ', prevHtmlTags[tagName]: ' + prevHtmlTags[tagName])
  if (memo.htmlTags[tagName] < 0) {
    return -1
  }
  //console.log('isJumTag after::memo.htmlTags: ' + JSON.stringify(memo.htmlTags))
  const closeAllTags = Object.values(memo.htmlTags).every(val => val === 0)
  if (closeAllTags) return 1
  return 0
}

const isPunctuation = (ch) => {
  return REG_PUNCTUATION.test(ch)
}

const hasPunctuation = (state, inlines, n, i) => {
  const src = state.src
  const openNextChar = isPunctuation(src[inlines[n].e + 1] || '')
  //const openPrevChar = isPunctuation(src[inlines[n].s - 1] || '') || n === 0
  let closePrevChar = isPunctuation(src[inlines[i].s - 1] || '')
  if (i + 1 < inlines.length) {
    //closePrevChar = closePrevChar && inlines[i+1] !== 'html_inline'
  }
  let closeNextChar = isPunctuation(src[inlines[i].e + 1] || '') || i === inlines.length - 1
  //const lastCharIsAsterisk = memo.inlineMarkEnd
  //const firstCharIsAsterisk = memo.inlineMarkStart

  //console.log('openPrevChar: ' + openPrevChar + ', openNextChar: ' + openNextChar + ', closePrevChar: ' + closePrevChar + ', closeNextChar: ' + closeNextChar + ', lastCharIsAsterisk: ' + lastCharIsAsterisk + ', firstCharIsAsterisk: ' + firstCharIsAsterisk + ', next condition: ' + ((openNextChar || closePrevChar) && !closeNextChar))
  //if ((openNextChar || closePrevChar) && !closeNextChar) {
  if ((openNextChar || closePrevChar) && !closeNextChar) {
    return true
  } else {
    return false
  }
}

const setEm = (state, inlines, marks, n, memo, opt, sNest) => {
  let i = n + 1
  let nest = 0
  let strongPNum = 0
  let insideTagsIsClose = 1
  while (i < inlines.length) {
    //console.log('[em] i: ' + i + ', src: ' + state.src.slice(inlines[i].sp, inlines[i].ep + 1) + ', inlines[i]: ' + JSON.stringify(inlines[i]))
    //console.log(inlines[i].type, JSON.stringify(memo.htmlTags))
    if (inlines[i].len === 0 || inlines[i].check) { i++; continue }
    if (!sNest && inlines[i].type === 'html_inline') {
      inlines.check = true
      insideTagsIsClose = checkInsideTags(inlines, i, memo)
      //console.log('    i: ' + i + ', insideTagsIsClose: ' + insideTagsIsClose)
      if (insideTagsIsClose === -1) return n, nest
      if (insideTagsIsClose === 0) { i++; continue }
    }
    if (inlines[i].type !== '') { i++; continue }

    const emNum = Math.min(inlines[n].len, inlines[i].len)

    //console.log('sNest: ' + sNest + ', emNum: ' + emNum)
    if (!sNest && emNum !== 1) return n, sNest, memo

    const hasMarkersAtStartAndEnd = (i) => {
      let flag =  memo.inlineMarkStart
      if (!flag) return false
      inlines.length - 1 === i ? flag = true : flag = false
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
    //console.log('    nest: ' + nest + ', emNum: ' + emNum)
    if (nest === -1) return n, nest

    if (emNum === 1) {
      //console.log('    hasPunctuation: ' + hasPunctuation(state, inlines, n, i) + ', memo.inlineMarkEnd: ' + memo.inlineMarkEnd)
      if (hasPunctuation(state, inlines, n, i)) {
        if (memo.inlineMarkEnd) {
          //console.log('check nest em.')
          //console.log('~~~~~~~~~~~~~~~~~')
          marks.push(...createMarks(state, inlines, i, inlines.length - 1, memo, opt))
          //console.log('~~~~~~~~~~~~~~~~~')

          if (inlines[i].len === 0) { i++; continue }
        } else {
          return n, nest
        }
      }
      //console.log('inlines[i].len: ' + inlines[i].len)
      if (inlines[i].len < 1) { // memo.html
        i++; continue;
      }

      //console.log('    ===> em Normal push. n: ' + n + ', i: ' + i + ', nest: ' + nest, ', strongPNum: ' + strongPNum)
      //console.log(inlines[n].ep, inlines[n].sp, inlines[n].s)
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
      //console.log(marks)
      if (inlines[n].len === 0) return n, nest
    }

    i++
  }
  return n, nest
}

const setText = (inlines, marks, n, nest) => {
  //console.log('n: ' + n + ' [text]: inlines[n].len: ' + inlines[n].len)
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
  //console.log(inlines)
  //console.log(marks)
  //console.log('n: ' + n + ', i: ' + i + ', inlines[n].s: ' + inlines[n].s + ', inlines[i].s: ' + inlines[i].s)
  while (j < marks.length) {
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
  //console.log('strongNest: ' + strongNest + ', emNest: ' + emNest + ', parentNest: ' + parentNest + ', parentCloseN: ' + parentCloseN)
  if (parentCloseN < marks.length) {
    while (parentCloseN < marks.length) {
      if (marks[parentCloseN].nest === parentNest) break
      parentCloseN++
    }
    //console.log('parentCloseN: ' + parentCloseN)
    if (parentCloseN >  marks.length - 1) {
      isRange = true
    } else {
      //console.log(marks[parentCloseN].s, i, inlines[i].s)
      if (marks[parentCloseN].s < inlines[i].s) isRange = false
    }
  }
  //console.log('isRange: ' + isRange)

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
   //console.log('n: ' + n +  ' ----- inlines:: src: ' + state.src.slice(inlines[n].sp, inlines[n].ep + 1) + ', inlines[n].sp: ' + inlines[n].sp + ', inlines[n].len: ' + inlines[n].len + ', memo.isEm: ' + memo.isEm)
    if (inlines[n].len > 1) {
      n, nest = setStrong(state, inlines, marks, n, memo, opt)
    }
    if (inlines[n].len !== 0) {
      n, nest = setEm(state, inlines, marks, n, memo, opt)
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
  if (src.charCodeAt(start) !== 0x2A) return false
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

  //console.log('state.src.length(max): ' + state.src.length + (state.src.length === max ? '' : '(' + max + ')') + ', start: ' + start +  ', state.src: ' + state.src)
  let inlines = createInlines(state, start, max, opt)
  //console.log('inlines: ')
  //console.log(inlines)

  const memo = {
    html: state.md.options.html,
    htmlTags: {},
    inlineMarkStart: src.charCodeAt(0) === 0x2A ? true : false,
    inlineMarkEnd: src.charCodeAt(max - 1) === 0x2A ? true : false,
  }

  let marks = createMarks(state, inlines, 0, inlines.length, memo, opt)
  //console.log('marks: ')
  //console.log(marks)

  inlines = mergeInlinesAndMarks(inlines, marks)
  //console.log('fix inlines:')
  //console.log(inlines)

  setToken(state, inlines, opt)

  //console.log ('End process:: max:' + max + ', state.posMax: ' + state.posMax + ', opt.mditAttrs: ' + opt.mditAttrs)

  if (opt.mditAttrs && max !== state.posMax) {
    if (!attributesSrc) {
      state.pos = max
      return true
    }
   //console.log('start: ' + start + ', attributesSrc[0]::' + attributesSrc[0] + ', attributesSrc[1].length: ' + attributesSrc[1].length)
    if (attributesSrc[1].length > 1) {
      state.pos = max + attributesSrc[1].length
    } else {
      state.pos = max
    }
  } else {
    state.pos = max
  }
  //console.log(state.tokens)
  return true
}

const mditStrongJa = (md, option) => {
  const opt = {
    dollarMath: true, //inline math $...$
    mditAttrs: true, //markdown-it-attrs
  }
  if (option) Object.assign(opt, option)

  md.inline.ruler.before('emphasis', 'strong_ja', (state, silent) => {
    return strongJa(state, silent, opt)
  })
}
  export default mditStrongJa