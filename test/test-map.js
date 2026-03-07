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
const hasMap = (value) => Array.isArray(value)
const isWrapperTokenType = (type) => type === 'link_open' || type === 'link_close' || /_(open|close)$/.test(type)

const buildInlineMapMetrics = (block) => {
  const children = block && Array.isArray(block.children) ? block.children : []
  const mappedFlags = children.map((child) => hasMap(child.map))
  let mappedChildren = 0
  let mappedText = 0
  let wrapperNeighborMapGaps = 0
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!child) continue
    const isMapped = mappedFlags[i]
    if (isMapped) {
      mappedChildren++
      if (child.type === 'text') mappedText++
      continue
    }
    if (!isWrapperTokenType(child.type)) continue
    const prevMapped = i > 0 && mappedFlags[i - 1]
    const nextMapped = i + 1 < mappedFlags.length && mappedFlags[i + 1]
    if (prevMapped || nextMapped) wrapperNeighborMapGaps++
  }
  return {
    inlineHasMap: hasMap(block && block.map),
    mappedChildren,
    mappedText,
    wrapperNeighborMapGaps
  }
}

const compareMapQuality = (beforeSummary, afterSummary) => {
  const beforeBlocks = new Map()
  const afterBlocks = new Map()
  for (const block of beforeSummary || []) beforeBlocks.set(block.idx, buildInlineMapMetrics(block))
  for (const block of afterSummary || []) afterBlocks.set(block.idx, buildInlineMapMetrics(block))
  const ids = new Set([...beforeBlocks.keys(), ...afterBlocks.keys()])
  const regressions = []
  const improvements = []

  for (const idx of [...ids].sort((a, b) => a - b)) {
    const before = beforeBlocks.get(idx) || {
      inlineHasMap: false,
      mappedChildren: 0,
      mappedText: 0,
      wrapperNeighborMapGaps: 0
    }
    const after = afterBlocks.get(idx) || {
      inlineHasMap: false,
      mappedChildren: 0,
      mappedText: 0,
      wrapperNeighborMapGaps: 0
    }
    const reasons = []
    const gains = []

    if (before.inlineHasMap && !after.inlineHasMap) reasons.push('inline-map-lost')
    if (after.mappedChildren < before.mappedChildren) {
      reasons.push('mapped-children ' + before.mappedChildren + '->' + after.mappedChildren)
    } else if (after.mappedChildren > before.mappedChildren) {
      gains.push('mapped-children ' + before.mappedChildren + '->' + after.mappedChildren)
    }
    if (after.mappedText < before.mappedText) {
      reasons.push('mapped-text ' + before.mappedText + '->' + after.mappedText)
    } else if (after.mappedText > before.mappedText) {
      gains.push('mapped-text ' + before.mappedText + '->' + after.mappedText)
    }
    if (after.wrapperNeighborMapGaps > before.wrapperNeighborMapGaps) {
      reasons.push('wrapper-map-gaps ' + before.wrapperNeighborMapGaps + '->' + after.wrapperNeighborMapGaps)
    } else if (after.wrapperNeighborMapGaps < before.wrapperNeighborMapGaps) {
      gains.push('wrapper-map-gaps ' + before.wrapperNeighborMapGaps + '->' + after.wrapperNeighborMapGaps)
    }

    if (reasons.length > 0) regressions.push({ idx, reasons, before, after })
    if (gains.length > 0) improvements.push({ idx, gains, before, after })
  }

  return {
    regressed: regressions.length > 0,
    improved: improvements.length > 0,
    regressions,
    improvements
  }
}

// Token-only structural diffs still happen when postprocess splits bracket text or
// rewrites inline ranges. The practical signal is whether map quality regresses,
// not whether the child-token summary changed at all.
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
    out.push('- inline idx=' + block.idx + ' map=' + JSON.stringify(block.map))
    let shown = 0
    for (const child of block.children) {
      if (shown >= limit) {
        out.push('  ...')
        break
      }
      const content = child.content.replace(/\n/g, '\\n')
      out.push('  ' + child.type + ' tag=' + child.tag + ' level=' + child.level + ' map=' + JSON.stringify(child.map) + ' content=' + content)
      shown++
    }
  }
  return out.join('\n')
}

const formatMapQuality = (quality) => {
  const lines = []
  for (const item of quality.regressions) {
    lines.push('- inline idx=' + item.idx + ' regression: ' + item.reasons.join(', '))
  }
  for (const item of quality.improvements) {
    lines.push('- inline idx=' + item.idx + ' improvement: ' + item.gains.join(', '))
  }
  if (lines.length === 0) return '(no map-quality delta)'
  return lines.join('\n')
}

const rawArgs = process.argv.slice(2)
const showStructural = rawArgs.includes('--show-structural')
const strictMapRegression = !rawArgs.includes('--allow-map-regressions')
const args = rawArgs.filter((arg) => arg !== '--show-structural' && arg !== '--allow-map-regressions')
const files = args.length > 0
  ? args.map((p) => (p.includes('/') ? p : path.join(__dirname, p)))
  : [path.join(__dirname, 'p-attrs--o-japaneseonly-complex.txt')]

const maxDiff = 10
let total = 0
let structuralDiffs = 0
let mapRegressions = 0
let mapImprovements = 0
let printedRegressions = 0
let printedStructural = 0

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const examples = readExamples(content)
  for (let idx = 0; idx < examples.length; idx++) {
    const markdown = examples[idx].markdown
    if (!markdown.includes('[') && !markdown.includes('**') && !markdown.includes('*')) continue
    total++
    const { before, after } = run(markdown)
    const beforeSummary = before || []
    const afterSummary = after || []
    const sigBefore = signature(beforeSummary)
    const sigAfter = signature(afterSummary)
    if (sigBefore === sigAfter) continue

    structuralDiffs++
    const quality = compareMapQuality(beforeSummary, afterSummary)
    if (quality.regressed) {
      mapRegressions++
      if (printedRegressions < maxDiff) {
        console.log('\n=== MAP REGRESSION ' + path.basename(file) + ' #' + (idx + 1) + ' ===')
        console.log('markdown: ' + markdown.replace(/\n/g, '\\n'))
        console.log('quality:')
        console.log(formatMapQuality(quality))
        console.log('before:')
        console.log(formatInline(beforeSummary))
        console.log('after:')
        console.log(formatInline(afterSummary))
        printedRegressions++
      }
      continue
    }

    if (quality.improved) mapImprovements++
    if (showStructural && printedStructural < maxDiff) {
      console.log('\n=== STRUCTURAL DIFF ' + path.basename(file) + ' #' + (idx + 1) + ' ===')
      console.log('markdown: ' + markdown.replace(/\n/g, '\\n'))
      console.log('quality:')
      console.log(formatMapQuality(quality))
      console.log('before:')
      console.log(formatInline(beforeSummary))
      console.log('after:')
      console.log(formatInline(afterSummary))
      printedStructural++
    }
  }
}

console.log('\nChecked ' + total + ' cases.')
console.log('Structural diff count: ' + structuralDiffs)
console.log('Map regression count: ' + mapRegressions)
console.log('Map improvement count: ' + mapImprovements)
if (!showStructural && structuralDiffs > 0) {
  console.log('(structural-only diffs are suppressed; pass --show-structural to inspect them)')
}
if (mapRegressions > maxDiff) {
  console.log('(showing first ' + maxDiff + ' regressions)')
}
if (strictMapRegression && mapRegressions > 0) {
  process.exitCode = 1
}
