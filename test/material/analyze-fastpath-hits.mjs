import MarkdownIt from 'markdown-it'
import mditStrongJa from '../../index.js'

const makeRng = (seed) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const parts = [
  'a', 'b', 'x', 'y', 'z',
  '参照', '崩れ', 'と', '。',
  '(', ')', '[', ']', '_',
  '*', '**', '***', '****',
  '`c*d`', '[x](u)', '[a](v)', '[line  \nbreak](u)',
  '[ref]', '[ref-star]', 'label',
  '[a**a**[x](v)](u)',
  'aa**aa***Text***と*More*bb**bb'
]

const pick = (rng, arr) => arr[(rng() * arr.length) | 0]

const genCase = (rng) => {
  let src = ''
  const n = 20 + ((rng() * 30) | 0)
  for (let i = 0; i < n; i++) {
    src += pick(rng, parts)
    if (rng() < 0.14) src += ' '
  }
  if (src.indexOf('[') === -1) src += ' ['
  if (src.indexOf(']') === -1) src += '] '
  src += ' **崩れ[参照*ラベル][ref と [x](v) の組み合わせ**\n\n[ref]: u\n'
  return src
}

const addCounts = (dst, src) => {
  if (!src || typeof src !== 'object') return
  for (const [k, v] of Object.entries(src)) {
    dst[k] = (dst[k] || 0) + v
  }
}

const parseArgs = () => {
  const out = {
    seed: 20260214,
    count: 4000,
    mode: 'aggressive'
  }
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === '--seed' && i + 1 < process.argv.length) {
      out.seed = Number(process.argv[++i])
      continue
    }
    if (arg === '--count' && i + 1 < process.argv.length) {
      out.count = Number(process.argv[++i])
      continue
    }
    if (arg === '--mode' && i + 1 < process.argv.length) {
      out.mode = String(process.argv[++i] || out.mode)
    }
  }
  return out
}

const shorten = (text, max = 180) => {
  const oneLine = text.replace(/\n/g, '\\n')
  if (oneLine.length <= max) return oneLine
  return oneLine.slice(0, max - 1) + '…'
}

const run = ({ seed = 20260214, count = 4000, mode = 'aggressive' } = {}) => {
  const rng = makeRng(seed)
  const md = new MarkdownIt().use(mditStrongJa, { mode })
  const totals = {
    brokenRefFastPaths: Object.create(null),
    tailFastPaths: Object.create(null),
    brokenRefFlow: Object.create(null)
  }
  const examples = {
    brokenRefFastPaths: Object.create(null),
    tailFastPaths: Object.create(null)
  }

  for (let i = 0; i < count; i++) {
    const src = genCase(rng)
    const env = { __strongJaPostprocessMetrics: {} }
    md.render(src, env)
    const metrics = env.__strongJaPostprocessMetrics || {}
    addCounts(totals.brokenRefFastPaths, metrics.brokenRefFastPaths)
    addCounts(totals.tailFastPaths, metrics.tailFastPaths)
    addCounts(totals.brokenRefFlow, metrics.brokenRefFlow)
    if (metrics.brokenRefFastPaths) {
      for (const key of Object.keys(metrics.brokenRefFastPaths)) {
        if (!examples.brokenRefFastPaths[key]) examples.brokenRefFastPaths[key] = src
      }
    }
    if (metrics.tailFastPaths) {
      for (const key of Object.keys(metrics.tailFastPaths)) {
        if (!examples.tailFastPaths[key]) examples.tailFastPaths[key] = src
      }
    }
  }

  console.log(`[fastpath-analyze] seed=${seed} count=${count} mode=${mode}`)
  console.log('[fastpath-analyze] brokenRefFastPaths:', totals.brokenRefFastPaths)
  console.log('[fastpath-analyze] tailFastPaths:', totals.tailFastPaths)
  console.log('[fastpath-analyze] brokenRefFlow:', totals.brokenRefFlow)

  const dumpExamples = (bucketName) => {
    const bucket = examples[bucketName]
    const keys = Object.keys(bucket)
    if (keys.length === 0) return
    console.log(`[fastpath-analyze] examples:${bucketName}`)
    for (const key of keys) {
      console.log(`  - ${key}: ${shorten(bucket[key])}`)
    }
  }

  dumpExamples('brokenRefFastPaths')
  dumpExamples('tailFastPaths')
}

run(parseArgs())

