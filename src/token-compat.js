import Token from 'markdown-it/lib/token.mjs'
import {
  REG_ATTRS,
  isJapaneseChar,
  hasCjkBreaksRule,
  getRuntimeOpt,
  moveRuleAfter
} from './token-utils.js'

const isAsciiWordCode = (code) => {
  return (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5A) ||
    (code >= 0x61 && code <= 0x7A)
}

const registerTokenCompat = (md, baseOpt) => {
  let hasTextJoinRule = false
  const coreRules = md.core && md.core.ruler && Array.isArray(md.core.ruler.__rules__)
    ? md.core.ruler.__rules__
    : null
  if (coreRules) {
    for (let i = 0; i < coreRules.length; i++) {
      const rule = coreRules[i]
      if (rule && rule.name === 'text_join') {
        hasTextJoinRule = true
        break
      }
    }
  }

  if (!md.__strongJaTokenTrimTrailingRegistered) {
    md.__strongJaTokenTrimTrailingRegistered = true
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
        const lastCode = tail.content.charCodeAt(tail.content.length - 1)
        if (lastCode !== 0x20 && lastCode !== 0x09) continue
        const trimmed = tail.content.replace(/[ \t]+$/, '')
        if (trimmed !== tail.content) {
          tail.content = trimmed
        }
      }
    }
    if (hasTextJoinRule) {
      md.core.ruler.after('text_join', 'strong_ja_trim_trailing_spaces', trimInlineTrailingSpaces)
    } else {
      md.core.ruler.after('inline', 'strong_ja_trim_trailing_spaces', trimInlineTrailingSpaces)
    }
  }

  if (!md.__strongJaTokenSoftbreakSpacingRegistered) {
    md.__strongJaTokenSoftbreakSpacingRegistered = true
    const normalizeSoftbreakSpacing = (state) => {
      if (!state) return
      if (baseOpt.hasCjkBreaks !== true && state.md) {
        baseOpt.hasCjkBreaks = hasCjkBreaksRule(state.md)
      }
      if (baseOpt.hasCjkBreaks !== true) return
      if (!state.tokens || state.tokens.length === 0) return
      for (let i = 0; i < state.tokens.length; i++) {
        const token = state.tokens[i]
        if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) continue
        let hasEmphasis = false
        for (let j = 0; j < token.children.length; j++) {
          const child = token.children[j]
          if (!child) continue
          if (child.type === 'strong_open' || child.type === 'strong_close' || child.type === 'em_open' || child.type === 'em_close') {
            hasEmphasis = true
            break
          }
        }
        if (!hasEmphasis) continue
        for (let j = 0; j < token.children.length; j++) {
          const child = token.children[j]
          if (!child) continue
          if (child.type === 'softbreak') {
            const prevToken = token.children[j - 1]
            const nextToken = token.children[j + 1]
            if (!prevToken || !nextToken) continue
            if (prevToken.type !== 'text' || !prevToken.content) continue
            if (nextToken.type !== 'text' || !nextToken.content) continue
            const prevCharCode = prevToken.content.charCodeAt(prevToken.content.length - 1)
            const nextCharCode = nextToken.content.charCodeAt(0)
            const isAsciiWord = isAsciiWordCode(nextCharCode)
            const shouldReplace = isAsciiWord &&
              isJapaneseChar(prevCharCode) && !isJapaneseChar(nextCharCode)
            if (!shouldReplace) continue
            child.type = 'text'
            child.tag = ''
            child.content = ' '
            child.markup = ''
            child.info = ''
            continue
          }
          if (child.type !== 'text' || !child.content) continue
          if (child.content.indexOf('\n') === -1) continue
          let normalized = ''
          for (let idx = 0; idx < child.content.length; idx++) {
            const ch = child.content[idx]
            if (ch === '\n') {
              const prevCharCode = idx > 0 ? child.content.charCodeAt(idx - 1) : 0
              const nextCharCode = idx + 1 < child.content.length ? child.content.charCodeAt(idx + 1) : 0
              const isAsciiWord = isAsciiWordCode(nextCharCode)
              const shouldReplace = isAsciiWord &&
                isJapaneseChar(prevCharCode) && !isJapaneseChar(nextCharCode)
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
  }

  const restoreSoftbreaksAfterCjk = (state) => {
    if (!state) return
    const overrideOpt = state.env && state.env.__strongJaTokenOpt
    if (overrideOpt) {
      const opt = getRuntimeOpt(state, baseOpt)
      if (opt.mditAttrs !== false) return
    }
    if (!state.md || state.md.__strongJaRestoreSoftbreaksForAttrs !== true) return
    if (baseOpt.hasCjkBreaks !== true && state.md) {
      baseOpt.hasCjkBreaks = hasCjkBreaksRule(state.md)
    }
    if (baseOpt.hasCjkBreaks !== true) return
    if (!state.tokens || state.tokens.length === 0) return
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) continue
      const children = token.children
      let prevTextCharCode = 0
      for (let j = 0; j < children.length; j++) {
        const child = children[j]
        if (!child) continue
        if (child.type === 'text') {
          if (child.content === '') {
            if (!prevTextCharCode || !isJapaneseChar(prevTextCharCode)) continue
            const next = children[j + 1]
            if (!next || next.type !== 'text' || !next.content) continue
            const nextCharCode = next.content.charCodeAt(0)
            if (nextCharCode !== 0x7B) continue
            child.type = 'softbreak'
            child.tag = ''
            child.content = '\n'
            child.markup = ''
            child.info = ''
            continue
          }
          prevTextCharCode = child.content.charCodeAt(child.content.length - 1)
        }
      }
    }
  }

  const registerRestoreSoftbreaks = () => {
    if (baseOpt.mditAttrs !== false) return
    if (md.__strongJaTokenRestoreRegistered) return
    const anchorRule = hasTextJoinRule ? 'text_join' : 'inline'
    const added = md.core.ruler.after(anchorRule, 'strong_ja_restore_softbreaks', restoreSoftbreaksAfterCjk)
    if (added !== false) {
      md.__strongJaTokenRestoreRegistered = true
      md.__strongJaRestoreSoftbreaksForAttrs = baseOpt.mditAttrs === false
      if (baseOpt.patchCorePush !== false && !md.__strongJaTokenPatchCorePush) {
        md.__strongJaTokenPatchCorePush = true
        const originalPush = md.core.ruler.push.bind(md.core.ruler)
        md.core.ruler.push = (name, fn, options) => {
          const res = originalPush(name, fn, options)
          if (typeof name === 'string' && name.indexOf('cjk_breaks') !== -1) {
            baseOpt.hasCjkBreaks = true
            moveRuleAfter(md.core.ruler, 'strong_ja_restore_softbreaks', name)
          }
          return res
        }
      }
      if (baseOpt.hasCjkBreaks) {
        moveRuleAfter(md.core.ruler, 'strong_ja_restore_softbreaks', 'cjk_breaks')
      }
    }
  }
  registerRestoreSoftbreaks()

  if (baseOpt.mditAttrs !== false && !md.__strongJaTokenPreAttrsRegistered) {
    md.__strongJaTokenPreAttrsRegistered = true
    md.core.ruler.before('linkify', 'strong_ja_token_pre_attrs', (state) => {
      if (!state || !state.tokens) return
      const overrideOpt = state.env && state.env.__strongJaTokenOpt
      if (overrideOpt) {
        const opt = getRuntimeOpt(state, baseOpt)
        if (opt.mditAttrs === false) return
      }
      for (let i = 0; i < state.tokens.length; i++) {
        const token = state.tokens[i]
        if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) continue
        const children = token.children
        let lastMeaningful = children.length - 1
        while (lastMeaningful >= 0) {
          const child = children[lastMeaningful]
          if (!child) {
            lastMeaningful--
            continue
          }
          if (child.type === 'text' && child.content === '') {
            lastMeaningful--
            continue
          }
          break
        }
        for (let j = 0; j <= lastMeaningful; j++) {
          const child = children[j]
          if (!child || child.type !== 'text' || !child.content) continue
          const content = child.content
          if (content.charCodeAt(0) !== 0x7B || content.charCodeAt(content.length - 1) !== 0x7D) continue
          if (REG_ATTRS.test(content)) continue
          if (j !== lastMeaningful) continue
          const placeholder = new Token('text', '', 0)
          placeholder.content = ''
          children.splice(j + 1, 0, placeholder)
          lastMeaningful = j
          j++
        }
      }
    })
  }
}

export { registerTokenCompat }
