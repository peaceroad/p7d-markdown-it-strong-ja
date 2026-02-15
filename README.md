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

This plugin targets asterisk emphasis markers (`*`, `**`). It does not replace all inline parsing behavior of `markdown-it`. The goal is to help only where emphasis tends to break in Japanese text. When input is heavily malformed, the plugin prefers safe output and leaves markers as literal text instead of forcing unstable HTML.

Underscore emphasis (`_`, `__`) is intentionally left to plain `markdown-it`. strong-ja does not add custom delimiter-direction logic for `_` runs, and underscore-heavy malformed spans are handled fail-safe (kept conservative rather than force-rewritten).

Mode selection controls how aggressively the plugin helps:

- `japanese` (default): alias of `japanese-boundary-guard`. This is the recommended mode for mixed Japanese/English prose.
- `japanese-boundary`: keeps markdown-it as baseline and enables Japanese-context local relaxation around `*` runs. It does not apply the mixed JA/EN single-`*` guard. Link/ref postprocess repairs are enabled. Target behavior is JP-friendly conservative recovery.
- `japanese-boundary-guard`: includes everything from `japanese-boundary`, plus an extra mixed JA/EN guard for space-adjacent ASCII segments (for patterns like `* English*`, `** "English"**`, `*** [English](u)***`). This guard is applied consistently for `*` run lengths (`*` and longer runs). Link/ref postprocess repairs are enabled. Target behavior is JP-friendly mixed-text safety.
- `aggressive`: is more permissive than baseline-first and is the most eager mode for early opener recovery. Japanese local relaxation and link/ref postprocess repairs are enabled. Target behavior is maximum recovery.
- `compatible`: keeps plain markdown-it delimiter decisions as-is. It does not run Japanese local relaxation and skips link/ref postprocess repairs. Output stays aligned with plain `markdown-it` under the same plugin stack.

### What `japanese-boundary` and `japanese-boundary-guard` Share

The following behavior is shared by both modes (`japanese` is an alias of `japanese-boundary-guard`):

- baseline-first decisions on top of `markdown-it`
- Japanese-context local relaxation (same-line neighborhood only)
- single-`*` direction correction for malformed opener/closer flips
- token-only postprocess repairs around links/references (except `compatible`)
- fail-safe behavior: low-confidence spans are preserved

Representative shared outputs:

- Input: `*味噌汁。*umai*`
- `japanese-boundary` / `japanese-boundary-guard`: `<p><em>味噌汁。</em>umai*</p>`

- Input: `説明文ではこれは**[寿司](url)**です。`
- `japanese-boundary` / `japanese-boundary-guard`: `<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>`

### What Only `japanese-boundary-guard` Adds

`japanese-boundary-guard` adds an extra mixed JA/EN suppression guard:

- target: space-adjacent + ASCII-start segments (plain / quoted / link / code wrappers)
- goal: reduce unnatural conversions such as `* English*` or `* \`English\`*`
- applied consistently across run lengths (`*`, `**`, `***`, ...)

Representative differences:

- Input: `日本語です。* English* です。`
- `japanese-boundary`: `<p>日本語です。<em> English</em> です。</p>`
- `japanese-boundary-guard`: `<p>日本語です。* English* です。</p>`

- Input: `和食では* \`umami\`*を使う。`
- `japanese-boundary`: `<p>和食では<em> <code>umami</code></em>を使う。</p>`
- `japanese-boundary-guard`: `<p>和食では* <code>umami</code>*を使う。</p>`

### Mode Selection Guide (Practical)

- default for user-facing prose: `japanese` (`japanese-boundary-guard`)
- strict markdown-it parity: `compatible`
- maximum recovery over predictability: `aggressive`
- niche use without guard suppression: `japanese-boundary`

### Example Corpus Notes

Detailed cases and visual outputs:

- `example/README.md`
- `example/mixed-ja-en-stars-mode.html`
- `example/mixed-ja-en-stars-mode.txt`
- `example/inline-wrapper-matrix.html`

## How `japanese` (`japanese-boundary-guard`) Decides (Step by Step)

This section follows the implementation flow for `mode: 'japanese'` (which resolves to `japanese-boundary-guard`).

Terms used below:

- Opening marker: `*` or `**` that starts emphasis.
- Closing marker: `*` or `**` that ends emphasis.
- Run: a contiguous group of the same marker (`*`, `**`, `***`, ...).
- Line: text split by `\n`.

Note:

- Steps 0-5 describe marker-direction and pairing flow for `*` / `**`.
- Final behavior for `inline link`, `inline code`, and symbol wrappers (such as `{}()`) is handled in Step 6 (postprocess).
- See the Step 6-1 notes and `example/inline-wrapper-matrix.html` for concrete mode-by-mode examples.
- Step 2.5 is `japanese-boundary-guard`-only. `japanese-boundary` skips Step 2.5 and shares the rest.

### Step 0: Decide whether Japanese helper logic is used

`japanese` (`japanese-boundary-guard`) does not rewrite every `*`. It first inspects characters adjacent to a candidate marker and enters the helper path only when local Japanese context exists. The context check is Japanese-focused and mainly looks at Hiragana, Katakana, Kanji (Han), and fullwidth punctuation/symbol ranges commonly used in Japanese text.

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

### Step 2.5 (`japanese-boundary-guard` only): Suppress mixed JA/EN over-conversion

This extra step exists only in `japanese-boundary-guard`. It suppresses conversions for space-adjacent + ASCII-start segments to reduce unnatural emphasis around English fragments.

Representative differences:

- Input: `日本語です。* English* です。`
- `japanese-boundary`: `<p>日本語です。<em> English</em> です。</p>`
- `japanese-boundary-guard`: `<p>日本語です。* English* です。</p>`

- Input: `和食では* \`umami\`*を使う。`
- `japanese-boundary`: `<p>和食では<em> <code>umami</code></em>を使う。</p>`
- `japanese-boundary-guard`: `<p>和食では* <code>umami</code>*を使う。</p>`

### Step 3: Apply extra direction correction only to single `*`

Extra direction correction is applied only to run length `1` (`*`). This is where malformed input most often flips opener/closer direction unintentionally. In `japanese-boundary` / `japanese-boundary-guard` (`japanese`) and `aggressive`, this can change which side pairs first. In `compatible`, base `markdown-it` behavior remains.

Example that stops here:

- Input: `*味噌汁。*umai* という表記です。`
- `japanese` / `aggressive`: `<p><em>味噌汁。</em>umai* という表記です。</p>`
- `compatible` / `markdown-it`: `<p>*味噌汁。<em>umai</em> という表記です。</p>`

Example that proceeds:

- Input: `比較用メモでは**味噌汁。**umami**という書き方を使います。`
- Why: this is not a single-star run.

Additional boundary rule in this step:

- When scanning backward to detect a previous single-`*` opener, the scan stops at sentence punctuation (`。`, `！`, `？`, `.`, `!`, `?`, `‼`, `⁇`, `⁈`, `⁉`) unless that punctuation is immediately adjacent to the current marker.
- This prevents a previous sentence from over-influencing the current single-`*` correction.

### Step 4: Do not apply Step 3 single-star correction to `**` and above

All runs of `**` and longer (`***`, `****`, and `*****+`) still use normal `markdown-it` logic and japanese relaxations. What is intentionally excluded is the single-star-only direction correction from Step 3. Extending the same correction to multi-star runs pushes `japanese` too far toward `compatible` behavior and breaks expected Japanese-side recovery.

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
In this README, there is one Step 6 phase; Step 6-1 to 6-4 are its sub-sections.

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

Inline-link note:

- `[text](url)` does not perform collapsed-reference label matching.
- Postprocess only does token-only `*` / `**` wrapper repair around the link.
- It never "passes" matching by deleting emphasis markers.

Example:

- Input: `メニューではmenu**[ramen](url)**と書きます。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard`: `<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>`
- `aggressive`: `<p>メニューではmenu<strong><a href="url">ramen</a></strong>と書きます。</p>`
- `compatible` / `markdown-it`: `<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>`

- Input: `説明文ではこれは**[寿司](url)**です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>`
- `compatible` / `markdown-it`: `<p>説明文ではこれは**<a href="url">寿司</a>**です。</p>`

Inline-code / plain-wrapper note:

- Input: `昼食は**\`code\`**の話です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>昼食は<strong><code>code</code></strong>の話です。</p>`
- `compatible` / `markdown-it`: `<p>昼食は**<code>code</code>**の話です。</p>`

- Input: `注記では**aa\`stock\`**aaという記法を試します。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `compatible` / `markdown-it`: `<p>注記では**aa<code>stock</code>**aaという記法を試します。</p>`
- `aggressive`: `<p>注記では<strong>aa<code>stock</code></strong>aaという記法を試します。</p>`

- Input: `お店の場所は**{}()**です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>お店の場所は<strong>{}()</strong>です。</p>`
- `compatible` / `markdown-it`: `<p>お店の場所は**{}()**です。</p>`

#### Step 6-2: Postprocess by mode

`japanese-boundary`, `japanese-boundary-guard` (and therefore `japanese`) and `aggressive` run postprocess repairs for broken emphasis around links and collapsed references. `compatible` intentionally skips these repairs to stay aligned with plain `markdown-it` output.

The repair target is mainly broken `*` / `**` around links and collapsed references. Low-confidence spans that cross non-target inline elements (for example `code_inline`, `html_inline`, images, or autolinks) are kept as-is to avoid risky rewrites.

#### Step 6-3: Why postprocess can skip or normalize

Postprocess is conservative by design. It prioritizes stable output over aggressive conversion, so it skips rewrites when:

- emphasis/link repair signals are weak
- the span is low-confidence (`***` noise, underscore emphasis, `code_inline` involvement, wrapper imbalance)
- no known token-only fast-path signature matches

When rewrites do apply, token-level normalization can still happen while preserving equivalent rendered HTML. For example, `[` / `]` / `[]` may end up split into separate text tokens. Postprocess is strict token-only now, so there is no runtime inline parser fallback and no placeholder-token roundtrip.

Example (low-confidence span is preserved):

- Input: `注記では**aa\`stock\`***tail*です。`
- `japanese` / `compatible`: `<p>注記では**aa<code>stock</code>**<em>tail</em>です。</p>`
- Reason: mixed `**` and `*` around code in a low-confidence malformed span is kept conservative, so `**` remains literal.

In short, for ambiguous malformed input, strong-ja prioritizes safe/readable output over maximum conversion.

## Behavior Examples

Representative cases only (full corpus: `test/readme-mode.txt`).

Supporting visuals:

- `example/inline-wrapper-matrix.html`
- `example/mixed-ja-en-stars-mode.html`

### 1) Baseline Japanese punctuation case

- Input: `**「だし」**は和食の基本です。`
- `japanese` / `aggressive`: `<p><strong>「だし」</strong>は和食の基本です。</p>`
- `compatible` / `markdown-it`: `<p>**「だし」**は和食の基本です。</p>`

### 2) Mixed JA/EN mode differences

- Input: `**天ぷら。**crunch**という表現を使います。`
- `japanese` / `aggressive`: `<p><strong>天ぷら。</strong>crunch**という表現を使います。</p>`
- `compatible` / `markdown-it`: `<p>**天ぷら。<strong>crunch</strong>という表現を使います。</p>`

- Input: `日本語です。* English* です。`
- `japanese-boundary`: `<p>日本語です。<em> English</em> です。</p>`
- `japanese-boundary-guard` / `compatible`: `<p>日本語です。* English* です。</p>`

### 3) Safety-first malformed handling

- Input: `**[**[x](v)](u)**`
- All modes: `<p><strong>[</strong><a href="v">x</a>](u)**</p>`

- Input: `注記では**aa\`stock\`***tail*です。`
- `japanese` / `compatible`: `<p>注記では**aa<code>stock</code>**<em>tail</em>です。</p>`
- Low-confidence span: keep literal `**` instead of risky forced conversion.

### 4) Inline link/code adjacency

- Input: `説明文ではこれは**[ラーメン](url)**です。`
- `japanese` / `aggressive`: `<p>説明文ではこれは<strong><a href="url">ラーメン</a></strong>です。</p>`
- `compatible` / `markdown-it`: `<p>説明文ではこれは**<a href="url">ラーメン</a>**です。</p>`

- Input: `注記では**aa\`stock\`**aaという記法を試します。`
- `japanese` / `compatible` / `markdown-it`: `<p>注記では**aa<code>stock</code>**aaという記法を試します。</p>`
- `aggressive`: `<p>注記では<strong>aa<code>stock</code></strong>aaという記法を試します。</p>`

### 5) Pure-English malformed tail (`aggressive` delta)

- Input: `broken **tail [aa**aa***Text***and*More*bb**bb](https://x.test) after`
- `japanese` / `compatible` / `markdown-it`:  
  `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>and</em>More</em>bb**bb</a> after</p>`
- `aggressive`:  
  `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><strong>and<em>More</em>bb</strong>bb</a> after</p>`

## Options

### `mode`

- Type: `'japanese' | 'japanese-boundary' | 'japanese-boundary-guard' | 'aggressive' | 'compatible'`
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
