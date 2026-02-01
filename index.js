import legacy from './engine/legacy.js'
import tokenEngine from './engine/token.js'

const mditStrongJa = (md, option) => {
  const engine = option && typeof option.engine === 'string' ? option.engine : 'token'
  if (engine === 'token') {
    return tokenEngine(md, option)
  }
  return legacy(md, option)
}

export default mditStrongJa
