import { hasCjkBreaksRule, normalizeCoreRulesBeforePostprocess, ensureCoreRuleOrder, resolveMode } from './src/token-utils.js'
import { patchScanDelims } from './src/token-core.js'
import { registerTokenCompat } from './src/token-compat.js'
import { registerTokenPostprocess } from './src/token-postprocess.js'

const buildNoLinkKey = (opt) => {
  const mode = resolveMode(opt)
  const mditAttrs = opt && opt.mditAttrs === false ? '0' : '1'
  const mdBreaks = opt && opt.mdBreaks === true ? '1' : '0'
  return `${mode}|${mditAttrs}|${mdBreaks}`
}

const getNoLinkMd = (md, opt) => {
  const baseOpt = opt || md.__strongJaTokenOpt || { mode: 'japanese' }
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
  if (option && typeof option.engine === 'string' && option.engine !== 'token') {
    throw new Error('mditStrongJa: legacy engine was removed; use token (default)')
  }
  const opt = {
    mditAttrs: true,
    mdBreaks: md.options.breaks,
    mode: 'japanese',
    coreRulesBeforePostprocess: [],
    postprocess: true,
    patchCorePush: true
  }
  if (option) Object.assign(opt, option)
  opt.hasCjkBreaks = hasCjkBreaksRule(md)

  md.__strongJaTokenOpt = opt
  patchScanDelims(md)
  registerTokenCompat(md, opt)

  if (!opt._skipPostprocess) {
    registerTokenPostprocess(md, opt, getNoLinkMd)
    const rawCoreRules = opt.coreRulesBeforePostprocess
    const hasCoreRuleConfig = Array.isArray(rawCoreRules)
      ? rawCoreRules.length > 0
      : !!rawCoreRules
    const coreRulesBeforePostprocess = hasCoreRuleConfig
      ? normalizeCoreRulesBeforePostprocess(rawCoreRules)
      : []
    ensureCoreRuleOrder(md, coreRulesBeforePostprocess, 'strong_ja_token_postprocess')
  }

  return md
}

export default tokenEngine
