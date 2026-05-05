import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'

const MODES = [
  { key: 'japanese-boundary', label: 'japanese-boundary', opt: { mode: 'japanese-boundary' } },
  { key: 'japanese-boundary-guard', label: 'japanese-boundary-guard (default alias: japanese)', opt: { mode: 'japanese-boundary-guard' } },
  { key: 'aggressive', label: 'aggressive', opt: { mode: 'aggressive' } },
  { key: 'compatible', label: 'compatible / markdown-it', opt: { mode: 'compatible' } }
]

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const escapeAttr = (value) => escapeHtml(value).replace(/"/g, '&quot;')

const slugify = (value, index) => {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `case-${index + 1}${slug ? `-${slug}` : ''}`
}

const normalizeCsv = (value) => {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const parseCases = (content) => {
  const lines = content.split(/\r?\n/)
  const cases = []
  let current = null
  let currentField = null

  const pushCurrent = () => {
    if (!current) return
    current.intent = (current.intent || '').trim()
    current.preferred = normalizeCsv(current.preferredRaw || '')
    current.acceptable = normalizeCsv(current.acceptableRaw || '')
    current.focus = (current.focus || '').trim()
    current.markdown = (current.markdown || '').replace(/\n+$/, '')
    cases.push(current)
    current = null
    currentField = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd()
    if (line.startsWith('#')) continue

    const header = line.match(/^\[(.+?)\]$/)
    if (header) {
      const tag = header[1].trim()
      const lower = tag.toLowerCase()
      if (lower.startsWith('case')) {
        pushCurrent()
        current = {
          name: tag.slice(4).trim() || `case-${cases.length + 1}`,
          intent: '',
          preferredRaw: '',
          acceptableRaw: '',
          focus: '',
          markdown: ''
        }
        continue
      }
      if (lower === 'intent') currentField = 'intent'
      else if (lower === 'preferred') currentField = 'preferredRaw'
      else if (lower === 'acceptable') currentField = 'acceptableRaw'
      else if (lower === 'focus') currentField = 'focus'
      else if (lower === 'markdown') currentField = 'markdown'
      else currentField = null
      continue
    }

    if (!current || !currentField) continue
    if (currentField === 'markdown') current[currentField] += line + '\n'
    else current[currentField] += (current[currentField] ? '\n' : '') + line
  }

  pushCurrent()
  return cases
}

const countPreferredTotals = (cases) => {
  const counts = Object.create(null)
  for (let i = 0; i < MODES.length; i++) counts[MODES[i].key] = 0
  for (let i = 0; i < cases.length; i++) {
    const preferred = cases[i].preferred
    for (let j = 0; j < preferred.length; j++) {
      if (counts[preferred[j]] !== undefined) counts[preferred[j]]++
    }
  }
  return counts
}

const MODE_ORDER = Object.fromEntries(MODES.map((mode, index) => [mode.key, index]))

const describeModeRole = (modeKey, testCase) => {
  if (testCase.preferred.includes(modeKey)) return 'preferred'
  if (testCase.acceptable.includes(modeKey)) return 'acceptable'
  return 'neutral'
}

const sortRenderedModes = (renderedModes) => {
  const roleRank = {
    preferred: 0,
    acceptable: 1,
    neutral: 2
  }
  return renderedModes.slice().sort((a, b) => {
    const roleDiff = roleRank[a.role] - roleRank[b.role]
    if (roleDiff !== 0) return roleDiff
    return MODE_ORDER[a.key] - MODE_ORDER[b.key]
  })
}

const buildModeBadge = (role) => {
  if (role === 'preferred') return '<span class="badge preferred">Preferred</span>'
  if (role === 'acceptable') return '<span class="badge acceptable">Acceptable</span>'
  return '<span class="badge neutral">Compare</span>'
}

const buildModeChips = (modeKeys, fallback = '-') => {
  if (!modeKeys || modeKeys.length === 0) return escapeHtml(fallback)
  return modeKeys.map((key) => {
    const mode = MODES.find((candidate) => candidate.key === key)
    const label = mode ? mode.label : key
    return `<span class="mode-chip">${escapeHtml(label)}</span>`
  }).join('')
}

const decorateRenderedHtml = (html) => {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part || part.charAt(0) === '<') return part
      return part.replace(/\*/g, '<span class="literal-star">*</span>')
    })
    .join('')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputArg = process.argv[2] || 'author-intent-cases.txt'
const outArg = process.argv[3] || 'author-intent-cases.html'
const inputPath = path.resolve(__dirname, inputArg.replace(/^\.\//, ''))
const outputPath = path.resolve(__dirname, outArg.replace(/^\.\//, ''))

const cases = parseCases(fs.readFileSync(inputPath, 'utf8'))
const markdownIt = new MarkdownIt()
const modeRenderers = Object.fromEntries(MODES.map((mode) => [mode.key, new MarkdownIt().use(mditStrongJa, mode.opt)]))
const preferredTotals = countPreferredTotals(cases)

let caseHtml = ''
let caseIndexHtml = ''
for (let i = 0; i < cases.length; i++) {
  const testCase = cases[i]
  const caseId = slugify(testCase.name, i)
  const rendered = sortRenderedModes(MODES.map((mode) => {
    const html = modeRenderers[mode.key].render(testCase.markdown)
    const sameAsMarkdownIt = html === markdownIt.render(testCase.markdown)
    return {
      ...mode,
      html,
      role: describeModeRole(mode.key, testCase),
      sameAsMarkdownIt
    }
  }))

  const preferredLabels = testCase.preferred.map((key) => {
    const mode = MODES.find((candidate) => candidate.key === key)
    return mode ? mode.label : key
  }).join(', ') || '-'

  caseIndexHtml += `
        <li>
          <a href="#${escapeAttr(caseId)}">
            <span class="case-index-no">${i + 1}</span>
            <span class="case-index-main">
              <span class="case-index-title">${escapeHtml(testCase.name)}</span>
              <span class="case-index-meta">Preferred: ${escapeHtml(preferredLabels)}</span>
            </span>
          </a>
        </li>`

  caseHtml += `
  <section class="case" id="${escapeAttr(caseId)}">
    <header class="case-header">
      <div>
        <p class="eyebrow">Case ${i + 1}</p>
        <h2>${escapeHtml(testCase.name)}</h2>
      </div>
      <a class="top-link" href="#top">Back to top</a>
    </header>
    <div class="intent-grid">
      <section class="intent-card intent-main">
        <h3>Author intent</h3>
        <p>${escapeHtml(testCase.intent)}</p>
      </section>
      <section class="intent-card">
        <h3>Preferred</h3>
        <div class="mode-chip-row">${buildModeChips(testCase.preferred)}</div>
      </section>
      <section class="intent-card">
        <h3>Acceptable</h3>
        <div class="mode-chip-row">${buildModeChips(testCase.acceptable)}</div>
      </section>
      <section class="intent-card intent-focus">
        <h3>Focus</h3>
        <p>${escapeHtml(testCase.focus)}</p>
      </section>
    </div>
    <div class="markdown-block">
      <div class="block-label">Markdown source</div>
      <pre class="source markdown-source">${escapeHtml(testCase.markdown)}</pre>
    </div>
    <div class="grid">
      ${rendered.map((mode) => `
      <article class="mode-card role-${mode.role}">
        <header>
          <div class="title-row">
            <h3>${escapeHtml(mode.label)}</h3>
            <div class="badges">
              ${buildModeBadge(mode.role)}
              <span class="badge ${mode.sameAsMarkdownIt ? 'same' : 'diff'}">${mode.sameAsMarkdownIt ? 'Same as markdown-it' : 'Diff from markdown-it'}</span>
            </div>
          </div>
          <details class="html-toggle">
            <summary>HTML Source</summary>
            <pre class="source html-source">${escapeHtml(mode.html)}</pre>
          </details>
        </header>
        <div class="rendered">${decorateRenderedHtml(mode.html)}</div>
      </article>`).join('')}
    </div>
  </section>`
}

const summaryRows = MODES.map((mode) => {
  return `<tr><th>${escapeHtml(mode.label)}</th><td>${preferredTotals[mode.key] || 0}</td></tr>`
}).join('')

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Author Intent Cases</title>
  <style>
    :root {
      --bg: #f7f7f5;
      --card: #ffffff;
      --line: #d8d8d4;
      --text: #20242a;
      --muted: #68707a;
      --preferred-bg: #f3fbf5;
      --preferred-line: #86b894;
      --acceptable-bg: #fffaf0;
      --acceptable-line: #d8bd72;
      --neutral-bg: #fafafa;
      --neutral-line: #d7dde5;
      --same-bg: #f2faf5;
      --same-fg: #276749;
      --diff-bg: #fff7f0;
      --diff-fg: #9a4d16;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Segoe UI", sans-serif;
      line-height: 1.75;
    }
    main { max-width: 1280px; margin: 0 auto; padding: 18px; }
    h1 { margin: 0 0 8px; font-size: 30px; letter-spacing: -0.02em; }
    h2, h3 { line-height: 1.35; }
    .lead { margin: 0 0 8px; color: var(--muted); font-size: 14px; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .toolbar button {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: #374151;
      padding: 6px 12px;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
    }
    .toolbar button:hover { background: #f3f4f6; border-color: #a8a8a2; }
    .panel, .case {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 14px;
    }
    .summary-table th, .summary-table td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
    }
    .summary-table thead th { background: #f7f2e8; }
    .notes { margin: 8px 0 0; padding-left: 18px; color: var(--muted); }
    .notes li { margin: 4px 0; }
    .case-index {
      list-style: none;
      padding: 0;
      margin: 12px 0 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 8px;
    }
    .case-index li { margin: 0; }
    .case-index a {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      min-height: 100%;
      color: inherit;
      text-decoration: none;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      padding: 8px 10px;
    }
    .case-index a:hover {
      border-color: #9ca3af;
      background: #fff;
    }
    .case-index-no {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: #4b5563;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
    }
    .case-index-main {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .case-index-title {
      overflow-wrap: anywhere;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.35;
    }
    .case-index-meta {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }
    .case-header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .case h2 { margin: 0; font-size: 20px; }
    .eyebrow {
      margin: 0 0 2px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .top-link {
      color: var(--muted);
      font-size: 12px;
      text-decoration: none;
      white-space: nowrap;
    }
    .top-link:hover { color: #111827; text-decoration: underline; }
    .intent-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(180px, 0.7fr) minmax(180px, 0.7fr);
      gap: 8px;
      margin-bottom: 10px;
    }
    .intent-card {
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 10px;
      background: #fff;
      padding: 8px 10px;
      min-width: 0;
    }
    .intent-card.intent-main { grid-column: span 1; }
    .intent-card.intent-focus { grid-column: 1 / -1; }
    .intent-card h3 {
      margin: 0 0 4px;
      color: #374151;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .intent-card p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    details { margin-bottom: 8px; }
    summary { cursor: pointer; color: #374151; font-size: 12px; }
    .markdown-block {
      margin-bottom: 10px;
    }
    .block-label {
      margin: 0 0 4px;
      color: #374151;
      font-size: 12px;
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 10px;
      align-items: stretch;
    }
    .mode-card {
      border: 1px solid var(--neutral-line);
      background: var(--neutral-bg);
      border-radius: 10px;
      padding: 10px;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 6px;
    }
    .mode-card.role-preferred {
      border-color: var(--preferred-line);
      background: var(--preferred-bg);
      border-left-width: 4px;
    }
    .mode-card.role-acceptable {
      border-color: var(--acceptable-line);
      background: var(--acceptable-bg);
      border-left-width: 4px;
    }
    .mode-card header {
      display: block;
      margin-bottom: 6px;
    }
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 8px;
      min-width: 0;
    }
    .mode-card h3 { margin: 0; font-size: 14px; line-height: 1.35; }
    .html-toggle {
      margin: 6px 0 0;
    }
    .html-toggle summary {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border: 1px solid rgba(0, 0, 0, 0.14);
      border-radius: 999px;
      background: #fff;
      white-space: nowrap;
    }
    .html-toggle pre {
      margin-top: 8px;
    }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .mode-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .mode-chip {
      display: inline-flex;
      align-items: center;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #fff;
      color: #334155;
      padding: 2px 7px;
      font-size: 11px;
      line-height: 1.4;
    }
    .badge {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      border: 1px solid transparent;
      background: #fff;
    }
    .badge.preferred {
      background: #dcfce7;
      color: #166534;
      border-color: #86efac;
    }
    .badge.acceptable {
      background: #fef3c7;
      color: #92400e;
      border-color: #fcd34d;
    }
    .badge.neutral {
      background: #eef2ff;
      color: #4338ca;
      border-color: #c7d2fe;
    }
    .badge.same {
      background: var(--same-bg);
      color: var(--same-fg);
      border-color: #86efac;
    }
    .badge.diff {
      background: var(--diff-bg);
      color: var(--diff-fg);
      border-color: #fdba74;
    }
    .rendered {
      border: 1px dashed rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      background: #fff;
      padding: 9px 12px;
      min-height: 0;
      line-height: 1.75;
      font-size: 16px;
    }
    .rendered p { margin: 0; }
    .rendered em {
      color: #9a3412;
      background: #fff7ed;
      border-radius: 4px;
      padding: 0 2px;
    }
    .rendered strong {
      color: #991b1b;
      background: #fef2f2;
      border-radius: 4px;
      padding: 0 2px;
    }
    .rendered code {
      color: #334155;
      background: #eef2f7;
      border-radius: 4px;
      padding: 0 3px;
      font-size: 0.92em;
    }
    .literal-star {
      color: #166534;
      background: #e7f8ec;
      border-radius: 3px;
      padding: 0 1px;
      font-weight: 700;
    }
    pre.source {
      margin: 0;
      padding: 8px 10px;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      background: #fff;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: "Cascadia Code", "Consolas", monospace;
      font-size: 12px;
      line-height: 1.55;
    }
    .markdown-source {
      background: #f4f4f5;
      color: #111827;
      border-color: #d4d4d8;
    }
    @media (max-width: 720px) {
      main { padding: 12px; }
      h1 { font-size: 24px; }
      .intent-grid { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
      .case-header {
        display: grid;
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main id="top">
    <h1>Author-Intent Naturalness Cases</h1>
    <p class="lead">タグ数や markdown-it 差分だけではなく、「この入力で書き手がどこを強調したかったか」を明示したケースを並べて見るための example です。</p>
    <p class="lead">このページは自動採点ページではありません。Preferred / Acceptable は、mode を見比べるための review hint です。</p>
    <p class="lead">single-sentence だけでなく、同一段落内の multi-sentence case も含めています。sentence-boundary stop や local repair が後続文に spillover しないかを見るためです。</p>
    <div class="toolbar" aria-label="Display controls">
      <button type="button" data-toggle-html="open">Open all HTML source</button>
      <button type="button" data-toggle-html="close">Close all HTML source</button>
    </div>

    <section class="panel">
      <h2>How to use</h2>
      <ul class="notes">
        <li>まず <strong>Intent</strong> と <strong>Focus</strong> を読み、そのあと上から順に mode の見た目を比較する。</li>
        <li>Preferred は「このケースで一番自然に見えてほしい mode」、Acceptable は妥協可能な mode を示す。</li>
        <li>迷うケースは削らずに残し、Preferred / Acceptable を見直して corpus 側に判断の揺れを蓄積する。</li>
        <li>同一段落の複数文ケースは重要だが、段落をまたぐケースは inline scope が切れるため優先度を下げてよい。</li>
      </ul>
      <table class="summary-table">
        <thead><tr><th>Mode</th><th>Preferred count</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Case index</h2>
      <p class="lead">各ケースへ直接移動できます。まずケース名と Preferred を見て、気になる入力だけ開いて確認してください。</p>
      <ol class="case-index">${caseIndexHtml}
      </ol>
    </section>

    ${caseHtml}
  </main>
  <script>
    document.querySelectorAll('[data-toggle-html]').forEach((button) => {
      button.addEventListener('click', () => {
        const open = button.getAttribute('data-toggle-html') === 'open'
        document.querySelectorAll('.html-toggle').forEach((details) => {
          details.open = open
        })
      })
    })
  </script>
</body>
</html>`

fs.writeFileSync(outputPath, html, 'utf8')
console.log(`wrote ${outputPath}`)
