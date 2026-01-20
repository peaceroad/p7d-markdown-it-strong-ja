import fs from 'fs'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'

const readCases = (content) => {
  const lines = content.split(/\r?\n/)
  const cases = []
  let current = null
  let currentField = null

  const startCase = (name) => {
    if (current) cases.push(current)
    current = {
      name: name || `case-${cases.length + 1}`,
      markdown: '',
      expected: {}
    }
    currentField = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line.startsWith('#') || line === '') continue
    const header = line.match(/^\[(.+?)\]$/)
    if (header) {
      const tag = header[1].trim()
      const lower = tag.toLowerCase()
      if (lower.startsWith('case')) {
        const name = tag.slice(4).trim()
        startCase(name)
        continue
      }
      if (lower === 'markdown') {
        currentField = 'markdown'
        continue
      }
      if (['default', 'aggressive', 'compatible', 'markdown-it'].includes(lower)) {
        currentField = lower
        current.expected[currentField] = ''
        continue
      }
      currentField = null
      continue
    }

    if (!current || !currentField) continue
    if (currentField === 'markdown') {
      current.markdown += line + '\n'
    } else {
      current.expected[currentField] += line + '\n'
    }
  }

  if (current) cases.push(current)
  for (const entry of cases) {
    entry.markdown = entry.markdown.replace(/\n+$/, '')
    for (const key of Object.keys(entry.expected)) {
      entry.expected[key] = entry.expected[key].replace(/\n+$/, '')
    }
  }
  return cases
}

const normalize = (value) => value.replace(/\n+$/, '')
const pretty = (value) => normalize(value).replace(/\n/g, '\\n')
const compare = (label, actual, expected) => {
  const a = normalize(actual)
  const e = normalize(expected)
  if (a !== e) {
    console.log(`DIFF ${label}`)
    console.log(`  expected: ${e}`)
    console.log(`  actual:   ${a}`)
    return false
  }
  return true
}

const content = fs.readFileSync(new URL('./readme-mode.txt', import.meta.url), 'utf8')
const cases = readCases(content)

const mdIt = new MarkdownIt()
const mdDefault = new MarkdownIt().use(mditStrongJa)
const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
const mdCompat = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })

let ok = true
for (const entry of cases) {
  const input = entry.markdown
  const outputs = {
    default: mdDefault.render(input),
    aggressive: mdAggressive.render(input),
    compatible: mdCompat.render(input),
    'markdown-it': mdIt.render(input)
  }
  console.log(`\n[case ${entry.name}]`)
  console.log(`markdown: ${pretty(input)}`)
  console.log(`default: ${pretty(outputs.default)}`)
  console.log(`aggressive: ${pretty(outputs.aggressive)}`)
  console.log(`compatible: ${pretty(outputs.compatible)}`)
  console.log(`markdown-it: ${pretty(outputs['markdown-it'])}`)
  if (entry.expected.default !== undefined) {
    ok = compare(`${entry.name} default`, outputs.default, entry.expected.default) && ok
  }
  if (entry.expected.aggressive !== undefined) {
    ok = compare(`${entry.name} aggressive`, outputs.aggressive, entry.expected.aggressive) && ok
  }
  if (entry.expected.compatible !== undefined) {
    ok = compare(`${entry.name} compatible`, outputs.compatible, entry.expected.compatible) && ok
  }
  if (entry.expected['markdown-it'] !== undefined) {
    ok = compare(`${entry.name} markdown-it`, outputs['markdown-it'], entry.expected['markdown-it']) && ok
  }
}

if (ok) {
  console.log('readme-mode examples OK')
} else {
  process.exit(1)
}
