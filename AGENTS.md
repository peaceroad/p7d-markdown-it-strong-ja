## 主な処理フロー

### インライン解析
1. `computeReferenceRanges`  
   - `state.src` を走査して `[label][key]` のペアを検出。参照定義 (`state.env.references`) が存在する範囲だけを `refRanges` に格納し、`findRefRangeIndex` 用のキャッシュ (`__cache`) を付与する。
2. `createInlines → createMarks`  
   - `createInlines` が原文を1文字ずつ解析して `inlines` 配列を構築。  
   - `setStrong` / `setEm` は `refRanges` を参照しながら `*` のペアを判定し、`pushMark` で `strong_open/close`, `em_open/close` を挿入。  
   - 余ったテキストは `setText` が `text` マークを追加する。
3. `mergeInlinesAndMarks → setToken`  
   - `mergeInlinesAndMarks` で `inlines` と `marks` を統合。  
   - `setToken` が `state.push` を呼び、`state.md.parseInline` の子トークンから必要なフィールドのみ (`copyInlineTokenFields`) をコピーして最終的な `Token` 列を作る。

### collapsed reference 後処理
1. `inlineHasCollapsedRef / registerCollapsedRefTarget`  
   - `computeReferenceRanges` の結果を使って collapsed reference の有無を判定し、対象段落 (`state.tokens`) を `state.env.__strongJaCollapsedTargets` に保存する。
2. `convertCollapsedReferenceLinks`  
   - 必要なテキストトークンだけ `splitBracketToken` で `[`/`]` 単位に分割。  
   - `[label][]` / `[label][key]` / 既存 `link_open` を判定し、参照定義がある場合のみ `link_open/link_close` を挿入。未定義参照は変更しない。
3. `mergeBrokenMarksAroundLinks`  
   - `*_close → link → *_open` など、リンク周辺で壊れたマークを線形走査で整理する。

## アーキテクチャ概要

- `strongJa` を `md.inline.ruler.before('emphasis')` に挿入し、markdown-it 標準の強調処理より先に日本語向けロジックを適用する。
- collapsed reference の後処理は `md.core.ruler.after('inline')` で行い、`state.env.__strongJaCollapsedTargets` に登録された段落のみを再走査する。
- `findRefRangeIndex` は `refRanges.__cache` を使ってメモ化し、同じ位置の参照判定を繰り返さないようにしている。

## 最適化の現状

- `splitBracketToken` によってテキスト分割が局所化され、`convertCollapsedReferenceLinks` 冒頭で全トークンを分解する必要がなくなった。
- `copyInlineTokenFields` は存在するプロパティだけをコピーするよう最適化し、余計な代入を減らしている。
- ベンチマーク (`test/material/performance_compare.mjs`) で取れる。

