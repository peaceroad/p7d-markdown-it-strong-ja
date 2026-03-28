const fallbackMarkupByType = (type) => {
  if (type === 'strong_open' || type === 'strong_close') return '**'
  if (type === 'em_open' || type === 'em_close') return '*'
  return ''
}

const makeTokenLiteralText = (token) => {
  if (!token) return
  const literal = token.markup || fallbackMarkupByType(token.type)
  token.type = 'text'
  token.tag = ''
  token.nesting = 0
  token.content = literal
  token.markup = ''
  token.info = ''
}

const sanitizeEmStrongBalance = (tokens, onChangeStart = null) => {
  if (!tokens || tokens.length === 0) return false
  const stack = []
  let changed = false
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || !token.type) continue
    if (token.type === 'strong_open' || token.type === 'em_open') {
      stack.push({ type: token.type, idx: i })
      continue
    }
    if (token.type !== 'strong_close' && token.type !== 'em_close') continue
    const expected = token.type === 'strong_close' ? 'strong_open' : 'em_open'
    if (stack.length > 0 && stack[stack.length - 1].type === expected) {
      stack.pop()
      continue
    }
    if (onChangeStart) onChangeStart(i)
    makeTokenLiteralText(token)
    changed = true
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]
    const token = tokens[entry.idx]
    if (!token) continue
    if (onChangeStart) onChangeStart(entry.idx)
    makeTokenLiteralText(token)
    changed = true
  }
  return changed
}

export { sanitizeEmStrongBalance }
