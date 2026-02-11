const CHAR_ASTERISK = 0x2A // *
const CHAR_SPACE = 0x20 // ' '
const CHAR_TAB = 0x09 // '\t'
const CHAR_NEWLINE = 0x0A // '\n'
const REG_JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]/u
const REG_ATTRS = /{[^{}\n!@#%^&*()]+?}$/

const isJapaneseChar = (ch) => {
  if (!ch) return false
  const code = typeof ch === 'string' ? ch.charCodeAt(0) : ch
  if (code < 128) return false
  if (code >= 0x3040 && code <= 0x309F) return true
  if (code >= 0x30A0 && code <= 0x30FF) return true
  if (code >= 0x4E00 && code <= 0x9FAF) return true
  return REG_JAPANESE.test(String.fromCharCode(code))
}

const hasCjkBreaksRule = (md) => {
  if (!md || !md.core || !md.core.ruler || !Array.isArray(md.core.ruler.__rules__)) return false
  if (md.__strongJaHasCjkBreaks === true) return true
  const rules = md.core.ruler.__rules__
  for (let idx = 0; idx < rules.length; idx++) {
    const rule = rules[idx]
    if (rule && typeof rule.name === 'string' && rule.name.indexOf('cjk_breaks') !== -1) {
      md.__strongJaHasCjkBreaks = true
      return true
    }
  }
  return false
}

const findPrevNonSpace = (src, start) => {
  for (let i = start; i >= 0; i--) {
    const ch = src.charCodeAt(i)
    if (ch === CHAR_NEWLINE) return 0
    if (ch === CHAR_SPACE || ch === CHAR_TAB) continue
    return ch
  }
  return 0
}

const findNextNonSpace = (src, start, max) => {
  for (let i = start; i < max; i++) {
    const ch = src.charCodeAt(i)
    if (ch === CHAR_NEWLINE) return 0
    if (ch === CHAR_SPACE || ch === CHAR_TAB) continue
    return ch
  }
  return 0
}

const resolveMode = (opt) => {
  const raw = opt && typeof opt.mode === 'string' ? opt.mode : 'japanese'
  const mode = raw.toLowerCase()
  if (mode === 'japanese-only') return 'japanese'
  return mode
}

const getRuntimeOpt = (state, baseOpt) => {
  if (!state || !state.env || !state.env.__strongJaTokenOpt) return baseOpt
  const override = state.env.__strongJaTokenOpt
  if (state.__strongJaTokenRuntimeOpt &&
      state.__strongJaTokenRuntimeBase === baseOpt &&
      state.__strongJaTokenRuntimeOverride === override) {
    return state.__strongJaTokenRuntimeOpt
  }
  const merged = { ...baseOpt, ...override }
  state.__strongJaTokenRuntimeOpt = merged
  state.__strongJaTokenRuntimeBase = baseOpt
  state.__strongJaTokenRuntimeOverride = override
  return merged
}

function normalizeCoreRulesBeforePostprocess(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  const normalized = []
  const seen = new Set()
  for (let idx = 0; idx < list.length; idx++) {
    const raw = list[idx]
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}

function ensureCoreRuleOrder(md, ruleNames, targetRuleName) {
  if (!md || !md.core || !md.core.ruler) return
  if (!ruleNames || ruleNames.length === 0) return
  for (let idx = 0; idx < ruleNames.length; idx++) {
    moveRuleBefore(md.core.ruler, ruleNames[idx], targetRuleName)
  }
}

function moveRuleBefore(ruler, ruleName, beforeName) {
  if (!ruler || !ruler.__rules__) return
  const rules = ruler.__rules__
  let fromIdx = -1
  let beforeIdx = -1
  for (let idx = 0; idx < rules.length; idx++) {
    if (rules[idx].name === ruleName) fromIdx = idx
    if (rules[idx].name === beforeName) beforeIdx = idx
    if (fromIdx !== -1 && beforeIdx !== -1) break
  }
  // Ensure ruleName is before beforeName; keep existing order if already earlier.
  if (fromIdx === -1 || beforeIdx === -1 || fromIdx < beforeIdx) return

  const rule = rules.splice(fromIdx, 1)[0]
  rules.splice(beforeIdx, 0, rule)
  ruler.__cache__ = null
}

function moveRuleAfter(ruler, ruleName, afterName) {
  if (!ruler || !ruler.__rules__) return
  const rules = ruler.__rules__
  let fromIdx = -1
  let afterIdx = -1
  for (let idx = 0; idx < rules.length; idx++) {
    if (rules[idx].name === ruleName) fromIdx = idx
    if (rules[idx].name === afterName) afterIdx = idx
    if (fromIdx !== -1 && afterIdx !== -1) break
  }
  if (fromIdx === -1 || afterIdx === -1 || fromIdx === afterIdx + 1) return

  const rule = rules.splice(fromIdx, 1)[0]
  const targetIdx = fromIdx < afterIdx ? afterIdx - 1 : afterIdx
  rules.splice(targetIdx + 1, 0, rule)
  ruler.__cache__ = null
}

export {
  CHAR_ASTERISK,
  CHAR_SPACE,
  CHAR_TAB,
  CHAR_NEWLINE,
  REG_ATTRS,
  isJapaneseChar,
  hasCjkBreaksRule,
  findPrevNonSpace,
  findNextNonSpace,
  resolveMode,
  getRuntimeOpt,
  normalizeCoreRulesBeforePostprocess,
  ensureCoreRuleOrder,
  moveRuleBefore,
  moveRuleAfter
}
