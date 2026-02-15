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

This section follows the runtime flow for `mode: 'japanese'` (which resolves to `japanese-boundary-guard`).
The flow has three layers: Step 1 builds the baseline with plain `markdown-it`; Steps 2-8 apply helper logic only where needed; Step 9 repairs link/reference-adjacent breakage.

Terms used below:

- Opening marker: `*` or `**` that starts emphasis.
- Closing marker: `*` or `**` that ends emphasis.
- Run: a contiguous group of the same marker (`*`, `**`, `***`, ...).
- Line: text split by `\n`.

### Step 1: Build the baseline with plain `markdown-it`

`markdown-it` runs first. If it can already parse a pattern (including cross-line `**...**`), that baseline structure is kept.

Example:

- Input: `カツ**丼も\n人気**です`
- `markdown-it` / `japanese` / `compatible`: `<p>カツ<strong>丼も\n人気</strong>です</p>`

Positioning:

- `mode: 'compatible'` mostly uses this baseline as-is.
- Other modes (`japanese`, `japanese-boundary`, `japanese-boundary-guard`, `aggressive`) may add helper logic in later steps.

### Step 2: Decide whether Japanese helper logic should run

This decision is made per `*` run. `japanese` does not rewrite the whole line blindly. It checks non-whitespace characters adjacent to each run and only enters helper logic when local Japanese context exists.

Japanese context here is mainly Hiragana, Katakana, Kanji (Han), and fullwidth punctuation/symbols. If adjacent context is mostly ASCII letters/numbers, the Step 1 result is kept.

Example that stays on baseline:

- Input: `**sushi.**umami**`
- Output (`japanese`): `<p>**sushi.<strong>umami</strong></p>`
- Why: local context is ASCII-side.

Example that proceeds to helper logic:

- Input: `**味噌汁。**umami**`
- Why: local Japanese context is adjacent.

### Step 3: Keep valid `markdown-it` direction decisions

`japanese` is baseline-first. It does not overwrite already-stable direction decisions. It only adds candidates where malformed input is likely to misdirect pairing.

Example that stays as-is:

- Input: `*寿司*は人気です。`
- Output: `<p><em>寿司</em>は人気です。</p>`

Example that continues:

- Input: `*味噌汁。*umai*`
- Why: leaving the first `*` literal can make the later pair win (`*味噌汁。<em>umai</em>`), so local correction checks whether Japanese-side pairing should be preferred.

### Step 4: Use same-line local context only

Local helper checks only read non-whitespace characters on the same line. They do not bridge across `\n`.

Example:

- Input: `*味噌汁。\n*umai*`
- Output (`japanese`): `<p>*味噌汁。\n<em>umai</em></p>`
- Why: the first `*` does not see the next line.

### Step 5 (`japanese-boundary-guard` only): Suppress mixed JA/EN over-conversion

This step exists only in `japanese-boundary-guard`. It suppresses emphasis when the segment is space-adjacent and ASCII-start, to avoid unnatural emphasis around English fragments.

Representative differences:

- Input: `日本語です。* English* です。`
- `japanese-boundary`: `<p>日本語です。<em> English</em> です。</p>`
- `japanese-boundary-guard`: `<p>日本語です。* English* です。</p>`

- Input: `和食では* \`umami\`*を使う。`
- `japanese-boundary`: `<p>和食では<em> <code>umami</code></em>を使う。</p>`
- `japanese-boundary-guard`: `<p>和食では* <code>umami</code>*を使う。</p>`

### Step 6: Apply extra direction correction only to single `*`

Extra direction correction is applied only to run length `1` (`*`), where malformed inputs most often flip opener/closer direction.

Example:

- Input: `*味噌汁。*umai*`
- `japanese` / `aggressive`: `<p><em>味噌汁。</em>umai*</p>`
- `compatible` / `markdown-it`: `<p>*味噌汁。<em>umai</em></p>`

Additional boundary rule:

- Backward scan for previous single-`*` stops at sentence punctuation (`。`, `！`, `？`, `.`, `!`, `?`, `‼`, `⁇`, `⁈`, `⁉`) unless that punctuation is immediately adjacent to the current marker.

### Step 7: Do not apply Step 6 single-star correction to `**` and longer runs

Runs of `**` and longer (`***`, `****`, `*****+`) still use baseline `markdown-it` decisions and Japanese relaxations. Only the single-star-specific correction from Step 6 is excluded.

Example:

- Input: `**味噌汁。**umami**という表現を使います。`
- `japanese`: `<p><strong>味噌汁。</strong>umami**という表現を使います。</p>`
- `compatible`: `<p>**味噌汁。<strong>umami</strong>という表現を使います。</p>`

### Step 8: Build emphasis pairs normally; keep literals when forcing is unsafe

After direction candidates are fixed, normal inline pairing builds final tokens. If forcing tags looks unsafe, markers are left literal.

Example:

- Input: `**[**[x](v)](u)**`
- Output: `<p><strong>[</strong><a href="v">x</a>](u)**</p>`

### Step 9: Repair link/reference-adjacent breakage after pairing

Steps 1-8 decide marker direction and pairing. Step 9 is a separate phase that only adjusts malformed spans around links/references. Option name: `postprocess`.

#### Step 9-1: Collapsed reference matching follows `markdown-it` normalization

##### 9-1A: Collapsed reference matching (`[label][]`)

Collapsed reference matching (`[label][]`) follows `markdown-it` key normalization. strong-ja does not force matching by deleting `*`/`**` markers from labels.

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

##### 9-1B: Inline link handling (`[text](url)`)

- `[text](url)` does not do collapsed-reference label matching.
- Step 9 only adjusts malformed `*` / `**` wrappers around links.
- It never forces matching by deleting markers.

Examples:

- Input: `メニューではmenu**[ramen](url)**と書きます。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard`: `<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>`
- `aggressive`: `<p>メニューではmenu<strong><a href="url">ramen</a></strong>と書きます。</p>`
- `compatible` / `markdown-it`: `<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>`

- Input: `説明文ではこれは**[寿司](url)**です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>`
- `compatible` / `markdown-it`: `<p>説明文ではこれは**<a href="url">寿司</a>**です。</p>`

##### 9-1C: Inline code / symbol wrapper handling

- Input: `昼食は**\`code\`**の話です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>昼食は<strong><code>code</code></strong>の話です。</p>`
- `compatible` / `markdown-it`: `<p>昼食は**<code>code</code>**の話です。</p>`

- Input: `注記では**aa\`stock\`**aaという記法を試します。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `compatible` / `markdown-it`: `<p>注記では**aa<code>stock</code>**aaという記法を試します。</p>`
- `aggressive`: `<p>注記では<strong>aa<code>stock</code></strong>aaという記法を試します。</p>`

- Input: `お店の場所は**{}()**です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>お店の場所は<strong>{}()</strong>です。</p>`
- `compatible` / `markdown-it`: `<p>お店の場所は**{}()**です。</p>`

#### Step 9-2: Which modes run Step 9

Step 9 runs in:

- `japanese-boundary`
- `japanese-boundary-guard` (therefore also `japanese`)
- `aggressive`

Step 9 is skipped in:

- `compatible` (to keep plain `markdown-it` parity)

Target is mainly malformed `*` / `**` around links and collapsed refs. Spans that cross inline code, inline HTML, images, or autolinks are kept as-is.

#### Step 9-3: Why Step 9 can skip rewrites or normalize tokens

Step 9 is intentionally conservative. It prefers stable output over maximum conversion, so it skips rewrites when:

- emphasis/link repair signals are weak
- the span is low-confidence (`***` noise, underscore-heavy mix, code involvement, wrapper imbalance)
- the malformed shape does not match known safe repair patterns

Even when rewrite succeeds, token arrangement can be normalized while rendered HTML stays equivalent. For example, `[` / `]` / `[]` may become separate text tokens. The runtime path is strict token-only (no inline reparse fallback).

Example (low-confidence span is preserved):

- Input: `注記では**aa\`stock\`***tail*です。`
- `japanese` / `compatible`: `<p>注記では**aa<code>stock</code>**<em>tail</em>です。</p>`
- Reason: mixed `**` and `*` around code is low-confidence, so literal `**` is preserved.

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

## Notes

- Use `state.env.__strongJaTokenOpt` to override options per render.
- Overrides are merged with plugin options, but setup-time behavior (such as rule registration/order) cannot be switched at render time.
- This is an ESM plugin (`type: module`) and works in Node.js, browser bundlers, and VS Code extension pipelines that use `markdown-it` ESM.
- `scanDelims` patch is applied once per `MarkdownIt` prototype in the same process.
