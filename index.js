const processInlineTokens = (state, start, end, type, max) => {
  let token
  const content = type === 'strong' ? state.src.slice(start, end - 1) : state.src.slice(start, end)

  const childTokens = state.md.parseInline(content, state.env)

  token = state.push(`${type}_open`, type, 1)
  token.markup = type === 'strong' ? '**' : '*'

  if (childTokens[0] && childTokens[0].children) {
    childTokens[0].children.forEach(t => {
      token = state.push(t.type, t.tag, t.nesting)
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

  token = state.push(`${type}_close`, type, -1)
  token.markup = type === 'strong' ? '**' : '*'

  state.pos = end + 1

  if (state.pos === max) {
    state.pos = end
    token = state.push('text', '', 0)
    token.content = '★mdStrongJa★'
  }
}

const strongJa = (state, silent, md) => {
  let end, type
  const max = state.posMax
  const start = state.pos

  if (silent) return false
  if (start + 1 > max) return false
  if (state.src.charCodeAt(start) !== 0x2A)  return false

  if (state.src.charCodeAt(start + 1) === 0x2A) {
    end = start + 2
    type = 'strong'
  } else {
    end = start + 1
    type = 'em'
  }

  while (end < max) {
    if (state.src.charCodeAt(end) === 0x2A) {
      if (type === 'strong' && state.src.charCodeAt(end + 1) === 0x2A) {
        end += 1
        break
      } else if (type === 'em' && (state.src.charCodeAt(end - 1) === 0x2A || state.src.charCodeAt(end + 1) === 0x2A)) {
        end++
        continue
      } else if (type === 'em') {
        break
      }
    }
    end++
  }
  const noContent = type === 'strong' ? end === start + 3 :end === start + 1
  if (end >= max || noContent) {
    state.pos = start
    return false
  }
  //console.log('start: ' + start + ', end: '+ end+ ', state.pos: ' + state.pos)

  processInlineTokens(state, start + (type === 'strong' ? 2 : 1), end, type, max)
  //console.log('output:: state.src.length: ' + state.src.length + ', state.posMax: ' + state.posMax + ', state.pos: ' + state.pos)
  return true
}

/*
const strongJa = (state, silent, md) => {

  let content, token
  let found = false
  const max = state.posMax
  const start = state.pos

//  console.log('input:: state.src.length: ' + state.src.length + ', state.posMax: ' + state.posMax + ', state.pos: ' + state.pos + ', start: ' + start)

  if (silent) return false
  if (start + 3 > max) return false
  if (state.src.charCodeAt(start) !== 0x2A || state.src.charCodeAt(start + 1) !== 0x2A) return false


  let end = start + 2
  while (end < max) {
    if (state.src.charCodeAt(end) === 0x2A && state.src.charCodeAt(end +1) === 0x2A) {
      found = true
      end++
      break
    }
    //state.md.inline.skipToken(state)
    end++
  }
  //console.log('found: ' + found +  ', start: ' + start + ', end: '+ end)

  if (!found) {
    state.pos = start
    return false
  }


  content = state.src.slice(start + 2, end - 1)
  //console.log('content: ' + content)

  token = state.push('strong_open', 'strong', 1)
  token.markup  = '**'

  //**An error will occur if there are [] inside the brackets. I needed an argument for state.env.
  const childTokens = md.parseInline(content, state.env)

  if (childTokens[0] && childTokens[0].children) {
    childTokens[0].children.forEach(t => {
    token = state.push(t.type, t.tag, t.nesting)
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

  token = state.push('strong_close', 'strong', -1)
  token.markup  = '**'

  state.pos = end + 1
  // When there is `** at the end of a paragraph(state.pos === max), if state.pos = end + 1 remains, the output is `</strong>undefined</p>`.
  //For now, I created md.core.ruler.push('remove_strong_ja_sp_chars') and it worked.
  if (state.pos === max) {
    state.pos = end
    token = state.push('text', '', 0)
    token.content = '★mdStrongJa★'
    return true
  }

  //console.log('output:: state.src.length: ' + state.src.length + ', state.posMax: ' + state.posMax + ', state.pos: ' + state.pos)

  return false
}*/
const mdStrongJa = (md) => {
  md.inline.ruler.before('emphasis', 'strong_ja', (state, silent) => {
    strongJa(state, silent, md)
  })
  /*
  md.inline.ruler.before('emphasis', 'em_ja', (state, silent) => {
    emJa(state, silent, md)
  })*/


  md.core.ruler.push('remove_strong_ja_sp_chars', (state) => {
    let i = 0
    while (i < state.tokens.length) {
      //console.log(state.tokens[i].type)
      if (state.tokens[i].type !== 'inline') {
        i++
        continue
      }
      //console.log(state.tokens[i].children)
      if (state.tokens[i].children) {
        if(state.tokens[i].children[state.tokens[i].children.length - 1]) {
          if (state.tokens[i].children[state.tokens[i].children.length - 1].content) {
            if(state.tokens[i].children[state.tokens[i].children.length - 1].content === '★mdStrongJa★*') {
              //console.log(state.tokens[i].children[state.tokens[i].children.length - 1])
              state.tokens[i].children.pop()
            }
          }
        }
      }
      i++
    }
  })
}

export default mdStrongJa