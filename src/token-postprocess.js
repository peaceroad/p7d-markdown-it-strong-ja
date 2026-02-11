import Token from 'markdown-it/lib/token.mjs'
import { convertCollapsedReferenceLinks, mergeBrokenMarksAroundLinks, getMapFromTokenRange } from './token-link-utils.js'
import {
  rebuildInlineLevels,
  fixEmOuterStrongSequence,
  fixLeadingAsteriskEm,
  fixTrailingStrong
} from './token-core.js'
import { getRuntimeOpt, isJapaneseChar, resolveMode } from './token-utils.js'

const ISLAND_PREFIX = '\uE000SJI'
const ISLAND_SUFFIX = '\uE001'
const MAX_ISLAND_BUILD_RETRIES = 16
let islandNonceSeq = 0

const scanBrokenRefState = (text, out) => {
  if (!text || text.indexOf('[') === -1) {
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

const getLinkHrefTitle = (token) => {
  let href = ''
  let title = ''
  if (!token || !token.attrs) return { href, title }
  for (let i = 0; i < token.attrs.length; i++) {
    const pair = token.attrs[i]
    if (!pair) continue
    if (pair[0] === 'href') href = pair[1]
    else if (pair[0] === 'title') title = pair[1]
    if (href && title) break
  }
  return { href, title }
}

const quoteLinkTitle = (title) => {
  if (!title) return ''
  const quote = title.indexOf('"') === -1 ? '"' : '\''
  let escaped = ''
  for (let i = 0; i < title.length; i++) {
    const ch = title[i]
    if (ch === '\n' || ch === '\r') {
      escaped += ' '
      continue
    }
    if (ch === '\\' || ch === quote) {
      escaped += '\\'
    }
    escaped += ch
  }
  return `${quote}${escaped}${quote}`
}

const hasOwnMeta = (token) => {
  if (!token || !token.meta) return false
  for (const key in token.meta) {
    if (Object.prototype.hasOwnProperty.call(token.meta, key)) return true
  }
  return false
}

const hasUnsafeLinkAttrs = (token) => {
  if (!token || !token.attrs) return false
  for (let i = 0; i < token.attrs.length; i++) {
    const pair = token.attrs[i]
    if (!pair || pair.length === 0) continue
    const name = pair[0]
    if (name !== 'href' && name !== 'title') return true
  }
  return false
}

const occursExactlyOnce = (text, pattern) => {
  if (!text || !pattern) return false
  const first = text.indexOf(pattern)
  if (first === -1) return false
  return text.indexOf(pattern, first + pattern.length) === -1
}

const hasIslandCollision = (raw, islands) => {
  if (!raw || !islands || islands.size === 0) return false
  for (const marker of islands.keys()) {
    if (!occursExactlyOnce(raw, marker)) return true
  }
  return false
}

const addIsland = (ctx, islandTokens) => {
  const marker = `${ISLAND_PREFIX}${ctx.nonce}:${ctx.nextId}${ISLAND_SUFFIX}`
  ctx.nextId++
  ctx.islands.set(marker, islandTokens)
  return marker
}

const appendTokenAsMarkdown = (raw, token, ctx) => {
  if (!token) return raw
  if (hasOwnMeta(token)) return raw + addIsland(ctx, [token])
  if (token.type === 'text') {
    if (token.content) raw += token.content
    return raw
  }
  if (token.type === 'softbreak') return raw + '\n'
  if (token.type === 'hardbreak') return raw + '  \n'
  if (token.type === 'code_inline') {
    const fence = token.markup || '`'
    return raw + fence + token.content + fence
  }
  if (token.type === 'html_inline') return raw + (token.content || '')
  if ((token.type === 'strong_open' || token.type === 'strong_close' ||
       token.type === 'em_open' || token.type === 'em_close') && token.markup) {
    return raw + token.markup
  }
  if (token.type && token.markup &&
      (token.type.endsWith('_open') || token.type.endsWith('_close'))) {
    return raw + token.markup
  }
  if (token.markup) return raw + token.markup
  return raw + addIsland(ctx, [token])
}

const serializeTokenRange = (tokens, startIdx, endIdx, ctx, linkCloseMap) => {
  let raw = ''
  for (let i = startIdx; i <= endIdx; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.type === 'link_open') {
      const closeIdx = linkCloseMap.get(i) ?? -1
      if (closeIdx === -1 || closeIdx > endIdx) {
        raw += addIsland(ctx, [t])
        continue
      }
      if (hasOwnMeta(t) || hasUnsafeLinkAttrs(t)) {
        raw += addIsland(ctx, tokens.slice(i, closeIdx + 1))
        i = closeIdx
        continue
      }
      const label = serializeTokenRange(tokens, i + 1, closeIdx - 1, ctx, linkCloseMap)
      if (label === null) return null
      const { href, title } = getLinkHrefTitle(t)
      const titlePart = title ? ` ${quoteLinkTitle(title)}` : ''
      raw += `[${label}](${href || ''}${titlePart})`
      i = closeIdx
      continue
    }
    if (t.type === 'link_close') {
      raw += addIsland(ctx, [t])
      continue
    }
    raw = appendTokenAsMarkdown(raw, t, ctx)
  }
  return raw
}

const buildLinkCloseMap = (tokens, startIdx, endIdx) => {
  const closeMap = new Map()
  const stack = []
  for (let i = startIdx; i <= endIdx; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.type === 'link_open') {
      stack.push(i)
      continue
    }
    if (token.type !== 'link_close' || stack.length === 0) continue
    closeMap.set(stack.pop(), i)
  }
  return closeMap
}

const buildRawFromTokens = (tokens, startIdx, endIdx) => {
  const linkCloseMap = buildLinkCloseMap(tokens, startIdx, endIdx)
  for (let attempt = 0; attempt < MAX_ISLAND_BUILD_RETRIES; attempt++) {
    const ctx = { nextId: 0, islands: new Map(), nonce: (islandNonceSeq++).toString(36) }
    const raw = serializeTokenRange(tokens, startIdx, endIdx, ctx, linkCloseMap)
    if (raw === null) return null
    if (!hasIslandCollision(raw, ctx.islands)) {
      return { raw, islands: ctx.islands }
    }
  }
  return null
}

const cloneTextLike = (source, content) => {
  const token = new Token('text', '', 0)
  Object.assign(token, source)
  token.content = content
  if (source.meta) token.meta = { ...source.meta }
  return token
}

const restoreIslands = (tokens, islands) => {
  if (!tokens || tokens.length === 0 || !islands || islands.size === 0) return tokens
  const restored = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.type !== 'text' || !token.content) {
      restored.push(token)
      continue
    }
    const content = token.content
    let cursor = 0
    let hit = false
    while (cursor < content.length) {
      const start = content.indexOf(ISLAND_PREFIX, cursor)
      if (start === -1) break
      const end = content.indexOf(ISLAND_SUFFIX, start + ISLAND_PREFIX.length)
      if (end === -1) break
      hit = true
      if (start > cursor) {
        restored.push(cloneTextLike(token, content.slice(cursor, start)))
      }
      const marker = content.slice(start, end + ISLAND_SUFFIX.length)
      const island = islands.get(marker)
      if (island && island.length > 0) {
        for (let j = 0; j < island.length; j++) restored.push(island[j])
      } else {
        restored.push(cloneTextLike(token, marker))
      }
      cursor = end + ISLAND_SUFFIX.length
    }
    if (!hit) {
      restored.push(token)
      continue
    }
    if (cursor < content.length) {
      restored.push(cloneTextLike(token, content.slice(cursor)))
    }
  }
  return restored
}

const parseInlineWithFixes = (md, raw, env) => {
  if (!raw) return null
  let parsed = null
  try {
    parsed = md.parseInline(raw, env)
  } catch {
    return null
  }
  const inline = parsed && parsed.length > 0 ? parsed[0] : null
  if (!inline || !inline.children) return null
  const children = inline.children
  let changed = false
  if (fixEmOuterStrongSequence(children)) changed = true
  if (fixLeadingAsteriskEm(children)) changed = true
  if (fixTrailingStrong(children)) changed = true
  if (sanitizeEmStrongBalance(children)) changed = true
  if (changed) rebuildInlineLevels(children)
  return children
}

const getInlineWrapperBase = (type) => {
  if (!type || typeof type !== 'string') return ''
  if (type === 'link_open' || type === 'link_close') return ''
  if (type.endsWith('_open')) return type.slice(0, -5)
  if (type.endsWith('_close')) return type.slice(0, -6)
  return ''
}

const expandSegmentEndForWrapperBalance = (tokens, startIdx, endIdx) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return endIdx
  const depthMap = new Map()
  let openDepthTotal = 0
  let expandedEnd = endIdx

  for (let i = startIdx; i <= expandedEnd; i++) {
    const token = tokens[i]
    if (!token || !token.type) continue
    const base = getInlineWrapperBase(token.type)
    if (!base) continue
    if (token.type.endsWith('_open')) {
      depthMap.set(base, (depthMap.get(base) || 0) + 1)
      openDepthTotal++
      continue
    }
    const prev = depthMap.get(base) || 0
    if (prev > 0) {
      depthMap.set(base, prev - 1)
      openDepthTotal--
    }
  }

  while (openDepthTotal > 0 && expandedEnd + 1 < tokens.length) {
    expandedEnd++
    const token = tokens[expandedEnd]
    if (!token || !token.type) continue
    const base = getInlineWrapperBase(token.type)
    if (!base) continue
    if (token.type.endsWith('_open')) {
      depthMap.set(base, (depthMap.get(base) || 0) + 1)
      openDepthTotal++
      continue
    }
    const prev = depthMap.get(base) || 0
    if (prev > 0) {
      depthMap.set(base, prev - 1)
      openDepthTotal--
    }
  }

  return openDepthTotal > 0 ? -1 : expandedEnd
}

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

const sanitizeEmStrongBalance = (tokens) => {
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
    makeTokenLiteralText(token)
    changed = true
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]
    const token = tokens[entry.idx]
    if (!token) continue
    makeTokenLiteralText(token)
    changed = true
  }
  return changed
}

const hasJapaneseContextInRange = (tokens, startIdx, endIdx) => {
  if (!tokens || startIdx < 0 || endIdx < startIdx) return false
  for (let i = startIdx; i <= endIdx && i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.type !== 'text' && token.type !== 'code_inline') continue
    const content = token.content
    if (!content) continue
    for (let j = 0; j < content.length; j++) {
      if (isJapaneseChar(content.charCodeAt(j))) return true
    }
  }
  return false
}

const fixTailAfterLinkStrongClose = (tokens, md, env, mode) => {
  const isJapaneseMode = mode === 'japanese'
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
    if (isJapaneseMode && !hasJapaneseContextInRange(tokens, startIdx, tokens.length - 1)) continue
    const serialized = buildRawFromTokens(tokens, startIdx, tokens.length - 1)
    if (!serialized || !serialized.raw) continue
    const parsed = parseInlineWithFixes(md, serialized.raw, env)
    const children = restoreIslands(parsed, serialized.islands)
    if (children && children.length > 0) {
      tokens.splice(startIdx, tokens.length - startIdx, ...children)
      return true
    }
  }
  return false
}

const registerTokenPostprocess = (md, baseOpt, getReparseMdInstance) => {
  if (md.__strongJaTokenPostprocessRegistered) return
  md.__strongJaTokenPostprocessRegistered = true
  md.core.ruler.after('inline', 'strong_ja_token_postprocess', (state) => {
    if (!state || !state.tokens) return
    const opt = getRuntimeOpt(state, baseOpt)
    const mode = resolveMode(opt)
    if (mode === 'compatible') return
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
      if (mode === 'japanese' && !hasJapaneseContextInRange(children, 0, children.length - 1)) {
        continue
      }
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
        if (hasEmphasis && hasBracketText && hasLinkOpen && hasLinkClose) break
      }
      if (!hasEmphasis && !hasBracketText) continue
      if (hasLinkOpen && hasLinkClose && hasBracketText && state.__strongJaReferenceCount > 0) {
        for (let j = 0; j < children.length; j++) {
          const child = children[j]
          if (!child || child.type !== 'text' || !child.content) continue
          if (scanBrokenRefState(child.content, scanState).brokenEnd) {
            maxReparse++
          }
        }
      }
      if (maxReparse !== 0) {
        while (reparseCount < maxReparse) {
          let didReparse = false
          let brokenRefStart = -1
          let brokenRefDepth = 0
          const linkCloseMap = buildLinkCloseMap(children, 0, children.length - 1)
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
            if (brokenRefStart !== -1 && child.type === 'link_open') {
              if (brokenRefDepth <= 0) {
                brokenRefStart = -1
                brokenRefDepth = 0
                continue
              }
              const closeIdx = linkCloseMap.get(j) ?? -1
              if (closeIdx !== -1) {
                const segmentEnd = expandSegmentEndForWrapperBalance(children, brokenRefStart, closeIdx)
                if (segmentEnd === -1) {
                  brokenRefStart = -1
                  continue
                }
                const originalMap = getMapFromTokenRange(children, brokenRefStart, segmentEnd)
                const serialized = buildRawFromTokens(children, brokenRefStart, segmentEnd)
                if (!serialized || !serialized.raw) {
                  brokenRefStart = -1
                  continue
                }
                const reparseMd = typeof getReparseMdInstance === 'function'
                  ? getReparseMdInstance(md, opt)
                  : md
                const parsed = parseInlineWithFixes(reparseMd, serialized.raw, state.env)
                const restored = restoreIslands(parsed, serialized.islands)
                if (restored && restored.length > 0) {
                  if (originalMap) {
                    for (let k = 0; k < restored.length; k++) {
                      const childToken = restored[k]
                      if (childToken && !childToken.map) childToken.map = [originalMap[0], originalMap[1]]
                    }
                  }
                  children.splice(brokenRefStart, segmentEnd - brokenRefStart + 1, ...restored)
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
        }
      }
      if (hasEmphasis) {
        if (fixEmOuterStrongSequence(children)) changed = true
        if (hasLinkClose && fixTailAfterLinkStrongClose(children, md, state.env, mode)) changed = true
        if (hasLinkClose && fixLeadingAsteriskEm(children)) changed = true
        if (fixTrailingStrong(children)) changed = true
        if (sanitizeEmStrongBalance(children)) changed = true
      }
      if (changed) rebuildInlineLevels(children)
      if (!hasBracketText) continue
      convertCollapsedReferenceLinks(children, state)
      mergeBrokenMarksAroundLinks(children)
    }
  })
}

export { registerTokenPostprocess }
