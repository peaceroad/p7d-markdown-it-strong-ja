# p7d-markdown-it-strong-ja

This is a plugin for markdown-it. It is an alternative to the standard `**` (strong) and `*` (em) processing. It also processes strings that cannot be converted by the standard.

## Use

```js
import mdit from 'markdown-it'
import mditStrongJa from '@peaceroad/markdown-it-strong-ja'
import mditAttrs from 'markdown-it-attrs'
const md = mdit().use(mditStrongJa).use(mditAttrs)

md.render('HTMLは**「HyperText Markup Language」**の略です。')
// <p>HTMLは<strong>「HyperText Markup Language」</strong>の略です。</p>


md.render('HTMLは*「HyperText Markup Language」*の略です。')
// <p>HTMLは<em>「HyperText Markup Language」</em>の略です。</p>
```

Note: this plugin assumes `markdown-it-attrs` is used. If you do not use it, pass `use(mditStrongJa, { mditAttrs: false })`.

### How this differs from vanilla markdown-it

Default output pairs `*` / `**` as it scans left-to-right: when a line contains Japanese (hiragana / katakana / kanji (Han) / fullwidth punctuation), japanese mode treats the leading `**` aggressively; English-only lines follow markdown-it style pairing. Pick one mode for the examples below:

- `mode: 'japanese'` (default, alias: `'japanese-only'`) … Japanese ⇒ aggressive, English-only ⇒ markdown-it compatible
- `mode: 'aggressive'` … always aggressive (lead `**` pairs greedily)
- `mode: 'compatible'` … markdown-it compatible (lead `**` stays literal)

```js
const mdDefault = mdit().use(mditStrongJa) // mode: 'japanese'
const mdCompat = mdit().use(mditStrongJa, { mode: 'compatible' }) // markdown-it pairing
const mdAggressive = mdit().use(mditStrongJa, { mode: 'aggressive' }) // always pair leading **
```

Default (japanese) pairs aggressively only when Japanese is present in the paragraph (the full inline content); detection is not line-by-line. Aggressive always pairs the leading `**`, and compatible matches markdown-it. Detection keys off hiragana/katakana/kanji (Han) and fullwidth punctuation; it does not treat Hangul as Japanese, so it is not full CJK detection.

Quick mode guide:
- Pick `compatible` for markdown-it behavior everywhere.
- Pick `japanese` to be aggressive only when Japanese text is present.
- Pick `aggressive` if you want leading `**` to always pair.

Japanese-first pairing around punctuation and mixed sentences: leading/trailing Japanese quotes or brackets (`「`, `」`, `（`, `、` etc.) are wrapped in Japanese paragraphs. Mixed sentences here mean one paragraph that contains multiple `*` runs; Japanese text keeps the leading `**` aggressive, while English-only stays compatible unless you pick aggressive mode.

- Punctuation (Japanese quotes / fullwidth punctuation):
  - Input: `**「test」**`
  - Output (default/aggressive/compatible/markdown-it): `<p><strong>「test」</strong></p>`
  - Input: `これは**「test」**です`
  - Output (default/aggressive): `<p>これは<strong>「test」</strong>です</p>`
  - Output (compatible/markdown-it): `<p>これは**「test」**です</p>`

- Mixed sentence (multiple `*` runs): English-only stays markdown-it compatible unless you pick aggressive mode; earlier `**` runs can remain literal while later ones pair.
  - Input (Japanese mixed): `**あああ。**iii**`
  - Output (default/aggressive): `<p><strong>あああ。</strong>iii**</p>`
  - Output (compatible/markdown-it): `<p>**あああ。<strong>iii</strong></p>`
  - Input (English-only): `**aaa.**iii**`
  - Output (aggressive): `<p><strong>aaa.</strong>iii**</p>`
  - Output (default/compatible/markdown-it): `<p>**aaa.<strong>iii</strong></p>`
  - Input (English-only, two `**` runs): `**aaa.**eee.**eeee**`
  - Output (aggressive): `<p><strong>aaa.</strong>eee.<strong>eeee</strong></p>`
  - Output (default/compatible/markdown-it): `<p>**aaa.**eee.<strong>eeee</strong></p>`

Inline link/HTML/code blocks stay intact (see Link / Inline code examples above): the plugin re-wraps `[label](url)` / `[label][]` after pairing to avoid broken emphasis tokens around anchors, inline HTML, or inline code. This also covers clusters of `*` with no spaces around the link or code span.

- Link (cluster of `*` without spaces):
  - Input (English-only): `string**[text](url)**`
  - Output (aggressive): `<p>string<strong><a href="url">text</a></strong></p>`
  - Output (default/compatible/markdown-it): `<p>string**<a href="url">text</a>**</p>`
  - Input (Japanese mixed): `これは**[text](url)**です`
  - Output (default/aggressive): `<p>これは<strong><a href="url">text</a></strong>です</p>`
  - Output (compatible/markdown-it): `<p>これは**<a href="url">text</a>**です</p>`
- Inline code (cluster of `*` without spaces):
  - Input (English-only): `` **aa`code`**aa ``
  - Output (aggressive): `<p><strong>aa<code>code</code></strong>aa</p>`
  - Output (default/compatible/markdown-it): `<p>**aa<code>code</code>**aa</p>`
  - Input (Japanese mixed): `` これは**`code`**です ``
  - Output (default/aggressive): `<p>これは<strong><code>code</code></strong>です</p>`
  - Output (compatible/markdown-it): `<p>これは**<code>code</code>**です</p>`

Notice. The plugin keeps inline HTML / angle-bracket regions intact so rendered HTML keeps correct nesting (for example, it avoids mis-nesting in inputs like `**aaa<code>**bbb</code>` when HTML output is enabled).



## Example

The following examples are for strong. The process for em is roughly the same.

````markdown
[Markdown]
HTMLは「**HyperText Markup Language**」の略です。
[HTML]
<p>HTMLは「<strong>HyperText Markup Language</strong>」の略です。</p>


[Markdown]
HTMLは**「HyperText Markup Language」**の略です。
[HTML]
<p>HTMLは<strong>「HyperText Markup Language」</strong>の略です。</p>


[Markdown]
HTMLは**「HyperText *Markup* Language」**の略です。
[HTML]
<p>HTMLは<strong>「HyperText <em>Markup</em> Language」</strong>の略です。</p>


[Markdown]
HTMLは**「HyperText *Markup* `Language`」**の略です。
[HTML]
<p>HTMLは<strong>「HyperText <em>Markup</em> <code>Language</code>」</strong>の略です。</p>


[Markdown]
HTMLは**「HyperText Mark

up Language」**の略です。
[HTML]
<p>HTMLは**「HyperText Mark</p>
<p>up Language」**の略です。</p>


[Markdown]
HTMLは\**「HyperText Markup Language」**の略です。
[HTML]
<p>HTMLは**「HyperText Markup Language」**の略です。</p>


[Markdown]
HTMLは\\**「HyperText Markup Language」**の略です。
[HTML]
<p>HTMLは\<strong>「HyperText Markup Language」</strong>の略です。</p>


[Markdown]
HTMLは\\\**「HyperText Markup Language」**の略です。
[HTML]
<p>HTMLは\**「HyperText Markup Language」**の略です。</p>


[Markdown]
HTMLは`**`は**「HyperText Markup Language」**の略です。
[HTML]
<p>HTMLは<code>**</code>は<strong>「HyperText Markup Language」</strong>の略です。</p>

[Markdown]
HTMLは`**`は**「HyperText** <b>Markup</b> Language」の略です。
[HTML:false]
<p>HTMLは<code>**</code>は<strong>「HyperText</strong> &lt;b&gt;Markup&lt;/b&gt; Language」の略です。</p>
[HTML:true]
<p>HTMLは<code>**</code>は<strong>「HyperText</strong> <b>Markup</b> Language」の略です。</p>


[Markdown]
HTMLは`**`は**「HyperText <b>Markup</b> Language」**の略です。
[HTML:false]
<p>HTMLは<code>**</code>は<strong>「HyperText &lt;b&gt;Markup&lt;/b&gt; Language」</strong>の略です。</p>
[HTML:true]
<p>HTMLは<code>**</code>は<strong>「HyperText <b>Markup</b> Language」</strong>の略です。</p>


[Markdown]
```
HTMLは`**`は**「HyperText Markup Language」**の略です。
```
[HTML:false]
<pre><code>HTMLは`**`は**「HyperText Markup Language」**の略です。
</code></pre>
[HTML:true]
<pre><code>HTMLは`**`は**「HyperText Markup Language」**の略です。
</code></pre>


[Markdown]
HTMLは**「HyperText <b>Markup</b> Language」**
[HTML:false]
<p>HTMLは<strong>「HyperText &lt;b&gt;Markup&lt;/b&gt; Language」</strong></p>
[HTML:true]
<p>HTMLは<strong>「HyperText <b>Markup</b> Language」</strong></p>

[Markdown]
これは**[text](url)**と**`code`**と**<b>HTML</b>**です
[HTML html:true]
<p>これは<strong><a href="url">text</a></strong>と<strong><code>code</code></strong>と<strong><b>HTML</b></strong>です</p>


[Markdown]
HTMLは「**HyperText Markup Language**」
[HTML]
<p>HTMLは「<strong>HyperText Markup Language</strong>」</p>

[Markdown]
HTMLは**「HyperText Markup Language」**。
[HTML]
<p>HTMLは<strong>「HyperText Markup Language」</strong>。</p>

[Markdown]
HTMLは**「HyperText Markup Language」**
[HTML]
<p>HTMLは<strong>「HyperText Markup Language」</strong></p>


[Markdown]
HTMLは**「HyperText Markup Language」**。
[HTML]
<p>HTMLは<strong>「HyperText Markup Language」</strong>。</p>

[Markdown]
***強調と*入れ子*の検証***を行う。
[HTML]
<p><em><em><em>強調と</em>入れ子</em>の検証</em>**を行う。</p>

[Markdown]
****
[HTML]
<hr>

[Markdown]
a****b
[HTML]
<p>a****b</p>

[Markdown]
a****
[HTML]
<p>a****</p>
````


### coreRulesBeforePostprocess

`strong_ja_token_postprocess` runs inside the markdown-it core pipeline. When other plugins register core rules, you can keep their rules ahead of `strong_ja_token_postprocess` by listing them in `coreRulesBeforePostprocess`. Each name is normalized, deduplicated, and re-ordered once during plugin setup.

```js
const md = mdit()
  .use(cjkBreaks)
  .use(mditStrongJa, {
    coreRulesBeforePostprocess: ['cjk_breaks', 'my_custom_rule']
  })
```

- Default: `[]`
- Specify `['cjk_breaks']` (or other rule names) when you rely on plugins such as `@peaceroad/markdown-it-cjk-breaks-mod` and need them to run first.
- Pass an empty array if you do not want `mditStrongJa` to reorder any core rules.
- Reordering is setup-time behavior and still applies even when `postprocess: false` is set.

Most setups can leave this option untouched; use it only when you must keep another plugin's core rule ahead of `strong_ja_token_postprocess`.

### postprocess

Toggle the link/reference reconstruction pass and the link-adjacent mark cleanup that runs after inline parsing.

```js
const md = mdit().use(mditStrongJa, {
  postprocess: false
})
```

- Default: `true`
- Set `false` when you want to minimize core-rule interference and accept that some link/reference + emphasis combinations remain literal (for example, `**[text](url)**`, `[**Text**][]`).
- `postprocess: false` disables the runtime reconstruction pass, but the `strong_ja_token_postprocess` rule remains registered in the core chain.

### patchCorePush

Controls whether `mditStrongJa` patches `md.core.ruler.push` to keep `strong_ja_restore_softbreaks` ordered after `cjk_breaks` when other plugins register their core rules after `mditStrongJa` (used only when `mditAttrs: false`).

```js
const md = mdit().use(mditStrongJa, {
  mditAttrs: false,
  patchCorePush: false
})
```

- Default: `true`
- Disable if you want to avoid monkey-patching core rule registration and can guarantee rule ordering (or you do not use `cjk_breaks`).
- If disabled and `cjk_breaks` is registered later, softbreak normalization can run too early and spacing around CJK punctuation can differ in no-attrs mode.
