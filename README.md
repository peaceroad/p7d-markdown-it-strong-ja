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
- `japanese-boundary`: keeps markdown-it as baseline and enables Japanese-context local relaxation around `*` runs. It does not apply the space-leading ASCII suppression guard. Link/ref postprocess repairs are enabled. Target behavior is JP-friendly conservative recovery.
- `japanese-boundary-guard`: includes everything from `japanese-boundary`, plus an extra mixed JA/EN guard for space-adjacent ASCII segments (for patterns like `* English*`, `** "English"**`, `*** [English](u)***`). This guard is applied consistently for `*` run lengths (`*` and longer runs). Link/ref postprocess repairs are enabled. Target behavior is JP-friendly mixed-text safety.
- `aggressive`: is more permissive than baseline-first and is the most eager mode for early opener recovery. Japanese local relaxation and link/ref postprocess repairs are enabled. Target behavior is maximum recovery.
- `compatible`: keeps plain markdown-it delimiter decisions as-is. It does not run Japanese local relaxation and skips link/ref postprocess repairs. Output stays aligned with plain `markdown-it` under the same plugin stack.

`japanese-boundary-guard` is the default because it applies a conservative policy to ambiguous space-leading ASCII, not because the parser can fully infer author intent. If `* English*` or `* \`umami\`*` is an intentional authoring convention, select `japanese-boundary` explicitly.

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

- user-facing prose where suppressing over-conversion is the priority: `japanese` (`japanese-boundary-guard`)
- strict markdown-it parity: `compatible`
- maximum recovery over predictability: `aggressive`
- intentional space-leading English/code emphasis: `japanese-boundary`

### Example Corpus Notes

Detailed cases and visual outputs:

- `example/README.md`
- `example/author-intent-cases.html`
- `example/mixed-ja-en-stars-mode.html`
- `example/mixed-ja-en-stars-mode.txt`
- `example/inline-wrapper-matrix.html`
- `docs/note-mode-default.md`

## How `japanese` (`japanese-boundary-guard`) Decides (Step by Step)

This section follows the implementation phases for `mode: 'japanese'` (which resolves to `japanese-boundary-guard`):

1. **Delimiter decisions (Steps 1-7):** obtain the plain `markdown-it` result for each `*` run, then adjust only the runs that need Japanese-aware handling.
2. **Emphasis token generation (Step 8):** let the normal inline pipeline pair the adjusted opener/closer candidates.
3. **Token postprocess (Step 9):** repair only known-safe malformed shapes next to links or references.

Steps 1-7 decide delimiter direction during inline parsing; they do not rewrite an already-finished token stream. Only Step 9 operates on inline tokens after parsing.

Terms used below:

- Opening marker: `*` or `**` that starts emphasis.
- Closing marker: `*` or `**` that ends emphasis.
- Run: a contiguous group of the same marker (`*`, `**`, `***`, ...).
- Line: text split by `\n`.

### TL;DR

- **Establish a baseline:** call plain `markdown-it` delimiter scanning for each `*` run first.
- **Adjust locally:** `japanese` enters helper logic only for runs with nearby Japanese context and preserves stable baseline decisions.
- **Guard mixed text:** `japanese-boundary-guard` additionally protects space-adjacent, ASCII-start segments from over-conversion.
- **Finish safely:** after normal emphasis pairing, token-only postprocess repairs only high-confidence link/reference-adjacent breakage.


### Step 1: Use plain `markdown-it` delimiter decisions as the baseline

For every `*` run, strong-ja first calls the original `markdown-it` delimiter scanner. This returns the run length and whether it can open or close emphasis. Patterns that `markdown-it` already handles, including cross-line `**...**`, are built from this baseline.

Example:

- Input: `カツ**丼も\n人気**です`
- `markdown-it` / `japanese` / `compatible`: `<p>カツ<strong>丼も\n人気</strong>です</p>`

How modes use it:

- `compatible` returns this result directly and skips Steps 2-7.
- `japanese`, `japanese-boundary`, and `japanese-boundary-guard` adjust only runs that need local help.
- `aggressive` starts from the same result but applies helper logic more broadly, without the Japanese-context gate.

### Step 2: Decide per run whether Japanese-aware help is needed

`japanese` does not rewrite the entire source or a finished token stream. During inline parsing, it checks the source around each run and enters Steps 3-7 only when nearby Japanese context exists. That context mainly covers Hiragana, Katakana, Han, and fullwidth punctuation/symbols; single-star bracket/quote wrappers receive limited lookaround outside the wrapper. Without such context, the Step 1 result is returned unchanged.

Example that stays on baseline:

- Input: `**sushi.**umami**`
- Output (`japanese`): `<p>**sushi.<strong>umami</strong></p>`
- Why: local context is ASCII-side.

Example that proceeds to helper logic:

- Input: `**味噌汁。**umami**`
- Why: local Japanese context is adjacent.

### Step 3: Preserve stable opener/closer directions

Even on the helper path, stable opener/closer directions from `markdown-it` take priority. strong-ja relaxes only local cases that whitespace or Japanese punctuation would otherwise exclude.

Example that stays as-is:

- Input: `*寿司*は人気です。`
- Output: `<p><em>寿司</em>は人気です。</p>`

Example that continues:

- Input: `*味噌汁。*umai*`
- Why: leaving the first `*` literal can make the later pair win (`*味噌汁。<em>umai</em>`), so local correction checks whether Japanese-side pairing should be preferred.

### Step 4: Use same-line local context only

Whitespace and wrapper lookaround stays on the current line; it never treats text across `\n` as local context. This limit applies to strong-ja's additional checks, not to normal inline pairing, so it does not disable cross-line emphasis that was already valid in Step 1.

Example:

- Input: `*味噌汁。\n*umai*`
- Output (`japanese`): `<p>*味噌汁。\n<em>umai</em></p>`
- Why: the first `*` does not see the next line.

### Step 5 (`japanese-boundary-guard` only): Suppress mixed JA/EN over-conversion

This extra check exists only in `japanese-boundary-guard`. It tightens emphasis candidates for space-adjacent segments whose first significant character—after optional quotes, brackets, or code-like wrappers—is an ASCII word character. The guard applies to single and multi-marker runs.

Representative differences:

- Input: `日本語です。* English* です。`
- `japanese-boundary`: `<p>日本語です。<em> English</em> です。</p>`
- `japanese-boundary-guard`: `<p>日本語です。* English* です。</p>`

- Input: `和食では* \`umami\`*を使う。`
- `japanese-boundary`: `<p>和食では<em> <code>umami</code></em>を使う。</p>`
- `japanese-boundary-guard`: `<p>和食では* <code>umami</code>*を使う。</p>`

### Step 6: Apply extra direction correction only to single `*`

For a run length of `1`, strong-ja may also inspect the previous single `*` and Japanese context between the two markers. This limits opener/closer inversion in malformed input. The correction runs in `japanese-boundary`, `japanese-boundary-guard` (`japanese`), and `aggressive`, but not `compatible`.

Example:

- Input: `*味噌汁。*umai*`
- `japanese` / `aggressive`: `<p><em>味噌汁。</em>umai*</p>`
- `compatible` / `markdown-it`: `<p>*味噌汁。<em>umai</em></p>`

Additional boundary rule:

- Backward scan for previous single-`*` stops at sentence punctuation (`。`, `！`, `？`, `.`, `!`, `?`, `‼`, `⁇`, `⁈`, `⁉`) unless that punctuation is immediately adjacent to the current marker.

### Step 7: Do not apply Step 6 single-star correction to `**` and longer runs

Runs of `**` and longer still use the Step 1 baseline plus the Japanese-aware checks and guard from Steps 2-5. Only Step 6's backward lookup for a previous single `*` is excluded, because extending it to multi-marker runs can disturb unrelated pairing.

Example:

- Input: `**味噌汁。**umami**という表現を使います。`
- `japanese`: `<p><strong>味噌汁。</strong>umami**という表現を使います。</p>`
- `compatible`: `<p>**味噌汁。<strong>umami</strong>という表現を使います。</p>`

### Step 8: Pair normally; keep markers literal when pairing is unsafe

After each run has its opener/closer candidates, the normal `markdown-it` inline pipeline pairs them and emits `em_*` / `strong_*` tokens. Markers that cannot be paired safely remain literal text.

Example:

- Input: `**[**[x](v)](u)**`
- Output: `<p><strong>[</strong><a href="v">x</a>](u)**</p>`

### Step 9: Postprocess only known link/reference-adjacent breakage

The processing phase changes here. Steps 1-8 belong to inline parsing; Step 9 is a core-rule token postprocess. It rearranges `*` / `**`-related tokens only when an already-built inline token range next to a link or reference matches a known-safe malformed shape. It never converts the range back to source text for reparsing. Option name: `postprocess`.

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

## Compatibility Notes

### `markdown-it-attrs` 5.x parity

When `markdown-it-attrs` is installed, strong-ja follows the token stream produced by that plugin and does not reinterpret where `{...}` attributes should be attached. This is intentional: strong-ja should not make attribute syntax mean something different from `markdown-it-attrs` alone.

One edge case to be aware of is a tight list item followed by an emphasized line:

```markdown
- e {.li-style}
*{.ul-style}*
```

With `markdown-it-attrs` 5.x, the first attribute block is consumed as a block-level attribute on the hidden `paragraph_open` inside the tight list. Because that paragraph token is hidden by markdown-it's tight-list rendering, the class is not visible in the final HTML. The second `{.ul-style}` is inside emphasis text, not a suffix after a closed inline token, so it remains literal text:

```html
<ul>
<li>e
<em>{.ul-style}</em></li>
</ul>
```

This output matches `markdown-it-attrs` alone. To attach attributes intentionally, use the syntax owned by `markdown-it-attrs`, for example:

```markdown
- e
{.ul-style}
```

```html
<ul class="ul-style">
<li>e</li>
</ul>
```

or attach inline attributes after the closing inline token:

```markdown
- e
*x*{.ul-style}
```

```html
<ul>
<li>e
<em class="ul-style">x</em></li>
</ul>
```

strong-ja keeps this as dependency parity rather than adding a local workaround.

### `markdown-it` 14.2 astral delimiter policy

`markdown-it` 14.2 recognizes astral characters (surrogate pairs) as full Unicode code points when scanning emphasis delimiters. strong-ja keeps `compatible` mode aligned with that upstream behavior.

In Japanese modes, strong-ja still only adds its own delimiter relaxation when Japanese/CJK context is present. Astral Han characters, such as CJK Extension B, are treated as CJK context:

```markdown
*𠀋?*abc*
```

```html
<p><em>𠀋?</em>abc*</p>
```

Emoji or symbol-only English contexts remain aligned with `markdown-it` and are not promoted just because they are astral characters:

```markdown
*😀?*abc*
```

```html
<p>*😀?<em>abc</em></p>
```

Symbols inside Japanese prose may still be emphasized by the existing Japanese-context rule, for example `**😀**です` can render as `<p><strong>😀</strong>です</p>`. Use `mode: 'compatible'` when exact `markdown-it` 14.2 delimiter behavior is required.

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
- Repairs stay local to malformed link/reference-adjacent spans; valid inputs such as `[w](u) *string*  [w](u)` are left unchanged.

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

- Use `state.env.__strongJaTokenOpt` to override runtime-effective options per render.
- Repeated `.use(...)` on the same `MarkdownIt` instance is treated as first-install-wins no-op. Create a new `MarkdownIt` instance for a different plugin option set.
- Runtime-effective override keys are merged with plugin options, but setup-time behavior (such as rule registration/order) cannot be switched at render time and cannot be retrofitted after the first `.use(...)` on the same `MarkdownIt` instance.
- `mode` and `postprocess` are runtime-effective via initial install or per-render override. `mditAttrs`, `patchCorePush`, and `coreRulesBeforePostprocess` are setup-time effective after the first `.use(...)` on a `MarkdownIt` instance.
- This is an ESM plugin (`type: module`) and is tested against `markdown-it` 14.x in Node.js, browser bundlers, and VS Code extension pipelines that use `markdown-it` ESM.
- The implementation relies on `markdown-it` internal ESM modules / core rule internals (`lib/token.mjs`, `lib/common/utils.mjs`, `ruler.__rules__`) plus a `scanDelims` prototype patch, so internal `markdown-it` changes may require plugin updates.
- `scanDelims` patch is applied once per `MarkdownIt` prototype in the same process.
