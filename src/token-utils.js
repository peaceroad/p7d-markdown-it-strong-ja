const CHAR_ASTERISK = 0x2A // *
const CHAR_SPACE = 0x20 // ' '
const CHAR_TAB = 0x09 // '\t'
const CHAR_NEWLINE = 0x0A // '\n'
const CHAR_IDEOGRAPHIC_SPACE = 0x3000 // fullwidth space
const MODE_FLAG_COMPATIBLE = 1 << 0
const MODE_FLAG_AGGRESSIVE = 1 << 1
const MODE_FLAG_JAPANESE_BASE = 1 << 2
const MODE_FLAG_JAPANESE_PLUS = 1 << 3
const MODE_FLAG_JAPANESE_ANY = MODE_FLAG_JAPANESE_BASE | MODE_FLAG_JAPANESE_PLUS
const REG_CJK_BREAKS_RULE_NAME = /(^|[_-])cjk_breaks([_-]|$)/
const VALID_CANONICAL_MODES = new Set([
  'compatible',
  'aggressive',
  'japanese-boundary',
  'japanese-boundary-guard'
])
const REG_JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]/u
const REG_ATTRS = /{[^{}\n!@#%^&*()]+?}$/

const isJapaneseChar = (ch) => {
  if (!ch) return false
  const code = typeof ch === 'string' ? ch.charCodeAt(0) : ch
  if (code < 128) return false
  if (code >= 0x3040 && code <= 0x309F) return true
  if (code >= 0x30A0 && code <= 0x30FF) return true
  // Han + CJK punctuation/fullwidth ranges are common hot-path hits.
  // Keep these as cheap numeric checks before the fallback regex.
  if (code >= 0x3400 && code <= 0x4DBF) return true
  if (code >= 0x4E00 && code <= 0x9FFF) return true
  if (code >= 0xF900 && code <= 0xFAFF) return true
  if (code >= 0x3000 && code <= 0x303F) return true
  if (code >= 0xFF00 && code <= 0xFFEF) return true
  return REG_JAPANESE.test(String.fromCharCode(code))
}

const getInlineWrapperBase = (type) => {
  if (!type || typeof type !== 'string') return ''
  if (type === 'link_open' || type === 'link_close') return ''
  if (type.endsWith('_open')) return type.slice(0, -5)
  if (type.endsWith('_close')) return type.slice(0, -6)
  return ''
}

const hasCjkBreaksRule = (md) => {
  if (!md || !md.core || !md.core.ruler || !Array.isArray(md.core.ruler.__rules__)) return false
  if (md.__strongJaHasCjkBreaks === true) return true
  const rules = md.core.ruler.__rules__
  if (md.__strongJaHasCjkBreaks === false &&
      md.__strongJaCjkBreaksRuleCount === rules.length) {
    return false
  }
  for (let idx = 0; idx < rules.length; idx++) {
    const rule = rules[idx]
    if (rule && typeof rule.name === 'string' && isCjkBreaksRuleName(rule.name)) {
      md.__strongJaHasCjkBreaks = true
      md.__strongJaCjkBreaksRuleCount = rules.length
      return true
    }
  }
  md.__strongJaHasCjkBreaks = false
  md.__strongJaCjkBreaksRuleCount = rules.length
  return false
}

const isCjkBreaksRuleName = (name) => {
  return typeof name === 'string' && REG_CJK_BREAKS_RULE_NAME.test(name)
}

const resolveMode = (opt) => {
  const raw = opt && typeof opt.mode === 'string' ? opt.mode : 'japanese'
  const normalized = raw.toLowerCase()
  // `japanese` resolves to the guard mode.
  if (normalized === 'japanese') return 'japanese-boundary-guard'
  if (VALID_CANONICAL_MODES.has(normalized)) return normalized
  throw new Error(
    `mditStrongJa: unknown mode "${raw}". Valid modes: japanese, japanese-boundary, japanese-boundary-guard, aggressive, compatible`
  )
}

const getModeFlags = (mode) => {
  switch (mode) {
    case 'compatible':
      return MODE_FLAG_COMPATIBLE
    case 'aggressive':
      return MODE_FLAG_AGGRESSIVE
    case 'japanese-boundary':
      return MODE_FLAG_JAPANESE_BASE
    case 'japanese-boundary-guard':
      return MODE_FLAG_JAPANESE_PLUS
    default:
      return 0
  }
}

const deriveModeInfo = (opt) => {
  if (!opt || typeof opt !== 'object') return opt
  const rawMode = opt.mode
  if (opt.__strongJaModeRaw === rawMode &&
      typeof opt.__strongJaMode === 'string' &&
      typeof opt.__strongJaModeFlags === 'number') {
    return opt
  }
  const mode = resolveMode(opt)
  opt.__strongJaModeRaw = rawMode
  opt.__strongJaMode = mode
  opt.__strongJaModeFlags = getModeFlags(mode)
  return opt
}

const getRuntimeOpt = (state, baseOpt) => {
  if (!state || !state.env || !state.env.__strongJaTokenOpt) return deriveModeInfo(baseOpt)
  const override = state.env.__strongJaTokenOpt
  if (state.__strongJaTokenRuntimeOpt &&
      state.__strongJaTokenRuntimeBase === baseOpt &&
      state.__strongJaTokenRuntimeOverride === override) {
    return state.__strongJaTokenRuntimeOpt
  }
  const merged = { ...baseOpt, ...override }
  state.__strongJaTokenRuntimeOpt = deriveModeInfo(merged)
  state.__strongJaTokenRuntimeBase = baseOpt
  state.__strongJaTokenRuntimeOverride = override
  return state.__strongJaTokenRuntimeOpt
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
  CHAR_IDEOGRAPHIC_SPACE,
  REG_ATTRS,
  isJapaneseChar,
  getInlineWrapperBase,
  hasCjkBreaksRule,
  isCjkBreaksRuleName,
  resolveMode,
  getModeFlags,
  deriveModeInfo,
  MODE_FLAG_COMPATIBLE,
  MODE_FLAG_AGGRESSIVE,
  MODE_FLAG_JAPANESE_BASE,
  MODE_FLAG_JAPANESE_PLUS,
  MODE_FLAG_JAPANESE_ANY,
  getRuntimeOpt,
  normalizeCoreRulesBeforePostprocess,
  ensureCoreRuleOrder,
  moveRuleBefore,
  moveRuleAfter
}
