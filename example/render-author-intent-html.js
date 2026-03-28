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
for (let i = 0; i < cases.length; i++) {
  const testCase = cases[i]
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

  caseHtml += `
  <section class="case">
    <h2>${i + 1}. ${escapeHtml(testCase.name)}</h2>
    <dl class="meta">
      <dt>Intent</dt><dd>${escapeHtml(testCase.intent)}</dd>
      <dt>Preferred</dt><dd>${escapeHtml(testCase.preferred.join(', ') || '-')}</dd>
      <dt>Acceptable</dt><dd>${escapeHtml(testCase.acceptable.join(', ') || '-')}</dd>
      <dt>Focus</dt><dd>${escapeHtml(testCase.focus)}</dd>
    </dl>
    <details class="markdown-toggle">
      <summary>Markdown Source</summary>
      <pre class="source">${escapeHtml(testCase.markdown)}</pre>
    </details>
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
        <div class="rendered">${mode.html}</div>
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
      --bg: #f5f3ee;
      --card: #fffdf8;
      --line: #d9d2c7;
      --text: #1f2937;
      --muted: #5b6470;
      --preferred-bg: #e8f7ed;
      --preferred-line: #7cc08f;
      --acceptable-bg: #fff5d8;
      --acceptable-line: #d8b24c;
      --neutral-bg: #eef2f7;
      --neutral-line: #b7c4d6;
      --same-bg: #edfdf5;
      --same-fg: #166534;
      --diff-bg: #fff7ed;
      --diff-fg: #9a3412;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(1100px 460px at 100% -10%, #d8ece7 0%, transparent 60%),
        radial-gradient(900px 420px at -10% 0%, #fbe7d7 0%, transparent 60%),
        linear-gradient(180deg, #f3efe8, var(--bg));
      color: var(--text);
      font-family: "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Segoe UI", sans-serif;
      line-height: 1.75;
    }
    main { max-width: 1080px; margin: 0 auto; padding: 18px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    .lead { margin: 0 0 8px; color: var(--muted); font-size: 14px; }
    .panel, .case {
      background: rgba(255, 253, 248, 0.92);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
      backdrop-filter: blur(2px);
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
    .case h2 { margin: 0 0 8px; font-size: 18px; }
    .meta {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 4px 8px;
      margin: 0 0 8px;
      font-size: 13px;
    }
    .meta dt { font-weight: 700; color: #374151; }
    .meta dd { margin: 0; color: var(--muted); }
    details { margin-bottom: 8px; }
    summary { cursor: pointer; color: #374151; font-size: 12px; }
    .markdown-toggle summary {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.7);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .mode-card {
      border: 1px solid var(--neutral-line);
      background: var(--neutral-bg);
      border-radius: 10px;
      padding: 10px;
    }
    .mode-card.role-preferred {
      border-color: var(--preferred-line);
      background: var(--preferred-bg);
    }
    .mode-card.role-acceptable {
      border-color: var(--acceptable-line);
      background: var(--acceptable-bg);
    }
    .mode-card header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "title html";
      gap: 4px 10px;
      align-items: center;
      margin-bottom: 6px;
    }
    .title-row {
      grid-area: title;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 8px;
      min-width: 0;
    }
    .mode-card h3 { margin: 0; font-size: 14px; line-height: 1.35; }
    .html-toggle {
      grid-area: html;
      margin: 0;
      justify-self: end;
    }
    .html-toggle summary {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border: 1px solid rgba(0, 0, 0, 0.14);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.82);
      white-space: nowrap;
    }
    .html-toggle pre {
      margin-top: 8px;
    }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
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
      background: rgba(255, 255, 255, 0.85);
      padding: 7px 12px;
      min-height: 0;
      line-height: 1.55;
      font-size: 16px;
    }
    pre.source {
      margin: 0;
      padding: 8px 10px;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.88);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: "Cascadia Code", "Consolas", monospace;
      font-size: 12px;
      line-height: 1.55;
    }
    @media (max-width: 720px) {
      main { padding: 12px; }
      h1 { font-size: 24px; }
      .meta { grid-template-columns: 1fr; }
      .mode-card header {
        grid-template-columns: 1fr;
        grid-template-areas:
          "title"
          "html";
        align-items: start;
      }
      .html-toggle {
        justify-self: start;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>Author-Intent Naturalness Cases</h1>
    <p class="lead">タグ数や markdown-it 差分だけではなく、「この入力で書き手がどこを強調したかったか」を明示したケースを並べて見るための example です。</p>
    <p class="lead">このページは自動採点ページではありません。Preferred / Acceptable は、mode を見比べるための review hint です。</p>
    <p class="lead">single-sentence だけでなく、同一段落内の multi-sentence case も含めています。sentence-boundary stop や local repair が後続文に spillover しないかを見るためです。</p>

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

    ${caseHtml}
  </main>
</body>
</html>`

fs.writeFileSync(outputPath, html, 'utf8')
console.log(`wrote ${outputPath}`)
