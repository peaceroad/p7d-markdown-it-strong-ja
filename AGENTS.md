# AGENTS

## Overview
- Entry point is `index.js`, which wires scanDelims patching, compat rules, and postprocess.
- Link/reference helpers live in `src/token-link-utils.js`.
- Current postprocess workflow: `docs/note-post-processing.md`.
- Migration/development history: `docs/note-post-processing-dev-log.md`.

## File Map
- `index.js`: token engine entry; normalizes options and registers rules.
- `src/token-core.js`: scanDelims patch + emphasis fixers.
- `src/token-compat.js`: attrs/cjk_breaks compatibility rules.
- `src/token-postprocess.js`: postprocess entry (re-export).
- `src/token-postprocess/orchestrator.js`: postprocess runtime flow and registration.
- `src/token-postprocess/guards.js`: broken-ref/tail guard and signal helpers.
- `src/token-postprocess/fastpaths.js`: token-only fast-path implementations and dispatch.
- `src/token-link-utils.js`: collapsed-ref helpers + link-mark cleanup + map utilities.
- `src/token-utils.js`: shared helpers, caches, rule ordering.

## Options (public)
- `mode`: `japanese`(default, resolves to `japanese-boundary-guard`) / `japanese-boundary` / `japanese-boundary-guard` / `aggressive` / `compatible`.
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
2. Patch `scanDelims` (prototype-level, one-time). For `mode: japanese-boundary`/`japanese-boundary-guard`, keep markdown-it base result first and apply local same-line relaxation around each `*` run only when needed.
3. In `mode: japanese-boundary-guard`, space-adjacent ASCII-start segments (plain words + quoted/link/code wrappers) are kept strict across `*` run lengths to reduce mixed JA/EN over-conversion.
4. In `mode: japanese-boundary`/`japanese-boundary-guard`, extra direction guard is applied only for single `*` runs (`count === 1`) to avoid opener/closer inversion in malformed link-label patterns.
5. Previous-star direction back-scan now stops at sentence boundary punctuation (except punctuation immediately adjacent to the current `*`) to reduce cross-sentence spillover.
6. Register compat rules (trailing space trim, softbreak normalization, attrs guard).
7. Register `strong_ja_token_postprocess`; if `coreRulesBeforePostprocess` is set, reorder matching core rules before it.
8. At runtime, skip postprocess internals when `postprocess: false` or `mode: compatible`.

## Postprocess Notes
- Repairs collapsed refs; cleans broken marks around links (em/strong only).
- Postprocess entry runs only when inline content contains asterisk markers (`*`); broken-ref/collapsed-ref repair paths additionally require bracket context.
- Collapsed reference label matching follows markdown-it key normalization rules (no implicit star trimming).
- Runtime segment parser fallback (`md.inline.parse`) is fully removed from postprocess; repairs are strict token-only.
- Tail repair uses token-only fast paths for canonical malformed patterns and dangling `strong_close` tails after `link_close`.
- Broken-ref repair uses active token-only fast paths (`strong-around-link`, `leading-close+inner-strong`) plus wrapper-depth guards.
- Broken-ref candidate gating is asterisk-first; underscore-heavy malformed ranges are left fail-safe to markdown-it behavior.
- Strong-run gating ignores noise patterns (`** **`, `***`, `****`) and prefers text-neighbored `**` runs.
- In `mode: japanese-boundary`/`japanese-boundary-guard`, inline segments without Japanese context skip postprocess rewriting.
- `mode: compatible` bypasses postprocess repairs and keeps markdown-it output for malformed link/ref patterns.
- Broken-segment repair still expands end range to close outstanding inline wrapper pairs (`*_open/*_close`) so unresolved collapsed refs with inline links do not leave orphan `</strong>`/`</em>` tags.
- Postprocess sanitizes unmatched `strong/em` tokens back to literal `*`/`**` text in repaired segments to avoid malformed HTML tags on extreme malformed inputs.
- Optional debug metrics are available via `state.env.__strongJaPostprocessMetrics` (`brokenRefFastPaths`, `tailFastPaths`, `brokenRefFlow`).
- Map is copied from the original token range when possible.
- Repairs are fail-safe: unsupported or low-confidence malformed shapes are preserved as-is (fail-closed).

## Performance Notes
- Caches: `md.__strongJaHasCjkBreaks`, `state.__strongJaTokenRuntimeOpt`.
- `scanDelims` patch is idempotent per inline-state prototype (avoids multi-instance re-wrapping).
- Runtime option merge is cached per parse-state + override object (`state.__strongJaTokenRuntimeOpt`); no-override renders skip runtime-option merge on the hot path.
- Japanese-context scans in postprocess are gated by mode (`japanese-boundary`/`japanese-boundary-guard` only); `aggressive`/`compatible` avoid that extra pass.
- Postprocess now checks marker presence (`*`) before Japanese-context scans and bracket-text checks on each inline token.
- Postprocess skips inline blocks without asterisk markers (`*`) before child-level scans.
- Postprocess short-circuits inline blocks that have brackets but no `*` markers before child-level scans.
- Postprocess broken-ref repair loop runs only when inline children include both `link_open` and `link_close`, and bracket text is present.
- Segment-local candidates are rejected early when no asterisk emphasis signal exists.
- Broken-ref wrapper close-only guard now uses per-pass asterisk wrapper-depth prefix caches, avoiding repeated `0..startIdx` rescans per candidate.
- Broken-ref wrapper close-only guard now also uses prefix open/close counts, so in-range close-only checks avoid per-candidate range rescans.
- Broken-ref wrapper prefix stats are built lazily per repair pass, avoiding unnecessary upfront scans in no-candidate passes.
- Broken-ref candidate gating now avoids a redundant range scan by relying on text-marker presence checks (`*`) as the primary precondition.
- Broken-ref wrapper-risk gating now shares one wrapper-range scan (`buildBrokenRefWrapperRangeSignals`) across leading-close and preexisting-close-only checks.
- Broken-ref wrapper gating now reuses `buildBrokenRefWrapperRangeSignals` for imbalance + asterisk-emphasis-token context, removing the extra wrapper-imbalance pass.
- Broken-ref repair now checks active fast-path signatures before dispatch, reducing no-match dispatch churn in malformed-heavy inputs.
- Canonical tail repairs are handled by token-only rearrangement.
- Malformed nested broken-ref cases are handled by token-only strong relocation before sanitize.
- Leading-close + inner-strong malformed broken-ref spans are handled by token-only marker relocation before sanitize.
- Postprocess inline pre-scan short-circuits once emphasis + bracket + link-pair flags are all discovered.
- Link range handling precomputes `link_open -> link_close` pairs per target range, avoiding per-link close-index rescans in hot paths.
- Collapsed-ref reconstruction memoizes `link_open -> link_close` pairs per pass and invalidates after token mutations.
- Token-link helpers memoize bracket presence per token via `__strongJaHasBracket`/`__strongJaBracketAtomic`.
- Compat softbreak passes short-circuit when no emphasis; restore-softbreaks tracks the last text char in a single pass.
- Compat runtime override checks now short-circuit when no per-render override is provided.

## Risks / Watchpoints
- Prototype patch is shared across MarkdownIt instances in the same process (now patched once per prototype).
- Pattern-based fixers (e.g., `fixEmOuterStrongSequence`) are sensitive to Markdown-it output changes.
- Map repair is coarse (range-level); per-token source positions can still be lost.
- Strict token-only repair intentionally leaves unknown malformed shapes as fail-closed literals; conversion coverage for unseen shapes may be lower than former fallback behavior.
- `patchCorePush` monkey-patches core rule registration and relies on a rule name containing `cjk_breaks`.
- Japanese-context detection is Hiragana/Katakana/Han + fullwidth punctuation only (not full CJK/Hangul).
- `coreRulesBeforePostprocess` reorders at setup even when `postprocess: false`; `postprocess` controls runtime behavior only.

## Tests & Bench
- Tests: `npm test`
- Full regression: `npm run test:all`
- Readme parity only: `npm run test:readme`
- Map diagnostics: `npm run test:map`
- Postprocess perf bench: `npm run bench:postprocess` (malformed corpus; compares mode + `postprocess` on/off).
- Postprocess release gate: `npm run test:postprocess-gate` (postprocess suites + deterministic analyzer checks in one command).
- Active fast-path lock: `node test/post-processing-fastpath.test.js` (ensures representative token-only fast paths are exercised).
- Fast-path roster lock: `node test/post-processing-fastpath-roster.test.js` (source broken-ref fast-path names must match fixture-backed keys).
- Fast-path fixture source: `test/post-processing/fastpath-cases.txt`.
- Broken-ref flow lock: `node test/post-processing-flow.test.js` (locks `brokenRefFlow` branch reasons + HTML parity/divergence expectations).
- Postprocess case-file tests share parser utility: `test/post-processing/case-file-utils.js` (`parseCaseSections`).
- No-op heavy regressions: `node test/post-processing-noop.test.js` (fuzz-mined pathological inputs; bounds extra inline-parse delta `<=0` and asserts HTML parity vs `postprocess:false`).
- Fail-safe matrix: `node test/post-processing.test.js` validates skip/fail-closed paths and checks no-extra-call conditions via `md.inline.parse` delta (`postprocess:true/false`).
- Compatible parity: `test/compatible-parity.test.js` asserts `mode: compatible` output equals plain `markdown-it` under the same plugin stacks used by fixtures.
- Option edges: `test/options-edge.test.js` includes complex broken/tail regressions across mode+mditAttrs matrix and meta-bearing token coverage.
- Token-only progress: `node test/post-processing-progress.test.js` now measures `md.inline.parse` delta (`postprocess:true` vs `false`) rather than `MarkdownIt.prototype.parseInline`.
- Token-only progress fixtures are currently all `expect_calls=none` and act as zero-extra-call regression locks.
- Token-only progress tail fixtures include code-inline and ref-like sentinels (`tail-code-inline-guard-aggressive`, `tail-ref-like-range-guard-aggressive`).
- Postprocess-call stress probe: `npm run analyze:postprocess-calls -- --count 2500 --seed <fixed-seed>` (current target snapshot: `extra_renders=0`, `extra_calls=0`).
- Fast-path activity probe: `npm run analyze:fastpath -- --count <count> --seed <fixed-seed> --mode <mode>` (aggregates `brokenRefFastPaths`/`tailFastPaths`/`brokenRefFlow`).
- Bench (from repo root): `node test/material/performance_compare.mjs ../../index.js 500 3`
