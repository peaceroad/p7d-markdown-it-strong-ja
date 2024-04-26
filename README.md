# p7d-markdown-it-strong-ja

This is a plugin for markdown-it. It is an alternative to the standard `**` (strong) processing. It also processes strings that cannot be converted by the standard."

## Use

```js
import mdit from 'markdown-it'
import mdStrongJa from '@peaceroad/markdown-it-strong-ja'
const md = mdit().use(mdStrongJa)

md.renderer('HTMLは**「HyperText Markup Language」**の略です。')
// <p>HTMLは<strong>「HyperText Markup Language」</strong>の略です。</p>
```

## Example

```
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
```