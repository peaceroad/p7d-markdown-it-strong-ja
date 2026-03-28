# Postprocess Notes (Token-Only)

## 1. Status

- Token-only migration for postprocess runtime is complete (`src/token-postprocess.js` re-export + `src/token-postprocess/*.js` modules).
- Runtime inline-parser fallback (`md.inline.parse`) is removed.
- Repair policy is now:
  - fix known malformed shapes with token-only transforms
  - keep unknown/low-confidence shapes unchanged (fail-closed)
- Current regression gates are green:
  - `npm run test:all`
  - `npm run test:postprocess-gate`
  - `node test/post-processing-progress.test.js`
  - `node test/post-processing-noop.test.js`
  - `npm run analyze:postprocess-calls -- --count 2500 --seed <fixed-seed>`

## 2. Runtime Workflow

### 2.1 Entry and Rule Registration

- Entry: `index.js`
- Postprocess rule: `registerTokenPostprocess` in `src/token-postprocess/orchestrator.js` (re-exported from `src/token-postprocess.js`)
- Runtime skips:
  - `mode: compatible`
  - `postprocess: false`

### 2.2 Inline Pre-Scan And Facts

For each candidate `inline` token, postprocess now builds one lightweight facts object and fills the rest lazily.

Initial pre-scan captures:

- marker presence (`*`) in inline content before touching children
- bracket context (`[` or `]`) from inline content, then confirmed on children when needed
- link pair presence (`link_open` + `link_close`)
- existing emphasis presence (`em/strong`) before any repair stage
- asterisk-wrapper balance risk for sanitize gating
- Japanese context only when mode is `japanese-boundary` / `japanese-boundary-guard`

Lazy fields on the same facts object are populated only on the repair paths that need them:

- `code_inline` presence for strong-around-code activation
- reference count for broken-ref / collapsed-ref stages
- postprocess metrics sink
- `link_open -> link_close` map reuse
- broken-ref wrapper-prefix stats
- broken-ref helper fallback caches when stage hooks are not present
- earliest changed index for suffix-only `level` rebuild

This keeps non-target paragraphs on the cheap path.

### 2.3 Broken-Ref Repair Pass (Token-Only)

Module:

- `src/token-postprocess/broken-ref.js`

Main helpers:

- `runBrokenRefRepairs`
- `runBrokenRefRepairPass`
- `runBrokenRefCandidateRewrite`
- `expandSegmentEndForWrapperBalance`
- `shouldAttemptBrokenRefRewrite`
- `applyBrokenRefTokenOnlyFastPath`

Flow:

1. detect broken-ref start in text tokens
2. when `link_open` is found, compute `segmentEnd` (wrapper-balanced range)
3. reject low-confidence ranges with guard checks
4. apply ordered token-only fast paths (single-pass signature + dispatch)
5. if no fast path matches, keep range unchanged (fail-closed)

`expandSegmentEndForWrapperBalance(...)` now tracks only asterisk `strong/em` depth with fixed counters, which is both cheaper and closer to the actual broken-ref responsibility than a generic wrapper map. Direct helper fallback paths also memoize link-close maps and wrapper-prefix stats per pass, so exported repair helpers do not regress when called outside the orchestrator facts flow. Broken-ref passes now seed their signal flags from already-known inline facts and keep the `link_open` candidate branch in a dedicated helper, which reduces no-op checks in the common orchestrator path while keeping the runner shape narrow. When repeated repair passes finish on an early repair exit, the runner re-summarizes current token-level bracket/emphasis/link-close facts before returning so later stages do not depend on partial scan state.

Current broken-ref fast paths:

- `tryFixBrokenRefStrongAroundLinkTokenOnly`
- `tryFixBrokenRefLeadingCloseThenInnerStrongBeforeLinkTokenOnly`

### 2.4 Tail Repair Pass After `link_close` (Token-Only)

Main helpers:

- `fixTailAfterLinkStrongClose`
- `tryFixTailPatternTokenOnly`
- `tryFixTailDanglingStrongCloseTokenOnly`

Flow:

1. find `link_close` followed by malformed strong-tail pattern
2. apply token-only tail fix
3. if pattern does not match, keep unchanged

### 2.5 Stage Runner And Final Normalize / Safety

`processInlinePostprocessToken(...)` is now a thin runner over four stages, with broken-ref delegated to `src/token-postprocess/broken-ref.js`:

- activation (`tryActivateInlineEmphasis`)
- broken-ref repair (`runInlineBrokenRefRepairStage`)
- emphasis repair/sanitize (`runInlineEmphasisRepairStage`)
- collapsed-ref finalize (`runInlineCollapsedRefStage`)

Emphasis-bearing edits mark the earliest changed index and use suffix-only `rebuildInlineLevelsFrom(...)` when possible; full rebuild stays as a generic safety fallback.

Collapsed-ref finalize then runs:

- `convertCollapsedReferenceLinks`
- `mergeBrokenMarksAroundLinks`

Broken-ref and collapsed-ref now both use named orchestrator gate/apply helpers before the token-mutation helpers run. That keeps `processInlinePostprocessToken(...)` at the stage-dispatch level while `broken-ref.js` and `token-link-utils.js` own the candidate and rewrite details.

These helpers now have narrower boundaries as well:

- collapsed-ref scan / candidate / target / link-pair / apply helpers
- broken-mark merge scan/apply helpers

## 3. What Changed (Before -> Now)

Removed from runtime path:

- raw segment serialization
- island placeholder build/restore
- inline reparsing fallback (`md.inline.parse`)
- no-op reparse equivalence checks and caches

Removed helper groups:

- `buildRawFromTokens`
- `restoreIslands`
- `parseInlineWithFixes`
- related clone/equivalence/reparse-cache helpers

Effect:

- lower complexity in postprocess hot path
- no reparse side-effect risk from external parser/plugin chains
- deterministic fail-closed behavior for unknown malformed inputs

## 4. Test Mapping

### 4.1 Primary Gates

- Shared case parser utility:
  - `test/post-processing/case-file-utils.js` (`parseCaseSections`)
  - used by fail-safe/progress/noop/flow/fastpath case-file tests
- `test/options-edge.test.js`
  - mode/mditAttrs matrix
  - malformed broken-ref/tail shape regressions
  - key output expectations
- `test/post-processing-fastpath.test.js`
  - locks representative active fast-path hits via metrics
  - broken-ref: `strong-around-link`, `leading-close-then-inner-strong-before-link`
  - tail: `tail-pattern`, `tail-dangling-strong-close`
  - fixture source: `test/post-processing/fastpath-cases.txt`
- `test/post-processing-fastpath-roster.test.js`
  - locks active broken-ref fast-path roster against fixture-backed keys
  - prevents silent fast-path growth without fixture updates
- `test/post-processing-flow.test.js`
  - locks `brokenRefFlow` branch intent per reason:
    - `skip-no-text-marker`
    - `skip-guard`
    - `skip-no-active-signature`
    - `skip-no-fastpath-match`
    - `repaired`
  - verifies HTML parity/divergence against `postprocess:false` per branch expectation
  - fixture source: `test/post-processing/flow-cases.txt`
- `test/post-processing-broken-ref-helper.test.js`
  - locks direct helper parity between orchestrator-style hooks and fallback cache paths
- `test/post-processing-emphasis-helper.test.js`
  - locks direct token-contract behavior for:
    - `fixTrailingStrong`
    - `fixEmOuterStrongSequence`
    - `fixLeadingAsteriskEm`
    - `sanitizeEmStrongBalance`
    - `scanInlinePostprocessSignals` asterisk-wrapper balance signal
- `test/post-processing-emphasis-metrics.test.js`
  - locks representative render-time `emphasisFixers.*` and `emphasisSanitize.*` metric hits:
    - `leading-asterisk-em`
    - `em-outer-strong-sequence`
    - `trailing-strong`
    - `sanitize-em-strong-balance`
    - `attempted`
    - `attempted-after-change`
    - `repaired`
    - `skipped-balanced`
- `test/post-processing-progress.test.js`
  - verifies `postprocess:true` adds no extra `md.inline.parse` calls vs `postprocess:false`
  - fixtures: `test/post-processing/token-only-regressions.txt`
- `test/post-processing-noop.test.js`
  - heavy malformed/no-op corpus
  - asserts HTML parity with `postprocess:false`
  - fixtures: `test/post-processing/noop-heavy-cases.txt`
- `test/postprocess-gate.js` / `npm run test:postprocess-gate`
  - one-command release gate for postprocess suites + deterministic analyzers
  - includes fail-safe/noop/progress/fastpath/fastpath-roster/flow/broken-ref-helper/emphasis-helper/emphasis-metrics + postprocess-call/fastpath analyzer runs

### 4.2 Full Regression

- `npm run test:all`
  - core fixtures
  - readme fixtures
  - map diagnostics (`npm run test:map`, which now separates structural diffs from map-quality regressions/improvements and can show structural-only rewrites with `-- --show-structural`)

### 4.3 Postprocess Call Drift Probe

- `test/material/analyze-postprocess-calls.mjs`
- command:
  - `npm run analyze:postprocess-calls -- --count 2500 --seed <fixed-seed>`
- current target snapshot:
  - `extra_renders=0`
  - `extra_calls=0`

## 5. Known Limits

- Unknown malformed shapes are intentionally left as literals (fail-closed).
- Map propagation remains range-level; per-token source precision is not guaranteed after repair.

## 6. Maintenance Rules

When adding/changing token-only fast paths:

1. keep guard-first, fail-closed behavior
2. avoid touching non-target tokens/attrs/meta without explicit justification
3. add or update fixtures in:
   - `test/options-edge.test.js`
   - `test/post-processing/token-only-regressions.txt`
   - `test/post-processing/noop-heavy-cases.txt` (if fuzz-mined/no-op risk)
4. run:
   - `node test/post-processing-fastpath.test.js`
   - `node test/post-processing-progress.test.js`
   - `node test/post-processing-noop.test.js`
   - `npm run test:all`

## 7. Current Evaluation

### 7.1 Stability

- Runtime inline-parser fallback is removed and the tracked progress cases remain zero-extra-call.
- Fail-safe tests and noop-heavy tests pass, which indicates current guard behavior is stable for known malformed families.
- Full regression remains green (`npm run test:all`), including fixture/readme/map test bundles.

### 7.2 Performance

- Scan-delims benchmark snapshot (`npm run bench:scan`, reference run):
  - `markdown-it`: `avg=4.261ms`
  - `japanese-boundary`: `avg=5.818ms`
  - `japanese-boundary-guard`: `avg=5.578ms`
  - `aggressive`: `avg=5.961ms`
  - `compatible`: `avg=4.174ms`
- Postprocess-call analyzer snapshot remains zero (`extra_renders=0`, `extra_calls=0`).
- Fast-path analyzer snapshot (`npm run analyze:fastpath -- --count 8000 --seed <fixed-seed> --mode aggressive`, reference run):
  - `brokenRefFastPaths`: none observed in random malformed corpus
  - `tailFastPaths`: `tail-dangling-strong-close=975`, `tail-pattern=4`
  - `brokenRefFlow`: `candidate=468`, `skip-no-text-marker=426`, `skip-no-active-signature=12`, `skip-guard=30`
- Postprocess malformed-corpus snapshot (`npm run bench:postprocess`, median, reference run):
  - `markdown-it`: `0.0721ms/doc`
  - `japanese-boundary + postprocess:on`: `0.1069ms/doc`
  - `japanese-boundary + postprocess:off`: `0.0588ms/doc`
  - `aggressive + postprocess:on`: `0.0806ms/doc`
  - `aggressive + postprocess:off`: `0.0610ms/doc`

### 7.3 Maintainability

- Runner/helper boundaries are clearer than before: per-inline facts, staged orchestrator helpers, the dedicated broken-ref runner, and collapsed-ref / link-mark finalize helpers are now split into narrower units, with broken-ref and collapsed-ref both using named gate/apply helpers at the orchestrator boundary.
- Postprocess is still pattern-heavy and order-dependent in broken-ref fast paths.
- Guard predicates are still numerous; correctness is test-backed, but the remaining readability cost is concentrated in broken-ref signature/guard logic rather than the outer runner flow.
- Optional observability exists via `state.env.__strongJaPostprocessMetrics`:
  - `brokenRefFastPaths`
  - `tailFastPaths`
  - `brokenRefFlow` (candidate/skip/repaired diagnostics)
  - `brokenRefCandidateFlow` (candidate -> guard -> fast-path dispatch/result)
  - `brokenRefPasses` (budgeted/executed/repaired/stopped-no-repair)
  - `emphasisFixers` (`leading-asterisk-em`, `em-outer-strong-sequence`, `trailing-strong`, `sanitize-em-strong-balance`)
  - `emphasisSanitize` (`attempted`, `attempted-after-change`, `attempted-pre-scan-risk`, `repaired`, `no-change`, `skipped-balanced`)

### 7.4 Main Concerns

1. Fast-path growth risk:
   - Adding one-off malformed shapes can increase branching and review cost.
2. Guard interaction complexity:
   - Multiple skip predicates can hide conversion opportunities or make future behavior harder to predict.
3. Map granularity:
   - Repairs preserve range-level map continuity, not per-token precision.
4. Documentation drift risk:
   - User-facing docs must stay aligned with strict token-only behavior.
5. Retired fast-path risk:
   - three previously dormant broken-ref fast paths were removed after repeated no-hit analysis.
   - if new malformed families reappear in real corpus, they may need explicit reintroduction with fixtures.

## 8. Maintenance Plan (Ongoing)

### 8.1 Phase A: Naming/Doc Consistency Hardening

- Keep code and docs synchronized on `token-only`/`rewrite` wording.
- Remove remaining user-facing references that imply runtime parser fallback behavior.
- Keep AGENTS + docs synchronized as the source of maintenance truth.

Done when:

- no stale runtime-parser-fallback explanation remains in README/docs
- postprocess helper naming is consistent with rewrite behavior

### 8.2 Phase B: Guard Simplification Without Behavior Change

- Extract/merge related guard logic into clearer grouped predicates (noise guard, wrapper guard, delimiter guard).
- Preserve exact output by running full regression before/after each small refactor.
- Prefer structure-only refactors (no behavior changes) in separate commits.
- Progress:
  - extracted low-confidence range gate (`isLowConfidenceBrokenRefRange`)
  - consolidated low-confidence wrapper/risk scans into one helper (`buildBrokenRefWrapperRangeSignals`) reused across leading-close / preexisting-close-only / wrapper-imbalance checks
  - removed redundant wrapper-imbalance pass (`getAsteriskWrapperRangeInfo`) by reusing wrapper signals in `shouldAttemptBrokenRefRewrite`
  - merged risk+wrapper guard signals into single-pass `buildBrokenRefWrapperRangeSignals(..., firstTextOffset)` and removed redundant range helpers
- extracted broken-ref single-pass helper (`runBrokenRefRepairPass`)
- extracted inline pre-scan helper (`scanInlinePostprocessSignals`)
- sanitizer now runs only when pre-scan or earlier repair indicates possible asterisk-wrapper imbalance
- broken-ref repairs now use a hybrid loop:
  - first run a cheap existence probe
  - execute one repair pass immediately
  - only after a successful repair, recompute the remaining guard-passed candidate budget for follow-up passes
- ranges without any strong-token fast-path signal now short-circuit to `skip-no-active-signature` before fast-path dispatch
- extracted repair loop helper (`runBrokenRefRepairs`)
- extracted per-inline orchestrator (`processInlinePostprocessToken`)
- extracted tail candidate scan/apply helpers (`scanTailRepairCandidateAfterLinkClose`, `tryRepairTailCandidate`)
- flattened broken-ref rewrite decision into a single helper (`shouldAttemptBrokenRefRewrite`) for lower call depth
- moved broken-ref repair-budget precondition to inline orchestrator and delayed `scanState` allocation to repair-needed cases only
- all postprocess and full regression suites remain green

Done when:

- `src/token-postprocess/orchestrator.js` + `src/token-postprocess/guards.js` flow is shorter and easier to audit
- `npm run test:all` and postprocess-specific tests stay green

### 8.3 Phase C: Fast-Path Policy Tightening

- Keep existing fast paths, but require a strict admission rule for new ones:
  - real failing corpus sample
  - dedicated fixture in `test/options-edge.test.js` or `test/post-processing/*`
  - no-op/progress regression checks
- Keep active-path hit locks in `test/post-processing-fastpath.test.js`.
- Avoid adding speculative fast paths that do not have reproducible malformed input evidence.
- Progress:
  - retired three dormant broken-ref fast paths after repeated no-hit evidence:
    - `strong-tail-before-link`
    - `trailing-em-close-before-link`
    - `demote-isolated-strong-wrapper-before-link`
  - active broken-ref paths are now reduced to:
    - `strong-around-link`
    - `leading-close-then-inner-strong-before-link`
  - added active-signature precheck before fast-path dispatch to skip known non-matching candidates earlier
  - coupled path signature checks to the fast-path dispatch table to avoid drift between "active-signature" and "apply" logic
  - active-path locks remain green (`test/post-processing-fastpath.test.js`).

Done when:

- every active fast path has at least one explicit regression fixture
- dormant fast paths are either promoted to active with reproducible fixtures or explicitly retired
- no fixture relies on undocumented pattern behavior

### 8.4 Phase D: Performance Tracking Gate

- Add a lightweight benchmark note/checklist for release-time comparison:
  - `npm run test:postprocess-gate`
  - `npm run bench:scan`
  - `npm run bench:postprocess`
  - `npm run analyze:postprocess-calls -- --count 2500 --seed <fixed-seed>`
  - `npm run analyze:fastpath -- --count <count> --seed <fixed-seed> --mode <mode>`
- Track relative deltas per mode; focus on no-regression for `japanese-boundary` and `japanese-boundary-guard`.

Done when:

- a consistent benchmark procedure is documented and repeatable
- release checks include both correctness and performance gates

### 8.5 Phase E: Map Quality Follow-up (Optional)

- Investigate whether post-repair per-token map refinement is feasible without high complexity.
- Keep current range-level behavior if precision gain is small or risky.

Done when:

- clear keep/upgrade decision is documented with tradeoffs

### 8.6 Planning Artifact Policy

- Do not create additional one-off plan files for this topic.
- Keep active planning in `docs/note-post-processing.md`.
- Keep migration history and detailed chronology in `docs/note-post-processing-dev-log.md`.
- Create a new standalone plan document only when scope expands beyond postprocess token-only maintenance (for example a cross-module redesign).

### 8.7 Operational Checklist

1. Keep docs/tests naming consistent with strict token-only runtime.
   - README/README_JA/AGENTS/current notes should not imply runtime parser re-entry.
2. Keep deterministic malformed-corpus branch reporting in release checks.
   - Run:
     - `npm run analyze:postprocess-calls -- --count 2500 --seed <fixed-seed>`
     - `npm run analyze:fastpath -- --count 8000 --seed <fixed-seed> --mode aggressive`
   - Compare across releases:
     - `brokenRefFlow.*`
     - `brokenRefFastPaths.*`
     - `tailFastPaths.*`
3. Keep guard-path refactors behavior-preserving.
   - Verify:
     - `npm run test:all`
     - `node test/post-processing-flow.test.js`
4. Keep map policy explicit.
   - Current policy: range-level map propagation.
   - Revisit only if source-map precision becomes a hard requirement.
5. Keep fast-path lifecycle conservative.
   - Add fast paths only with reproducible malformed corpus + dedicated fixture + metrics lock.
   - Retire dormant paths after repeated no-hit evidence and fixture confirmation.
   - Keep roster lock:
     - `node test/post-processing-fastpath-roster.test.js`

## 9. Document Roles

- `docs/note-post-processing.md` (this file)
  - current implementation workflow, evaluation, and active maintenance plan
- `docs/note-post-processing-dev-log.md`
  - migration history / implementation decision log
