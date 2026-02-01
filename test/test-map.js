import fs from 'fs'
import path from 'path'
import url from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url)).replace(/\\/g, '/')

const readExamples = (content) => {
  const lines = content.split(/\r?\n/)
  const examples = []
  let current = null
  let mode = null

  for (const line of lines) {
    if (line === '[Markdown]') {
      if (current && current.markdown.length > 0) {
        current.markdown = current.markdown.replace(/\n+$/, '')
        examples.push(current)
      }
      current = { markdown: '' }
      mode = 'markdown'
      continue
    }
    if (line.startsWith('[HTML')) {
      mode = 'html'
      continue
    }
    if (!current || mode !== 'markdown') continue
    current.markdown += line + '\n'
  }
  if (current && current.markdown.length > 0) {
    current.markdown = current.markdown.replace(/\n+$/, '')
    examples.push(current)
  }
  return examples
}

const summarizeTokens = (tokens) => {
  const summary = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t || t.type !== 'inline') continue
    const children = (t.children || []).map((c) => ({
      type: c.type,
      tag: c.tag || '',
      nesting: c.nesting,
      level: c.level,
      map: c.map || null,
      markup: c.markup || '',
      content: c.content || ''
    }))
    summary.push({
      idx: i,
      map: t.map || null,
      children
    })
  }
  return summary
}

const signature = (summary) => JSON.stringify(summary)

const run = (markdown, engine) => {
  const md = new MarkdownIt().use(mditStrongJa, { engine })
  let before = null
  let after = null

  const ruleName = engine === 'token' ? 'strong_ja_token_postprocess' : 'strong_ja_postprocess'
  md.core.ruler.before(ruleName, 'map_snapshot_before', (state) => {
    before = summarizeTokens(state.tokens)
  })
  md.core.ruler.after(ruleName, 'map_snapshot_after', (state) => {
    after = summarizeTokens(state.tokens)
  })

  const html = md.render(markdown)
  return { before, after, html }
}

const formatInline = (summary, limit = 20) => {
  const out = []
  for (const block of summary) {
    out.push(`- inline idx=${block.idx} map=${JSON.stringify(block.map)}`)
    let shown = 0
    for (const child of block.children) {
      if (shown >= limit) {
        out.push('  ...')
        break
      }
      const content = child.content.replace(/\n/g, '\\n')
      out.push(`  ${child.type} tag=${child.tag} level=${child.level} map=${JSON.stringify(child.map)} content=${content}`)
      shown++
    }
  }
  return out.join('\n')
}

const args = process.argv.slice(2)
let engine = 'legacy'
const fileArgs = []
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--engine' && args[i + 1]) {
    engine = args[i + 1]
    i++
    continue
  }
  if (arg.startsWith('--engine=')) {
    engine = arg.slice('--engine='.length)
    continue
  }
  if (arg === 'token' || arg === 'legacy') {
    engine = arg
    continue
  }
  fileArgs.push(arg)
}
if (engine !== 'token' && engine !== 'legacy') {
  engine = 'legacy'
}
const files = fileArgs.length > 0
  ? fileArgs.map((p) => (p.includes('/') ? p : path.join(__dirname, p)))
  : [path.join(__dirname, 'p-attrs--o-japaneseonly-complex.txt')]

const maxDiff = 10
let total = 0
let diffs = 0
let printed = 0

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const examples = readExamples(content)
  for (let idx = 0; idx < examples.length; idx++) {
    const markdown = examples[idx].markdown
    if (!markdown.includes('[') && !markdown.includes('**') && !markdown.includes('*')) continue
    total++
    const { before, after } = run(markdown, engine)
    const sigBefore = signature(before || [])
    const sigAfter = signature(after || [])
    if (sigBefore !== sigAfter) {
      diffs++
      if (printed < maxDiff) {
        console.log(`\n=== DIFF ${path.basename(file)} #${idx + 1} ===`)
        console.log(`markdown: ${markdown.replace(/\n/g, '\\n')}`)
        console.log('before:')
        console.log(formatInline(before || []))
        console.log('after:')
        console.log(formatInline(after || []))
        printed++
      }
    }
  }
}

console.log(`\nChecked ${total} cases. Diff count: ${diffs}`)
if (diffs > maxDiff) {
  console.log(`(showing first ${maxDiff} diffs)`)
}
