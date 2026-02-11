# p7d-markdown-it-strong-ja

`@peaceroad/markdown-it-strong-ja` is a `markdown-it` plugin that extends `*` / `**` emphasis handling for Japanese text, while keeping normal Markdown behavior as close to `markdown-it` as possible.

## Install

```bash
npm i @peaceroad/markdown-it-strong-ja
```

## Quick Start

```js
import MarkdownIt from 'markdown-it'
import strongJa from '@peaceroad/markdown-it-strong-ja'

const md = MarkdownIt().use(strongJa)

md.render('和食では**「だし」**が料理の土台です。')
// <p>和食では<strong>「だし」</strong>が料理の土台です。</p>
```

## Scope and Modes

This plugin targets emphasis markers (`*`, `**`). It does not replace all inline parsing behavior of `markdown-it`. The goal is to help only where emphasis tends to break in Japanese text. When input is heavily malformed, the plugin prefers safe output and leaves markers as literal text instead of forcing unstable HTML.

Mode selection controls how aggressively the plugin helps:

- `japanese` (default): starts from `markdown-it` decisions, then applies Japanese-focused local help only where needed. For pure-English malformed tails, it stays close to `markdown-it`.
- `aggressive`: more willing to treat early `**` as opening markers.
- `compatible`: prioritizes `markdown-it` output and skips postprocess repairs.

## How `japanese` Decides (Step by Step)

This section follows the implementation flow for `mode: 'japanese'`.

Terms used below:

- Opening marker: `*` or `**` that starts emphasis.
- Closing marker: `*` or `**` that ends emphasis.
- Run: a contiguous group of the same marker (`*`, `**`, `***`, ...).
- Line: text split by `\n`.

### Step 0: Decide whether Japanese helper logic is used

`japanese` does not rewrite every `*`. It first inspects characters adjacent to a candidate marker and enters the helper path only when local Japanese context exists. The context check is Japanese-focused and mainly looks at Hiragana, Katakana, Kanji (Han), and fullwidth punctuation/symbol ranges commonly used in Japanese text.

Example that stops here:

- Input: `海外向けメモでは**sushi.**umami**という表記があります。`
- Output (`japanese`): `<p>海外向けメモでは**sushi.<strong>umami</strong>という表記があります。</p>`
- Why: local context is English-side, so the helper path is not applied.

Example that proceeds:

- Input: `説明文では**味噌汁。**umami**という書き方があります。`
- Why: `。` and adjacent Japanese context are present.

### Step 1: Keep valid `markdown-it` decisions

`japanese` is baseline-first. If `markdown-it` already produced a stable and valid decision, that decision is kept. The plugin adds candidates only where malformed input is likely to misdirect pairing.

Example that stops here:

- Input: `*寿司*は人気です。`
- Output: `<p><em>寿司</em>は人気です。</p>`

Example that proceeds:

- Input: `*味噌汁。*umai* という表記です。`
- Why: leaving the first `*` literal can make the later `*` pair first (`*味噌汁。<em>umai</em> という表記です。`). `japanese` checks whether local correction should prefer the Japanese-side pair.

### Step 2: Use same-line local context only

Local direction checks use non-whitespace characters on the same line only. They do not look across `\n`. A paragraph may contain multiple lines, but local helper decisions are line-based.

Example that stops here:

- Input: `説明は次の2行です。\n*味噌汁。\n*umai*`
- Output (`japanese`): `<p>説明は次の2行です。\n*味噌汁。\n<em>umai</em></p>`
- Why: the first `*` does not see the next line in local context.

Example that proceeds:

- Input: `*味噌汁。*umai* という表記です。`
- Why: Japanese and English context are on the same line.

### Step 3: Apply extra direction correction only to single `*`

Extra direction correction is applied only to run length `1` (`*`). This is where malformed input most often flips opener/closer direction unintentionally. In `japanese` and `aggressive`, this can change which side pairs first. In `compatible`, base `markdown-it` behavior remains.

Example that stops here:

- Input: `*味噌汁。*umai* という表記です。`
- `japanese` / `aggressive`: `<p><em>味噌汁。</em>umai* という表記です。</p>`
- `compatible` / `markdown-it`: `<p>*味噌汁。<em>umai</em> という表記です。</p>`

Example that proceeds:

- Input: `比較用メモでは**味噌汁。**umami**という書き方を使います。`
- Why: this is not a single-star run.

### Step 4: Do not apply Step 3 single-star correction to `**` and above

`**`, `***`, `****` still use normal `markdown-it` logic and japanese relaxations. What is intentionally excluded is the single-star-only direction correction from Step 3. Extending the same correction to multi-star runs pushes `japanese` too far toward `compatible` behavior and breaks expected Japanese-side recovery.

Example:

- Input: `**味噌汁。**umami**という表現を使います。`
- `japanese`: `<p><strong>味噌汁。</strong>umami**という表現を使います。</p>`
- `compatible`: `<p>**味噌汁。<strong>umami</strong>という表現を使います。</p>`

### Step 5: Build pairs normally; keep literals when forced pairing is unsafe

After marker direction candidates are fixed, inline pairing builds final tokens. If forcing tags would produce unstable structure, markers are left as literal text.

Example:

- Input: `**[**[x](v)](u)** という壊れた入力です。`
- Output: `<p><strong>[</strong><a href="v">x</a>](u)** という壊れた入力です。</p>`

### Step 6: Postprocess link/reference-adjacent breakage

Steps 0-5 are marker-direction and inline-pairing. Step 6 is a separate phase that repairs link/reference-adjacent breakage in the already-built inline token stream.

#### Step 6-1: Collapsed reference matching follows `markdown-it` normalization

Collapsed reference matching (`[label][]`) follows `markdown-it` key normalization. The plugin does not force matching by deleting emphasis markers from labels.

Mismatch example:

```markdown
献立は「[**寿司**][]」です。

[寿司]: https://example.com/
```

```html
<p>献立は「[<strong>寿司</strong>][]」です。</p>
```

Match example:

```markdown
献立は「[**寿司**][]」です。

[**寿司**]: https://example.com/
```

```html
<p>献立は「<a href="https://example.com/"><strong>寿司</strong></a>」です。</p>
```

#### Step 6-2: Postprocess by mode

`japanese` and `aggressive` run postprocess repairs for broken emphasis around links and collapsed references. `compatible` intentionally skips these repairs to stay aligned with plain `markdown-it` output.

#### Step 6-3: Why postprocess can skip or normalize

Postprocess is conservative by design. It prioritizes stable output over aggressive conversion. If a segment has no useful repair target, cannot be bounded safely, or fails reparse, the plugin keeps the existing token result rather than applying risky rewrites.

During successful rewrites, markdown-equivalent normalization can occur. For example, link title escaping or line-break representation can be normalized. Tokens with `meta`, or links with attrs beyond `href` / `title`, are preserved via island placeholders and restored after reparse, instead of being destructively rebuilt. If placeholder collision is detected, strong-ja retries marker generation up to 16 times before abandoning that rewrite path.

In short, for ambiguous malformed input, strong-ja prioritizes safe and readable output over maximum conversion.

## Behavior Examples

These examples are synchronized with `test/readme-mode.txt`.

### Punctuation with Japanese text

This is the typical Japanese punctuation case where `japanese` / `aggressive` recover emphasis.

- Input: `**「だし」**は和食の基本です。`
- `japanese` / `aggressive`: `<p><strong>「だし」</strong>は和食の基本です。</p>`
- `compatible` / `markdown-it`: `<p>**「だし」**は和食の基本です。</p>`

### Mixed Japanese and English

This case shows the mode difference when Japanese-side closing is preferred.

- Input: `**天ぷら。**crunch**という表現を使います。`
- `japanese` / `aggressive`: `<p><strong>天ぷら。</strong>crunch**という表現を使います。</p>`
- `compatible` / `markdown-it`: `<p>**天ぷら。<strong>crunch</strong>という表現を使います。</p>`

### Single-star edge case in plain text

This is the main single-star direction-correction case.

- Input: `*うどん。*chewy* という表記です。`
- `japanese` / `aggressive`: `<p><em>うどん。</em>chewy* という表記です。</p>`
- `compatible` / `markdown-it`: `<p>*うどん。<em>chewy</em> という表記です。</p>`

- Input: `日本語 *broth。*taste* という比較です。`
- `japanese` / `aggressive`: `<p>日本語 <em>broth。</em>taste* という比較です。</p>`
- `compatible` / `markdown-it`: `<p>日本語 *broth。<em>taste</em> という比較です。</p>`

### Single-star edge case inside link label

The same single-star local correction applies inside inline link labels.

- Input: `記録では[*天丼。*crispy*]()という表記を確認します。`
- `japanese` / `aggressive`: `<p>記録では<a href=""><em>天丼。</em>crispy*</a>という表記を確認します。</p>`
- `compatible` / `markdown-it`: `<p>記録では<a href="">*天丼。<em>crispy</em></a>という表記を確認します。</p>`

### Malformed link marker sequence

For malformed marker/link mixtures, safe output is preferred over forced tag completion.

- Input: `**[**[x](v)](u)** という壊れた入力です。`
- All modes: `<p><strong>[</strong><a href="v">x</a>](u)** という壊れた入力です。</p>`

### Pure-English malformed tail

For pure-English malformed tails, `japanese` stays close to `markdown-it`.

- Input: `For diagnostics, we keep broken **tail [aa**aa***Text***and*More*bb**bb](https://x.test) after this note.`
- `japanese` / `compatible` / `markdown-it`:  
  `<p>For diagnostics, we keep broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>and</em>More</em>bb**bb</a> after this note.</p>`
- `aggressive`:  
  `<p>For diagnostics, we keep broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><strong>and<em>More</em>bb</strong>bb</a> after this note.</p>`

### Link and code near emphasis

These cases show mode differences around links and inline code.

- Input: `説明文ではこれは**[ラーメン](url)**です。`
- `japanese` / `aggressive`: `<p>説明文ではこれは<strong><a href="url">ラーメン</a></strong>です。</p>`
- `compatible` / `markdown-it`: `<p>説明文ではこれは**<a href="url">ラーメン</a>**です。</p>`

- Input: `注記では**aa\`stock\`**aaという記法を試します。`
- `japanese` / `compatible` / `markdown-it`: `<p>注記では**aa<code>stock</code>**aaという記法を試します。</p>`
- `aggressive`: `<p>注記では<strong>aa<code>stock</code></strong>aaという記法を試します。</p>`

## Options

### `mode`

- Type: `'japanese' | 'japanese-only' | 'aggressive' | 'compatible'`
- Default: `'japanese'`

### `mditAttrs`

- Type: `boolean`
- Default: `true`
- Set `false` if your stack does not use `markdown-it-attrs`.

### `postprocess`

- Type: `boolean`
- Default: `true`
- Set `false` to disable link/reference postprocess repairs.
- In `mode: 'compatible'`, repairs are skipped even when this is `true`.

### `coreRulesBeforePostprocess`

- Type: `string[]`
- Default: `[]`
- Names of core rules that must run before `strong_ja_token_postprocess`.

### `patchCorePush`

- Type: `boolean`
- Default: `true`
- Helper hook to keep rule order stable when `mditAttrs: false` and `cjk_breaks` is registered later.

### About `markdown-it` `breaks`

`breaks` is controlled by `markdown-it` itself. This plugin does not override `md.options.breaks`. However, with `cjk_breaks`, compatibility handling may adjust softbreak-related tokens, so rendered line-break behavior can still differ in some cases.

## Per-render Override

Use `state.env.__strongJaTokenOpt` to override options per render. It merges with plugin options. Setup-time behavior (rule registration/order) is fixed at plugin initialization and cannot be fully switched at render time.

## Runtime and Integration Notes

- ESM plugin (`type: module`)
- Works in Node.js, browser bundlers, and VS Code extension pipelines that use `markdown-it` ESM
- `scanDelims` patch is applied once per `MarkdownIt` prototype in the same process
