import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'

const readCases = (content) => {
  const lines = content.split(/\r?\n/)
  const cases = []
  let current = null
  let currentField = null

  const pushCurrent = () => {
    if (!current) return
    current.markdown = current.markdown.replace(/\n+$/, '')
    cases.push(current)
    current = null
    currentField = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd()
    if (line.startsWith('#') || line === '') continue

    const header = line.match(/^\[(.+?)\]$/)
    if (header) {
      const tag = header[1].trim()
      const lower = tag.toLowerCase()
      if (lower.startsWith('case')) {
        pushCurrent()
        current = {
          name: tag.slice(4).trim() || `case-${cases.length + 1}`,
          markdown: ''
        }
        continue
      }
      if (lower === 'markdown') {
        currentField = 'markdown'
        continue
      }
      currentField = null
      continue
    }

    if (!current || currentField !== 'markdown') continue
    current.markdown += line + '\n'
  }

  pushCurrent()
  return cases
}

const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const toInline = (value) => value.replace(/\n/g, '\\n')
const normalize = (value) => value.replace(/\n+$/, '')
const stripTags = (value) => value.replace(/<[^>]+>/g, ' ')
const countTag = (html, tag) => {
  const matches = html.match(new RegExp(`<${tag}>`, 'g'))
  return matches ? matches.length : 0
}
const getActiveSourceClasses = (active) => {
  let emDepth = 0
  let strongDepth = 0
  for (let i = 0; i < active.length; i++) {
    if (active[i] === 'star1') emDepth++
    if (active[i] === 'star2') strongDepth++
  }
  if (emDepth === 0 && strongDepth === 0) return ''
  const classes = ['src-span']
  if (emDepth > 0 && strongDepth > 0) {
    classes.push('tone-mix')
  } else if (emDepth > 0) {
    classes.push('tone-em')
  } else {
    classes.push('tone-strong')
  }
  if (emDepth > 1) classes.push('tone-em-double')
  if (strongDepth > 1) classes.push('tone-strong-double')
  return classes.join(' ')
}
const colorizeUnresolvedStars = (text) => {
  return escapeHtml(text).replace(/\*/g, '<span class="src-unresolved">*</span>')
}
const highlightUnresolvedAsterisksInHtml = (html) => {
  const parts = html.split(/(<[^>]+>)/g)
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part || (part.startsWith('<') && part.endsWith('>'))) continue
    parts[i] = part.replace(/\*/g, '<span class="unresolved-star">*</span>')
  }
  return parts.join('')
}
const countLiteralAsterisks = (html) => {
  const text = stripTags(html)
  const matches = text.match(/\*/g)
  return matches ? matches.length : 0
}
const describeInputTraits = (caseName, markdown) => {
  const lines = []
  if (caseName.startsWith('base-fullwidth-space-boundary')) {
    lines.push('入力特性: `！` の直後に全角スペース（U+3000）を置いた `*...*` と、`**` / `*` の直後に英字が始まる場合（スペースあり/なし）を同一段落で比較するケースです。')
    lines.push('確認観点: 全角スペース境界での開始判定が過剰にならないこと、`**English...**` と `** English...**` の差、および単一 `*` でも同様の差が一貫して説明できること。')
    return lines
  }
  if (caseName.startsWith('base-plus-space-contrast-ladder')) {
    lines.push('入力特性: 単一 `*` / `**` / `***` / `****` で「半角スペースあり」と「半角スペースなし」を同じ段落に並べた比較ケースです。')
    lines.push('確認観点: `japanese-boundary` と `japanese-boundary-guard` の境界差（スペース直後の英字をどこまで強調扱いにするか）が段階的に見えること。')
    return lines
  }
  if (caseName.startsWith('base-link-and-code-outer-markers')) {
    lines.push('入力特性: `[]()` と `[][]`、およびインラインコード `` `...` `` の外側に `*` / `**` を重ねた日英混在ケースです。')
    lines.push('確認観点: リンク・参照リンク・コードをまたぐ強調で、モード間の回復差と未解決 `*` の残し方が直感的に比較できること。')
    return lines
  }
  if (caseName.startsWith('base-japanese-bracket-and-punctuation')) {
    lines.push('入力特性: 鍵括弧・括弧・引用符（「」,『』,(),〈〉,【】,“”,〝〟）に加えて、半角記号で囲まれた語句（("..."), [...], {...}, <...>, #...#, ;...;, @...@, +...+, =...=, ~...~, |...|, :...:, !...!, ?...?）の外側に `*...*` を置いた日英混在ケースです。')
    lines.push('確認観点: 日本語記号だけでなく、半角記号まわりでも `*` の開始/終了が破綻しないか。')
    return lines
  }
  if (caseName.startsWith('grouped-single-spillover')) {
    lines.push('入力特性: 先頭文で単一 `*` を崩し、後続文の `*` / `**` 解釈に波及するかを確認するケースです。')
    lines.push('確認観点: 単一 `*` の補正が段落全体を過剰に巻き込まないこと。')
    return lines
  }
  if (caseName.startsWith('grouped-double-spillover')) {
    lines.push('入力特性: 先頭文で `**` を崩し、後続文の `**` と通常 `*` がどう再配置されるかを確認するケースです。')
    lines.push('確認観点: `**` 系での回復量と、互換モードとの差分の妥当性。')
    return lines
  }
  if (caseName.startsWith('grouped-dense-mixed-cross-sentence')) {
    lines.push('入力特性: `*` / `**` / `***` を混在させ、文境界をまたぐ崩れ入力を1段落に集約した高密度ケースです。')
    lines.push('確認観点: 回復力（タグ化）と安全性（未解決 `*` 残し）のバランス。')
    return lines
  }
  if (caseName.startsWith('grouped-multi-space-vs-nospace')) {
    lines.push('入力特性: `***` / `****` で「直後にスペースあり」と「スペースなし」を同居させた比較ケースです。')
    lines.push('確認観点: 複数 `*` での境界規則が、スペース有無で一貫して説明可能か。')
    return lines
  }

  const hasSpaceAfterSingle = markdown.includes('* Japanese food culture')
  const hasNoSpaceAfterSingle = markdown.includes('*Japanese food culture')
  const hasSpaceAfterMulti = /\*{3,6} Japanese food culture/.test(markdown)
  const hasNoSpaceAfterMulti = /\*{3,6}Japanese food culture/.test(markdown)
  if ((hasSpaceAfterSingle && hasNoSpaceAfterSingle) || (hasSpaceAfterMulti && hasNoSpaceAfterMulti)) {
    lines.push('入力特性: `* Japanese ...`（半角スペースあり）と `*Japanese ...`（半角スペースなし）の両方を同一段落に含む比較ケースです。')
  } else if (hasSpaceAfterMulti) {
    lines.push('入力特性: `*** Japanese ...` / `**** Japanese ...` のように、複数 `*` の直後に半角スペースがあるケースです。')
  } else if (hasNoSpaceAfterMulti) {
    lines.push('入力特性: `***Japanese ...` / `****Japanese ...` のように、複数 `*` の直後に半角スペースがないケースです。')
  } else if (hasSpaceAfterSingle) {
    lines.push('入力特性: `* Japanese ...`（`*` の直後に半角スペースあり）のケースです。')
  } else if (hasNoSpaceAfterSingle) {
    lines.push('入力特性: `*Japanese ...`（`*` の直後に半角スペースなし）のケースです。')
  } else {
    lines.push('入力特性: 日英混在段落で、前段の崩れた `*` が後続文の強調解釈に与える影響を見るケースです。')
  }
  return lines
}
const summarizeMode = (label, output, markdownItOutput) => {
  const sameAsMarkdownIt = normalize(output) === normalize(markdownItOutput)
  const stars = countLiteralAsterisks(output)
  const emCount = countTag(output, 'em')
  const strongCount = countTag(output, 'strong')
  return {
    label,
    sameAsMarkdownIt,
    stars,
    emCount,
    strongCount,
    emphasisTotal: emCount + strongCount
  }
}
const buildAssessment = (caseName, markdown, stats) => {
  const modeSummary = [
    `base(${stats.base.sameAsMarkdownIt ? 'SAME' : 'DIFF'}, em:${stats.base.emCount}, strong:${stats.base.strongCount}, literal*:${stats.base.stars})`,
    `plus(${stats.plus.sameAsMarkdownIt ? 'SAME' : 'DIFF'}, em:${stats.plus.emCount}, strong:${stats.plus.strongCount}, literal*:${stats.plus.stars})`,
    `aggressive(${stats.aggressive.sameAsMarkdownIt ? 'SAME' : 'DIFF'}, em:${stats.aggressive.emCount}, strong:${stats.aggressive.strongCount}, literal*:${stats.aggressive.stars})`,
    `compatible(${stats.compatible.sameAsMarkdownIt ? 'SAME' : 'DIFF'}, em:${stats.compatible.emCount}, strong:${stats.compatible.strongCount}, literal*:${stats.compatible.stars})`
  ].join(' / ')
  const lines = []
  const hasSpaceAfterMulti = /\*{3,6} /.test(markdown)
  const hasNoSpaceAfterMulti = /\*{3,6}[^\s*]/.test(markdown)
  lines.push(...describeInputTraits(caseName, markdown))
  lines.push(`モード別の結果: ${modeSummary}`)

  if (stats.base.emphasisTotal > stats.compatible.emphasisTotal) {
    lines.push('回復量: base は compatible より強調タグを多く回復しています。読みやすさを優先するなら有利です。')
  } else if (stats.base.emphasisTotal < stats.compatible.emphasisTotal) {
    lines.push('回復量: base は compatible より強調タグの回復を抑えています。原文記号の保守を優先するケースです。')
  } else {
    lines.push('回復量: base と compatible は同程度の強調タグ数です。主な差は開閉位置です。')
  }

  if (hasSpaceAfterMulti || hasNoSpaceAfterMulti) {
    if (stats.plus.sameAsMarkdownIt) {
      lines.push('multi-* 判定: plus は複数 `*` の境界判定で markdown-it と同じ解釈です（予測しやすさ優先）。')
    } else {
      lines.push('multi-* 判定: plus は複数 `*` でも文脈補正を行うため、markdown-it との差分が出ています。')
    }
  } else if (stats.plus.stars < stats.base.stars) {
    lines.push('single-* 判定: plus は base より literal `*` を減らし、単独 `*` の回復を強めています。')
  } else if (stats.plus.stars > stats.base.stars) {
    lines.push('single-* 判定: plus は base より安全側（literal維持）に寄る結果です。')
  } else {
    lines.push('single-* 判定: plus と base は literal `*` の残り方が同程度です。')
  }

  if (stats.aggressive.emphasisTotal > stats.base.emphasisTotal) {
    lines.push('aggressive 傾向: aggressive は base より先頭側の回復を強めるため、タグ化は増えますが文境界をまたぐリスクも上がります。')
  } else if (stats.aggressive.emphasisTotal < stats.base.emphasisTotal) {
    lines.push('aggressive 傾向: aggressive でもこのケースでは base よりタグ化が増えていません。')
  } else {
    lines.push('aggressive 傾向: aggressive と base のタグ回復量はほぼ同じです。')
  }

  return lines
}
const createModeTotals = () => ({
  base: { same: 0, diff: 0, em: 0, strong: 0, stars: 0, emphasisTotal: 0 },
  plus: { same: 0, diff: 0, em: 0, strong: 0, stars: 0, emphasisTotal: 0 },
  aggressive: { same: 0, diff: 0, em: 0, strong: 0, stars: 0, emphasisTotal: 0 },
  compatible: { same: 0, diff: 0, em: 0, strong: 0, stars: 0, emphasisTotal: 0 }
})
const addModeSummary = (total, summary) => {
  if (!total || !summary) return
  if (summary.sameAsMarkdownIt) total.same++
  else total.diff++
  total.em += summary.emCount
  total.strong += summary.strongCount
  total.stars += summary.stars
  total.emphasisTotal += summary.emphasisTotal
}
const buildOverallEvaluation = (totals, caseCount) => {
  const rate = (n) => `${Math.round((n / caseCount) * 100)}%`
  const rows = [
    ['japanese-boundary', totals.base],
    ['japanese-boundary-guard', totals.plus],
    ['aggressive', totals.aggressive],
    ['compatible / markdown-it', totals.compatible]
  ]
  const rowHtml = rows.map(([label, t]) => {
    return `<tr><th>${escapeHtml(label)}</th><td>${t.same}/${caseCount} (${rate(t.same)})</td><td>${t.em}</td><td>${t.strong}</td><td>${t.stars}</td></tr>`
  }).join('')
  const notes = [
    `互換性（markdown-it一致率）は compatible が最上位、次点は base/plus です。`,
    `回復力（em+strongタグ総数）は aggressive が最も高くなりやすく、plus が続きます。`,
    `安全側（未解決 * の保持）は compatible と base が多く、plus/aggressive は少なくなる傾向です。`,
    `実運用の推奨は、互換重視なら compatible、日英混在の直感補正なら plus、積極回復重視なら aggressive です。`
  ]
  return `
  <section class="case">
    <h2>Overall Mode Evaluation (${caseCount} cases)</h2>
    <table class="summary-table">
      <thead><tr><th>Mode</th><th>markdown-it一致</th><th>em総数</th><th>strong総数</th><th>未解決*</th></tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <ul class="assessment-list">${notes.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
  </section>`
}
const colorizeMarkdownSource = (value, mdForSource) => {
  const inline = mdForSource.parseInline(value, {})[0]
  const children = inline && inline.children ? inline.children : []
  const active = []
  let pos = 0
  let out = ''

  const pushPlain = (chunk) => {
    if (!chunk) return
    out += colorizeUnresolvedStars(chunk)
  }
  const pushActiveText = (chunk) => {
    if (!chunk) return
    const cls = getActiveSourceClasses(active)
    if (!cls) {
      out += colorizeUnresolvedStars(chunk)
      return
    }
    const escaped = escapeHtml(chunk)
    out += `<span class="${cls}">${escaped}</span>`
  }
  const pushMarker = (marker, cls) => {
    out += `<span class="src-star ${cls}">${escapeHtml(marker)}</span>`
  }
  const removeLast = (cls) => {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i] === cls) {
        active.splice(i, 1)
        break
      }
    }
  }
  const consumeMarker = (marker, cls, isOpen) => {
    const idx = value.indexOf(marker, pos)
    if (idx === -1) return false
    pushPlain(value.slice(pos, idx))
    pushMarker(marker, cls)
    pos = idx + marker.length
    if (isOpen) {
      active.push(cls)
    } else {
      removeLast(cls)
    }
    return true
  }
  const consumeContent = (content) => {
    if (!content) return
    const idx = value.indexOf(content, pos)
    if (idx === -1) {
      pushActiveText(content)
      return
    }
    pushPlain(value.slice(pos, idx))
    pushActiveText(content)
    pos = idx + content.length
  }

  for (const token of children) {
    if (!token) continue
    if (token.type === 'strong_open') {
      if (!consumeMarker('**', 'star2', true)) pushMarker('**', 'star2')
      continue
    }
    if (token.type === 'strong_close') {
      if (!consumeMarker('**', 'star2', false)) pushMarker('**', 'star2')
      continue
    }
    if (token.type === 'em_open') {
      if (!consumeMarker('*', 'star1', true)) pushMarker('*', 'star1')
      continue
    }
    if (token.type === 'em_close') {
      if (!consumeMarker('*', 'star1', false)) pushMarker('*', 'star1')
      continue
    }
    if (token.type === 'softbreak') {
      consumeContent('\n')
      continue
    }
    if (token.type === 'hardbreak') {
      const idx = value.indexOf('  \n', pos)
      if (idx !== -1) {
        pushPlain(value.slice(pos, idx))
        pushActiveText('  \n')
        pos = idx + 3
      }
      continue
    }
    if (typeof token.content === 'string' && token.content.length > 0) {
      consumeContent(token.content)
    }
  }
  pushPlain(value.slice(pos))
  return out
}
const colorizeHtmlSource = (value) => {
  let escaped = escapeHtml(toInline(value))
  escaped = escaped.replace(/&lt;\/?em&gt;/g, (tag) => `<span class="src-em">${tag}</span>`)
  escaped = escaped.replace(/&lt;\/?strong&gt;/g, (tag) => `<span class="src-strong">${tag}</span>`)
  return escaped
}
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const inputArg = process.argv[2] || 'mixed-ja-en-stars-mode.txt'
const outArg = process.argv[3] || 'mixed-ja-en-stars-mode.html'
const inputPath = path.resolve(__dirname, inputArg.replace(/^\.\//, ''))
const outputPath = path.resolve(__dirname, outArg.replace(/^\.\//, ''))

const content = fs.readFileSync(inputPath, 'utf8')
const cases = readCases(content)

const mdBase = new MarkdownIt()
const mdBaseMode = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
const mdPlusMode = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
const mdCompatible = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })

let body = ''
const totals = createModeTotals()
for (let i = 0; i < cases.length; i++) {
  const c = cases[i]
  const outputs = {
    base: mdBaseMode.render(c.markdown),
    plus: mdPlusMode.render(c.markdown),
    aggressive: mdAggressive.render(c.markdown),
    compatible: mdCompatible.render(c.markdown),
    markdownIt: mdBase.render(c.markdown)
  }
  const stats = {
    base: summarizeMode('japanese-boundary', outputs.base, outputs.markdownIt),
    plus: summarizeMode('japanese-boundary-guard', outputs.plus, outputs.markdownIt),
    aggressive: summarizeMode('aggressive', outputs.aggressive, outputs.markdownIt),
    compatible: summarizeMode('compatible/markdown-it', outputs.compatible, outputs.markdownIt)
  }
  addModeSummary(totals.base, stats.base)
  addModeSummary(totals.plus, stats.plus)
  addModeSummary(totals.aggressive, stats.aggressive)
  addModeSummary(totals.compatible, stats.compatible)
  const renderedForView = {
    base: highlightUnresolvedAsterisksInHtml(outputs.base),
    plus: highlightUnresolvedAsterisksInHtml(outputs.plus),
    aggressive: highlightUnresolvedAsterisksInHtml(outputs.aggressive),
    compatible: highlightUnresolvedAsterisksInHtml(outputs.compatible)
  }

  const flags = [
    ['base vs markdown-it', !stats.base.sameAsMarkdownIt],
    ['plus vs markdown-it', !stats.plus.sameAsMarkdownIt],
    ['aggressive vs markdown-it', !stats.aggressive.sameAsMarkdownIt],
    ['compatible / markdown-it', !stats.compatible.sameAsMarkdownIt]
  ]
  const assessmentLines = buildAssessment(c.name, c.markdown, stats)
  const badges = flags.map(([label, diff]) => {
    const cls = diff ? 'diff' : 'same'
    const text = diff ? 'DIFF' : 'SAME'
    return `<span class="badge ${cls}">${escapeHtml(label)}: ${text}</span>`
  }).join('')

  body += `
  <section class="case">
    <h2>${i + 1}. ${escapeHtml(c.name)}</h2>
    <ul class="assessment-list">${assessmentLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    <div class="badges">${badges}</div>
    <details open>
      <summary>Markdown Source（着色は markdown-it の解釈基準に寄せた目安表示）</summary>
      <pre class="source markdown-source">${colorizeMarkdownSource(c.markdown, mdBase)}</pre>
    </details>
    <div class="grid">
      <article>
        <h3>japanese-boundary</h3>
        <div class="rendered">${renderedForView.base}</div>
        <details class="html-source-toggle">
          <summary>HTML Source</summary>
          <pre class="source html-source">${colorizeHtmlSource(outputs.base)}</pre>
        </details>
      </article>
      <article>
        <h3>japanese-boundary-guard</h3>
        <div class="rendered">${renderedForView.plus}</div>
        <details class="html-source-toggle">
          <summary>HTML Source</summary>
          <pre class="source html-source">${colorizeHtmlSource(outputs.plus)}</pre>
        </details>
      </article>
      <article>
        <h3>aggressive</h3>
        <div class="rendered">${renderedForView.aggressive}</div>
        <details class="html-source-toggle">
          <summary>HTML Source</summary>
          <pre class="source html-source">${colorizeHtmlSource(outputs.aggressive)}</pre>
        </details>
      </article>
      <article>
        <h3>compatible / markdown-it</h3>
        <div class="rendered">${renderedForView.compatible}</div>
        <details class="html-source-toggle">
          <summary>HTML Source</summary>
          <pre class="source html-source">${colorizeHtmlSource(outputs.compatible)}</pre>
        </details>
      </article>
    </div>
  </section>`
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mixed JA/EN Star Cases</title>
  <style>
    :root { --bg: #f7f8fa; --card:#fff; --text:#1f2937; --muted:#6b7280; --line:#d1d5db; --same:#065f46; --diff:#92400e; --em:#ea580c; --strong:#b91c1c; --mix:#7e22ce; --source-bg:#f1f3f5; --source-text:#111827; --unresolved-fg:#15803d; --unresolved-bg:#d6ffc8; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: var(--bg); color: var(--text); font-family: Segoe UI, Helvetica, Arial, sans-serif; font-size: 17px; line-height: 1.85; }
    h1 { margin: 0 0 8px 0; font-size: 24px; }
    p.lead { margin: 0 0 24px 0; color: var(--muted); }
    .case { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 0 0 16px 0; }
    .case h2 { margin: 0 0 10px 0; font-size: 18px; }
    .assessment-list { margin: 0 0 10px 18px; padding: 0; color: #374151; font-size: 14px; line-height: 1.7; }
    .assessment-list li { margin: 0 0 4px 0; }
    .summary-table { width: 100%; border-collapse: collapse; margin: 0 0 10px 0; font-size: 14px; }
    .summary-table th, .summary-table td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; }
    .summary-table thead th { background: #eef2ff; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .badge { font-size: 12px; padding: 3px 8px; border-radius: 999px; background: #eef2ff; }
    .badge.same { background: #ecfdf5; color: var(--same); border: 1px solid #a7f3d0; }
    .badge.diff { background: #fffbeb; color: var(--diff); border: 1px solid #fde68a; }
    details { margin-bottom: 12px; }
    summary { cursor: pointer; color: #374151; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(320px, 1fr)); gap: 12px; overflow-x: auto; }
    article { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #fff; min-width: 320px; }
    article h3 { margin: 0 0 8px 0; font-size: 14px; }
    .controls { margin: 0 0 16px 0; }
    .controls button { border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 14px; }
    .controls button:hover { background: #f8fafc; }
    .rendered { border: 1px dashed #c7d2fe; border-radius: 6px; padding: 10px; background: #f8fafc; margin-bottom: 8px; line-height: 1.9; font-size: 17px; }
    .rendered em { color: var(--em); font-style: italic; font-weight: 400; }
    .rendered strong { color: var(--strong); font-style: normal; font-weight: 400; }
    .rendered em em { font-weight: 700; }
    .rendered strong strong { font-weight: 700; }
    .rendered em strong { color: var(--strong); font-style: italic; font-weight: 400; }
    .rendered strong em { color: #ec4899; font-style: italic; font-weight: 400; }
    .rendered em em strong, .rendered strong em em { font-weight: 700; }
    .rendered .unresolved-star { color: var(--unresolved-fg); background: var(--unresolved-bg); font-weight: 700; font-size: 1.2em; border-radius: 3px; padding: 0 1px; }
    pre.source { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--source-bg); color: var(--source-text); border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; font-size: 14px; line-height: 1.75; }
    .markdown-source .src-star.star1 { color: var(--em); font-weight: 400; }
    .markdown-source .src-star.star2 { color: var(--strong); font-weight: 400; }
    .markdown-source .src-star.star3 { color: var(--mix); font-weight: 400; }
    .markdown-source .src-span.tone-em { color: var(--em); font-style: italic; font-weight: 400; }
    .markdown-source .src-span.tone-strong { color: var(--strong); font-style: normal; font-weight: 400; }
    .markdown-source .src-span.tone-mix { color: var(--strong); font-style: italic; font-weight: 400; }
    .markdown-source .src-span.tone-em.tone-em-double { font-weight: 700; }
    .markdown-source .src-span.tone-strong.tone-strong-double { font-weight: 700; }
    .markdown-source .src-span.tone-mix.tone-em-double,
    .markdown-source .src-span.tone-mix.tone-strong-double { font-weight: 700; }
    .markdown-source .src-unresolved { color: #16a34a; font-weight: 700; }
    .html-source .src-em { color: var(--em); font-weight: 700; }
    .html-source .src-strong { color: var(--strong); font-weight: 700; }
  </style>
</head>
<body>
  <h1>Mixed JA/EN Star Cases</h1>
  <p class="lead">日英混在の同一段落で、前の文に未閉じ・崩れた <code>*</code> を入れたときに、後続文の強調（<code>*</code>, <code>**</code>, <code>***</code>）がどう解釈されるかを比較します。各ケースで <code>japanese-boundary</code> / <code>japanese-boundary-guard</code> / <code>aggressive</code> / <code>compatible（= markdown-it）</code> の差分を確認できます。</p>
  <p class="lead">ケース名が <code>base-</code> で始まるものは、<code>japanese-boundary</code> の境界判定（全角スペース、鍵括弧、句読点）を重点的に確認するためのケースです。鍵括弧は <code>「」</code>、<code>『』</code>、<code>()</code>、<code>〈〉</code>、<code>【】</code>、および引用符 <code>“”</code> / <code>〝〟</code> も含めて確認します。</p>
  <p class="lead">Generated from ${escapeHtml(path.basename(inputPath))}. Each case uses the same bilingual paragraph base and changes only marker placement.</p>
  <div class="controls">
    <button type="button" id="toggle-all-html-source">Open All HTML Source</button>
  </div>
  ${buildOverallEvaluation(totals, cases.length)}
  ${body}
  <script>
    (() => {
      const button = document.getElementById('toggle-all-html-source')
      if (!button) return

      const getTargets = () => Array.from(document.querySelectorAll('details.html-source-toggle'))
      const syncLabel = () => {
        const targets = getTargets()
        const allOpen = targets.length > 0 && targets.every((el) => el.open)
        button.textContent = allOpen ? 'Close All HTML Source' : 'Open All HTML Source'
      }

      button.addEventListener('click', () => {
        const targets = getTargets()
        const allOpen = targets.length > 0 && targets.every((el) => el.open)
        const next = !allOpen
        for (let i = 0; i < targets.length; i++) {
          targets[i].open = next
        }
        syncLabel()
      })

      document.addEventListener('toggle', (event) => {
        const target = event.target
        if (target && target.matches && target.matches('details.html-source-toggle')) {
          syncLabel()
        }
      }, true)

      syncLabel()
    })()
  </script>
</body>
</html>`

fs.writeFileSync(outputPath, html, 'utf8')
console.log(`wrote ${outputPath}`)
