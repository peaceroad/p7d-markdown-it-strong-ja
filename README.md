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

## Example

The following examples is for strong. The process for em is roughly the same.

~~~
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
~~~

## Options

### disallowMixed

When `disallowMixed: true`, emphasis is blocked in English contexts that contain markdown links, HTML tags, inline code, or math expressions to maintain better compatibility with standard markdown-it behavior.

```js
const md = mdit.use(mditStrongJa)
md.render('string**[text](url)**')
// <p>string<strong><a href="url">text</a></strong></p>
```

```js
const md = mdit.use(mditStrongJa, { disallowMixed: true })
md.render('string**[text](url)**')
// <p>string**<a href="url">text</a>**</p>
```

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
