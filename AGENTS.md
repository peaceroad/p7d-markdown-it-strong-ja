# AGENTS

## Overview
- Entry point is `index.js`, which wires scanDelims patching, compat rules, and postprocess.
- Link/reference helpers live in `src/token-link-utils.js`.

## File Map
- `index.js`: token engine entry; normalizes options and registers rules.
- `src/token-core.js`: scanDelims patch + emphasis fixers.
- `src/token-compat.js`: attrs/cjk_breaks compatibility rules.
- `src/token-postprocess.js`: link/ref reconstruction + guarded segment reparse.
- `src/token-link-utils.js`: collapsed-ref helpers + link-mark cleanup + map utilities.
- `src/token-utils.js`: shared helpers, caches, rule ordering.

## Options (public)
- `mode`: `japanese`(default, alias: `japanese-only`) / `aggressive` / `compatible`.
- `mditAttrs`: set `false` to disable attrs plugin coupling.
- `coreRulesBeforePostprocess`: core rule names to keep before `strong_ja_token_postprocess`.
- `postprocess`: enable/disable runtime link/ref reconstruction pass.
- `patchCorePush`: track late `cjk_breaks` registration when `mditAttrs: false` (rule name comes from the cjk-breaks plugin).

### Option Notes
- `mode` and `postprocess` are runtime-effective via per-render override.
- `mditAttrs`, `patchCorePush`, and `coreRulesBeforePostprocess` are setup-time effective (registration/order is fixed after `.use(...)`).

## Per-render override
- `state.env.__strongJaTokenOpt` can override options per render; merged with `md.__strongJaTokenOpt`.
- Runtime-only in practice: setup-time registration/order options are fixed at plugin initialization.

## Processing Flow
1. Build options and cache `hasCjkBreaks` on `md`.
2. Patch `scanDelims` (prototype-level, one-time). For `mode: japanese`, keep markdown-it base result first and apply local same-line relaxation around each `*` run only when needed.
3. In `mode: japanese`, extra direction guard is applied only for single `*` runs (`count === 1`) to avoid opener/closer inversion in malformed link-label patterns.
4. Register compat rules (trailing space trim, softbreak normalization, attrs guard).
5. Register `strong_ja_token_postprocess`; if `coreRulesBeforePostprocess` is set, reorder matching core rules before it.
6. At runtime, skip postprocess internals when `postprocess: false` or `mode: compatible`.

## Postprocess Notes
- Repairs collapsed refs; cleans broken marks around links.
- Collapsed reference label matching follows markdown-it key normalization rules (no implicit star trimming).
- Broken ref and tail segments are selectively reconstructed from raw markdown and reparsed with `parseInline`.
- Broken-ref reparse is attempted only when reference definitions exist in `state.env.references`.
- In `mode: japanese`, inline segments without Japanese context skip postprocess rewriting (keeps markdown-it-like output for pure-English malformed tails).
- Reparse uses a per-option cached secondary MarkdownIt instance with `_skipPostprocess: true` to avoid core-rule recursion.
- Segment rewrite uses island placeholders for non-serializable/meta-bearing tokens; those tokens are restored after reparse instead of skipping the segment.
- Link rebuild is treated as safe only for `href`/`title` attrs; other attrs (or malformed attr entries) stay island-preserved to avoid destructive rewrites.
- `mode: compatible` bypasses postprocess repairs and keeps markdown-it output for malformed link/ref patterns.
- Island placeholders include per-segment nonce and collision retry to avoid accidental replacement when source text contains marker-like literals.
- Broken-segment reparse extends replacement end to close outstanding inline wrapper pairs (`*_open/*_close`) so unresolved collapsed refs with inline links do not leave orphan `</strong>`/`</em>` tags.
- Postprocess sanitizes unmatched `strong/em` tokens back to literal `*`/`**` text in repaired segments to avoid malformed HTML tags on extreme malformed inputs.
- Map is copied from the original token range when possible.
- Repairs are fail-safe for parser errors/unrecoverable ranges; unsupported tokens are generally preserved via islands.

## Performance Notes
- Caches: `md.__strongJaHasCjkBreaks`, `md.__strongJaTokenReparseCache`, `state.__strongJaTokenRuntimeOpt`.
- `scanDelims` patch is idempotent per inline-state prototype (avoids multi-instance re-wrapping).
- Runtime option merge is cached per parse-state + override object (`state.__strongJaTokenRuntimeOpt`); no-override renders skip runtime-option merge on the hot path.
- Japanese-context scans in postprocess are gated by mode (`japanese` only); `aggressive`/`compatible` avoid that extra pass.
- Postprocess skips paragraphs without brackets or emphasis.
- Postprocess broken-ref pre-scan/reparse loop runs only when inline children include both `link_open` and `link_close`, and bracket text is present.
- Postprocess inline pre-scan short-circuits once emphasis + bracket + link-pair flags are all discovered.
- Segment raw reconstruction precomputes `link_open -> link_close` pairs per target range, avoiding per-link close-index rescans in hot paths.
- Token-link helpers memoize bracket presence per token via `__strongJaHasBracket`/`__strongJaBracketAtomic`.
- Compat softbreak passes short-circuit when no emphasis; restore-softbreaks tracks the last text char in a single pass.
- Compat runtime override checks now short-circuit when no per-render override is provided.

## Risks / Watchpoints
- Prototype patch is shared across MarkdownIt instances in the same process (now patched once per prototype).
- Pattern-based fixers (e.g., `fixEmOuterStrongSequence`) are sensitive to Markdown-it output changes.
- Segment reparse reconstructs markdown from token ranges; uncommon link/title/raw-markup combinations can still be lossy.
- Map repair is coarse (range-level); per-token source positions can still be lost.
- `patchCorePush` monkey-patches core rule registration and relies on a rule name containing `cjk_breaks`.
- Japanese-context detection is Hiragana/Katakana/Han + fullwidth punctuation only (not full CJK/Hangul).
- `coreRulesBeforePostprocess` reorders at setup even when `postprocess: false`; `postprocess` controls runtime behavior only.

## Tests & Bench
- Tests: `npm test`
- Full regression: `npm run test:all`
- Readme parity only: `npm run test:readme`
- Map diagnostics: `npm run test:map`
- Option edges: `test/options-edge.test.js` includes complex broken/tail regressions across mode+mditAttrs matrix, reparse-path assertions, and meta-bearing token coverage.
- Bench (from repo root): `node test/material/performance_compare.mjs ../../index.js 500 3`
