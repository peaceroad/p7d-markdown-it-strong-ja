import { hasCjkBreaksRule, ensureCoreRuleOrder, deriveOptionInfo } from './src/token-utils.js'
import { patchScanDelims } from './src/token-core.js'
import { registerTokenCompat } from './src/token-compat.js'
import { registerTokenPostprocess } from './src/token-postprocess.js'

const DEFAULT_OPTION = {
  mditAttrs: true, // assume markdown-it-attrs integration by default
  mode: 'japanese', // 'japanese'(->japanese-boundary-guard) | 'japanese-boundary' | 'japanese-boundary-guard' | 'aggressive' | 'compatible'
  coreRulesBeforePostprocess: [], // e.g. ['cjk_breaks'] to keep rules ahead of postprocess
  postprocess: true, // enable link/ref reconstruction pass
  patchCorePush: true // keep restore-softbreaks after late cjk_breaks
}

const buildNormalizedOption = (md, option) => {
  const opt = { ...DEFAULT_OPTION }
  if (option) Object.assign(opt, option)
  opt.hasCjkBreaks = hasCjkBreaksRule(md)
  deriveOptionInfo(opt)
  return opt
}

const mditStrongJa = (md, option) => {
  if (option && typeof option.engine === 'string' && option.engine !== 'token') {
    throw new Error('mditStrongJa: legacy engine was removed; use token (default)')
  }
  if (md.__strongJaTokenInstalled) {
    return md
  }
  const nextOpt = buildNormalizedOption(md, option)
  md.__strongJaTokenOpt = nextOpt
  patchScanDelims(md)
  registerTokenCompat(md, nextOpt)

  registerTokenPostprocess(md, nextOpt)
  ensureCoreRuleOrder(md, nextOpt.__strongJaNormalizedCoreRulesBeforePostprocess, 'strong_ja_token_postprocess')
  md.__strongJaTokenInstalled = true

  return md
}

export default mditStrongJa
