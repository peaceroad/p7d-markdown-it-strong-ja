import { pathToFileURL } from 'node:url'
import { resolve, isAbsolute } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import MarkdownIt from 'markdown-it'

const readArg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  if (index < 0 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

const config = workerData || {
  plugin: readArg('--plugin', 'none'),
  label: readArg('--label', readArg('--plugin', 'none')),
  corpus: readArg('--corpus', 'all'),
  iterations: Number(readArg('--iterations', '80')),
  warmup: Number(readArg('--warmup', '6')),
  options: JSON.parse(readArg('--options', '{}'))
}

const pluginSpec = config.plugin
const label = config.label
const corpusName = config.corpus
const iterations = config.iterations
const warmup = config.warmup
const options = config.options

const normalCorpus = [
  '和食では**「だし」**が料理の土台です。説明文では**[寿司](url)**です。',
  '日本語です。*味噌汁*と**だし**を説明します。English **strong** stays normal.',
  'メニューではramen**[説明](url)**と書きます。`code*inline`はそのままです。',
  '日本語 *A。*B* / **sushi.**umami** / [*味噌汁。*umai*]() を混在させます。',
  '段落内で**日本語とEnglish**を混ぜ、[リンク**ラベル**](https://example.com/a*b)も含めます。'
]

const malformedCorpus = [
  '**崩れ[参照*ラベル][ref-c と [code`a*b`](https://example.com/c*1) と [ok](https://example.com/ok*2) の組み合わせ**\n\n[ref-c]: https://example.com/ref*c',
  'aa**aa***Text***と*More*bb**bbテストは[aa**aa***Text***と*More*bb**bb][]です。aa**aa***Text***と*More*bb**bbと`c*d`\n\n[aa**aa***Text***と*More*bb**bb]: https://example.net/',
  '[aa**aa***Text***と*More*bb**bb][]参照[line  \nbreak](u)aa**aa***Text***と*More*bb**bb。a_[line  \nbreak](u)x***',
  '**崩れた[参照*リンクラベル][ref-star と [inline*link*broken](https://example.com/in*complete "T") と [urlwithstar](https://example.com/path*with) の組み合わせ**\n\n[ref-star]: https://example.com/ref*star',
  '**崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**[line  \nbreak*label*](u)text[line  \nbreak](u)__)**崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**  ラベル\n\n[ref]: https://example.com/ref*star',
  '[line  \nbreak](u)[]__`c*d`**z[x](u)_z(y_と[line  \nbreak](u)[ **崩れ[参照*ラベル][ref と [a**a**[x](v)](u) の組み合わせ**\n\n[ref]: u',
  ')_a**y)b[y**x崩れ。__参照_* **崩れ[参照*ラベル][ref と [x](v) の組み合わせ**\n\n[ref]: u',
  '**[**[x](v)](u)**',
  '**前文** 壊れた[参照ラベル と [plain](https://example.com/p) の続き\n\n[ref]: https://example.com/ref'
]

const noopCorpus = [
  'これはアスタリスクを含まない通常の日本語本文です。リンクや参照の修復対象もありません。',
  'English and Japanese mixed text without target markers should stay on the cheapest path.',
  '箇条書きではありませんが、句読点と全角記号（テスト）を含むだけの文章です。',
  'URL風の https://example.com/path も、コード風の `inline` も、対象記号なしなら軽く抜けます。'
]

const scanCorpus = [
  `
日本語です。* Japanese food culture* です。** Japanese food culture** です。
*味噌汁。*umai* と **味噌汁。**umami** という書き方を並べます。
説明文では**[寿司](url)**です。メニューではmenu**[ramen](url)**と書きます。
日本語 *A。*B* / **sushi.**umami** / [*味噌汁。*umai*]() を混在させます。
`.repeat(120)
]

const getCorpus = (name) => {
  if (name === 'normal') return normalCorpus
  if (name === 'malformed') return malformedCorpus
  if (name === 'noop') return noopCorpus
  if (name === 'scan') return scanCorpus
  return [...noopCorpus, ...normalCorpus, ...malformedCorpus, ...scanCorpus]
}

const toImportSpec = (spec) => {
  if (spec === 'none') return spec
  if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return spec
  if (spec.startsWith('.') || spec.startsWith('/') || isAbsolute(spec)) {
    return pathToFileURL(resolve(spec)).href
  }
  return spec
}

const loadPlugin = async (spec) => {
  if (spec === 'none') return null
  const module = await import(toImportSpec(spec))
  return module.default || module
}

const renderBatch = (md, corpus) => {
  for (let i = 0; i < corpus.length; i++) md.render(corpus[i])
}

const main = async () => {
  const plugin = await loadPlugin(pluginSpec)
  const md = new MarkdownIt()
  if (plugin) md.use(plugin, options)
  const corpus = getCorpus(corpusName)

  for (let i = 0; i < warmup; i++) renderBatch(md, corpus)

  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) renderBatch(md, corpus)
  const end = process.hrtime.bigint()

  const totalMs = Number(end - start) / 1e6
  const totalDocs = iterations * corpus.length
  const avgDocMs = totalMs / totalDocs
  const docsPerSec = 1000 / avgDocMs

  const result = {
    label,
    corpus: corpusName,
    docs: corpus.length,
    iterations,
    totalDocs,
    totalMs,
    avgDocMs,
    docsPerSec
  }

  if (parentPort) parentPort.postMessage(result)
  else console.log(JSON.stringify(result))
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error))
  process.exitCode = 1
})
