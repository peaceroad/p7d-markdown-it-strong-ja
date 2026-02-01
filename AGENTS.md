# AGENTS

## 概要
- `mditStrongJa` は `md.inline.ruler.before('emphasis')` で `strong_ja` を差し込み、日本語優先の強調判定を標準より前で実行する。
- オプションを正規化してインライン処理とコア処理で共有する。

## 主なオプション
- `mode`: `japanese-only`(default) / `aggressive` / `compatible`。compatible は markdown-it と同等の保守的挙動。
- `disallowMixed`: 旧挙動互換。英語/混在箇所では compat を強制。
- `mditAttrs`: `false` で attrs プラグイン非依存に切替。
- `dollarMath`, `mdBreaks`: それぞれ `$...$` / `breaks` 有効時の互換処理。
- `coreRulesBeforePostprocess`: `strong_ja_postprocess` より前に実行したい core ルール名の配列（`Set` で重複除去し、`moveRuleBefore` で一度だけ並べ替え）。
- `engine`: `legacy`(default) / `token`。`token` はトークンベース実装への移行用（現状は legacy と同等の挙動）。
- `postprocess`: `true`(default) でリンク/参照の再構築とリンク周辺の強調修復を有効化。`false` で後処理を無効化。
- `patchCorePush`: `true`(default) で `mditAttrs: false` 時に `cjk_breaks` の遅延登録を追跡し、softbreak 復元ルールを後ろに移動。
- CJK ブレーク検出は `md.__strongJaHasCjkBreaks` にキャッシュ。

## ワークフロー詳細
1. **段落初期化**: バックスラッシュ・参照・インラインリンクのキャッシュをクリアし、必要なら `state.__strongJaReferenceCount` を算出。`mditAttrs` 有効時のみ末尾 `{.class}` を検出してインライン対象から除外。
2. **範囲検出**: `[` が無い段落では `computeReferenceRanges` を呼ばず参照走査を省略。参照は `findMatchingBracket` でペア抽出し、定義済みラベルだけを保持。インラインリンクは `']('` が見える場合にだけ走査し、ラベル/宛先区間を記録してリンク跨ぎ判定に使う。
3. **インライン分割 (`createInlines`)**: ASCII 記号候補へジャンプしつつ走査し、`*` 連続列・バックティック・`$`・HTML タグをまとめて切り出す。バックスラッシュ有無は `__strongJaHasBackslash` と位置キャッシュで判定。HTML は 8KB 超の長い区間だけ探索範囲を上限付きでスキャン。純テキストのみなら `text` を積んで早期終了。
4. **マーク生成 (`setStrong`/`setEm`)**: 参照区間やリンクラベルを跨ぐ組み合わせを除外。`disallowMixed` 時は混在チェックを行い、日本語無し＋英数混在なら compat に寄せる。HTML タグ内の破綻を検出したら早期リターン。日本語文脈では強調内の半角スペースを許容し、そのまま保持。必要に応じて斜体→強調の順で分割挿入し、`pushMark` がソートを維持。
5. **トークン化 (`mergeInlinesAndMarks` → `setToken`)**: マークとインラインを統合した後、純テキストは直接 `text` push、その他は `md.inline.parse` を再利用。attrs 末尾は末尾 `}` を軽量に確認した上で正規表現に進む。末尾の `text` トークンに限って trailing space を削除し、リンク/コード/HTML 直前の空白は保持。`mdBreaks` 無効かつ CJK ブレーク有効時は softbreak を空白へ正規化。
6. **後処理 (`strong_ja_postprocess`)**: `postprocess` 有効時のみ、collapsed reference / インラインリンク候補がある段落だけ再訪。`[label](dest)` / `[label][]` を再構築し、既存 `link_open` があれば再利用。`mergeBrokenMarksAroundLinks` でリンク周辺の壊れた強調を掃除し、作業キャッシュを破棄。

## 後処理 (collapsed ref / inline link)
- collapsed reference またはインラインリンク候補がある段落だけ `registerPostProcessTarget` に登録。
- `strong_ja_postprocess` で `[label](dest)` / `[label][]` を再構築し、既存 `link_open` があれば再利用。`mergeBrokenMarksAroundLinks` でリンク周辺の壊れた強調を整理し、処理後にワークキャッシュを破棄。

## 最適化ポイント
- `[` 無しで `computeReferenceRanges` を呼ばず、不要な参照走査を省く。
- CJK ブレーク有無・attrs 可否・参照正規化関数を state / md にキャッシュして再判定を削減。
- 大きいインラインリンク範囲は Map キャッシュで二分探索結果を再利用。
- 改行位置を事前配列化し、`map` 計算を軽量化。
- 純テキスト（記号・改行・バックスラッシュなし）は `md.inline.parse` を呼ばず直接 `text` push。

## 懸案・観察
- `createInlines` は 8KB ガード付きで HTML を走査するが、さらに長い一行を頻繁に扱う場合はウィンドウ幅の調整余地あり。日本語文脈で半角スペースを強調対象に含めるため、互換重視なら `mode: compatible` / `disallowMixed` を検討。
- `findInlineLinkRange` の Map キャッシュは範囲数が大きい時にのみ有効化。極端に長い段落ではキャッシュヒット率を計測すると調整の手掛かりになる。

## テストとベンチ
- テスト: `npm test`
- ベンチ: `node test/material/performance_compare.mjs ./index.js 500 3`（繰り返し回数・サンプル数は任意調整）
