# README mode option examples

[case punctuation]
[markdown]
**「寿司」**は江戸前の代表です。
[default]
<p><strong>「寿司」</strong>は江戸前の代表です。</p>
[aggressive]
<p><strong>「寿司」</strong>は江戸前の代表です。</p>
[compatible]
<p>**「寿司」**は江戸前の代表です。</p>
[markdown-it]
<p>**「寿司」**は江戸前の代表です。</p>

[case punctuation-in-sentence]
[markdown]
和食では**「だし」**が料理の土台です。
[default]
<p>和食では<strong>「だし」</strong>が料理の土台です。</p>
[aggressive]
<p>和食では<strong>「だし」</strong>が料理の土台です。</p>
[compatible]
<p>和食では**「だし」**が料理の土台です。</p>
[markdown-it]
<p>和食では**「だし」**が料理の土台です。</p>

[case mixed-japanese]
[markdown]
**味噌汁。**umami**という表現を使います。
[default]
<p><strong>味噌汁。</strong>umami**という表現を使います。</p>
[aggressive]
<p><strong>味噌汁。</strong>umami**という表現を使います。</p>
[compatible]
<p>**味噌汁。<strong>umami</strong>という表現を使います。</p>
[markdown-it]
<p>**味噌汁。<strong>umami</strong>という表現を使います。</p>

[case mixed-english]
[markdown]
**sushi.**umami**という書き方です。
[default]
<p>**sushi.<strong>umami</strong>という書き方です。</p>
[aggressive]
<p><strong>sushi.</strong>umami**という書き方です。</p>
[compatible]
<p>**sushi.<strong>umami</strong>という書き方です。</p>
[markdown-it]
<p>**sushi.<strong>umami</strong>という書き方です。</p>

[case mixed-english-two]
[markdown]
**sushi.**broth.**dashi**という並びです。
[default]
<p>**sushi.**broth.<strong>dashi</strong>という並びです。</p>
[aggressive]
<p><strong>sushi.</strong>broth.<strong>dashi</strong>という並びです。</p>
[compatible]
<p>**sushi.**broth.<strong>dashi</strong>という並びです。</p>
[markdown-it]
<p>**sushi.**broth.<strong>dashi</strong>という並びです。</p>

[case single-star-japanese-leading]
[markdown]
*味噌汁。*umai*
[default]
<p><em>味噌汁。</em>umai*</p>
[aggressive]
<p><em>味噌汁。</em>umai*</p>
[compatible]
<p>*味噌汁。<em>umai</em></p>
[markdown-it]
<p>*味噌汁。<em>umai</em></p>

[case single-star-japanese-leading-link]
[markdown]
[*味噌汁。*umai*]()
[default]
<p><a href=""><em>味噌汁。</em>umai*</a></p>
[aggressive]
<p><a href=""><em>味噌汁。</em>umai*</a></p>
[compatible]
<p><a href="">*味噌汁。<em>umai</em></a></p>
[markdown-it]
<p><a href="">*味噌汁。<em>umai</em></a></p>

[case single-star-punctuation-leading]
[markdown]
*。*umai*
[default]
<p><em>。</em>umai*</p>
[aggressive]
<p><em>。</em>umai*</p>
[compatible]
<p>*。<em>umai</em></p>
[markdown-it]
<p>*。<em>umai</em></p>

[case single-star-mixed-local-punctuation]
[markdown]
日本語 *A。*B*
[default]
<p>日本語 <em>A。</em>B*</p>
[aggressive]
<p>日本語 <em>A。</em>B*</p>
[compatible]
<p>日本語 *A。<em>B</em></p>
[markdown-it]
<p>日本語 *A。<em>B</em></p>

[case malformed-link-marker]
[markdown]
**[**[x](v)](u)**
[default]
<p><strong>[</strong><a href="v">x</a>](u)**</p>
[aggressive]
<p><strong>[</strong><a href="v">x</a>](u)**</p>
[compatible]
<p><strong>[</strong><a href="v">x</a>](u)**</p>
[markdown-it]
<p><strong>[</strong><a href="v">x</a>](u)**</p>

[case english-broken-tail]
[markdown]
broken **tail [aa**aa***Text***and*More*bb**bb](https://x.test) after
[default]
<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>and</em>More</em>bb**bb</a> after</p>
[aggressive]
<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><strong>and<em>More</em>bb</strong>bb</a> after</p>
[compatible]
<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>and</em>More</em>bb**bb</a> after</p>
[markdown-it]
<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>and</em>More</em>bb**bb</a> after</p>

[case link-english]
[markdown]
メニューではmenu**[ramen](url)**と書きます。
[default]
<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>
[aggressive]
<p>メニューではmenu<strong><a href="url">ramen</a></strong>と書きます。</p>
[compatible]
<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>
[markdown-it]
<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>

[case link-japanese]
[markdown]
説明文ではこれは**[寿司](url)**です。
[default]
<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>
[aggressive]
<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>
[compatible]
<p>説明文ではこれは**<a href="url">寿司</a>**です。</p>
[markdown-it]
<p>説明文ではこれは**<a href="url">寿司</a>**です。</p>

[case code-english]
[markdown]
注記では**aa`broth`**aaという記法を試します。
[default]
<p>注記では**aa<code>broth</code>**aaという記法を試します。</p>
[aggressive]
<p>注記では<strong>aa<code>broth</code></strong>aaという記法を試します。</p>
[compatible]
<p>注記では**aa<code>broth</code>**aaという記法を試します。</p>
[markdown-it]
<p>注記では**aa<code>broth</code>**aaという記法を試します。</p>

[case code-japanese]
[markdown]
説明ではこれは**`出汁`**です。
[default]
<p>説明ではこれは<strong><code>出汁</code></strong>です。</p>
[aggressive]
<p>説明ではこれは<strong><code>出汁</code></strong>です。</p>
[compatible]
<p>説明ではこれは**<code>出汁</code>**です。</p>
[markdown-it]
<p>説明ではこれは**<code>出汁</code>**です。</p>
