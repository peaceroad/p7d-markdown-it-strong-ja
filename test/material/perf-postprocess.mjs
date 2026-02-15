import MarkdownIt from 'markdown-it'
import strongJa from '../../index.js'

const iterations = Number(process.argv[2] || 140)
const runs = Number(process.argv[3] || 5)

const corpus = [
  '**崩れ[参照*ラベル][ref-c と [code`a*b`](https://example.com/c*1) と [ok](https://example.com/ok*2) の組み合わせ**\n\n[ref-c]: https://example.com/ref*c',
  'aa**aa***Text***と*More*bb**bbテストは[aa**aa***Text***と*More*bb**bb][]です。aa**aa***Text***と*More*bb**bbと`c*d`\n\n[aa**aa***Text***と*More*bb**bb]: https://example.net/',
  '[aa**aa***Text***と*More*bb**bb][]参照[line  \nbreak](u)aa**aa***Text***と*More*bb**bb。a_[line  \nbreak](u)x***',
  '**崩れた[参照*リンクラベル][ref-star と [inline*link*broken](https://example.com/in*complete \"T\") と [urlwithstar](https://example.com/path*with) の組み合わせ**\n\n[ref-star]: https://example.com/ref*star',
  '**崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**[line  \nbreak*label*](u)text[line  \nbreak](u)__)**崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**  ラベル\n\n[ref]: https://example.com/ref*star',
  '[line  \nbreak](u)[]__`c*d`**z[x](u)_z(y_と[line  \nbreak](u)[ **崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**\n\n[ref]: u',
  ')_a**y)b[y**x崩れ。__参照_* **崩れ[参照*ラベル][ref と [x](v) の組み合わせ**\n\n[ref]: u',
  '**[**[x](v)](u)**',
  '**前文** 壊れた[参照ラベル と [plain](https://example.com/p) の続き\n\n[ref]: https://example.com/ref',
  '和食では**「だし」**が料理の土台です。説明文では**[寿司](url)**です。'
]

const cases = [
  { label: 'markdown-it', md: new MarkdownIt() },
  { label: 'boundary on', md: new MarkdownIt().use(strongJa, { mode: 'japanese-boundary', postprocess: true }) },
  { label: 'boundary off', md: new MarkdownIt().use(strongJa, { mode: 'japanese-boundary', postprocess: false }) },
  { label: 'aggressive on', md: new MarkdownIt().use(strongJa, { mode: 'aggressive', postprocess: true }) },
  { label: 'aggressive off', md: new MarkdownIt().use(strongJa, { mode: 'aggressive', postprocess: false }) }
]

const median = (values) => {
  if (!values || values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

const renderBatch = (md) => {
  for (let i = 0; i < corpus.length; i++) md.render(corpus[i])
}

const runOne = (md) => {
  for (let i = 0; i < 5; i++) renderBatch(md)
  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) renderBatch(md)
  const end = process.hrtime.bigint()
  const totalMs = Number(end - start) / 1e6
  const totalDocs = iterations * corpus.length
  const avgDocMs = totalMs / totalDocs
  return { totalMs, avgDocMs, docsPerSec: 1000 / avgDocMs }
}

console.log(`postprocess perf | corpus=${corpus.length} docs | iterations=${iterations} | runs=${runs}`)
for (let i = 0; i < cases.length; i++) {
  const row = cases[i]
  const totals = []
  const avgs = []
  const rps = []
  for (let r = 0; r < runs; r++) {
    const one = runOne(row.md)
    totals.push(one.totalMs)
    avgs.push(one.avgDocMs)
    rps.push(one.docsPerSec)
  }
  console.log(
    `${row.label.padEnd(13)} median_total=${median(totals).toFixed(2)}ms median_avg=${median(avgs).toFixed(4)}ms median_docs/s=${median(rps).toFixed(1)}`
  )
}
