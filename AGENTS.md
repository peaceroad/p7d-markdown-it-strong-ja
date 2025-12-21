# 主な処理フロー

## ルール登録と基本方針
- エクスポートされる `mditStrongJa` は `strong_ja` インラインルールを `md.inline.ruler.before('emphasis')` に差し込み、markdown-it 標準の強調処理より前で日本語向け判定を実行する。
- 同期オプション `dollarMath`, `mditAttrs`, `mdBreaks`, `disallowMixed`, `coreRulesBeforePostprocess` を1か所でまとめ、`strongJa` 内全体に渡す。
- `coreRulesBeforePostprocess` は `Set` で正規化し、`strong_ja_postprocess` より前に来るよう `moveRuleBefore` で一度だけ再配置する。
- collapsed reference / インラインリンクの後処理が必要な段落のみ `registerPostProcessTarget` を呼び、`md.core.ruler.after('inline')` に登録した `strong_ja_postprocess` で再訪する（`__strongJaPostProcessRegistered` で多重登録を抑止）。

## インライン解析
1. **事前初期化**
   - 段落先頭で `__strongJaBackslashCache` / `__strongJaHasBackslash` / `__strongJaRefRangeCache` / `__strongJaInlineLinkRangeCache` をクリアする。
   - `state.__strongJaReferenceCount` を必要時に計算する。
   - markdown-it-attrs が有効で、かつプラグインが登録済みのときだけ末尾 `{.class}` を検出し、`max` を調整してインライン処理対象から除外する。
   - collapsed ref の簡易検出は `[` がある場合のみ正規表現を走らせる。
2. **参照範囲とインラインリンク範囲の検出**
   - `state.__strongJaReferenceCount` が 0 の場合は参照定義が無いと見なし、`computeReferenceRanges` をスキップする。
   - `computeReferenceRanges` は `indexOf('[')` と `findMatchingBracket` で走査し、参照が定義済みの区間だけを `refRanges` に保存する。`findRefRangeIndex` は `__lastIndexState` で連続参照をメモ化する。
   - インラインリンクは `']('` 候補がある場合のみ `computeInlineLinkRanges` を呼び、ラベル/宛先ペアを抽出して `hasInlineLinkLabelCrossing` 判定に使う。`findInlineLinkRange` は範囲が大きい場合のみ Map キャッシュを使う。
3. **文字列から `inlines` を構築 (`createInlines`)**
   - ASCII 半角記号の候補位置へジャンプしつつ走査し、`*` 連続列・バックティック・ドル記法・HTML タグを専用ロジックでグルーピングする。
   - バックスラッシュは `__strongJaHasBackslash` で有無を判定し、必要な位置だけ `hasBackslash` で判定する。
   - HTML タグ検出時は `indexOf('>')` で閉じタグ候補を探し、`html_inline` として保持しつつタグ名と open/close 種別を `tag` に記録する。
4. **強調/斜体マーク判定 (`createMarks`)**
   - `setStrong` / `setEm` が `inlines` を走査しながら `pushMark` で `strong_*` / `em_*` マークを整列挿入する。`pushMark` は既にソート済みなら末尾に追加する。
   - 参照ラベルやインラインリンクの区間を跨ぐ組み合わせはスキップする。
   - `disallowMixed` の場合は `shouldBlockMixedLanguage` と `hasMarkdownHtmlPattern` で英数混在を判定する（先頭/末尾の文字で早期リターン）。
   - `setEm` は HTML タグ内部のネストを `checkInsideTags` / `htmlTagDepth` で管理し、壊れたネストを検出したら早期リターンする。
   - 余りは `setText` が `text` マークへ落とし込む。
5. **最終トークン化 (`mergeInlinesAndMarks` → `setToken`)**
   - `mergeInlinesAndMarks` でマーク列と `inlines` を統合したあと、`setToken` が `state.push` を通じて markdown-it の `Token` 列を生成する。
   - ASCII 半角記号・改行・バックスラッシュを含まない純テキストは `text` トークンを直接 push し、それ以外は `state.md.parseInline` で既存ルール（改行, `<br>`, コード, attrs など）を再利用する。
   - `mditAttrs` 有効時は `**text** {.class}` のような属性トークンを検知し、`parseInline` を避けて `text` として押し出す（attrs 文字列のエスケープを復元する）。
   - インラインリンクのラベル文字列は `__strongJaInlineLabelSources` / `__strongJaInlineLabelIndex` に保存し、後段の再ラップ処理で消費する。

## collapsed reference / インラインリンク後処理
1. **ターゲット登録**
   - `__strongJaHasCollapsedRefs` または `__strongJaHasInlineLinks` が真になった段落だけ `registerPostProcessTarget` に積み、`WeakSet` と `__strongJaPostProcessRegistered` で重複登録を防ぐ。
2. **`strong_ja_postprocess` の中身**
   - 対象段落に `[` / `]` を含む `text` トークンが無ければ、リンク・参照処理を丸ごとスキップする。
   - `convertInlineLinks` が `splitBracketToken` を利用しつつ `[label](dest)` 断片を `link_open/link_close` へ再構築し、`)` が現れるまで `parseInlineLinkTail` を呼ばない。
   - `convertCollapsedReferenceLinks` は `[label][]` / `[label][key]` を `state.env.references` で引き当て、存在するキーだけをアンカーに置き換える。既に `link_open` がある場合は再利用し、未定義参照はそのまま残す。
   - ラベルラップ中に壊れた強調マークがあった場合は `mergeBrokenMarksAroundLinks` が `*_close → link → *_open` パターンを掃除する。
   - 後処理終了後に `__strongJaPostProcessTargets` / `__strongJaInlineLabelSources` などの作業用フラグを必ず破棄する。

## 最適化と補助関数
- `normalizeReferenceCandidate` から呼ばれる正規化関数は `state.__strongJaNormalizeRef` にキャッシュし、毎回 `state.md.utils.normalizeReference` を辿らない。
- `splitBracketToken` は一度分割したトークンに `__strongJaHasBracket` / `__strongJaBracketAtomic` を埋め込み、再走査が不要なケースを即座に判定する。
