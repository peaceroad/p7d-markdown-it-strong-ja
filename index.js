import { hasCjkBreaksRule, normalizeCoreRulesBeforePostprocess, ensureCoreRuleOrder, deriveModeInfo } from './src/token-utils.js'
import { patchScanDelims } from './src/token-core.js'
import { registerTokenCompat } from './src/token-compat.js'
import { registerTokenPostprocess } from './src/token-postprocess.js'

const mditStrongJa = (md, option) => {
  if (option && typeof option.engine === 'string' && option.engine !== 'token') {
    throw new Error('mditStrongJa: legacy engine was removed; use token (default)')
  }
  const opt = {
    mditAttrs: true, // assume markdown-it-attrs integration by default
    mode: 'japanese', // 'japanese'(->japanese-boundary-guard) | 'japanese-boundary' | 'japanese-boundary-guard' | 'aggressive' | 'compatible'
    coreRulesBeforePostprocess: [], // e.g. ['cjk_breaks'] to keep rules ahead of postprocess
    postprocess: true, // enable link/ref reconstruction pass
    patchCorePush: true // keep restore-softbreaks after late cjk_breaks
  }
  if (option) Object.assign(opt, option)
  opt.hasCjkBreaks = hasCjkBreaksRule(md)
  deriveModeInfo(opt)

  md.__strongJaTokenOpt = opt
  patchScanDelims(md)
  registerTokenCompat(md, opt)

  registerTokenPostprocess(md, opt)
  const coreRulesBeforePostprocess = normalizeCoreRulesBeforePostprocess(opt.coreRulesBeforePostprocess)
  ensureCoreRuleOrder(md, coreRulesBeforePostprocess, 'strong_ja_token_postprocess')

  return md
}

export default mditStrongJa
