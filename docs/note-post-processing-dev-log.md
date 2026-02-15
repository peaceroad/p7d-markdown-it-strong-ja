# Postprocess Token-Only Dev Log

## Goal

Migrate postprocess repair (entry re-export: `src/token-postprocess.js`, runtime modules: `src/token-postprocess/*.js`) from reparsing-based fallback to strict token-only repair while preserving behavior for existing fixture coverage.

Primary goals:

1. Improve output stability by removing reparse-dependent drift.
2. Keep fail-safe behavior for malformed input (`break less, preserve more`).
3. Avoid performance regressions in Japanese modes.

## Scope and Constraints

- No new public options.
- Preserve current mode contracts:
  - `compatible`
  - `japanese-boundary`
  - `japanese-boundary-guard`
  - `aggressive`
- Keep `compatible` mode parity with plain markdown-it.

## Initial State (Historical)

Postprocess originally had two reparse-driven repair paths:

- broken-reference segment repair
- tail repair after `link_close`

Historical flow:

1. serialize token range back to markdown-like text
2. preserve unsafe/meta-bearing tokens through island placeholders
3. reparse with inline parser
4. restore islands and replace token range

This solved many malformed inputs, but introduced:

- possible plugin interaction drift
- normalization side effects from text roundtrip
- avoidable runtime cost on malformed-heavy content

## Final State (Current)

Postprocess is now strict token-only:

- no runtime `md.inline.parse` fallback
- no raw segment serialization
- no island placeholder path

Runtime behavior:

1. detect candidate malformed segments with token-level guards
2. apply ordered token-only fast paths for known safe shapes
3. keep unknown/low-confidence shapes unchanged (fail-closed)
4. run final balance sanitization (`sanitizeEmStrongBalance`)

## Major Implementation Decisions

### A. Reparse strategy decisions

- Rejected `core.process` re-entry due side effects (duplicate attrs/meta from external core plugins).
- Kept inline-only reparse only during migration stages.
- Fully removed runtime reparse after coverage and guard hardening reached stable zero-extra-call state.

### B. Token-only repair architecture

- Retained broken-ref detection and wrapper-balance expansion logic.
- Added/expanded token-only fast paths for known malformed families.
- Centralized fast-path dispatch via `BROKEN_REF_TOKEN_ONLY_FAST_PATHS`.
- Preserved fail-closed behavior for non-matching or low-confidence shapes.

### C. Guard-first safety model

Broken-ref candidate gates were strengthened to reject low-confidence ranges:

- long star-chain noise (`***`/`****`)
- underscore-emphasis token involvement
- `code_inline` involvement
- leading unmatched close-only wrappers
- pre-depth close-only ranges
- weak/noisy strong-run signals

Tail repair is token-only as well:

- canonical tail pattern fix
- dangling `strong_close` tail fix
- non-matching tails remain unchanged

## Key Fast Paths

Broken-ref token-only fast paths:

- `tryFixBrokenRefStrongAroundLinkTokenOnly`
- `tryFixBrokenRefLeadingCloseThenInnerStrongBeforeLinkTokenOnly`

Tail token-only fast paths:

- `tryFixTailPatternTokenOnly`
- `tryFixTailDanglingStrongCloseTokenOnly`

## Code Removal Summary

Removed runtime fallback helpers and paths:

- `parseInlineWithFixes`
- `buildRawFromTokens`
- `restoreIslands`
- reparse equivalence helpers
- reparse cache/negative cache logic
- no-op reparse retry bookkeeping

Result:

- simpler postprocess code path
- lower maintenance surface
- fewer plugin-chain interaction risks

## Test Assets Added or Strengthened

### A. Fail-safe locks

- `test/post-processing/fail-safe-cases.txt`
- `test/post-processing.test.js`

Purpose:

- lock conservative non-conversion behavior
- verify no extra parse calls when `postprocess:false`
- keep tag-balance safety checks

### B. Token-only progress locks

- `test/post-processing/token-only-regressions.txt`
- `test/post-processing-progress.test.js`

Purpose:

- case-by-case visibility for extra-call regressions
- fixed expectation format with `expect_calls=none` for current state

### C. Heavy no-op regressions

- `test/post-processing/noop-heavy-cases.txt`
- `test/post-processing-noop.test.js`

Purpose:

- keep fuzz-mined malformed corpus as permanent regression gate
- assert both:
  - no extra parse-call delta
  - HTML parity vs `postprocess:false`

## Measurement and Quality Signals

Primary signals:

- `npm run test:all` green
- token-only progress: all tracked cases `expect_calls=none`
- deterministic analyzer:
  - `npm run analyze:postprocess-calls -- --count 2500 --seed <fixed-seed>`
  - legacy alias: `npm run analyze:fallback -- --count 2500 --seed <fixed-seed>`
  - current snapshot: `extra_renders=0`, `extra_calls=0`

## Remaining Risks and Known Limits

- Unknown malformed shapes are intentionally fail-closed (left unchanged).
- Map propagation is range-level; per-token map precision is not guaranteed after complex rewrites.
- Historical log entries below still include migration-era `reparse` wording for continuity, even though runtime behavior is token-only.

## Practical Maintenance Rules

When extending postprocess repair:

1. Keep guard-first and fail-closed behavior.
2. Prefer token-only transformations over parser re-entry.
3. Add explicit regression cases for each new malformed family.
4. Update progress fixtures to lock expected extra-call behavior.
5. Run:
   - `node test/post-processing-progress.test.js`
   - `node test/post-processing-noop.test.js`
   - `npm run test:all`

## Logs

Detailed migration sequence (kept for future maintenance and regression triage):

1. Baseline stabilization:
   - Established explicit progress fixtures and fail-safe fixtures before major migration work.
   - Locked mode behavior (`compatible`, `japanese-boundary`, `japanese-boundary-guard`, `aggressive`) with fixture parity tests.
2. Reparse risk audit:
   - Confirmed that core re-entry (`core.process`) can replay third-party core plugins and duplicate side effects (for example attrs/meta writes).
   - Standardized migration preference to token-only repair to avoid plugin-chain re-entry.
3. Tail-first token-only conversion:
   - Introduced token-only canonical tail repair.
   - Added dangling `strong_close` tail repair path.
   - Added negative guards for low-confidence tails (for example Japanese-mode context absence).
4. Broken-ref guard hardening:
   - Added marker/no-marker gates to reject clear no-op ranges.
   - Added wrapper-depth/prefix guards to avoid partial in-wrapper overcorrection.
   - Added long-star/noise and underscore/code-sensitive skip guards.
5. Broken-ref fast-path expansion:
   - Added ordered fast paths for recurring malformed families:
     - outer/inner strong mismatch around links
     - strong tail continuation before links
     - trailing `em_close` before links
     - isolated strong wrapper demotion before links
     - leading-close then inner-strong before links
   - Kept strict fail-closed semantics for unmatched families.
6. No-op churn elimination:
   - Added heavy malformed corpus (`noop-heavy`) as permanent fixture coverage.
   - Added explicit zero-extra-call expectation locks (`expect_calls=none`) for tracked token-only progress cases.
7. Runtime fallback removal:
   - Removed segment serialization + island placeholder path from runtime.
   - Removed inline parser fallback and related cache/equivalence helpers.
   - Kept final balance sanitation and existing emphasis fixers.
8. Post-migration cleanup:
   - Normalized naming where possible from historical `reparse` wording toward `rewrite` wording.
   - Updated workflow docs to reflect strict token-only runtime behavior.
9. Ongoing policy:
   - Add fast paths only for observed malformed families with reproducible fixtures.
   - Prefer conservative skip behavior over speculative rewrites.
   - Keep analyzer + progress fixtures as release gates.
10. Maintenance refactor pass:
   - Extracted low-confidence guard bundling and single-pass broken-ref repair helper to reduce nested complexity.
   - Extracted inline pre-scan helper and repair-pass budget/loop helpers to flatten core-rule control flow.
   - Extracted per-inline postprocess orchestrator helper so the core rule loop is now dispatch-oriented.
   - Extracted tail-repair candidate scan/apply helpers to isolate tail detection from tail rewrite conditions.
   - Split broken-ref rewrite decision into imbalance/balanced helper predicates for guard readability.
   - Kept behavior unchanged with full regression + analyzer gates.
11. Performance instrumentation update:
   - Added malformed-corpus postprocess benchmark (`npm run bench:postprocess`) to compare mode + `postprocess` on/off cost directly.
12. Guard/readability + hot-path micro-optimization pass:
   - Split low-confidence guard into explicit sub-helpers (`noise`, `delimiter`, `wrapper`) for easier review.
   - Moved broken-ref repair-budget precondition to `processInlinePostprocessToken`, so budget scans and `scanState` allocation now run only when repair preconditions are already satisfied.
   - Kept output behavior unchanged with `test:all`, postprocess-specific suites, and analyzer zero-extra snapshot.
13. Fast-path observability + active-path lock:
   - Added optional runtime metrics sink (`state.env.__strongJaPostprocessMetrics`) with:
     - `brokenRefFastPaths`
     - `tailFastPaths`
     - `brokenRefFlow` (candidate/skip/repaired diagnostics)
   - Added active fast-path regression lock test:
     - `test/post-processing-fastpath.test.js`
   - Wired fast-path lock into edge suite execution (`test/test-edge.js`).
   - Current lock scope is active/observed paths; dormant-path keep/retire decision remains part of ongoing Phase C policy.
14. Fast-path analyzer script:
   - Added `test/material/analyze-fastpath-hits.mjs` and npm alias `analyze:fastpath`.
   - Purpose:
     - aggregate `brokenRefFastPaths` / `tailFastPaths` / `brokenRefFlow` over deterministic malformed corpus generation.
     - provide reproducible evidence for active vs dormant path decisions in Phase C.
   - Current observation on random malformed corpus (`seed=<fixed-seed>`, `count=8000`, `mode=aggressive`):
     - broken-ref fast paths were not observed.
     - tail fast paths were frequently observed (`tail-dangling-strong-close`) with occasional `tail-pattern`.
15. Dormant broken-ref fast-path retirement:
   - Removed unobserved paths after repeated fixture + analyzer no-hit confirmation:
     - `strong-tail-before-link`
     - `trailing-em-close-before-link`
     - `demote-isolated-strong-wrapper-before-link`
   - Kept active paths:
     - `strong-around-link`
     - `leading-close-then-inner-strong-before-link`
   - Kept active-path locks and flow diagnostics to support reintroduction if real corpus evidence appears.
16. Active-signature precheck optimization:
   - Added active fast-path signature precheck before dispatch in broken-ref repair flow.
   - Non-matching candidates now short-circuit as `brokenRefFlow.skip-no-active-signature` instead of dispatching through all fast paths.
   - Coupled signature predicates into `BROKEN_REF_TOKEN_ONLY_FAST_PATHS` entries, so active-signature checks and dispatch share one source of truth.
   - Merged precheck + dispatch into single-pass result-coded flow, removing duplicate signature scans per candidate while preserving `skip-no-active-signature` / `skip-no-fastpath-match` semantics.
   - Added a defensive regression lock for `skip-no-fastpath-match` using a test plugin that mutates strong-token `markup` to non-canonical values, confirming fail-closed behavior under external token-shape drift.
   - Added a deterministic regression lock case that exercises `skip-no-active-signature` and verifies HTML parity with `postprocess:false`.
   - Regression and analyzer gates remain green.
17. Broken-ref flow branch-lock suite:
   - Added `test/post-processing-flow.test.js` to lock each `brokenRefFlow` branch with deterministic cases:
     - `skip-no-text-marker`
     - `skip-guard`
     - `skip-no-active-signature`
     - `skip-no-fastpath-match` (defensive plugin case)
     - `repaired`
   - Added per-branch HTML expectation checks against `postprocess:false` (parity for skip branches, divergence for repaired branch).
   - Wired suite into `test/test-edge.js` and npm script `test:postprocess-flow`.
   - Externalized flow cases to `test/post-processing/flow-cases.txt` so branch coverage can be extended without editing test code.
18. Postprocess case-file parser consolidation:
   - Added shared test utility `test/post-processing/case-file-utils.js` (`parseCaseSections`).
   - Migrated fail-safe/progress/noop/flow tests to the shared parser, removing duplicated local case-file parsers.
   - Kept existing fixture formats and test expectations unchanged.
19. Fast-path fixture externalization:
   - Migrated `test/post-processing-fastpath.test.js` to case-file driven input (`test/post-processing/fastpath-cases.txt`) using shared parser utility.
   - Scoped fastpath suite to active fast-path hit locks; skip-reason coverage remains in `test/post-processing-flow.test.js`.
20. Current-state re-evaluation and execution-order freeze:
   - Re-ran full gates on current head:
     - `npm run test:all`
     - `npm run analyze:postprocess-calls -- --count 2500 --seed <fixed-seed>`
     - `npm run analyze:fastpath -- --count 8000 --seed <fixed-seed> --mode aggressive`
   - Snapshot stayed stable:
     - `extra_renders=0`, `extra_calls=0`, `html_changed_renders=0`
     - `brokenRefFastPaths` remained unhit on random malformed corpus
     - `tailFastPaths` remained dominated by `tail-dangling-strong-close`
   - Added an explicit immediate execution order in `docs/note-post-processing.md`:
     - naming/doc consistency
     - deterministic analyzer branch tracking
     - guard-path micro-refactor (behavior-preserving)
     - map policy decision
     - fast-path lifecycle policy continuation
21. Guard risk pre-scan consolidation (behavior-preserving):
   - Added `buildBrokenRefRangeRiskSignals` in the postprocess runtime module (then monolithic `src/token-postprocess.js`, now split under `src/token-postprocess/`).
   - Low-confidence broken-ref checks now share one range scan for:
     - long-star noise
     - underscore text marker presence
     - `code_inline` presence
     - underscore emphasis token presence
   - Reused signals in `hasBrokenRefNoiseRisk` / `hasBrokenRefDelimiterRisk` within `isLowConfidenceBrokenRefRange`.
   - Validation:
     - `node test/post-processing-flow.test.js`
     - `node test/post-processing-fastpath.test.js`
     - `node test/post-processing-progress.test.js`
     - `node test/post-processing-noop.test.js`
     - `node test/post-processing.test.js`
     - `npm run analyze:postprocess-calls -- --count 2500 --seed <fixed-seed>`
     - `npm run analyze:fastpath -- --count 8000 --seed <fixed-seed> --mode aggressive`
     - `npm run test:all`
   - Result: outputs and analyzer snapshots remained stable.
22. Postprocess release-gate command integration:
   - Added `test/postprocess-gate.js` and npm script `test:postprocess-gate`.
   - The gate runs, in fixed order:
     - fail-safe / noop-heavy / progress / fastpath / flow suites
     - postprocess-call analyzer (`count=2500`, `seed=<fixed-seed>`)
     - fastpath analyzer (`count=8000`, `seed=<fixed-seed>`, `mode=aggressive`)
   - Purpose:
     - make deterministic postprocess correctness + analyzer checks reproducible as a single command
     - reduce release-time checklist drift
   - Validation:
     - `npm run test:postprocess-gate` passed on current head.
23. Wrapper-risk shared-scan refactor (behavior-preserving):
   - Added `buildBrokenRefWrapperRangeSignals` in the postprocess runtime module (then monolithic `src/token-postprocess.js`, now split under `src/token-postprocess/`).
   - Consolidated wrapper-range scans used by:
     - `hasLeadingUnmatchedWrapperCloseInRange`
     - `hasPreexistingWrapperCloseOnlyInRange`
     - `hasBrokenRefWrapperRisk`
   - Result:
     - one shared wrapper scan per candidate range
     - preserved fail-closed semantics
   - Validation:
     - postprocess suites, analyzers, and `test:postprocess-gate` all remained stable.
24. Map policy decision lock:
   - Decided to keep range-level map propagation for postprocess repairs.
   - Rationale:
     - current diagnostics indicate expected token split drift with stable HTML
     - per-token map refinement is high-complexity for low practical gain in current scope
   - Revisit trigger:
     - source-map precision becomes a required external contract.
25. Analyzer naming alignment (non-breaking):
   - Added canonical npm command:
     - `analyze:postprocess-calls`
   - Kept legacy alias:
     - `analyze:fallback`
   - Updated `test:postprocess-gate` and active docs/AGENTS to use the canonical command.
26. Guard/readability + fast-path policy lock follow-up:
   - Added canonical analyzer entrypoint file:
     - `test/material/analyze-postprocess-calls.mjs`
     - current canonical script now points to it; legacy alias remains available.
   - Updated analyzer output label to:
     - `[postprocess-call-analyze]`
   - Consolidated wrapper-signal usage further:
     - removed redundant wrapper-imbalance helper (`getAsteriskWrapperRangeInfo`)
     - reused `buildBrokenRefWrapperRangeSignals` for wrapper imbalance + asterisk-emphasis-token context in `shouldAttemptBrokenRefRewrite`
   - Added active fast-path roster lock:
     - `test/post-processing-fastpath-roster.test.js`
     - ensures broken-ref fast-path names in source match fixture-backed keys (`fastpath-cases.txt`)
   - Wired roster lock into edge and postprocess gates:
     - `test/test-edge.js`
     - `test/postprocess-gate.js`
   - Validation:
     - postprocess suites + analyzers + `test:postprocess-gate` + `test:all` all green on current head.
27. Single-pass guard signal consolidation + dead helper removal:
   - Unified low-confidence guard scans to one pass:
     - `buildBrokenRefWrapperRangeSignals(tokens, startIdx, endIdx, firstTextOffset)`
     - now carries wrapper + delimiter/noise risk signals together.
   - Removed redundant helper paths:
     - `hasUnderscoreCharsInTextRange`
     - `hasLongStarChainInTextRange`
     - `hasCodeInlineInRange`
     - `hasUnderscoreEmphasisTokenInRange`
     - `buildBrokenRefRangeRiskSignals`
     - `getAsteriskWrapperRangeInfo`
   - Result:
     - fewer per-candidate range scans in broken-ref guard path
     - lower maintenance surface with no behavior drift
   - Validation:
     - postprocess suites, analyzers, postprocess gate, and `test:all` remained green.
28. Post-optimization benchmark snapshot refresh:
   - Re-ran:
     - `npm run bench:postprocess`
     - `npm run bench:scan`
   - Updated current-performance snapshot in `docs/note-post-processing.md` to latest local values.
   - Kept interpretation policy:
     - compare relative mode spread and analyzer zero-extra-call status
     - treat absolute wall-clock values as machine/load dependent.
29. Rewrite-decision helper flattening (behavior-preserving):
   - Removed thin branch helpers:
     - `shouldAttemptBrokenRefRewriteWithImbalance`
     - `shouldAttemptBrokenRefRewriteWithBalancedWrappers`
   - Inlined their logic into `shouldAttemptBrokenRefRewrite` to reduce call depth and keep the decision path local.
   - Preserved previous short-circuit behavior:
     - imbalance + tokenized asterisk wrappers -> immediate rewrite allow
     - balanced + tokenized asterisk wrappers -> immediate rewrite skip
   - Validation:
     - `npm run test:postprocess-gate`
     - `npm run test:all`
   - Result:
     - behavior remained stable with no analyzer drift (`extra_renders=0`, `extra_calls=0`).
30. Naming consistency hardening (current-state docs/tests):
   - Renamed token-only progress fixture key from `reparse` to `expect_calls`.
   - Updated `test/post-processing-progress.test.js` to read `expect_calls` via `expectCalls`.
   - Renamed fail-safe case types from `*_no_reparse` to `*_no_extra_parse_calls`.
   - Renamed marker-preservation fail-safe type from `island_literal_preserved` to `marker_literal_preserved`.
   - Removed deprecated npm alias `analyze:fallback`.
   - Removed legacy analyzer file `test/material/analyze-reparse-fallback.mjs` and made `test/material/analyze-postprocess-calls.mjs` the canonical implementation.
   - Updated current docs (`docs/note-post-processing.md`, `AGENTS.md`) to reflect the naming cleanup and close migration-phase wording.
   - Validation:
     - `npm run test:postprocess-gate`
     - `npm run test:all`
   - Result:
     - behavior unchanged; naming drift from migration-era terminology reduced in current-state docs/tests.
31. Inline hot-path guard order + docs neutralization:
   - Reordered `processInlinePostprocessToken` guard flow so Japanese-context scanning runs only after pre-scan confirms target relevance (`hasEmphasis || hasBracketText`).
   - This keeps behavior unchanged while reducing unnecessary per-character Japanese scans on non-target `*` paragraphs.
   - Replaced date-like fixed-seed literals in active docs with `<fixed-seed>` placeholders and removed as-of wording from AGENTS-facing notes.
   - Validation:
     - `npm run test:postprocess-gate`
     - `npm run test:all`
   - Result:
     - behavior and analyzer snapshots remained stable.

## Document Role

This file is the historical development log for the migration and hardening process.
For day-to-day current behavior/spec, read:

- `docs/note-post-processing.md`
