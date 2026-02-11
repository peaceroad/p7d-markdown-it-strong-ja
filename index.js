import { hasCjkBreaksRule, normalizeCoreRulesBeforePostprocess, ensureCoreRuleOrder, resolveMode } from './src/token-utils.js'
import { patchScanDelims } from './src/token-core.js'
import { registerTokenCompat } from './src/token-compat.js'
import { registerTokenPostprocess } from './src/token-postprocess.js'

const buildReparseCacheKey = (opt) => {
  const mode = resolveMode(opt)
  const mditAttrs = opt && opt.mditAttrs === false ? '0' : '1'
  return `${mode}|${mditAttrs}`
}

const getReparseMdInstance = (md, opt) => {
  const baseOpt = opt || md.__strongJaTokenOpt || { mode: 'japanese' }
  const key = buildReparseCacheKey(baseOpt)
  if (!md.__strongJaTokenReparseCache) {
    md.__strongJaTokenReparseCache = new Map()
  }
  const cache = md.__strongJaTokenReparseCache
  const cached = cache.get(key)
  if (cached) return cached

  const reparseMd = new md.constructor(md.options)
  mditStrongJa(reparseMd, { ...baseOpt, _skipPostprocess: true })
  cache.set(key, reparseMd)
  return reparseMd
}

const mditStrongJa = (md, option) => {
  if (option && typeof option.engine === 'string' && option.engine !== 'token') {
    throw new Error('mditStrongJa: legacy engine was removed; use token (default)')
  }
  const opt = {
    mditAttrs: true, // assume markdown-it-attrs integration by default
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
    registerTokenPostprocess(md, opt, getReparseMdInstance)
    const coreRulesBeforePostprocess = normalizeCoreRulesBeforePostprocess(opt.coreRulesBeforePostprocess)
    ensureCoreRuleOrder(md, coreRulesBeforePostprocess, 'strong_ja_token_postprocess')
  }

  return md
}

export default mditStrongJa
