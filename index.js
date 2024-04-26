import mdit from 'markdown-it'

const mdRulerEmphasisJa = (state, silent, mdOptions) => {
  let found, content,token
  const max = state.posMax
  const start = state.pos

  if (state.src.charCodeAt(start) !== 0x2A || state.src.charCodeAt(start + 1) !== 0x2A) return false
  if (silent) return false
  if (start + 3 >= max) return false
  state.pos = start + 2

  while (state.pos < max) {
    if (state.src.charCodeAt(state.pos) === 0x2A && state.src.charCodeAt(state.pos - 1) === 0x2A) {
      found = true
      break
    }
    state.md.inline.skipToken(state);
  }
  //console.log('found: ' + found)

  if (!found || start + 2 === state.pos) {
    state.pos = start
    return false
  }

  content = state.src.slice(start + 2, state.pos - 1)

  if(!mdOptions.html) {
    content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }


  state.posMax = state.pos
  state.pos = start + 2
  //console.log('state.posMax: ' + state.posMax + ', state.pos: ' + state.pos)

  token = state.push('strong_open', 'strong', 1)
  token.markup  = '**'


  const md = new mdit({html: true})
  const childTokens = md.parseInline(content)

  token = childTokens[0].children.map(t => {
    const aToken = state.push(t.type, t.tag, t.nesting)
    aToken.attrs = t.attrs
    aToken.map = t.map
    aToken.level = t.level
    aToken.children = t.children
    aToken.content = t.content
    aToken.markup = t.markup
    aToken.info = t.info
    aToken.meta = t.meta
    aToken.block = t.block
    aToken.hidden = t.hidden
    return aToken
  })

  //  console.log(token)

  token = state.push('strong_close', 'strong', -1)
  token.markup  = '**'

  state.pos = state.posMax + 1
  state.posMax = max

  return
}

const emphasisJa = (md) => {
  md.inline.ruler.before('emphasis', 'emphasis_ja', (state, silent) => {
    mdRulerEmphasisJa(state, silent, md.options)
  })
}

export default emphasisJa
