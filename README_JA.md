# p7d-markdown-it-strong-ja

`@peaceroad/markdown-it-strong-ja` is a `markdown-it` plugin that extends `*` / `**` emphasis handling for Japanese text while keeping regular Markdown behavior as close to `markdown-it` as possible.

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

このプラグインは、`*` / `**` の強調記号を主対象にした拡張です。`markdown-it` のインライン仕様全体を置き換えるものではなく、強調が崩れやすい場面だけを補助する設計になっています。入力が大きく壊れている場合は、無理にタグを作らず、文字を残して HTML の破綻を避けます。

モードは「どこまで積極的に補助するか」を選ぶための設定です。通常は `japanese` を使い、`markdown-it` と同じ挙動を優先したいときは `compatible`、先頭側の強調を積極的に拾いたいときだけ `aggressive` を選ぶと運用しやすくなります。

- `japanese` (default): `markdown-it` の判定を土台にしつつ、日本語の近傍文脈がある箇所だけ補助します。英語だけの壊れた tail では `markdown-it` 寄りの結果を優先します。
- `aggressive`: 先頭側の `**` を開きとして拾う方向へ寄せます。
- `compatible`: `markdown-it` 出力を優先し、postprocess 補正も行いません。

## How `japanese` Decides (Step by Step)

このセクションは、`mode: 'japanese'` の処理順に沿って説明します。用語は次の意味で使います。

- 開き側: 強調タグを開始する `*` / `**`
- 閉じ側: 強調タグを終了する `*` / `**`
- ラン (run): 連続した同じ記号のまとまり (`*`, `**`, `***` など)
- 行: `\n` で区切られる範囲

### Step 0: `japanese` 補助判定を使うかを決める

`japanese` でも、すべての `*` を補助しません。対象 `*` の左右にある隣接文字を見て、日本語文脈があるときだけ補助判定へ進みます。ここで主に見ているのは、ひらがな・カタカナ・漢字・全角の句読点や記号です。つまり、日本語中心の文脈判定であり、全言語を同じ基準で広く判定する方式ではありません。

ここで確定する例:

- Input: `**sushi.**umami**`
- Output (`japanese`): `<p>**sushi.<strong>umami</strong></p>`
- 理由: 隣接文脈が英語寄りなので、日本語補助判定を使わず `markdown-it` 側の結果を使います。

次へ進む例:

- Input: `**味噌汁。**umami**`
- `。` など日本語文脈が隣接するため、補助判定経路へ進みます。

### Step 1: `markdown-it` が決めた向きは壊さない

`japanese` は `markdown-it` 判定を土台にします。すでに有効に解釈できている箇所を別方向へ強制的に上書きするのではなく、「そのままだと崩れやすい箇所」にだけ候補を補います。

ここで確定する例:

- Input: `*寿司*は人気です。`
- Output: `<p><em>寿司</em>は人気です。</p>`

次へ進む例:

- Input: `*味噌汁。*umai*`
- 先頭の `*` を文字で残すと後ろの `*` が先にペアになりやすく、`*味噌汁。<em>umai</em>` 側に寄りやすい入力です。`japanese` では日本語側を先に閉じられるかを次の局所判定で見ます。

### Step 2: 局所判定は「同じ行」の近傍だけを見る

補助判定で左右の文字を見るときは、同じ行にある非空白文字だけを使います。改行をまたいで前後をつないでは見ません。ここでの行は `\n` 区切り、段落は空行区切りです。補助判定は行単位ですが、最終的なトークンのペア組み立ては `markdown-it` の inline 処理全体で行われます。

ここで確定する例:

- Input: `*味噌汁。\n*umai*`
- Output (`japanese`): `<p>*味噌汁。\n<em>umai</em></p>`
- 理由: 先頭 `*` は改行先を近傍に含めないため、前半を閉じる方向には寄りません。

次へ進む例:

- Input: `*味噌汁。*umai*`
- 同じ行で日本語側と英語側が混在するため、次の単一 `*` 補正が効くケースです。

### Step 3: 単一 `*` だけ向きを追加補正する

ここで行うのは「ラン長 1 の `*` だけに対する向き補正」です。単一 `*` は壊れた入力で向き誤判定が起きやすいため、同じ行の近傍文脈を使って開き側・閉じ側の候補を絞ります。`japanese` と `aggressive` はこの補正が有効で、`compatible` は `markdown-it` 判定のままです。

ここで確定する例:

- Input: `*味噌汁。*umai*`
- `japanese` / `aggressive`: `<p><em>味噌汁。</em>umai*</p>`
- `compatible` / `markdown-it`: `<p>*味噌汁。<em>umai</em></p>`

次へ進む例:

- Input: `**味噌汁。**umami**`
- これは単一 `*` ではないため、Step 3 の補正対象外です。

### Step 4: `**` 以上は Step 3 の単一 `*` 補正を使わない

このステップは「`**` 以上を何もしない」という意味ではありません。`**` / `***` / `****` でも、`markdown-it` の通常判定と `japanese` の基本緩和は使われます。ここで外しているのは、Step 3 の「単一 `*` 専用の追加補正」だけです。`**` 以上まで同じ補正を広げると `japanese` が `compatible` 側へ寄りすぎ、日本語寄りに拾いたいケースが落ちやすくなるためです。

ここで確定する例:

- Input: `**味噌汁。**umami**という表現を使います。`
- `japanese`: `<p><strong>味噌汁。</strong>umami**という表現を使います。</p>`
- `compatible`: `<p>**味噌汁。<strong>umami</strong>という表現を使います。</p>`

### Step 5: 最後に通常ペア処理でタグ化し、無理なら文字として残す

向き候補が決まったあとは、inline の通常ペア処理で最終トークン列を組み立てます。タグを無理に作ると壊れる入力では、`*` / `**` を文字として残して破綻を避けます。

ここで確定する例:

- Input: `**[**[x](v)](u)**`
- Output: `<p><strong>[</strong><a href="v">x</a>](u)**</p>`

### Step 6: その後、リンク周辺だけ後処理で整える

Step 0 から Step 5 は、強調記号の向きを決める段階です。Step 6 はその後段で、すでにできている inline トークン列に対してリンク周辺の崩れを補正します。強調判定とリンク補正は、実装上は別フェーズとして動いています。

#### Step 6-1: collapsed reference の照合は `markdown-it` 方式に合わせる

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

#### Step 6-2: mode ごとの postprocess 挙動

`japanese` と `aggressive` では、リンク周辺の壊れや collapsed reference の崩れを postprocess で補正します。`compatible` は互換優先のため、この補正を意図的にスキップし、通常の `markdown-it` 出力を保ちます。

#### Step 6-3: なぜ postprocess がスキップや正規化を行うのか

postprocess は「どんな入力でも無理にタグ化する」設計ではありません。最優先は壊れた HTML を作らないことです。そのため、直すべき記号が見当たらない区間、区間境界が安全に決められない区間、再解釈に失敗した区間では、既存トークンを保持して危険な書き換えを避けます。

書き換えが成功した場合でも、再構成の過程でテキスト表現が等価な形に正規化されることがあります。たとえば link title のエスケープ表現や改行表現が Markdown 等価な別表現になることがあります。`meta` を持つトークンや、`href` / `title` 以外の属性を持つリンクトークンはプレースホルダー退避して復元するため、破壊的に組み直さないようにしています。プレースホルダー文字列が本文と衝突した場合は、別マーカーを最大 16 回まで再生成して衝突回避を試みます。

要点としては、曖昧で壊れた入力に対して「変換量の多さ」より「安全で読みやすい出力」を優先します。

## Behavior Examples

These examples are synchronized with `test/readme-mode.txt`.

### Punctuation with Japanese text

日本語の全角記号を含む通常入力で、`japanese` / `aggressive` が強調を拾うケースです。

- Input: `**「だし」**は和食の基本です。`
- `japanese` / `aggressive`: `<p><strong>「だし」</strong>は和食の基本です。</p>`
- `compatible` / `markdown-it`: `<p>**「だし」**は和食の基本です。</p>`

### Mixed Japanese and English

日本語側を優先して閉じたいケースと、`compatible` が `markdown-it` に合わせる差分が出るケースです。

- Input: `**天ぷら。**crunch**という表現を使います。`
- `japanese` / `aggressive`: `<p><strong>天ぷら。</strong>crunch**という表現を使います。</p>`
- `compatible` / `markdown-it`: `<p>**天ぷら。<strong>crunch</strong>という表現を使います。</p>`

### Single-star edge case in plain text

単一 `*` の向き補正が効く典型例です。

- Input: `*うどん。*chewy*`
- `japanese` / `aggressive`: `<p><em>うどん。</em>chewy*</p>`
- `compatible` / `markdown-it`: `<p>*うどん。<em>chewy</em></p>`

- Input: `日本語 *A。*B*`
- `japanese` / `aggressive`: `<p>日本語 <em>A。</em>B*</p>`
- `compatible` / `markdown-it`: `<p>日本語 *A。<em>B</em></p>`

### Single-star edge case inside link label

リンクラベル内でも、単一 `*` の局所判定が plain text と同じ考え方で働きます。

- Input: `[*天丼。*crispy*]()`
- `japanese` / `aggressive`: `<p><a href=""><em>天丼。</em>crispy*</a></p>`
- `compatible` / `markdown-it`: `<p><a href="">*天丼。<em>crispy</em></a></p>`

### Malformed link marker sequence

壊れたリンク記号列では、無理なタグ化より壊れ回避を優先する例です。

- Input: `**[**[x](v)](u)**`
- All modes: `<p><strong>[</strong><a href="v">x</a>](u)**</p>`

### Pure-English malformed tail

英語だけの壊れ tail で、`japanese` が `markdown-it` 寄りの結果を維持する例です。

- Input: `broken **tail [aa**aa***Text***and*More*bb**bb](https://x.test) after`
- `japanese` / `compatible` / `markdown-it`:  
  `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><em><em>and</em>More</em>bb**bb</a> after</p>`
- `aggressive`:  
  `<p>broken **tail <a href="https://x.test">aa<strong>aa</strong><em>Text</em><strong>and<em>More</em>bb</strong>bb</a> after</p>`

### Link and code near emphasis

リンクやインラインコードを含むケースで、mode に応じた差分が出る例です。

- Input: `説明文ではこれは**[ラーメン](url)**です。`
- `japanese` / `aggressive`: `<p>説明文ではこれは<strong><a href="url">ラーメン</a></strong>です。</p>`
- `compatible` / `markdown-it`: `<p>説明文ではこれは**<a href="url">ラーメン</a>**です。</p>`

- Input: `注記では**aa\`stock\`**aaという記法を試します。`
- `japanese` / `compatible` / `markdown-it`: `<p>注記では**aa<code>stock</code>**aaという記法を試します。</p>`
- `aggressive`: `<p>注記では<strong>aa<code>stock</code></strong>aaという記法を試します。</p>`

## Options

### `mode`

- Type: `'japanese' | 'japanese-only' | 'aggressive' | 'compatible'`
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

## Per-render Override

レンダー単位でオプションを上書きしたい場合は `state.env.__strongJaTokenOpt` を使います。ここでの上書きは plugin オプションとマージされますが、rule 登録順など setup 時点で確定する挙動はレンダー時には変更できません。

## Runtime and Integration Notes

- ESM plugin (`type: module`)
- Node.js / browser bundler / VS Code extension など、`markdown-it` ESM を使うパイプラインで利用できます
- `scanDelims` patch は同一プロセス内で `MarkdownIt` prototype ごとに 1 回だけ適用されます
