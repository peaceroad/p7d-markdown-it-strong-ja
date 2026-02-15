import MarkdownIt from 'markdown-it'
import mditStrongJa from '../../index.js'

const iterations = Number(process.argv[2] || 300)
const runs = Number(process.argv[3] || 5)

const sample = `
日本語です。* Japanese food culture* です。** Japanese food culture** です。
*味噌汁。*umai* と **味噌汁。**umami** という書き方を並べます。
説明文では**[寿司](url)**です。メニューではmenu**[ramen](url)**と書きます。
日本語 *A。*B* / **sushi.**umami** / [*味噌汁。*umai*]() を混在させます。
`.repeat(120)

const cases = [
  { label: 'markdown-it', md: new MarkdownIt() },
  { label: 'japanese-boundary', md: new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' }) },
  { label: 'japanese-boundary-guard', md: new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' }) },
  { label: 'aggressive', md: new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' }) },
  { label: 'compatible', md: new MarkdownIt().use(mditStrongJa, { mode: 'compatible' }) }
]

const runOne = (md) => {
  for (let i = 0; i < 8; i++) md.render(sample)
  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) md.render(sample)
  const end = process.hrtime.bigint()
  const totalMs = Number(end - start) / 1e6
  const avgMs = totalMs / iterations
  return { totalMs, avgMs, rps: 1000 / avgMs }
}

console.log(`scanDelims perf | iterations=${iterations} runs=${runs}`)
for (let c = 0; c < cases.length; c++) {
  const row = cases[c]
  let total = 0
  let avg = 0
  let rps = 0
  for (let r = 0; r < runs; r++) {
    const result = runOne(row.md)
    total += result.totalMs
    avg += result.avgMs
    rps += result.rps
  }
  const n = runs
  console.log(
    `${row.label.padEnd(14)} total=${(total / n).toFixed(2)}ms avg=${(avg / n).toFixed(3)}ms rps=${(rps / n).toFixed(1)}`
  )
}
