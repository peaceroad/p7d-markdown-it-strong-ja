# AGENTS

## Overview
- Entry point is `index.js`, which wires scanDelims patching, compat rules, and postprocess.
- Link/reference helpers live in `src/token-link-utils.js`.

## File Map
- `index.js`: token engine entry; normalizes options and registers rules.
- `src/token-core.js`: scanDelims patch + emphasis fixers.
- `src/token-compat.js`: attrs/cjk_breaks compatibility rules.
- `src/token-postprocess.js`: link/ref reconstruction + guarded reparse.
- `src/token-link-utils.js`: collapsed-ref helpers + link-mark cleanup + map utilities.
- `src/token-utils.js`: shared helpers, caches, rule ordering.

## Options (public)
- `mode`: `japanese`(default, alias: `japanese-only`) / `aggressive` / `compatible`.
- `mditAttrs`: set `false` to disable attrs plugin coupling.
- `dollarMath`, `mdBreaks`: compat switches for `$...$` and `breaks`.
- `coreRulesBeforePostprocess`: core rule names to keep before `strong_ja_token_postprocess`.
- `postprocess`: enable/disable runtime link/ref reconstruction pass.
- `patchCorePush`: track late `cjk_breaks` registration when `mditAttrs: false` (rule name comes from the cjk-breaks plugin).

### Option Notes
- `mode` and `postprocess` are runtime-effective via per-render override.
- `mditAttrs`, `patchCorePush`, and `coreRulesBeforePostprocess` are setup-time effective (registration/order is fixed after `.use(...)`).
- `dollarMath` is currently accepted for compatibility but has no token-engine branch.
- `mdBreaks` is currently accepted; it does not branch core token transforms directly.
- no-link parser cache key is currently derived from `mode` and `mditAttrs` only.

## Per-render override
- `state.env.__strongJaTokenOpt` can override options per render; merged with `md.__strongJaTokenOpt`.
- Runtime-only in practice: setup-time registration/order options are fixed at plugin initialization.

## Processing Flow
1. Build options and cache `hasCjkBreaks` on `md`.
2. Patch `scanDelims` to relax `*` boundary rules in Japanese contexts.
3. Register compat rules (trailing space trim, softbreak normalization, attrs guard).
4. Register `strong_ja_token_postprocess`; if `coreRulesBeforePostprocess` is set, reorder matching core rules before it.
5. At runtime, skip postprocess internals when `postprocess: false`.

## Postprocess Notes
- Repairs collapsed refs; cleans broken marks around links.
- Reparse is guarded (avoids attrs/meta tokens) and limited by broken-ref count.
- Map is copied from the original token range when possible.
- Guarded reparse is fail-closed; some malformed link/emphasis segments may remain literal to preserve foreign attrs/meta payloads.

## Performance Notes
- Caches: `md.__strongJaHasCjkBreaks`, `md.__strongJaTokenNoLinkCache`, `state.__strongJaTokenRuntimeOpt`.
- `scanDelims` patch is idempotent per inline-state prototype (avoids multi-instance re-wrapping).
- `scanDelims` runtime mode decision is cached per parse-state + option object; no-override renders skip runtime-option merge on the hot path.
- no-link parser cache hit uses single `Map#get`.
- Postprocess skips paragraphs without brackets or emphasis.
- Postprocess reparse loop is skipped when no `link_open` exists in the inline children.
- Reparse is capped and avoids extra passes when no broken refs exist.
- Token-link helpers memoize bracket presence per token via `__strongJaHasBracket`/`__strongJaBracketAtomic`.
- Compat softbreak passes short-circuit when no emphasis; restore-softbreaks tracks the last text char in a single pass.
- Compat runtime override checks now short-circuit when no per-render override is provided.

## Risks / Watchpoints
- Prototype patch is shared across MarkdownIt instances in the same process (now patched once per prototype).
- Pattern-based fixers (e.g., `fixEmOuterStrongSequence`) are sensitive to Markdown-it output changes.
- Reparse can drop attrs/meta data; guarded but not fully avoidable.
- Map repair is coarse (range-level); per-token source positions can still be lost.
- `md.__strongJaTokenNoLinkCache` still grows per `mode` x `mditAttrs` combination in long-lived processes (small bounded key space).
- `patchCorePush` monkey-patches core rule registration and relies on a rule name containing `cjk_breaks`.
- Japanese detection is Hiragana/Katakana/Han + fullwidth punctuation only (not full CJK/Hangul).
- `coreRulesBeforePostprocess` reorders at setup even when `postprocess: false`; `postprocess` controls runtime behavior only.

## Tests & Bench
- Tests: `npm test`
- Full regression: `npm run test:all`
- Readme parity only: `npm run test:readme`
- Map diagnostics: `npm run test:map`
- Bench (from repo root): `node test/material/performance_compare.mjs ../../index.js 500 3`
