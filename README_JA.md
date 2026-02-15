# p7d-markdown-it-strong-ja

`@peaceroad/markdown-it-strong-ja` は、日本語テキストにおける `*` / `**` 強調の扱いを拡張しつつ、通常の Markdown 挙動を可能な限り `markdown-it` に近づけるための `markdown-it` プラグインです。

## インストール

```bash
npm i @peaceroad/markdown-it-strong-ja
```

## クイックスタート

```js
import MarkdownIt from 'markdown-it'
import strongJa from '@peaceroad/markdown-it-strong-ja'

const md = MarkdownIt().use(strongJa)

md.render('和食では**「だし」**が料理の土台です。')
// <p>和食では<strong>「だし」</strong>が料理の土台です。</p>
```

## 対象範囲とモード

このプラグインは、アスタリスク系の `*` / `**` 強調記号を主対象にした拡張です。`markdown-it` のインライン仕様全体を置き換えるものではなく、強調が崩れやすい場面だけを補助する設計になっています。入力が大きく壊れている場合は、無理にタグを作らず、文字を残して HTML の破綻を避けます。

`_` / `__`（アンダースコア強調）は意図的に plain `markdown-it` 側へ委譲しています。strong-ja は `_` ランに独自の「開き/閉じ判定」補助を追加せず、`_` が多い壊れ入力は安全側（無理に再構成しない）で保守的に扱います。

モードは「どこまで積極的に補助するか」を選ぶための設定です。通常は `japanese` を使い、`markdown-it` と同じ挙動を優先したいときは `compatible`、先頭側の強調を積極的に拾いたいときだけ `aggressive` を選ぶと運用しやすくなります。

- `japanese` (default): `japanese-boundary-guard` のエイリアスです。日英混在文ではこの指定を推奨します。
- `japanese-boundary`: `markdown-it` 判定を土台にしつつ、日本語文脈がある `*` 近傍だけを局所的に補助するモードです。単一 `*` の日英混在ガードは入れません。リンク/参照リンクの postprocess 補正は有効です。ねらいは日本語補助（保守的）です。
- `japanese-boundary-guard`: `japanese-boundary` を土台に、`* English*`、`** "English"**`、`*** [English](u)***` のような「半角スペース隣接 + ASCII 開始」パターンを抑制するガードを追加したモードです。このガードは `*` の本数に依存せず（`*` 以上のランで一貫して）適用されます。リンク/参照リンクの postprocess 補正は有効です。ねらいは日本語補助+混在文安全寄りです。
- `aggressive`: `markdown-it` 判定よりも先頭側を拾う方向に寄せるモードです。日本語文脈の局所補助とリンク/参照リンクの postprocess 補正は有効です。ねらいは回復量最大です。
- `compatible`: `markdown-it` の強調記号の開閉判定をそのまま使います。strong-ja 独自の強調補助は無効で、postprocess 補正も実行しません。同一プラグイン構成で plain `markdown-it` と同じ出力を維持します。

### `japanese-boundary` / `japanese-boundary-guard` で共通して適用されること

次は両モードで共通です（`japanese` は `japanese-boundary-guard` のエイリアス）。

- `markdown-it` を土台にした baseline-first 判定
- 日本語文脈がある場合だけ行う局所補助（同一行近傍のみ）
- 単一 `*` の向き補正（壊れやすい入力での opener/closer 反転抑制）
- リンク/参照リンク近傍を「トークンだけ」で整える後処理（`compatible` を除く）
- 低信頼区間は無理に変換しない安全側の挙動（壊すより残す）

共通挙動の代表例:

- Input: `*味噌汁。*umai*`
- `japanese-boundary` / `japanese-boundary-guard`: `<p><em>味噌汁。</em>umai*</p>`

- Input: `説明文ではこれは**[寿司](url)**です。`
- `japanese-boundary` / `japanese-boundary-guard`: `<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>`

### `japanese-boundary-guard` だけで追加されること

`japanese-boundary-guard` は、日英混在で過変換が起きやすい並びに追加ガードを入れます。

- 対象: 半角スペース隣接 + ASCII 開始の区間（通常文字列 / 引用 / リンク / コード記法）
- 目的: `* English*` や `* \`English\`*` のような違和感のある変換を抑える
- 適用: `*` の本数に依存せず一貫適用（`*`, `**`, `***` ...）

差分の代表例:

- Input: `日本語です。* English* です。`
- `japanese-boundary`: `<p>日本語です。<em> English</em> です。</p>`
- `japanese-boundary-guard`: `<p>日本語です。* English* です。</p>`

- Input: `和食では* \`umami\`*を使う。`
- `japanese-boundary`: `<p>和食では<em> <code>umami</code></em>を使う。</p>`
- `japanese-boundary-guard`: `<p>和食では* <code>umami</code>*を使う。</p>`

### モード選択の実務目安

- 通常運用: `japanese`（=`japanese-boundary-guard`）
- markdown-it と同じ挙動維持: `compatible`
- 過変換リスクより回復量優先: `aggressive`
- guard を外したい限定用途: `japanese-boundary`

### サンプルコーパスの補足

詳細比較と追加ケースは次を参照してください。

- `example/README.md`
- `example/mixed-ja-en-stars-mode.html`
- `example/mixed-ja-en-stars-mode.txt`
- `example/inline-wrapper-matrix.html`

## `japanese`（`japanese-boundary-guard`）の判定フロー（Step by Step）

このセクションは、`mode: 'japanese'`（内部的には `japanese-boundary-guard`）で `*` / `**` を含む入力を処理するときの判断順を説明します。  
全体の流れは次の 3 段です。まず Step 1 で `markdown-it` の通常処理を土台にし、Step 2 から Step 8 で必要な `*` 区間だけ補助し、最後に Step 9 でリンク周辺の崩れだけを整えます。

- 開き側: 強調タグを開始する `*` / `**`
- 閉じ側: 強調タグを終了する `*` / `**`
- ラン (run): 連続した同じ記号のまとまり (`*`, `**`, `***` など)
- 行: `\n` で区切られる範囲

### Step 1: まず `markdown-it` の通常ペアリングで土台を作る

最初に `markdown-it` の通常処理が動きます。  
そのため、改行をまたぐ `**...**` など、`markdown-it` が通常解釈できるパターンは同じ土台トークンになります。

例:

- Input: `カツ**丼も\n人気**です`
- `markdown-it` / `japanese` / `compatible`: `<p>カツ<strong>丼も\n人気</strong>です</p>`

ここでの位置づけ:

- `mode: 'compatible'` は、実質この段階の結果をそのまま採用します（以降の strong-ja 補助は行いません）。
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive` は、この土台に対して Step 2 以降の補助を適用します。

### Step 2: Step 1 の結果に対して、`japanese` 補助判定を使うかを決める

Step 2 では、Step 1 でできた土台トークン列を「`*` ランごと」に見て、補助判定に入るかどうかを決めます。`japanese`（`japanese-boundary-guard`）でも全文を一律には補正しません。各ランの直前・直後の隣接文字（非空白）を確認し、どちらかに日本語文脈があるときだけ補助判定へ進みます。ここでいう日本語文脈は、主にひらがな・カタカナ・漢字・全角句読点/記号です。逆に、隣接が英数字中心で日本語文脈が弱いランは Step 1 の結果を維持します。

ここで確定する例:

- Input: `**sushi.**umami**`
- Output (`japanese`): `<p>**sushi.<strong>umami</strong></p>`
- 理由: 隣接文脈が英語寄りなので、日本語補助判定を使わず `markdown-it` 側の結果を使います。

次へ進む例:

- Input: `**味噌汁。**umami**`
- `。` など日本語文脈が隣接するため、補助判定経路へ進みます。

### Step 3: `markdown-it` が決めた向きは壊さない

`japanese` は `markdown-it` 判定を土台にします。すでに有効に解釈できている箇所を別方向へ強制的に上書きするのではなく、「そのままだと崩れやすい箇所」にだけ候補を補います。

ここで確定する例:

- Input: `*寿司*は人気です。`
- Output: `<p><em>寿司</em>は人気です。</p>`

次へ進む例:

- Input: `*味噌汁。*umai*`
- 先頭の `*` を文字で残すと後ろの `*` が先にペアになりやすく、`*味噌汁。<em>umai</em>` 側に寄りやすい入力です。`japanese` では日本語側を先に閉じられるかを次の局所判定で見ます。

### Step 4: 局所判定は「同じ行」の近傍だけを見る

補助判定で左右の文字を見るときは、同じ行にある非空白文字だけを使います。改行をまたいで前後をつないでは見ません。ここでの行は `\n` 区切り、段落は空行区切りです。補助判定は行単位ですが、最終的なトークンのペア組み立ては `markdown-it` の inline 処理全体で行われます。

ここで確定する例:

- Input: `*味噌汁。\n*umai*`
- Output (`japanese`): `<p>*味噌汁。\n<em>umai</em></p>`
- 理由: 先頭 `*` は改行先を近傍に含めないため、前半を閉じる方向には寄りません。

次へ進む例:

- Input: `*味噌汁。*umai*`
- 同じ行で日本語側と英語側が混在するため、次の単一 `*` 補正が効くケースです。

### Step 5（`japanese-boundary-guard` のみ）: 日英混在ガードで過変換を抑える

`japanese-boundary-guard` だけが持つ追加ステップです。半角スペース隣接 + ASCII 開始のセグメントでは、強調化を抑制して「英語断片だけが不自然に強調される」ケースを減らします。

ここで差が出る代表例:

- Input: `日本語です。* English* です。`
- `japanese-boundary`: `<p>日本語です。<em> English</em> です。</p>`
- `japanese-boundary-guard`: `<p>日本語です。* English* です。</p>`

- Input: `和食では* \`umami\`*を使う。`
- `japanese-boundary`: `<p>和食では<em> <code>umami</code></em>を使う。</p>`
- `japanese-boundary-guard`: `<p>和食では* <code>umami</code>*を使う。</p>`

### Step 6: 単一 `*` だけ向きを追加補正する

ここで行うのは「ラン長 1 の `*` だけに対する向き補正」です。単一 `*` は壊れた入力で向き誤判定が起きやすいため、同じ行の近傍文脈を使って開き側・閉じ側の候補を絞ります。`japanese-boundary` / `japanese-boundary-guard`（=`japanese`）と `aggressive` はこの補正が有効で、`compatible` は `markdown-it` 判定のままです。

ここで確定する例:

- Input: `*味噌汁。*umai*`
- `japanese` / `aggressive`: `<p><em>味噌汁。</em>umai*</p>`
- `compatible` / `markdown-it`: `<p>*味噌汁。<em>umai</em></p>`

次へ進む例:

- Input: `**味噌汁。**umami**`
- これは単一 `*` ではないため、Step 6 の補正対象外です。

このステップの補足ルール:

- 直前の単一 `*` をさかのぼって探すときは、文末記号（`。`、`！`、`？`、`.`, `!`, `?`, `‼`, `⁇`, `⁈`, `⁉`）で探索を止めます（ただし、現在の `*` に隣接する記号は除く）。
- これにより、前の文の壊れた `*` が次の文の単一 `*` 判定へ過剰に影響することを抑えます。

### Step 7: `**` 以上は Step 6 の単一 `*` 補正を使わない

このステップは「`**` 以上を何もしない」という意味ではありません。`**` 以上のすべてのラン（`***`、`****`、`*****` 以上を含む）でも、`markdown-it` の通常判定と `japanese` の基本緩和は使われます。ここで外しているのは、Step 6 の「単一 `*` 専用の追加補正」だけです。`**` 以上まで同じ補正を広げると `japanese` が `compatible` 側へ寄りすぎ、日本語寄りに拾いたいケースが落ちやすくなるためです。

ここで確定する例:

- Input: `**味噌汁。**umami**という表現を使います。`
- `japanese`: `<p><strong>味噌汁。</strong>umami**という表現を使います。</p>`
- `compatible`: `<p>**味噌汁。<strong>umami</strong>という表現を使います。</p>`

### Step 8: 最後に通常ペア処理でタグ化し、無理なら文字として残す

向き候補が決まったあとは、inline の通常ペア処理で最終トークン列を組み立てます。タグを無理に作ると壊れる入力では、`*` / `**` を文字として残して破綻を避けます。

ここで確定する例:

- Input: `**[**[x](v)](u)**`
- Output: `<p><strong>[</strong><a href="v">x</a>](u)**</p>`

### Step 9: その後、リンク周辺だけ後処理で整える

Step 2 から Step 8 は、強調記号の向きを決める段階です。Step 9 はその後段で、すでにできている inline トークン列に対してリンク周辺の崩れを補正します。強調判定とリンク補正は、実装上は別フェーズとして動いています。

#### Step 9-1: collapsed reference の照合を `markdown-it` 方式に合わせる

##### 9-1A: `[label][]` の照合

`[label][]` のラベル照合は `markdown-it` の正規化に合わせています。`*` や `**` を勝手に消して照合を通すことはしません。つまり、見た目上似ていてもラベル文字列が一致しない場合はリンク化されません。

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

##### 9-1B: インラインリンク（`[text](url)`）の扱い

- `[text](url)` は collapsed reference のような「ラベル照合」自体は行いません。
- postprocess で行うのは、リンク内外にある `*` / `**` をトークン列のまま再配置する補正です。
- そのため、`*` / `**` を消して照合を通すような挙動はありません。

例:

- Input: `メニューではmenu**[ramen](url)**と書きます。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard`: `<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>`
- `aggressive`: `<p>メニューではmenu<strong><a href="url">ramen</a></strong>と書きます。</p>`
- `compatible` / `markdown-it`: `<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>`

- Input: `説明文ではこれは**[寿司](url)**です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>`
- `compatible` / `markdown-it`: `<p>説明文ではこれは**<a href="url">寿司</a>**です。</p>`

##### 9-1C: インラインコード / 記号列の扱い

- Input: `昼食は**\`code\`**の話です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>昼食は<strong><code>code</code></strong>の話です。</p>`
- `compatible` / `markdown-it`: `<p>昼食は**<code>code</code>**の話です。</p>`

- Input: `注記では**aa\`stock\`**aaという記法を試します。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `compatible` / `markdown-it`: `<p>注記では**aa<code>stock</code>**aaという記法を試します。</p>`
- `aggressive`: `<p>注記では<strong>aa<code>stock</code></strong>aaという記法を試します。</p>`

- Input: `お店の場所は**{}()**です。`
- `japanese` / `japanese-boundary` / `japanese-boundary-guard` / `aggressive`: `<p>お店の場所は<strong>{}()</strong>です。</p>`
- `compatible` / `markdown-it`: `<p>お店の場所は**{}()**です。</p>`

#### Step 9-2: モードごとの後処理挙動

Step 9 では、リンクや参照リンクの周辺で崩れた強調記号を整える「後処理」を行います（オプション名は `postprocess` です）。

- 実行する mode: `japanese-boundary` / `japanese-boundary-guard`（=`japanese`）/ `aggressive`
- 実行しない mode: `compatible`（`markdown-it` 互換を優先）

後処理が主に扱うのは、リンク/参照リンク近傍の `*` / `**` 崩れです。  
ただし、インラインコード（`` `...` ``）やインライン HTML、画像/自動リンクなどをまたぐ区間は壊しやすいため、無理に直さずそのまま保持します。

#### Step 9-3: なぜ後処理はスキップや正規化を行うのか

後処理は「変換量を最大化する」より「壊れた HTML を作らない」を優先します。  
そのため、直せる見込みが高いときだけ変換し、迷うときは文字を残します。

変換を見送る代表例:

- `*` があっても、同じ区間にリンク/参照リンクの崩れ手がかりが弱い
  - 例: `メニューではmenu**[ramen](url)**と書きます。`
  - `japanese`: `<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>`
  - 補足: リンクはあっても、英字隣接の境界で強制補正すると過変換になりやすいため、後処理は保守側を選びます。
- `***` ノイズが混在し、どこをタグ化すべきか曖昧
  - 例: `broken **tail [aa**aa***Text***and*More*bb**bb](https://x.test) after`
  - `japanese`: `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>and</em>More</em>bb**bb</a> after</p>`
  - 補足: `***` などのノイズが混ざる並びは境界誤判定を起こしやすく、無理にまとめて直すと崩れやすいため、保守的に残します。さらにこの例は英語-only で日本語文脈がないため、`japanese` モードではリンク tail 補正を積極適用しません（`aggressive` はより多く補正します）。
  - 対比（日本語文脈あり）: `broken **tail [aa**aa***Text***と*More*bb**bb](https://x.test) after`
  - `japanese` / `aggressive`: `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><strong>と<em>More</em>bb</strong>bb</a> after</p>`
  - `compatible`: `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>と</em>More</em>bb**bb</a> after</p>`
- `_` / `__` 強調が壊れ区間に混在し、`*` 系の安全補正条件を満たしにくい
  - 例: `崩れ **参照_ラベル_[ref と [x](v) の組み合わせ**`
  - `japanese`: `<p>崩れ <strong>参照_ラベル_[ref と <a href="v">x</a> の組み合わせ</strong></p>`
  - 補足: strong-ja は `_` 系を積極補正対象にしていないため、この種の区間は後処理で無理に再配置せず、`markdown-it` が作った構造を維持します（`postprocess:false` と同一出力）。
- インラインコードや HTML など、意味を壊しやすい要素をまたぐ
  - 例: `注記では**aa\`stock\`***tail*です。`
  - `japanese` / `compatible`: `<p>注記では**aa<code>stock</code>**<em>tail</em>です。</p>`
  - 補足: `**` の内側に英字（`aa`）とインラインコード（`` `stock` ``）が隣接し、さらに後続に `*tail*` が続くため、`**` を無理に `<strong>` 化すると範囲誤判定を起こしやすい並びです。
- 安全に直せる既知パターンに一致せず、強制変換すると壊れる可能性がある
  - 例: `**[**[x](v)](u)**`
  - `japanese`: `<p><strong>[</strong><a href="v">x</a>](u)**</p>`
  - 補足: 壊れ方が既知の安全補正パターンに合わない場合は、壊れた HTML を避けるため積極変換を行いません。

補足（「HTML を作らない」場合の見え方）:  
後処理が「この区間は直さない」と判断した場合、その区間では新しい強調タグを無理に作りません。結果として、少なくとも Step 9（後処理）由来の差分は増えず、`markdown-it` が作った構造に近い形を維持します（多くのケースで `postprocess:false` と同形）。

一方、変換に成功した場合でも、表示結果が同じ範囲でトークンの並びは正規化されることがあります。  
たとえば `[` / `]` / `[]` が別々の text token（文字トークン）に分割されることがあります。現在の実装は「文字列に戻して再解析しない」方式で、実行時に inline 再パースは行いません。

例（見た目は同じだが内部トークンが正規化される）:

- Input:
  ```markdown
  献立は「[**寿司**][]」です。

  [寿司]: https://example.com/
  ```
- Output:
  ```html
  <p>献立は「[<strong>寿司</strong>][]」です。</p>
  ```
- 説明: 出力 HTML は同じでも、内部では `[` / `]` / `[]` が扱いやすい単位に分割されることがあります（見た目上の差はありません）。

要点: 曖昧で壊れた入力では、「変換量の多さ」より「安全で読みやすい出力」を優先します。

## 挙動例

代表ケースのみを掲載しています（完全一覧は `test/readme-mode.txt`）。

補助資料:

- `example/inline-wrapper-matrix.html`
- `example/mixed-ja-en-stars-mode.html`

### 1) 日本語句読点の基本ケース

- Input: `**「だし」**は和食の基本です。`
- `japanese` / `aggressive`: `<p><strong>「だし」</strong>は和食の基本です。</p>`
- `compatible` / `markdown-it`: `<p>**「だし」**は和食の基本です。</p>`

### 2) 混在文でのモード差

- Input: `**天ぷら。**crunch**という表現を使います。`
- `japanese` / `aggressive`: `<p><strong>天ぷら。</strong>crunch**という表現を使います。</p>`
- `compatible` / `markdown-it`: `<p>**天ぷら。<strong>crunch</strong>という表現を使います。</p>`

- Input: `日本語です。* English* です。`
- `japanese-boundary`: `<p>日本語です。<em> English</em> です。</p>`
- `japanese-boundary-guard` / `compatible`: `<p>日本語です。* English* です。</p>`

### 3) 壊れ入力での安全優先

- Input: `**[**[x](v)](u)**`
- All modes: `<p><strong>[</strong><a href="v">x</a>](u)**</p>`

- Input: `注記では**aa\`stock\`***tail*です。`
- `japanese` / `compatible`: `<p>注記では**aa<code>stock</code>**<em>tail</em>です。</p>`
- 低信頼区間なので `**` を無理にタグ化しない

### 4) インラインリンク / インラインコード近傍

- Input: `説明文ではこれは**[ラーメン](url)**です。`
- `japanese` / `aggressive`: `<p>説明文ではこれは<strong><a href="url">ラーメン</a></strong>です。</p>`
- `compatible` / `markdown-it`: `<p>説明文ではこれは**<a href="url">ラーメン</a>**です。</p>`

- Input: `注記では**aa\`stock\`**aaという記法を試します。`
- `japanese` / `compatible` / `markdown-it`: `<p>注記では**aa<code>stock</code>**aaという記法を試します。</p>`
- `aggressive`: `<p>注記では<strong>aa<code>stock</code></strong>aaという記法を試します。</p>`

### 5) 英語のみの壊れ tail（`aggressive` 差分）

- Input: `broken **tail [aa**aa***Text***and*More*bb**bb](https://x.test) after`
- `japanese` / `compatible` / `markdown-it`:  
  `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>and</em>More</em>bb**bb</a> after</p>`
- `aggressive`:  
  `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><strong>and<em>More</em>bb</strong>bb</a> after</p>`

## オプション

### `mode`

- Type: `'japanese' | 'japanese-boundary' | 'japanese-boundary-guard' | 'aggressive' | 'compatible'`
- Default: `'japanese'`

### `mditAttrs`

- Type: `boolean`
- Default: `true`
- `markdown-it-attrs` を使わない構成では `false` にしてください。

### `postprocess`

- Type: `boolean`
- Default: `true`
- `false` にするとリンク/参照リンクの後処理補正を無効化します。
- `mode: 'compatible'` では `true` でも補正は実行しません。

### `coreRulesBeforePostprocess`

- Type: `string[]`
- Default: `[]`
- `strong_ja_token_postprocess` より前に置きたい core rule 名を指定します。

### `patchCorePush`

- Type: `boolean`
- Default: `true`
- `mditAttrs: false` かつ後から `cjk_breaks` が追加される構成で、rule 順序の崩れを抑える補助フックです。

### `markdown-it` の `breaks` 設定について

`breaks` 自体の ON/OFF は `markdown-it` が管理します。このプラグインは `md.options.breaks` を上書きしません。ただし、`cjk_breaks` 併用時の互換処理で softbreak 関連トークンを補正するため、結果として改行表示に影響が出るケースはあります。

## 補足

- レンダー単位でオプションを上書きしたい場合は `state.env.__strongJaTokenOpt` を使います。
- 上書きは plugin オプションとマージされますが、rule 登録順など setup 時点で確定する挙動はレンダー時に切り替えできません。
- このプラグインは ESM（`type: module`）です。Node.js / browser bundler / VS Code extension など、`markdown-it` ESM を使うパイプラインで利用できます。
- `scanDelims` patch は同一プロセス内で `MarkdownIt` prototype ごとに 1 回だけ適用されます。
