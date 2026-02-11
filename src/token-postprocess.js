import Token from 'markdown-it/lib/token.mjs'
import { convertCollapsedReferenceLinks, mergeBrokenMarksAroundLinks, getMapFromTokenRange } from './token-link-utils.js'
import {
  rebuildInlineLevels,
  findLinkClose,
  fixEmOuterStrongSequence,
  fixLeadingAsteriskEm,
  fixTrailingStrong
} from './token-core.js'
import { getRuntimeOpt } from './token-utils.js'

const scanBrokenRefState = (text, out) => {
  if (!text || text.indexOf('][') === -1) {
    out.depth = 0
    out.brokenEnd = false
    return out
  }
  let depth = 0
  let lastOpen = -1
  let lastClose = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (ch === 0x5B) {
      depth++
      lastOpen = i
    } else if (ch === 0x5D) {
      if (depth > 0) depth--
      lastClose = i
    }
  }
  out.depth = depth
  out.brokenEnd = depth > 0 && lastOpen > lastClose
  return out
}

const updateBracketDepth = (text, depth) => {
  if (!text || depth <= 0) return depth
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (ch === 0x5B) {
      depth++
    } else if (ch === 0x5D) {
      if (depth > 0) {
        depth--
        if (depth === 0) return 0
      }
    }
  }
  return depth
}

const getAttr = (token, name) => {
  if (!token || !token.attrs) return ''
  for (let i = 0; i < token.attrs.length; i++) {
    if (token.attrs[i][0] === name) return token.attrs[i][1]
  }
  return ''
}

const buildLabelText = (tokens, startIdx, endIdx) => {
  let label = ''
  for (let i = startIdx; i <= endIdx; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.type === 'text') {
      label += t.content
    } else if (t.type === 'code_inline') {
      const fence = t.markup || '`'
      label += fence + t.content + fence
    } else if (t.markup) {
      label += t.markup
    }
  }
  return label
}

const buildRawFromTokens = (tokens, startIdx, endIdx) => {
  let raw = ''
  for (let i = startIdx; i <= endIdx; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.type === 'link_open') {
      const closeIdx = findLinkClose(tokens, i)
      if (closeIdx === -1 || closeIdx > endIdx) break
      const label = buildLabelText(tokens, i + 1, closeIdx - 1)
      const href = getAttr(t, 'href')
      raw += `[${label}](${href || ''})`
      i = closeIdx
      continue
    }
    if (t.type === 'text') {
      raw += t.content
      continue
    }
    if (t.type === 'code_inline') {
      const fence = t.markup || '`'
      raw += fence + t.content + fence
      continue
    }
    if (t.markup) {
      raw += t.markup
    }
  }
  return raw
}

const parseInlineWithFixes = (md, raw, env) => {
  const parsed = md.parseInline(raw, env)
  const inline = parsed && parsed.length > 0 ? parsed[0] : null
  if (!inline || !inline.children) return null
  const children = inline.children
  let changed = false
  if (fixEmOuterStrongSequence(children)) changed = true
  if (fixLeadingAsteriskEm(children)) changed = true
  if (fixTrailingStrong(children)) changed = true
  if (changed) rebuildInlineLevels(children)
  return children
}

const hasUnsafeAttrs = (token) => {
  if (!token) return false
  if (token.meta && Object.keys(token.meta).length > 0) return true
  if (!token.attrs || token.attrs.length === 0) return false
  if (token.type !== 'link_open') return true
  for (let i = 0; i < token.attrs.length; i++) {
    const name = token.attrs[i][0]
    if (name !== 'href' && name !== 'title') return true
  }
  return false
}

const REPARSE_ALLOWED_TYPES = new Set([
  'text',
  'strong_open',
  'strong_close',
  'em_open',
  'em_close',
  'code_inline',
  'link_open',
  'link_close',
  'softbreak',
  'hardbreak'
])

const shouldReparseSegment = (tokens, startIdx, endIdx) => {
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (hasUnsafeAttrs(t)) return false
    if (t.type && !REPARSE_ALLOWED_TYPES.has(t.type)) return false
  }
  return true
}

const fixTailAfterLinkStrongClose = (tokens, md, env) => {
  let strongDepth = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.type === 'strong_open') strongDepth++
    if (t.type === 'strong_close') {
      if (strongDepth > 0) strongDepth--
    }
    if (t.type !== 'link_close') continue
    if (strongDepth !== 0) continue
    let startIdx = -1
    let foundStrongClose = -1
    let foundStrongOpen = -1
    for (let j = i + 1; j < tokens.length; j++) {
      const node = tokens[j]
      if (!node) continue
      if (node.type === 'strong_open') {
        foundStrongOpen = j
        break
      }
      if (node.type === 'strong_close') {
        foundStrongClose = j
        break
      }
      if (node.type === 'text' && node.content && startIdx === -1) {
        startIdx = j
      }
    }
    if (foundStrongClose === -1 || foundStrongOpen !== -1) continue
    if (startIdx === -1) startIdx = foundStrongClose
    const raw = buildRawFromTokens(tokens, startIdx, tokens.length - 1)
    const children = parseInlineWithFixes(md, raw, env)
    if (children && children.length > 0) {
      tokens.splice(startIdx, tokens.length - startIdx, ...children)
      return true
    }
  }
  return false
}

const registerTokenPostprocess = (md, baseOpt, getNoLinkMdInstance) => {
  if (md.__strongJaTokenPostprocessRegistered) return
  md.__strongJaTokenPostprocessRegistered = true
  md.core.ruler.after('inline', 'strong_ja_token_postprocess', (state) => {
    if (!state || !state.tokens) return
    const opt = getRuntimeOpt(state, baseOpt)
    if (opt.postprocess === false) return
    if (state.__strongJaReferenceCount === undefined) {
      const references = state.env && state.env.references
      state.__strongJaReferenceCount = references ? Object.keys(references).length : 0
    }
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]
      if (!token || token.type !== 'inline' || !token.children || token.children.length === 0) continue
      const inlineContent = token.content
      if (typeof inlineContent === 'string' &&
          inlineContent.indexOf('[') === -1 &&
          inlineContent.indexOf(']') === -1 &&
          inlineContent.indexOf('*') === -1 &&
          inlineContent.indexOf('_') === -1) {
        continue
      }
      const children = token.children
      let changed = false
      let hasBracketText = false
      let hasEmphasis = false
      let hasLinkOpen = false
      let hasLinkClose = false
      let reparseCount = 0
      let maxReparse = 0
      const scanState = { depth: 0, brokenEnd: false }
      for (let j = 0; j < children.length; j++) {
        const child = children[j]
        if (!child) continue
        if (!hasEmphasis &&
            (child.type === 'strong_open' || child.type === 'strong_close' || child.type === 'em_open' || child.type === 'em_close')) {
          hasEmphasis = true
        }
        if (!hasLinkOpen && child.type === 'link_open') {
          hasLinkOpen = true
        }
        if (!hasLinkClose && child.type === 'link_close') {
          hasLinkClose = true
        }
        if (child.type !== 'text' || !child.content) continue
        if (!hasBracketText && (child.content.indexOf('[') !== -1 || child.content.indexOf(']') !== -1)) {
          hasBracketText = true
        }
        if (scanBrokenRefState(child.content, scanState).brokenEnd) {
          maxReparse++
        }
      }
      if (maxReparse !== 0 && hasLinkOpen) {
        let allowReparse = true
        while (true) {
          let didReparse = false
          let brokenRefStart = -1
          let brokenRefDepth = 0
          hasBracketText = false
          hasEmphasis = false
          hasLinkClose = false
          for (let j = 0; j < children.length; j++) {
            const child = children[j]
            if (!child) continue
            if (child.type === 'text' && child.content) {
              if (!hasBracketText && (child.content.indexOf('[') !== -1 || child.content.indexOf(']') !== -1)) {
                hasBracketText = true
              }
              if (brokenRefStart === -1) {
                const scan = scanBrokenRefState(child.content, scanState)
                if (scan.brokenEnd) {
                  brokenRefStart = j
                  brokenRefDepth = scan.depth
                  continue
                }
              } else {
                brokenRefDepth = updateBracketDepth(child.content, brokenRefDepth)
                if (brokenRefDepth <= 0) {
                  brokenRefStart = -1
                  brokenRefDepth = 0
                }
              }
            }
            if (!hasEmphasis &&
                (child.type === 'strong_open' || child.type === 'strong_close' || child.type === 'em_open' || child.type === 'em_close')) {
              hasEmphasis = true
            }
            if (!hasLinkClose && child.type === 'link_close') {
              hasLinkClose = true
            }
            if (allowReparse && brokenRefStart !== -1 && child.type === 'link_open') {
              if (brokenRefDepth <= 0) {
                brokenRefStart = -1
                brokenRefDepth = 0
                continue
              }
              const closeIdx = findLinkClose(children, j)
              if (closeIdx !== -1) {
                if (shouldReparseSegment(children, brokenRefStart, closeIdx)) {
                  const originalMap = getMapFromTokenRange(children, brokenRefStart, closeIdx)
                  const raw = buildRawFromTokens(children, brokenRefStart, closeIdx)
                  const noLink = getNoLinkMdInstance(md, opt)
                  const parsed = parseInlineWithFixes(noLink, raw, state.env)
                  if (parsed && parsed.length > 0) {
                    if (originalMap) {
                      for (let k = 0; k < parsed.length; k++) {
                        const childToken = parsed[k]
                        if (childToken && !childToken.map) childToken.map = [originalMap[0], originalMap[1]]
                      }
                    }
                    children.splice(brokenRefStart, closeIdx - brokenRefStart + 1, ...parsed)
                  } else {
                    const text = new Token('text', '', 0)
                    text.content = raw
                    if (originalMap) text.map = [originalMap[0], originalMap[1]]
                    children.splice(brokenRefStart, closeIdx - brokenRefStart + 1, text)
                  }
                  brokenRefStart = -1
                  changed = true
                  didReparse = true
                  break
                }
                brokenRefStart = -1
              }
            }
          }
          if (!didReparse) break
          reparseCount++
          if (reparseCount >= maxReparse) {
            allowReparse = false
          }
          if (!allowReparse) {
            continue
          }
        }
      }
      if (hasEmphasis) {
        if (fixEmOuterStrongSequence(children)) changed = true
        if (hasLinkClose && fixTailAfterLinkStrongClose(children, md, state.env)) changed = true
        if (hasLinkClose && fixLeadingAsteriskEm(children)) changed = true
        if (fixTrailingStrong(children)) changed = true
      }
      if (changed) rebuildInlineLevels(children)
      if (!hasBracketText) continue
      convertCollapsedReferenceLinks(children, state)
      mergeBrokenMarksAroundLinks(children)
    }
  })
}

export { registerTokenPostprocess }
