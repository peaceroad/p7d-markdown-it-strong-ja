import { hasCjkBreaksRule, normalizeCoreRulesBeforePostprocess, ensureCoreRuleOrder } from './token-utils.js'
import { patchScanDelims } from './token-core.js'
import { registerTokenCompat } from './token-compat.js'
import { registerTokenPostprocess } from './token-postprocess.js'

const buildNoLinkKey = (opt) => {
  const mode = opt && typeof opt.mode === 'string' ? opt.mode : 'japanese-only'
  const disallowMixed = opt && opt.disallowMixed === true ? '1' : '0'
  const mditAttrs = opt && opt.mditAttrs === false ? '0' : '1'
  const mdBreaks = opt && opt.mdBreaks === true ? '1' : '0'
  return `${mode.toLowerCase()}|${disallowMixed}|${mditAttrs}|${mdBreaks}`
}

const getNoLinkMd = (md, opt) => {
  const baseOpt = opt || md.__strongJaTokenOpt || { mode: 'japanese-only', disallowMixed: false }
  const key = buildNoLinkKey(baseOpt)
  if (!md.__strongJaTokenNoLinkCache) {
    md.__strongJaTokenNoLinkCache = new Map()
  }
  const cache = md.__strongJaTokenNoLinkCache
  if (cache.has(key)) return cache.get(key)
  const noLink = new md.constructor(md.options)
  tokenEngine(noLink, { ...baseOpt, _skipPostprocess: true })
  noLink.inline.ruler.disable(['link'])
  cache.set(key, noLink)
  return noLink
}

const tokenEngine = (md, option) => {
  const opt = {
    mditAttrs: true,
    mdBreaks: md.options.breaks,
    disallowMixed: false,
    mode: 'japanese-only',
    coreRulesBeforePostprocess: [],
    postprocess: true,
    patchCorePush: true
  }
  if (option) Object.assign(opt, option)
  opt.hasCjkBreaks = hasCjkBreaksRule(md)
  const rawCoreRules = opt.coreRulesBeforePostprocess
  const hasCoreRuleConfig = Array.isArray(rawCoreRules)
    ? rawCoreRules.length > 0
    : !!rawCoreRules
  const coreRulesBeforePostprocess = hasCoreRuleConfig
    ? normalizeCoreRulesBeforePostprocess(rawCoreRules)
    : []

  md.__strongJaTokenOpt = opt
  patchScanDelims(md)
  registerTokenCompat(md, opt)

  if (!opt._skipPostprocess) {
    registerTokenPostprocess(md, opt, getNoLinkMd)
    ensureCoreRuleOrder(md, coreRulesBeforePostprocess, 'strong_ja_token_postprocess')
  }

  return md
}

export default tokenEngine
