import { hasCjkBreaksRule, normalizeCoreRulesBeforePostprocess, ensureCoreRuleOrder, resolveMode } from './src/token-utils.js'
import { patchScanDelims } from './src/token-core.js'
import { registerTokenCompat } from './src/token-compat.js'
import { registerTokenPostprocess } from './src/token-postprocess.js'

const buildNoLinkCacheKey = (opt) => {
  const mode = resolveMode(opt)
  const mditAttrs = opt && opt.mditAttrs === false ? '0' : '1'
  const mdBreaks = opt && opt.mdBreaks === true ? '1' : '0'
  return `${mode}|${mditAttrs}|${mdBreaks}`
}

const getNoLinkMdInstance = (md, opt) => {
  const baseOpt = opt || md.__strongJaTokenOpt || { mode: 'japanese' }
  const key = buildNoLinkCacheKey(baseOpt)
  if (!md.__strongJaTokenNoLinkCache) {
    md.__strongJaTokenNoLinkCache = new Map()
  }
  const cache = md.__strongJaTokenNoLinkCache
  const cached = cache.get(key)
  if (cached) return cached
  const noLink = new md.constructor(md.options)
  mditStrongJa(noLink, { ...baseOpt, _skipPostprocess: true })
  noLink.inline.ruler.disable(['link'])
  cache.set(key, noLink)
  return noLink
}

const mditStrongJa = (md, option) => {
  if (option && typeof option.engine === 'string' && option.engine !== 'token') {
    throw new Error('mditStrongJa: legacy engine was removed; use token (default)')
  }
  const opt = {
    mditAttrs: true, // assume markdown-it-attrs integration by default
    mdBreaks: md.options.breaks, // inherit md.options.breaks for compat handling
    mode: 'japanese', // 'japanese' | 'aggressive' | 'compatible' (pairing behavior)
    coreRulesBeforePostprocess: [], // e.g. ['cjk_breaks'] to keep rules ahead of postprocess
    postprocess: true, // enable link/ref reconstruction pass
    patchCorePush: true // keep restore-softbreaks after late cjk_breaks
  }
  if (option) Object.assign(opt, option)
  opt.hasCjkBreaks = hasCjkBreaksRule(md)

  md.__strongJaTokenOpt = opt
  patchScanDelims(md)
  registerTokenCompat(md, opt)

  if (!opt._skipPostprocess) {
    registerTokenPostprocess(md, opt, getNoLinkMdInstance)
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

export default mditStrongJa
