# 主な処理フロー

## ルール登録と基本方針
- エクスポートされる `mditStrongJa` は `strong_ja` インラインルールを `md.inline.ruler.before('emphasis')` に差し込み、markdown-it 標準の強調処理より前で日本語向け判定を実行する。
- 同期オプション `dollarMath`, `mditAttrs`, `mdBreaks`, `disallowMixed` を1か所でまとめ、`strongJa` 内全体に渡す。
- インライン処理の結果に collapsed reference もしくはインラインリンクの後処理が必要な場合のみ `registerPostProcessTarget` を呼び、`md.core.ruler.after('inline')` に登録した `strong_ja_postprocess` で対象段落を再訪する。

## インライン解析
1. **事前初期化**  
   - 段落先頭で `__strongJaBackslashCache` / `__strongJaRefRangeCache` / `__strongJaInlineLinkRangeCache` をクリアし、`state.__strongJaReferenceCount` と `state.__strongJaHasCollapsedRefs` を更新する。  
   - markdown-it-attrs の末尾 `{.class}` を検出した場合は `max` を調整し、インライン処理対象から除外する。
2. **参照範囲とインラインリンク範囲の検出**  
   - `computeReferenceRanges` が `[label][key]` / `[label][]` を高速に走査し、参照が定義済みの区間だけを `refRanges` に保存。`findRefRangeIndex` は `refRanges.__cache` と `__lastIndexState` でメモ化する。  
   - `computeInlineLinkRanges` は `[]()` のラベル/宛先ペアを抽出して `hasInlineLinkLabelCrossing` 判定に使う。
3. **文字列から `inlines` を構築 (`createInlines`)**  
   - 1文字ずつ走査し、`*` 連続列・バックティック・ドル記法・HTML タグを専用ロジックでグルーピング。  
   - バックスラッシュエスケープは `hasBackslash` の結果をキャッシュして二度目以降の判定を省く。  
   - HTML タグ検出時は `<tag>..</tag>` の範囲を `html_inline` として保持し、タグ名と open/close 種別を `tag` プロパティに記録する。
4. **強調/斜体マーク判定 (`createMarks`)**  
   - `setStrong` / `setEm` が `inlines` を走査しながら `pushMark` で `strong_*` / `em_*` マークを整列挿入。  
   - 参照ラベルやインラインリンクの区間を跨ぐ組み合わせはスキップし、日本語と英語が混在する場合は `disallowMixed` フラグや `REG_MARKDOWN_HTML` を使ってブロックする。  
   - HTML タグ内部やネスト状況は `checkInsideTags` と `createNestTracker` で管理し、壊れたネストを検出したら早期リターンする。  
   - 余りは `setText` が `text` マークへ落とし込む。
5. **最終トークン化 (`mergeInlinesAndMarks` → `setToken`)**  
   - `mergeInlinesAndMarks` でマーク列と `inlines` を統合したあと、`setToken` が `state.push` を通じて markdown-it の `Token` 列を生成する。  
   - 文字列トークンは `state.md.parseInline` を挟んで既存ルール（改行, `<br>`, コード, attrs など）を再利用し、`copyInlineTokenFields` で必要フィールドのみコピーする。  
   - `mditAttrs` 有効時は `**text** {.class}` のような属性トークンを検知し、`attrsIsText` フラグで空振りを避ける。  
   - インラインリンクのラベル文字列は `__strongJaInlineLabelSources` / `__strongJaInlineLabelIndex` に保存し、後段の再ラップ処理で消費する。

## collapsed reference / インラインリンク後処理
1. **ターゲット登録**  
   - `state.__strongJaHasCollapsedRefs` または `state.__strongJaHasInlineLinks` が真になった段落だけ `registerPostProcessTarget` に積み、`WeakSet` で重複登録を防ぐ。
2. **`strong_ja_postprocess` の中身**  
   - `convertInlineLinks` が `splitBracketToken` を利用しつつ `[label](dest)` 断片を `link_open/link_close` へ再構築し、必要に応じて `parseLinkDestination` / `parseLinkTitle` で URL・title を抽出する。  
   - `convertCollapsedReferenceLinks` は `[label][]` / `[label][key]` を `state.env.references` で引き当て、存在するキーだけをアンカーに置き換える。既に `link_open` がある場合は再利用し、未定義参照はそのまま残す。  
   - ラベルラップ中に壊れた強調マークがあった場合は `mergeBrokenMarksAroundLinks` が `*_close → link → *_open` パターンを掃除する。  
   - 後処理終了後に `__strongJaPostProcessTargets` / `__strongJaInlineLabelSources` などの作業用フラグを必ず破棄する。

## 最適化と補助関数
- `splitBracketToken` は必要なテキストトークンのみ分割するため、1段落全量をコピーせずに済む。`convertInlineLinks` / `convertCollapsedReferenceLinks` のどちらでも再利用する。
- 参照キー正規化は markdown-it 標準の `md.utils.normalizeReference` があればそれを使い、なければ大文字化＋空白圧縮で代替する。
- `normalizeReferenceCandidate` は collapsed reference のラベル内に含まれる `*` / `_` を取り除き、マークアップに影響されないキーを生成する。
- `hasBackslash` / `findRefRangeIndex` / `findInlineLinkRange` などのホットパスは `Map` や `__lastIndexState` を併用し、同じ位置を何度も走査しない。
- ベンチマークは `test/material/performance_compare.mjs` / `performance_final.mjs` で確認可能。

