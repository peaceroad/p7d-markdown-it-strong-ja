import MarkdownIt from 'markdown-it'

const pluginPath = process.argv[2] || '../../index.js'
const iterations = Number(process.argv[3]) || 500
const runs = Number(process.argv[4]) || 3

const { default: markdownItStrongJa } = await import(pluginPath)

const sample = `
漢字**かな**と*English*が混在するテキストです。
**Bold text** with *italic* plus 日本語の文章を混在させます。
\`code block\` と $math$ も含めて処理します。
<strong>HTML tags</strong> や **markdown emphasis** を混ぜます。
[Link text](http://example.com) と **strong text** の組み合わせ。
日本語の**強調**や*イタリック*を複数回含む長文です。
`.repeat(100)

const md = new MarkdownIt()
md.use(markdownItStrongJa, {
  disallowMixed: false,
  dollarMath: true,
  mditAttrs: true
})

const runBenchmark = () => {
  for (let i = 0; i < 10; i++) {
    md.render(sample)
  }

  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) {
    md.render(sample)
  }
  const end = process.hrtime.bigint()
  const totalMs = Number(end - start) / 1e6
  const avg = totalMs / iterations
  return { totalMs, avg, rps: 1000 / avg }
}

console.log(`Running ${runs} runs for plugin: ${pluginPath}`)
const results = []
for (let run = 1; run <= runs; run++) {
  console.log(`Run ${run}...`)
  const result = runBenchmark()
  console.log(
    `  Total: ${result.totalMs.toFixed(2)}ms, Avg: ${result.avg.toFixed(
      3
    )}ms, RPS: ${result.rps.toFixed(1)}`
  )
  results.push(result)
}

const total = results.reduce((sum, r) => sum + r.totalMs, 0)
const avg = total / runs
const avgPerRender =
  results.reduce((sum, r) => sum + r.avg, 0) / results.length
console.log('\nSummary:')
console.log(`  Avg total: ${avg.toFixed(2)}ms`)
console.log(`  Avg per render: ${avgPerRender.toFixed(3)}ms`)
console.log(`  Avg RPS: ${(1000 / avgPerRender).toFixed(1)}`)

console.log('\nMemory usage:')
console.log(process.memoryUsage())

