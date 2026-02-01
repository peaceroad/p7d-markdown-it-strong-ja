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

// Token-only: map diffs indicate where postprocess rewrites inline tokens.
// Some diffs are expected because inline child tokens often lack map data.
const run = (markdown) => {
  const md = new MarkdownIt().use(mditStrongJa)
  let before = null
  let after = null

  md.core.ruler.before('strong_ja_token_postprocess', 'map_snapshot_before', (state) => {
    before = summarizeTokens(state.tokens)
  })
  md.core.ruler.after('strong_ja_token_postprocess', 'map_snapshot_after', (state) => {
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
const files = args.length > 0
  ? args.map((p) => (p.includes('/') ? p : path.join(__dirname, p)))
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
    const { before, after } = run(markdown)
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
