# Example Evaluation Notes

この `example/` は、`mixed-ja-en-stars-mode.txt` を元に各モードの出力を比較し、  
「入力時の直感」と「出力の自然さ」を確認するためのディレクトリです。

## Files

- `mixed-ja-en-stars-mode.txt`: 比較用 Markdown ケース（現在 8 ケース）
- `render-mode-html.js`: 比較 HTML 生成スクリプト
- `mixed-ja-en-stars-mode.html`: 生成済み可視化結果
- `author-intent-cases.txt`: author-intent 付き自然さ確認コーパス（人手評価向け）
- `render-author-intent-html.js`: author-intent コーパスの比較 HTML 生成スクリプト
- `author-intent-cases.html`: 上記コーパスの生成済み可視化結果
- `render-inline-wrapper-matrix-html.js`: `* / **` と `inline code/link` の境界マトリクス可視化スクリプト
- `inline-wrapper-matrix.html`: 上記マトリクスの生成済み可視化結果
  - 注: `default(japanese)` は `japanese-boundary-guard` のエイリアスなので、重複表示を避けるため matrix 本体では省略

## How To Regenerate

```bash
node example/render-mode-html.js
node example/render-author-intent-html.js
node example/render-inline-wrapper-matrix-html.js
```

## 評価観点

- 互換性: `markdown-it` と同じ出力を維持できるか
- 出力の自然さ: 日本語文として読んだときに強調の境界が自然か
- 入出力の直感性: 入れた `*` / `**` に対して予想しやすい出力か
- 回復力: 壊れた入力でも強調をどれだけ救済できるか
- 安全性: 壊れ入力でタグ破綻を起こさないか（fail-safe）
- 可搬性: 他 plugin 併用時に壊れにくいか
- 速度: 修復経路での追加コストが小さいか

### このディレクトリでまだ弱い点

- `mixed-ja-en-stars-mode.*` の集計は `em` / `strong` / literal `*` の数と `markdown-it` 差分が中心で、「人間にとってどの出力が一番自然か」を直接ロックしてはいない
- そのため、回復量が多いモードと、執筆者意図に最も近いモードがズレるケースを定量化しづらい
- 特に `japanese-boundary-guard` の「過変換抑制」と、`japanese-boundary` / `aggressive` の「積極回復」の優劣は、ケースごとの author intent がないと判断しにくい

## author-intent corpus で確認したいこと

`author-intent-cases.*` は、単なるタグ数比較ではなく「この入力ではどのモードが一番自然か」を見るための補助コーパスです。

各ケースは次の情報を持ちます。

- `intent`: その入力で書き手が何を強調したかったか
- `preferred`: その意図に最も合うと考えるモード
- `acceptable`: 妥協可能なモード
- `focus`: そのケースで見たい論点
- `markdown`: 実際の入力

この corpus は現時点では **自動採点用ではなく、人手レビュー用** です。  
先にケースを育ててから、必要なら後段で簡易スコア化します。

## 現時点の author-intent 所見

現在の `author-intent-cases.txt` は 15 ケースです。

- `japanese-boundary-guard`: preferred `12`
- `japanese-boundary`: preferred `2`
- `compatible`: preferred `1`
- `aggressive`: preferred `0`

ここから読めること:

- **default としての `japanese-boundary-guard` はかなり強い**  
  user-facing な日本語/日英混在 prose では、過変換抑制と局所回復のバランスが良い
- ただし **universal best ではない**  
  `* English craft*` や `* \`umami\`*` のように、space-leading English/code を本当に強調したい意図では `japanese-boundary` の方が自然に見える
- pure-English malformed tail は、`compatible` / baseline 寄りの方が自然に見えるケースがある
- 現時点では **`japanese-boundary-guard` を置き換える明確な上位 mode は見えていない**  
  もし次に改善を狙うなら、default 置換よりも「space-leading English をどこまで許すか」の細い option/variant を考える方が筋が良い

この counts はまだ小さな curated corpus 上の結果であり、最終結論ではありません。  
ただし、**「default はかなり妥当だが、特定の author intent では保守的すぎる」** という傾向は、すでに十分見えています。

## 次に増やすべきケース

- 意図どおりに日本語語句だけを強調したいケース
- 日英混在で「英語側は強調したくない」ケース
- 逆に、日英混在でも英語語句を強調したいケース
- code/link/ref の外側に `*` / `**` を置いたケース
- 同一段落内で複数文にまたがるケース
- 単一 `*` の spillover を止めたいケース
- fail-safe を優先して literal `*` を残したいケース

補足:

- **同一段落内の複数文ケースは重要** です。`scanDelims` の前方/後方文脈や sentence-boundary stop、postprocess の局所修復がこの単位で効くためです
- 一方で、**段落をまたぐケースは優先度が下がります**。`markdown-it` の inline scope 自体が段落で切れるので、同じ意味での spillover は起きにくいです

## どう確認するか

おすすめの進め方は次の順です。

1. `author-intent-cases.txt` に「執筆者意図が明確なケース」を少数ずつ追加する  
2. `node example/render-author-intent-html.js` で全モードを並べて見る  
3. `preferred` / `acceptable` の指定が実際の見た目と合うかをレビューする  
4. 迷うケースは corpus から外さず、`acceptable` を広げて「どこが曖昧か」を明示する  
5. ケースが十分たまってから、はじめて mode default や guard 条件の見直しを考える

要するに、次に必要なのは「実装ロジックをすぐ大きく変えること」ではなく、  
**author-intent 付きのサンプルを増やして、自然さの判断材料を蓄積すること** です。

## モード仕様（実装上）

- `compatible`
  - `markdown-it` の delimiter 判定をそのまま使う
  - 日本語向け局所補助をしない
  - link/ref の postprocess 補正をしない
- `japanese-boundary`
  - baseline-first（`markdown-it` 判定を土台）
  - 日本語文脈がある `*` 近傍のみ局所補助
  - link/ref の postprocess 補正あり
- `japanese-boundary-guard`（`japanese` の実体）
  - `japanese-boundary` の仕様を含む
  - `* English*` など「半角スペース隣接 + ASCII 開始」の過変換を抑制
  - このガードは `*` 本数（`*`, `**`, `***`...）に依存せず適用
- `aggressive`
  - 先頭側の回復を最も積極化
  - link/ref の postprocess 補正あり
  - 回復量は増えるが過変換リスクも増える

## 現在の集計（このサンプル 8 ケース）

- `compatible`
  - `markdown-it` 一致: `8/8`
  - `em`: `56`, `strong`: `42`
  - literal `*`: `52`
- `japanese-boundary`
  - `markdown-it` 一致: `1/8`
  - `em`: `55`, `strong`: `47`
  - literal `*`: `34`
- `japanese-boundary-guard`
  - `markdown-it` 一致: `2/8`
  - `em`: `55`, `strong`: `47`
  - literal `*`: `34`
- `aggressive`
  - `markdown-it` 一致: `0/8`
  - `em`: `62`, `strong`: `48`
  - literal `*`: `16`

注記:

- この数字は **example corpus 限定** です。全体品質の絶対値ではなく、モード差の傾向をみる指標です。

## モード別評価

### compatible

- 強み:
  - 互換性が最も高い
  - 他 plugin との予測可能性が最も高い
- 弱み:
  - 日本語混在の壊れ入力を積極的には救済しない
  - literal `*` が残りやすい
- 向く用途:
  - 既存 Markdown 互換が最優先の環境

### japanese-boundary

- 強み:
  - 日本語文脈での強調補助が効きやすい
  - `aggressive` より過変換を抑えやすい
- 弱み:
  - 日英混在で、半角スペース隣接の ASCII 開始を強調しすぎることがある
- 向く用途:
  - 日本語主体で、回復力と保守性の中間を取りたい環境

### japanese-boundary-guard

- 強み:
  - `japanese-boundary` の補助は維持しつつ、混在文での過変換を抑える
  - 実運用のバランスが良い
- 弱み:
  - 入力者が「もっと積極回復」を期待すると弱く見えるケースがある
- 向く用途:
  - 日本語/日英混在の通常利用（デフォルト推奨）

### aggressive

- 強み:
  - 回復量が最大
  - literal `*` を最も減らせる
- 弱み:
  - 過変換リスクが最も高い
  - 文境界をまたぐ強調の違和感が出やすい
- 向く用途:
  - 壊れ入力をできるだけタグ化したいバッチ変換

## 現行の主な課題

- postprocess は strict token-only 化済み（runtime の reparse fallback なし）
- 未知の malformed 入力は fail-safe で非変換（壊すより残す）
- 自然さ評価はまだ `mixed-ja-en-stars-mode.*` の差分観察が中心で、author-intent corpus はこれから育てる段階
- 実装詳細は `docs/note-post-processing.md`、移行ログは `docs/note-post-processing-dev-log.md` を参照

## テストとの対応

- fail-safe 固定:
  - `test/post-processing/fail-safe-cases.txt`
  - `test/post-processing.test.js`
- token-only 進捗可視化:
  - `test/post-processing/token-only-regressions.txt`
  - `test/post-processing-progress.test.js`

進捗確認コマンド:

```bash
npm run test:postprocess
npm run test:tokenonly-progress
```
