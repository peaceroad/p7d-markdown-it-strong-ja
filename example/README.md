# Example Evaluation Notes

この `example/` は、`mixed-ja-en-stars-mode.txt` を元に各モードの出力を比較し、  
「入力時の直感」と「出力の自然さ」を確認するためのディレクトリです。

## Files

- `mixed-ja-en-stars-mode.txt`: 比較用 Markdown ケース（現在 8 ケース）
- `render-mode-html.js`: 比較 HTML 生成スクリプト
- `mixed-ja-en-stars-mode.html`: 生成済み可視化結果
- `render-inline-wrapper-matrix-html.js`: `* / **` と `inline code/link` の境界マトリクス可視化スクリプト
- `inline-wrapper-matrix.html`: 上記マトリクスの生成済み可視化結果
  - 注: `default(japanese)` は `japanese-boundary-guard` のエイリアスなので、重複表示を避けるため matrix 本体では省略

## How To Regenerate

```bash
node example/render-mode-html.js
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
