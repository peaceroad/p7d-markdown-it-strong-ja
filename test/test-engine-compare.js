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

const args = process.argv.slice(2)
const files = args.length > 0
  ? args.map((p) => (p.includes('/') ? p : path.join(__dirname, p)))
  : [path.join(__dirname, 'p-attrs--o-japaneseonly-complex.txt')]

const mdLegacy = new MarkdownIt().use(mditStrongJa, { engine: 'legacy' })
const mdToken = new MarkdownIt().use(mditStrongJa, { engine: 'token' })

let total = 0
let diffs = 0
let printed = 0
const maxDiff = 10

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const examples = readExamples(content)
  for (let idx = 0; idx < examples.length; idx++) {
    const markdown = examples[idx].markdown
    total++
    const legacy = mdLegacy.render(markdown)
    const token = mdToken.render(markdown)
    if (legacy !== token) {
      diffs++
      if (printed < maxDiff) {
        console.log(`\n=== DIFF ${path.basename(file)} #${idx + 1} ===`)
        console.log(`markdown: ${markdown.replace(/\n/g, '\\n')}`)
        console.log(`legacy: ${legacy.replace(/\n/g, '\\n')}`)
        console.log(`token: ${token.replace(/\n/g, '\\n')}`)
        printed++
      }
    }
  }
}

console.log(`\nChecked ${total} cases. Diff count: ${diffs}`)
if (diffs > maxDiff) {
  console.log(`(showing first ${maxDiff} diffs)`)
}
