import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import MarkdownIt from 'markdown-it'
import strongJa from '../index.js'

const MODES = [
  { key: 'japanese-boundary', label: 'japanese-boundary', opt: { mode: 'japanese-boundary' } },
  { key: 'japanese-boundary-guard', label: 'japanese-boundary-guard (alias: japanese)', opt: { mode: 'japanese-boundary-guard' } },
  { key: 'aggressive', label: 'aggressive', opt: { mode: 'aggressive' } },
  { key: 'compatible', label: 'compatible', opt: { mode: 'compatible' } }
]

const CATEGORIES = [
  { key: 'JA', label: '日本語', char: '和', note: 'Japanese character' },
  { key: 'EN', label: '英字', char: 'a', note: 'ASCII letter' },
  { key: 'NUM', label: '数字', char: '1', note: 'ASCII digit' },
  { key: 'P_ASC', label: 'ASCII記号', char: '.', note: 'ASCII punctuation' },
  { key: 'P_JA', label: '和文句読点', char: '。', note: 'Japanese punctuation' },
  { key: 'SP', label: '空白', char: ' ', note: 'Space' }
]

const PATTERNS = [
  {
    key: 'single-code',
    label: '*`code`*',
    marker: '*',
    innerMarkdown: '`x`',
    tag: 'em',
    innerHtml: '<code>x</code>'
  },
  {
    key: 'double-code',
    label: '**`code`**',
    marker: '**',
    innerMarkdown: '`x`',
    tag: 'strong',
    innerHtml: '<code>x</code>'
  },
  {
    key: 'single-link',
    label: '*[link](u)*',
    marker: '*',
    innerMarkdown: '[x](u)',
    tag: 'em',
    innerHtml: '<a href="u">x</a>'
  },
  {
    key: 'double-link',
    label: '**[link](u)**',
    marker: '**',
    innerMarkdown: '[x](u)',
    tag: 'strong',
    innerHtml: '<a href="u">x</a>'
  }
]

const ISSUE_CASE = 'メニューではmenu**[ramen](url)**と書きます。'

const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const escapeAttr = (value) => escapeHtml(value).replace(/"/g, '&quot;')

const buildCaseSource = (left, pattern, right) => {
  return `Z${left}${pattern.marker}${pattern.innerMarkdown}${pattern.marker}${right}Z`
}

const evaluateCase = (md, pattern, left, right) => {
  const source = buildCaseSource(left.char, pattern, right.char)
  const html = md.render(source).trim()
  const wrapped = `<${pattern.tag}>${pattern.innerHtml}</${pattern.tag}>`
  const converted = html.indexOf(wrapped) !== -1
  return { source, html, converted }
}

const buildModeData = () => {
  const byMode = []
  for (let i = 0; i < MODES.length; i++) {
    const mode = MODES[i]
    const md = new MarkdownIt().use(strongJa, mode.opt)
    const issueHtml = md.render(ISSUE_CASE).trim()
    const patterns = []
    for (let p = 0; p < PATTERNS.length; p++) {
      const pattern = PATTERNS[p]
      let convertedCount = 0
      const grid = []
      for (let l = 0; l < CATEGORIES.length; l++) {
        const row = []
        for (let r = 0; r < CATEGORIES.length; r++) {
          const result = evaluateCase(md, pattern, CATEGORIES[l], CATEGORIES[r])
          if (result.converted) convertedCount++
          row.push(result)
        }
        grid.push(row)
      }
      patterns.push({
        ...pattern,
        convertedCount,
        totalCount: CATEGORIES.length * CATEGORIES.length,
        grid
      })
    }
    byMode.push({
      ...mode,
      issueHtml,
      patterns
    })
  }
  return byMode
}

const buildSummaryRows = (modeData) => {
  const rows = []
  for (let i = 0; i < modeData.length; i++) {
    const mode = modeData[i]
    for (let p = 0; p < mode.patterns.length; p++) {
      const pat = mode.patterns[p]
      rows.push(
        `<tr><td>${escapeHtml(mode.label)}</td><td><code>${escapeHtml(pat.label)}</code></td><td>${pat.convertedCount}/${pat.totalCount}</td></tr>`
      )
    }
  }
  return rows.join('')
}

const CATEGORY_INDEX = Object.fromEntries(CATEGORIES.map((c, idx) => [c.key, idx]))
const BOUNDARY_CASES = [
  ['JA', 'JA'],
  ['SP', 'JA'],
  ['JA', 'P_JA'],
  ['P_ASC', 'P_JA'],
  ['JA', 'EN'],
  ['EN', 'JA'],
  ['JA', 'NUM'],
  ['NUM', 'JA'],
  ['SP', 'EN']
]

const getGridCell = (pat, leftKey, rightKey) => {
  const li = CATEGORY_INDEX[leftKey]
  const ri = CATEGORY_INDEX[rightKey]
  if (li === undefined || ri === undefined) return null
  return pat.grid[li][ri]
}

const getCategoryLabel = (key) => {
  const idx = CATEGORY_INDEX[key]
  if (idx === undefined) return key
  return CATEGORIES[idx].label
}

const matrixSourceToSnippet = (source) => {
  if (!source) return ''
  if (source.length >= 2 && source.charCodeAt(0) === 0x5A && source.charCodeAt(source.length - 1) === 0x5A) {
    return source.slice(1, -1)
  }
  return source
}

const collectBoundaryExamples = (pat, converted, limit) => {
  const out = []
  for (let i = 0; i < BOUNDARY_CASES.length; i++) {
    const pair = BOUNDARY_CASES[i]
    const cell = getGridCell(pat, pair[0], pair[1])
    if (!cell || cell.converted !== converted) continue
    const left = getCategoryLabel(pair[0])
    const right = getCategoryLabel(pair[1])
    const snippet = matrixSourceToSnippet(cell.source)
    out.push(`左:${left} / 右:${right}（${snippet}）`)
    if (out.length >= limit) break
  }
  return out
}

const buildPatternDescription = (mode, pat) => {
  const converted = collectBoundaryExamples(pat, true, 3)
  const literal = collectBoundaryExamples(pat, false, 3)

  if (pat.convertedCount === pat.totalCount) {
    return `この表では境界条件による抑制がほぼ入らず、英字や数字が隣接しても変換されます。代表例: ${converted.join('、')}。`
  }
  if (mode.key === 'compatible') {
    return `この表では markdown-it 互換を優先するため、境界の種類よりリテラル保持が優先されます。保持例: ${literal.join('、')}。`
  }
  if (converted.length > 0 && literal.length > 0) {
    return `この表では、日本語・和文句読点・空白に寄った境界は変換されやすく、英字や数字が隣接する境界は保持されやすい傾向です。変換例: ${converted.join('、')} / 保持例: ${literal.join('、')}。`
  }
  if (converted.length > 0) {
    return `この表では変換側の判定が優勢です。変換例: ${converted.join('、')}。`
  }
  if (literal.length > 0) {
    return `この表では保持側の判定が優勢です。保持例: ${literal.join('、')}。`
  }
  return 'この表は代表境界ケースの判定結果を表示します。'
}

const buildPatternTable = (mode, pat) => {
  let head = '<tr><th>左\\\\右</th>'
  for (let i = 0; i < CATEGORIES.length; i++) {
    head += `<th>${CATEGORIES[i].label}</th>`
  }
  head += '</tr>'

  let body = ''
  for (let l = 0; l < CATEGORIES.length; l++) {
    let row = `<tr><th>${CATEGORIES[l].label}</th>`
    for (let r = 0; r < CATEGORIES.length; r++) {
      const cell = pat.grid[l][r]
      const flag = cell.converted ? 'Y' : '-'
      const klass = cell.converted ? 'cell-yes' : 'cell-no'
      const tip = `src: ${cell.source}\nhtml: ${cell.html}`
      row += `<td class="${klass}" title="${escapeAttr(tip)}">${flag}</td>`
    }
    row += '</tr>'
    body += row
  }

  return `
  <section class="pattern-card">
    <h4><code>${escapeHtml(pat.label)}</code> <span class="count">${pat.convertedCount}/${pat.totalCount}</span></h4>
    <p class="pattern-desc">${escapeHtml(buildPatternDescription(mode, pat))}</p>
    <table class="matrix mode-${escapeHtml(mode.key)}">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </section>`
}

const buildModeSection = (mode, isOpen) => {
  let content = ''
  for (let p = 0; p < mode.patterns.length; p++) {
    content += buildPatternTable(mode, mode.patterns[p])
  }
  return `
  <details class="mode-block"${isOpen ? ' open' : ''}>
    <summary>${escapeHtml(mode.label)}</summary>
    <div class="issue-line">
      <div class="issue-src"><code>${escapeHtml(ISSUE_CASE)}</code></div>
      <div class="issue-html">${escapeHtml(mode.issueHtml)}</div>
    </div>
    <div class="pattern-grid">${content}</div>
  </details>`
}

const buildNaturalnessNotes = () => {
  return `
  <section class="notes">
    <h3>Naturalness Notes (boundary-focused)</h3>
    <ul>
      <li><code>japanese-boundary</code> and <code>japanese-boundary-guard</code>: conservative when English letters or digits touch the marker, while still recovering Japanese/punctuation-side wrappers.</li>
      <li><code>aggressive</code>: converts almost everything (maximum recovery, higher over-conversion risk).</li>
      <li><code>compatible</code>: stays closest to markdown-it output (maximum predictability, minimum recovery).</li>
      <li><code>default (japanese)</code> is an alias of <code>japanese-boundary-guard</code>, so the duplicate row is intentionally omitted.</li>
    </ul>
  </section>`
}

const buildHtml = (modeData) => {
  let sections = ''
  for (let i = 0; i < modeData.length; i++) {
    sections += buildModeSection(modeData[i], i === 0)
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>strong-ja inline wrapper matrix</title>
  <style>
    :root {
      --bg0: #f3f0ea;
      --bg1: #fffdf8;
      --ink: #1d1f22;
      --muted: #5f6772;
      --line: #d8d1c7;
      --ok-bg: #dff6e8;
      --ok-fg: #155b36;
      --no-bg: #f7e9e6;
      --no-fg: #7a2d22;
      --accent: #005f86;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Segoe UI", sans-serif;
      background:
        radial-gradient(1200px 480px at 85% -10%, #d4ecf8 0%, transparent 65%),
        radial-gradient(900px 400px at -10% 0%, #fde8da 0%, transparent 55%),
        linear-gradient(180deg, var(--bg0), var(--bg1));
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .lead { margin: 0 0 18px; color: var(--muted); }
    .panel {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(2px);
      margin-bottom: 14px;
    }
    .summary {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .summary th, .summary td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
    }
    .summary thead th {
      background: #f1ece3;
    }
    .legend-list { margin: 8px 0 0; padding-left: 18px; color: var(--muted); }
    .mode-block {
      border: 1px solid var(--line);
      border-radius: 12px;
      margin-bottom: 12px;
      background: rgba(255, 255, 255, 0.86);
      overflow: hidden;
    }
    .mode-block > summary {
      cursor: pointer;
      list-style: none;
      font-weight: 700;
      color: var(--accent);
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: #f5f9fb;
    }
    .mode-block > summary::-webkit-details-marker { display: none; }
    .issue-line {
      padding: 12px 14px 0;
      color: var(--muted);
      font-size: 13px;
    }
    .issue-src, .issue-html {
      padding: 6px 8px;
      border: 1px dashed var(--line);
      border-radius: 8px;
      margin-bottom: 8px;
      background: #fff;
      overflow-x: auto;
      white-space: nowrap;
    }
    .pattern-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 10px;
      padding: 12px 14px 14px;
    }
    .pattern-card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #fff;
    }
    .pattern-card h4 {
      margin: 0 0 8px;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: baseline;
    }
    .pattern-desc {
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }
    .count { color: var(--muted); font-weight: 600; }
    .matrix {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      table-layout: fixed;
    }
    .matrix th, .matrix td {
      border: 1px solid var(--line);
      text-align: center;
      padding: 4px;
      height: 24px;
    }
    .matrix th {
      background: #f8f5ef;
      font-weight: 700;
    }
    .cell-yes {
      background: var(--ok-bg);
      color: var(--ok-fg);
      font-weight: 700;
    }
    .cell-no {
      background: var(--no-bg);
      color: var(--no-fg);
      font-weight: 700;
    }
    .notes ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }
    .notes li { margin: 6px 0; }
    code {
      font-family: "Cascadia Code", "Consolas", monospace;
      font-size: 0.95em;
    }
    @media (max-width: 768px) {
      main { padding: 14px; }
      h1 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Inline Wrapper Matrix for strong-ja</h1>
    <p class="lead">Detailed visual comparison for <code>* / **</code> wrappers around <code>inline code</code> and <code>inline link</code>, with left/right context categories.</p>

    <section class="panel">
      <h3>How to read</h3>
      <ul class="legend-list">
        <li><code>Y</code>: wrapped as <code>&lt;em&gt;</code> or <code>&lt;strong&gt;</code> around code/link.</li>
        <li><code>-</code>: marker remains literal for that context.</li>
        <li>Rows are left context, columns are right context.</li>
        <li>Boundary labels: Japanese / ASCII letter / digit / ASCII punctuation / Japanese punctuation / space.</li>
        <li>Cell tooltip shows the source and rendered HTML for the exact case.</li>
      </ul>
    </section>

    <section class="panel">
      <h3>Summary (converted cells)</h3>
      <table class="summary">
        <thead><tr><th>Mode</th><th>Pattern</th><th>Converted</th></tr></thead>
        <tbody>${buildSummaryRows(modeData)}</tbody>
      </table>
    </section>

    ${buildNaturalnessNotes()}

    ${sections}
  </main>
</body>
</html>`
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outFile = path.resolve(__dirname, process.argv[2] || 'inline-wrapper-matrix.html')
const data = buildModeData()
const html = buildHtml(data)

fs.writeFileSync(outFile, html, 'utf8')
console.log(`Wrote ${path.relative(process.cwd(), outFile)}`)
