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

const captureInlineParseCalls = (md, markdown) => {
  const original = md.inline.parse
  const calls = []
  md.inline.parse = function countedInlineParse(src, parserMd, env, outTokens) {
    calls.push(src)
    return original.call(this, src, parserMd, env, outTokens)
  }
  const html = md.render(markdown)
  md.inline.parse = original
  return { calls, html }
}

const toMultiset = (values) => {
  const map = new Map()
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    map.set(value, (map.get(value) || 0) + 1)
  }
  return map
}

const diffMultiset = (a, b) => {
  const out = new Map()
  for (const [key, countA] of a.entries()) {
    const countB = b.get(key) || 0
    const diff = countA - countB
    if (diff > 0) out.set(key, diff)
  }
  return out
}

const hasJapanese = (text) => /[\u3040-\u30ff\u3400-\u9fff]/.test(text)

const classifyRaw = (raw) => {
  const tags = []
  if (raw.indexOf('`') !== -1) tags.push('code')
  if (raw.indexOf('_') !== -1) tags.push('underscore')
  if (raw.indexOf('***') !== -1) tags.push('star3+')
  if (raw.indexOf('](') !== -1) tags.push('link')
  if (raw.indexOf('][') !== -1) tags.push('ref')
  if (raw.indexOf('\n') !== -1) tags.push('newline')
  if (hasJapanese(raw)) tags.push('ja')
  if (raw.length >= 120) tags.push('len120+')
  else if (raw.length >= 60) tags.push('len60+')
  else tags.push('len<60')
  if (tags.length === 0) tags.push('plain')
  return tags.join('|')
}

const shorten = (text, max = 140) => {
  const oneLine = text.replace(/\n/g, '\\n')
  if (oneLine.length <= max) return oneLine
  return oneLine.slice(0, max - 1) + '…'
}

const run = ({
  seed = 20260214,
  count = 4000,
  modes = ['aggressive', 'japanese-boundary']
} = {}) => {
  const rng = makeRng(seed)
  const mdOnMap = new Map()
  const mdOffMap = new Map()
  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i]
    mdOnMap.set(mode, new MarkdownIt().use(mditStrongJa, { mode, postprocess: true }))
    mdOffMap.set(mode, new MarkdownIt().use(mditStrongJa, { mode, postprocess: false }))
  }

  let renders = 0
  let extraRenders = 0
  let extraCalls = 0
  let changedHtmlRenders = 0
  const categoryCounts = new Map()
  const rawCounts = new Map()

  for (let i = 0; i < count; i++) {
    const src = genCase(rng)
    for (let m = 0; m < modes.length; m++) {
      const mode = modes[m]
      renders++
      const on = captureInlineParseCalls(mdOnMap.get(mode), src)
      const off = captureInlineParseCalls(mdOffMap.get(mode), src)
      const extra = diffMultiset(toMultiset(on.calls), toMultiset(off.calls))
      if (extra.size === 0) continue
      extraRenders++
      if (on.html !== off.html) changedHtmlRenders++
      for (const [raw, cnt] of extra.entries()) {
        extraCalls += cnt
        rawCounts.set(raw, (rawCounts.get(raw) || 0) + cnt)
        const category = classifyRaw(raw)
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + cnt)
      }
    }
  }

  const topCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
  const topRaws = Array.from(rawCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)

  console.log(`[postprocess-call-analyze] seed=${seed} count=${count} renders=${renders}`)
  console.log(`[postprocess-call-analyze] extra_renders=${extraRenders} extra_calls=${extraCalls} html_changed_renders=${changedHtmlRenders}`)
  console.log('[postprocess-call-analyze] top_categories:')
  for (let i = 0; i < topCategories.length; i++) {
    const [name, cnt] = topCategories[i]
    console.log(`  - ${name}: ${cnt}`)
  }
  console.log('[postprocess-call-analyze] top_raws:')
  for (let i = 0; i < topRaws.length; i++) {
    const [raw, cnt] = topRaws[i]
    console.log(`  - (${cnt}) ${shorten(raw)}`)
  }
}

const parseArgs = () => {
  const out = { seed: 20260214, count: 4000 }
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === '--seed' && i + 1 < process.argv.length) {
      out.seed = Number(process.argv[++i])
      continue
    }
    if (arg === '--count' && i + 1 < process.argv.length) {
      out.count = Number(process.argv[++i])
    }
  }
  return out
}

const args = parseArgs()
run(args)
