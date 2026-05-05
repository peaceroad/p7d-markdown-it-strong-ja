import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workerPath = join(__dirname, 'bench-isolated-worker.mjs')

const readArg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  if (index < 0 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

const hasFlag = (name) => process.argv.includes(name)

const pluginPath = readArg('--plugin', './index.js')
const baselinePath = readArg('--baseline', '')
const corpusArg = readArg('--corpus', 'all')
const iterations = Number(readArg('--iterations', '80'))
const warmup = Number(readArg('--warmup', '6'))
const runs = Number(readArg('--runs', '5'))
const includeOff = hasFlag('--include-off')

const corpusNames = corpusArg === 'all'
  ? ['noop', 'normal', 'malformed', 'scan']
  : corpusArg.split(',').map((name) => name.trim()).filter(Boolean)

const pluginCases = [
  { key: 'guard', label: 'japanese-boundary-guard', options: { mode: 'japanese-boundary-guard', postprocess: true } },
  { key: 'boundary', label: 'japanese-boundary', options: { mode: 'japanese-boundary', postprocess: true } },
  { key: 'aggressive', label: 'aggressive', options: { mode: 'aggressive', postprocess: true } },
  { key: 'compatible', label: 'compatible', options: { mode: 'compatible', postprocess: true } }
]

if (includeOff) {
  pluginCases.push(
    { key: 'guard-off', label: 'japanese-boundary-guard off', options: { mode: 'japanese-boundary-guard', postprocess: false } },
    { key: 'aggressive-off', label: 'aggressive off', options: { mode: 'aggressive', postprocess: false } }
  )
}

const median = (values) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const runWorker = ({ plugin, label, corpus, options }) => new Promise((resolve, reject) => {
  const worker = new Worker(workerPath, {
    workerData: {
      plugin,
      label,
      corpus,
      iterations,
      warmup,
      options
    }
  })
  worker.once('message', resolve)
  worker.once('error', reject)
  worker.once('exit', (code) => {
    if (code !== 0) reject(new Error(`worker failed for ${label} / ${corpus}: exit ${code}`))
  })
})

const summarize = (samples) => {
  const totals = samples.map((sample) => sample.totalMs)
  const avgs = samples.map((sample) => sample.avgDocMs)
  const rps = samples.map((sample) => sample.docsPerSec)
  return {
    label: samples[0].label,
    corpus: samples[0].corpus,
    docs: samples[0].docs,
    iterations: samples[0].iterations,
    totalMs: median(totals),
    avgDocMs: median(avgs),
    docsPerSec: median(rps)
  }
}

const measureCase = async (job) => {
  const samples = []
  for (let run = 0; run < runs; run++) samples.push(await runWorker(job))
  return summarize(samples)
}

const printRows = (rows, baselineRows) => {
  for (const row of rows) {
    const baseline = baselineRows && baselineRows.get(`${row.corpus}\0${row.label}`)
    const delta = baseline ? ` delta=${(((row.avgDocMs - baseline.avgDocMs) / baseline.avgDocMs) * 100).toFixed(1)}%` : ''
    console.log(
      `${row.label.padEnd(28)} docs=${String(row.docs).padStart(2)} total=${row.totalMs.toFixed(2).padStart(8)}ms avg=${row.avgDocMs.toFixed(4).padStart(8)}ms docs/s=${row.docsPerSec.toFixed(1).padStart(8)}${delta}`
    )
  }
}

console.log(`isolated benchmark | iterations=${iterations} runs=${runs} warmup=${warmup}`)
console.log(`current=${pluginPath}${baselinePath ? ` baseline=${baselinePath}` : ''}`)
console.log('Each case is measured in a fresh Node.js worker isolate, so prototype-level scanDelims patching cannot leak into markdown-it baseline runs.')

for (const corpus of corpusNames) {
  console.log(`\ncorpus=${corpus}`)
  const baselineRows = baselinePath
    ? new Map(await Promise.all(pluginCases.map(async (testCase) => {
      const row = await measureCase({
        plugin: baselinePath,
        label: testCase.label,
        corpus,
        options: testCase.options
      })
      return [`${row.corpus}\0${row.label}`, row]
    })))
    : null

  const rows = [
    await measureCase({ plugin: 'none', label: 'markdown-it', corpus, options: {} }),
    ...await Promise.all(pluginCases.map((testCase) => measureCase({
      plugin: pluginPath,
      label: testCase.label,
      corpus,
      options: testCase.options
    })))
  ]

  if (baselineRows) {
    console.log('baseline:')
    printRows([...baselineRows.values()])
    console.log('current:')
  }
  printRows(rows, baselineRows)
}
