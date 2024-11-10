const hasSlashFlag = (state, start) => {
  let slashNum = 0
  let i = start - 1
  while(i >= 0) {
    /// if (state.src.charCodeAt(i) === 0x2A) { i--; continue }
    if (state.src.charCodeAt(i) === 0x5C) { slashNum++; i--; continue }
    break
  }
  return slashNum % 2 === 1 ? true : false
}

const setToken = (state, inlines) => {
  let i = 0
  while (i < inlines.length) {
    const type = inlines[i].type
    const tag = type.replace(/(?:_open|_close)$/, '')

    if (/_open$/.test(type)) {
      const startToken = state.push(type, tag, 1)
      startToken.markup = tag === 'strong' ? '**' : '*'
    }

    if (type === 'text') {
      const content = state.src.slice(inlines[i].s, inlines[i].e + 1)
      if (/^\**$/.test(content)) {
        //console.log('asterisk process::')
        const asteriskToken = state.push(type, '', 0)
        asteriskToken.content = content
        //console.log('asteriskToken: ' + asteriskToken.content)
        i++
        continue
      }
      const childTokens = state.md.parseInline(content, state.env)
      if (childTokens[0] && childTokens[0].children) {
        state.tokens[state.tokens.length - 1].children = childTokens[0].children
        childTokens[0].children.forEach(t => {
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
        })
      }
    }

    if (/_close$/.test(type)) {
      const closeToken = state.push(type, tag, -1)
      closeToken.markup = tag === 'strong' ? '**' : '*'
    }

    i++
  }
}

const inlinesPush = (inlines, s, e, len, type) => {
  inlines.push({
    s: s,
    sp: s,
    e: e,
    ep: e,
    len: len,
    type: type,
  })
}

const crateInlines = (state, start, max) => {
  let n = start
  let inlines = []
  let noMark = ''
  let mark = ''
  let beforeIsMark = true
  while (n < max) {
    if (state.src.charCodeAt(n) === 0x2A) {
      if (hasSlashFlag(state, n)) {
        beforeIsMark = false
        noMark += state.src[n]
        if (n === max - 1) {
          inlinesPush(inlines, n - noMark.length + 1, n, noMark.length, 'text')
        }
        n++
        continue
      }
      beforeIsMark = true
      mark += '*'
      if (n !== start && noMark !== '') {
        inlinesPush(inlines, n - noMark.length, n - 1, noMark.length, 'text')
      }
      noMark = ''
      if (n === max - 1) {
        inlinesPush(inlines, n - mark.length + 1, n, mark.length, '')
      }
    } else {
      noMark += state.src[n]
      if (state.src[n-1] === '*' && beforeIsMark) {
        inlinesPush(inlines, n - mark.length, n - 1, mark.length, '')
        mark = ''
      }
      if (n === max - 1) {
        inlinesPush(inlines, n - noMark.length + 1, n, noMark.length, 'text')
      }
    }
    n++
  }
  return inlines
}

const marksPush = (marks, nest, s, e, len, outsideLen, type) => {
  //console.log('before marks:')
  //console.log(marks)
  const np = {
    nest: nest,
    s: s,
    e: e,
    len: len,
    oLen: outsideLen,
    type: type,
  }
  //let i = marks.findIndex(o => o.s > s)
  let i = marks.findIndex(o => o.s > s)
  if (i === -1) {
    marks.push(np)
  } else {
    marks.splice(i, 0, np)
  }
}

const setStrong = (inlines, marks, n, memo) => {
  let i = n + 2
  let j = 0
  let nest = 0
  while (i < inlines.length) {
    if (inlines[i].len === 0) { i += 2; continue }
    //console.log('n: ' + n +  ' [strong]: inlines[n].len: ' + inlines[n].len + ', i: ' + i + ', inlines[i].len: ' + inlines[i].len)

    nest = checkNest(inlines, marks, n, i)
    //console.log('n: ' + n +  ' [strong]: nest: ' + nest)
    if (nest === -1) return n, nest, memo

    if (inlines[i].len === 1 && inlines[n].len > 2) {
      //console.log('n: ' + n +  ' [strong]: check em inside strong: ' + nest)
      marksPush(marks, nest, inlines[n].ep, inlines[n].ep, 1, inlines[n].len - 1, 'em_open')
      marksPush(marks, nest, inlines[i].sp, inlines[i].ep, 1, inlines[i].len - 1, 'em_close')
      inlines[n].len -= 1
      inlines[n].ep -= 1
      inlines[i].len = 0
      inlines[i].sp += 1
      if (i + 2 < inlines.length) {
        i += 2
        nest++
      } else {
        return n, nest, memo
      }
      //console.log(marks)
      //console.log('n: ' + n +  ' [strong]: check em inside strong end.')
    }

    let strongNum = Math.trunc(Math.min(inlines[n].len, inlines[i].len) / 2)
    if (inlines[i].len > 1) {
      //console.log('n: ' + n +  ' [strong]: normal push, nest: ' + nest)
      j = 0
      while (j < strongNum) {
        //console.log('j: ' + j + ', inlines[i].sp: ' + inlines[i].sp)
        marksPush(marks, nest + strongNum - 1 - j , inlines[n].ep - 1, inlines[n].ep, 2, inlines[n].len - 2,'strong_open')
        inlines[n].ep -= 2
        inlines[n].len -= 2
        marksPush(marks, nest + strongNum - 1 - j, inlines[i].sp, inlines[i].sp + 1, 2, inlines[i].len - 2,'strong_close')
        inlines[i].sp += 2
        inlines[i].len -= 2
        //console.log(marks)
        j++
      }

      if (inlines[n].len === 0) return n, nest, memo
    }

    if (inlines[n].len === 1) {
      //console.log('check em that warp strong: ')
      nest++
      n, nest, memo= setEm(inlines, marks, n, memo, nest)
      if (memo.hasEmThatWrapStrong) {
        //console.log('fix strong wrapped em:')
        let k = 0
        while (k < strongNum) {
            marks[marks.length - 2 - k * 2 - 1].nest += 1
            marks[marks.length - 2 - k * 2].nest += 1
          k++
        }
      }
    }

    if (inlines[n].len === 0) return n, nest, memo
    i += 2
  }
  return n, nest, memo
}

const setEm = (inlines, marks, n, memo, sNest) => {
  let i = n + 2
  let nest = 0
  let strongPNum = 0
  while (i < inlines.length) {
    if (inlines[i].len === 0) { i += 2; continue }
    const emNum = Math.min(inlines[n].len, inlines[i].len)
    if (memo.isEm && emNum !== 1) return n, sNest, memo
    //console.log('n: ' + n +  ' [em]: inlines[n].len: ' + inlines[n].len + ', i: ' + i,  ', inlines[i].len: ' + inlines[i].len + ', isEm: ' + memo.isEm)
    //console.log(marks)

    if (memo.isEm && inlines[i].len === 2) {
      strongPNum++
      i += 2
      continue
    }

    if (sNest) {
      nest  = sNest - 1
    } else {
      nest = checkNest(inlines, marks, n, i)
    }
    //console.log('n: ' + n +  ' [em]: nest: ' + nest)
    if (nest === -1) return n, nest, memo

    if (emNum === 1) {
      //console.log('n: ' + n +  ' [em]: normal push, nest: ' + nest)
      //console.log('strongPNum: ' + strongPNum)
      //console.log(inlines[n].ep, inlines[n].sp, inlines[n].s)

      marksPush(marks, nest, inlines[n].ep, inlines[n].ep, 1, inlines[n].len - 1, 'em_open')
      inlines[n].ep -= 1
      inlines[n].len -= 1

      if (strongPNum % 2 === 0 || inlines[i].len < 2) {
        marksPush(marks, nest, inlines[i].sp, inlines[i].sp, 1, inlines[i].len - 1, 'em_close')
        inlines[i].sp += 1
      } else {
        marksPush(marks, nest, inlines[i].ep, inlines[i].ep, 1, inlines[i].len - 1, 'em_close')
        inlines[i].sp = inlines[i].ep - 1
        inlines[i].ep -= 1

      }
      inlines[i].len -= 1
      //console.log(marks)
      if (!memo.isEm) memo.hasEmThatWrapStrong = true
      if (inlines[n].len === 0) return n, nest, memo
    }

    i += 2
  }

  return n, nest, memo
}

const setText = (inlines, marks, n, nest) => {
  //console.log('n: ' + n + ' [text]: inlines[n].len: ' + inlines[n].len)
  //marksPush(marks, -1, inlines[n].sp + 1, inlines[n].ep, inlines[n].len, -1, 'text')
  marksPush(marks, nest, inlines[n].sp, inlines[n].ep, inlines[n].len, -1, 'text')
  //inlines[n].sp +=  1
  inlines[n].len = 0
}

const checkNest = (inlines, marks, n, i) => {
  let nest = 1
  let isRange = true
  if (marks.length === 0) return nest
  let strongNest = 0
  let emNest = 0
  let j = 0
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
    //console.log(parentCloseN, marks[parentCloseN].s, i, inlines[i].s)
    if (marks[parentCloseN].s < inlines[i].s) isRange = false
  }
  //console.log('isRange: ' + isRange)

  if (isRange) {
    nest = parentNest + 1
  } else {
    nest = -1
  }
  return nest
}

const createMarks = (inlines, inlinesStart, inlinesEnd, memo) => {
  let marks = []
  let n = inlinesStart
  while (n < inlinesEnd) {
    if (inlines[n].type !== '') { n += 2; continue }
    if (inlines[n].len === 0) { n += 2; continue }
    memo.isEm =  inlines[n].len === 1 ? true : false
    memo.wrapEm = 0
    let nest = 0
    //console.log('n: ' + n +  ' ----- inlines.length: ' + inlines.length + ', memo.isEm: ' + memo.isEm)
    if (!memo.isEm) {
      n, nest, memo = setStrong(inlines, marks, n, memo)
    }
    n, nest, memo = setEm(inlines, marks, n, memo)

    if (inlines[n].len !== 0) setText(inlines, marks, n, nest)
    n += 2
  }
  return marks
}

const strongJa = (state, silent) => {
  const max = state.posMax
  const start = state.pos
  if (silent) return false
  if (start > max) return false
  if (state.src.charCodeAt(start) !== 0x2A) return false
  if (hasSlashFlag(state, start)) return false
  //console.log('state.src.length: ' + state.src.length + ', start: ' + start +  ', state.src: ' + state.src)
  let inlines = crateInlines(state, start, max)
  //console.log('inlines: ')
  //console.log(inlines)

  const memo = {
    isEm: false,
    hasEmThatWrapStrong: false,
    noSetStrongEnd: false,
    inlineMarkStart: state.src.charCodeAt(0) === 0x2A ? true : false,
    inlineMarkEnd: state.src.charCodeAt(max - 1) === 0x2A ? true : false,
  }
  let marks = createMarks(inlines, 0, inlines.length, memo)
  //console.log('marks: ')
  //console.log(marks)

  let n = 0
  while (n < inlines.length) {
    if (inlines[n].type !== '') { n++; continue }
    let i = 0
    //console.log('n: ' + n + ', inlines[n].s: ' + inlines[n].s + ', inlines[n].e: ' + inlines[n].e)
    let c = 0
    while (i < marks.length) {
      //console.log(marks[i].s, inlines[n].e, marks[i].e, inlines[n].e)
      //console.log(marks[i].s >= inlines[n].s ,  marks[i].e <= inlines[n].e)
      if (marks[i].s >= inlines[n].s && marks[i].e <= inlines[n].e) {
        //console.log('n: ' + n + ', i: ' + i + ', marks[i].type: ' + marks[i].type)
        inlines.splice(n + i + 1, 0, marks[i])
        c++
        i++
        continue
      }
      break
    }
    if (marks.length) {
      marks.splice(0, c)
      inlines.splice(n, 1)
      n += c
    } else {
      inlines[n].type = 'text'
      n++
    }
  }

  //console.log('fix inlines:')
  //console.log(inlines)
  setToken(state, inlines)

  //console.log('state.pos: ' + state.pos + ', inlines[inlines.length - 1].e + 1: ' + (inlines[inlines.length - 1].e + 1) + ', max: ' + max)
  state.pos = inlines[inlines.length - 1].e + 1
  return true
}

const mditStrongJa = (md) => {
  md.inline.ruler.before('emphasis', 'strong_ja', (state, silent) => {
    return strongJa(state, silent)
  })
}
export default mditStrongJa