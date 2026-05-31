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
const HAS_OWN = Object.prototype.hasOwnProperty
const REG_CJK_BREAKS_RULE_NAME = /(^|[_-])cjk_breaks([_-]|$)/
const VALID_CANONICAL_MODES = new Set([
  'compatible',
  'aggressive',
  'japanese-boundary',
  'japanese-boundary-guard'
])
const REG_JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]/u
const REG_ATTRS = /{[^{}\n!@#%^&*()]+?}$/
const CHAR_REPLACEMENT = 0xFFFD

const isHighSurrogate = (code) => code >= 0xD800 && code <= 0xDBFF
const isLowSurrogate = (code) => code >= 0xDC00 && code <= 0xDFFF

const combineSurrogates = (high, low) => {
  return 0x10000 + ((high - 0xD800) << 10) + (low - 0xDC00)
}

const codePointAtSafe = (src, index, fallback = 0) => {
  if (typeof src !== 'string' || index < 0 || index >= src.length) return fallback
  const first = src.charCodeAt(index)
  if (first < 0xD800 || first > 0xDFFF) return first
  if (first <= 0xDBFF) {
    const second = index + 1 < src.length ? src.charCodeAt(index + 1) : 0
    return isLowSurrogate(second) ? combineSurrogates(first, second) : CHAR_REPLACEMENT
  }
  return CHAR_REPLACEMENT
}

const codePointBeforeSafe = (src, index, fallback = 0) => {
  if (typeof src !== 'string' || index <= 0 || index > src.length) return fallback
  const last = src.charCodeAt(index - 1)
  if (last < 0xD800 || last > 0xDFFF) return last
  if (last >= 0xDC00) {
    const first = index - 2 >= 0 ? src.charCodeAt(index - 2) : 0
    return isHighSurrogate(first) ? combineSurrogates(first, last) : CHAR_REPLACEMENT
  }
  return CHAR_REPLACEMENT
}

const codePointStartBefore = (src, index) => {
  if (typeof src !== 'string' || index <= 0 || index > src.length) return -1
  const lastIdx = index - 1
  const last = src.charCodeAt(lastIdx)
  if (isLowSurrogate(last) && lastIdx - 1 >= 0 && isHighSurrogate(src.charCodeAt(lastIdx - 1))) {
    return lastIdx - 1
  }
  return lastIdx
}

const codePointSize = (code) => code > 0xFFFF ? 2 : 1

const isAstralJapaneseCode = (code) => {
  return (code >= 0x1AFF0 && code <= 0x1AFFF) || // Kana Extended-B
    (code >= 0x1B000 && code <= 0x1B0FF) || // Kana Supplement
    (code >= 0x1B100 && code <= 0x1B12F) || // Kana Extended-A
    (code >= 0x1B130 && code <= 0x1B16F) || // Small Kana Extension
    (code >= 0x20000 && code <= 0x2A6DF) || // CJK Unified Ideographs Extension B
    (code >= 0x2A700 && code <= 0x2B73F) || // Extension C
    (code >= 0x2B740 && code <= 0x2B81F) || // Extension D
    (code >= 0x2B820 && code <= 0x2CEAF) || // Extension E
    (code >= 0x2CEB0 && code <= 0x2EBEF) || // Extension F
    (code >= 0x2EBF0 && code <= 0x2EE5F) || // Extension I
    (code >= 0x2F800 && code <= 0x2FA1F) || // CJK Compatibility Ideographs Supplement
    (code >= 0x30000 && code <= 0x3134F) || // Extension G
    (code >= 0x31350 && code <= 0x323AF) // Extension H
}

const isJapaneseChar = (ch) => {
  if (!ch) return false
  const code = typeof ch === 'string' ? ch.codePointAt(0) : ch
  if (!Number.isFinite(code)) return false
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
  if (code > 0x10FFFF) return false
  if (code >= 0x10000 && isAstralJapaneseCode(code)) return true
  if (code >= 0x10000 && code < 0x20000) return false
  return REG_JAPANESE.test(String.fromCodePoint(code))
}

const isAsciiWordCode = (code) => {
  return (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5A) ||
    (code >= 0x61 && code <= 0x7A)
}

const isSoftSpaceCode = (code) => {
  return code === CHAR_SPACE || code === CHAR_TAB || code === CHAR_IDEOGRAPHIC_SPACE
}

const cloneMap = (map) => {
  if (!map || !Array.isArray(map)) return null
  return [map[0], map[1]]
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

const deriveOptionInfo = (opt) => {
  if (!opt || typeof opt !== 'object') return opt
  deriveModeInfo(opt)
  const rawPostprocess = opt.postprocess
  const rawCoreRules = opt.coreRulesBeforePostprocess
  if (opt.__strongJaPlanPostprocessRaw === rawPostprocess &&
      opt.__strongJaPlanCoreRulesRaw === rawCoreRules &&
      typeof opt.__strongJaPostprocessActive === 'boolean' &&
      typeof opt.__strongJaIsCompatibleMode === 'boolean' &&
      typeof opt.__strongJaIsJapaneseMode === 'boolean' &&
      typeof opt.__strongJaStrictAsciiCodeGuard === 'boolean' &&
      typeof opt.__strongJaStrictAsciiStrongGuard === 'boolean' &&
      Array.isArray(opt.__strongJaNormalizedCoreRulesBeforePostprocess)) {
    return opt
  }
  opt.__strongJaPlanPostprocessRaw = rawPostprocess
  opt.__strongJaPlanCoreRulesRaw = rawCoreRules
  opt.__strongJaIsCompatibleMode = (opt.__strongJaModeFlags & MODE_FLAG_COMPATIBLE) !== 0
  opt.__strongJaPostprocessActive = rawPostprocess !== false && !opt.__strongJaIsCompatibleMode
  opt.__strongJaIsJapaneseMode = (opt.__strongJaModeFlags & MODE_FLAG_JAPANESE_ANY) !== 0
  opt.__strongJaStrictAsciiCodeGuard = (opt.__strongJaModeFlags & MODE_FLAG_JAPANESE_PLUS) !== 0
  opt.__strongJaStrictAsciiStrongGuard = (opt.__strongJaModeFlags & MODE_FLAG_AGGRESSIVE) === 0
  opt.__strongJaNormalizedCoreRulesBeforePostprocess = normalizeCoreRulesBeforePostprocess(rawCoreRules)
  return opt
}

const hasRuntimeOverride = (override) => {
  if (!override || typeof override !== 'object') return false
  return (HAS_OWN.call(override, 'mode') && override.mode !== undefined) ||
    (HAS_OWN.call(override, 'postprocess') && override.postprocess !== undefined)
}

const getRuntimeOpt = (state, baseOpt) => {
  const override = state && state.env ? state.env.__strongJaTokenOpt : null
  const hasOverride = hasRuntimeOverride(override)
  if (state &&
      state.__strongJaTokenRuntimeOpt &&
      state.__strongJaTokenRuntimeBase === baseOpt &&
      state.__strongJaTokenRuntimeOverride === override &&
      state.__strongJaTokenRuntimeHasOverride === hasOverride) {
    return state.__strongJaTokenRuntimeOpt
  }
  let resolved = deriveOptionInfo(baseOpt)
  if (hasOverride) {
    const merged = baseOpt && typeof baseOpt === 'object' ? { ...baseOpt } : {}
    if (HAS_OWN.call(override, 'mode') && override.mode !== undefined) merged.mode = override.mode
    if (HAS_OWN.call(override, 'postprocess') && override.postprocess !== undefined) merged.postprocess = override.postprocess
    resolved = deriveOptionInfo(merged)
  }
  if (!state) return resolved
  state.__strongJaTokenRuntimeOpt = resolved
  state.__strongJaTokenRuntimeBase = baseOpt
  state.__strongJaTokenRuntimeOverride = override
  state.__strongJaTokenRuntimeHasOverride = hasOverride
  return resolved
}

const getReferenceCount = (state) => {
  if (!state) return 0
  let referenceCount = state.__strongJaReferenceCount
  if (referenceCount !== undefined) return referenceCount
  const references = state.env && state.env.references
  if (!references) {
    state.__strongJaReferenceCount = 0
    return 0
  }
  referenceCount = 0
  for (const key in references) {
    if (HAS_OWN.call(references, key)) referenceCount++
  }
  state.__strongJaReferenceCount = referenceCount
  return referenceCount
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
  codePointAtSafe,
  codePointBeforeSafe,
  codePointStartBefore,
  codePointSize,
  isJapaneseChar,
  isAsciiWordCode,
  isSoftSpaceCode,
  cloneMap,
  hasCjkBreaksRule,
  isCjkBreaksRuleName,
  resolveMode,
  getModeFlags,
  deriveModeInfo,
  deriveOptionInfo,
  hasRuntimeOverride,
  MODE_FLAG_COMPATIBLE,
  MODE_FLAG_AGGRESSIVE,
  MODE_FLAG_JAPANESE_BASE,
  MODE_FLAG_JAPANESE_PLUS,
  MODE_FLAG_JAPANESE_ANY,
  getRuntimeOpt,
  getReferenceCount,
  normalizeCoreRulesBeforePostprocess,
  ensureCoreRuleOrder,
  moveRuleBefore,
  moveRuleAfter
}
