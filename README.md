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

Notice. Basically, it is assumed that you will use markdown-it-attrs in conjunction with this. If you do not use it, please use `use(mditStrongJa, {mditAttrs: false})`.

### How this differs from vanilla markdown-it

Default output pairs `*` / `**` as it scans left-to-right: when a line contains Japanese (hiragana / katakana / kanji / fullwidth punctuation), japanese-only mode treats the leading `**` aggressively; English-only lines follow markdown-it style pairing. Pick one mode for the examples below:

- `mode: 'japanese-only'` (default) … Japanese ⇒ aggressive, English-only ⇒ markdown-it compatible
- `mode: 'aggressive'` … always aggressive (lead `**` pairs greedily)
- `mode: 'compatible'` … markdown-it compatible (lead `**` stays literal)

```js
const mdDefault = mdit().use(mditStrongJa) // mode: 'japanese-only'
const mdCompat = mdit().use(mditStrongJa, { mode: 'compatible' }) // markdown-it pairing
const mdAggressive = mdit().use(mditStrongJa, { mode: 'aggressive' }) // always pair leading **
```

Default (japanese-only) pairs aggressively only when Japanese is present. Aggressive always pairs the leading `**`, and compatible matches markdown-it.

Japanese-first pairing around punctuation and mixed sentences: leading/trailing Japanese quotes or brackets (`「`, `」`, `（`, `、` etc.) are wrapped even when the same pattern would stay literal in markdown-it. Mixed sentences here mean one line that contains multiple `*` runs; Japanese text keeps the leading `**` aggressive, while English-only stays compatible unless you pick aggressive mode.

- Punctuation:
  - Input: `**「test」**`
  - Output (default): `<p><strong>「test」</strong></p>`
  - Output (aggressive): `<p><strong>「test」</strong></p>`
  - Output (compatible): `<p>**「test」**</p>`

- Mixed sentence (multiple `*` runs):
  - Input (Japanese mixed): `**あああ。**iii**`
  - Output (default): `<p><strong>あああ。</strong>iii**</p>`
  - Output (aggressive): `<p><strong>あああ。</strong>iii**</p>`
  - Output (compatible): `<p>**あああ。<strong>iii</strong></p>`
  - Input (English-only): `**aaa.**iii**`
  - Output (default): `<p>**aaa.<strong>iii</strong></p>`
  - Output (aggressive): `<p><strong>aaa.</strong>iii**</p>`
  - Output (compatible): `<p>**aaa.<strong>iii</strong></p>`

Inline link/HTML/code blocks stay intact (see Link / Inline code examples above): the plugin re-wraps `[label](url)` / `[label][]` after pairing to avoid broken emphasis tokens around anchors, inline HTML, or inline code. This also covers clusters of `*` with no spaces around the link or code span.

- Link (cluster of `*` without spaces):
  - Input (English-only): `string**[text](url)**`
  - Output (default): `<p>string**<a href="url">text</a>**</p>`
  - Output (aggressive): `<p>string<strong><a href="url">text</a></strong></p>`
  - Output (compatible): `<p>string**<a href="url">text</a>**</p>`
  - Input (Japanese mixed): `これは**[text](url)**です`
  - Output (default/aggressive): `<p>これは<strong><a href="url">text</a></strong>です</p>`
  - Output (compatible): `<p>これは**<a href="url">text</a>**です</p>`
- Inline code (cluster of `*` without spaces):
  - Input (English-only): `` **aaa.`code`** ``
  - Output (default): `<p>**aaa.<code>code</code>**</p>`
  - Output (aggressive): `<p><strong>aaa.`code`</strong>**</p>`
  - Output (compatible): `<p>**aaa.<code>code</code>**</p>`
  - Input (Japanese mixed): `` これは**`code`**です ``
  - Output (default/aggressive): `<p>これは<strong><code>code</code></strong>です</p>`
  - Output (compatible): `<p>これは**<code>code</code>**です</p>`

### Known differences from vanilla markdown-it

This section collects other cases that diverge from vanilla markdown-it.

The plugin keeps pairing aggressively in Japanese contexts, which can diverge from markdown-it when markup spans newlines or mixes nested markers.

- Multiline + nested emphasis (markdown-it leaves trailing `**`):

  ```markdown
  ***強調と*入れ子*の検証***を行う。
  ```

  - markdown-it: `<p><em><em><em>強調と</em>入れ子</em>の検証</em>**を行う。</p>`
  - markdown-it-strong-ja (default/aggressive): `<p><em><strong>強調と<em>入れ子</em>の検証</strong></em>を行う。</p>`
  - If you want markdown-it behavior here, use `mode: 'compatible'`.

Notice. The plugin keeps inline HTML / angle-bracket regions intact so rendered HTML keeps correct nesting (for example, it avoids mis-nesting in inputs like `**aaa<code>**bbb</code>` when HTML output is enabled).



## Example

The following examples is for strong. The process for em is roughly the same.

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


### disallowMixed (legacy)

`disallowMixed: true` is kept for back-compat: it forces compatible pairing for English/mixed contexts that contain markdown links, HTML tags, inline code, or math expressions while staying aggressive for Japanese-only text. Prefer `mode` for new setups; enable this only if you need the legacy compat-first behavior in mixed English.

### coreRulesBeforePostprocess

`strong_ja_postprocess` runs inside the markdown-it core pipeline. When other plugins register core rules, you can keep their rules ahead of `strong_ja_postprocess` by listing them in `coreRulesBeforePostprocess`. Each name is normalized, deduplicated, and re-ordered once during plugin setup.

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

Most setups can leave this option untouched; use it only when you must keep another plugin's core rule ahead of `strong_ja_postprocess`.
