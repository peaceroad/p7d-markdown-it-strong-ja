# README mode option examples

[case punctuation]
[markdown]
**「test」**
[default]
<p><strong>「test」</strong></p>
[aggressive]
<p><strong>「test」</strong></p>
[compatible]
<p><strong>「test」</strong></p>
[markdown-it]
<p><strong>「test」</strong></p>

[case mixed-japanese]
[markdown]
**あああ。**iii**
[default]
<p><strong>あああ。</strong>iii**</p>
[aggressive]
<p><strong>あああ。</strong>iii**</p>
[compatible]
<p>**あああ。<strong>iii</strong></p>
[markdown-it]
<p>**あああ。<strong>iii</strong></p>

[case mixed-english]
[markdown]
**aaa.**iii**
[default]
<p>**aaa.<strong>iii</strong></p>
[aggressive]
<p><strong>aaa.</strong>iii**</p>
[compatible]
<p>**aaa.<strong>iii</strong></p>
[markdown-it]
<p>**aaa.<strong>iii</strong></p>

[case mixed-english-two]
[markdown]
**aaa.**eee.**eeee**
[default]
<p>**aaa.**eee.<strong>eeee</strong></p>
[aggressive]
<p><strong>aaa.</strong>eee.<strong>eeee</strong></p>
[compatible]
<p>**aaa.**eee.<strong>eeee</strong></p>
[markdown-it]
<p>**aaa.**eee.<strong>eeee</strong></p>

[case link-english]
[markdown]
string**[text](url)**
[default]
<p>string**<a href="url">text</a>**</p>
[aggressive]
<p>string<strong><a href="url">text</a></strong></p>
[compatible]
<p>string**<a href="url">text</a>**</p>
[markdown-it]
<p>string**<a href="url">text</a>**</p>

[case link-japanese]
[markdown]
これは**[text](url)**です
[default]
<p>これは<strong><a href="url">text</a></strong>です</p>
[aggressive]
<p>これは<strong><a href="url">text</a></strong>です</p>
[compatible]
<p>これは**<a href="url">text</a>**です</p>
[markdown-it]
<p>これは**<a href="url">text</a>**です</p>

[case code-english]
[markdown]
**aa`code`**aa
[default]
<p>**aa<code>code</code>**aa</p>
[aggressive]
<p><strong>aa<code>code</code></strong>aa</p>
[compatible]
<p>**aa<code>code</code>**aa</p>
[markdown-it]
<p>**aa<code>code</code>**aa</p>

[case code-japanese]
[markdown]
これは**`code`**です
[default]
<p>これは<strong><code>code</code></strong>です</p>
[aggressive]
<p>これは<strong><code>code</code></strong>です</p>
[compatible]
<p>これは**<code>code</code>**です</p>
[markdown-it]
<p>これは**<code>code</code>**です</p>
