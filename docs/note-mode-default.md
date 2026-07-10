# Default Mode Decision

## Status

Keep `japanese` mapped to `japanese-boundary-guard`.

Decision reviewed: 2026-07-11, package version 0.9.3.

This is a conservative product-policy decision for user-facing Japanese and mixed Japanese/English prose. It is not a claim that `japanese-boundary-guard` can infer every author's intent.

## Evidence

The current evaluation sources are:

- `example/author-intent-cases.txt`: 16 curated author-intent cases
- `example/author-intent-cases.html`: generated side-by-side mode output
- `example/mixed-ja-en-stars-mode.txt`: larger mixed-text stress cases
- `example/inline-wrapper-matrix.html`: wrapper and boundary conversion matrix

The author-intent generator reports two different metrics:

- **Assigned preferred count**: how often an editor explicitly named a mode as preferred. This describes annotation distribution, not accuracy.
- **Preferred-output coverage**: how often a mode's actual HTML equals the HTML from a preferred mode for that case. Modes that render the same HTML receive equal credit.

Current preferred-output coverage:

| Mode | Coverage |
| --- | ---: |
| `japanese-boundary-guard` | 13/16 |
| `japanese-boundary` | 12/16 |
| `aggressive` | 9/16 |
| `compatible` | 8/16 |

These values are evidence for the current policy, not general naturalness scores. The corpus is small, curated, and has no independent holdout set yet.

## Why the Guard Remains the Default

- It has the highest current preferred-output coverage.
- It keeps the shared Japanese boundary and token-only link/ref repairs.
- It suppresses space-leading ASCII conversions that are ambiguous and visually surprising in ordinary mixed prose.
- When intent is uncertain, preserving literal markers is safer than producing unintended emphasis.
- Users who intentionally author space-leading English/code emphasis can opt into `japanese-boundary`.

The margin over `japanese-boundary` is small. The decision therefore rests on the conservative default policy as well as the corpus result.

## Irreducible Intent Ambiguity

The author-intent corpus includes the same Markdown source twice with opposing intent: one case wants `* English*` left literal, while the other wants it emphasized. A deterministic parser that sees only the source cannot satisfy both cases simultaneously.

This sets an important boundary: no source-only heuristic can strictly dominate the current guard for all author intent. A different mode can choose a different policy, but it cannot recover information that is absent from the input.

## Candidate Beyond the Current Guard

A possible experimental policy is a contextual space-leading guard:

- allow selected single-`*` space-leading ASCII spans when the closing delimiter attaches directly to continuing Japanese prose;
- allow locally paired code/link wrappers under the same condition;
- keep multi-marker runs and externally space-separated spans strict.

This could recover cases such as `* English craft*という...` and `* \`umami\`*を...` without enabling every `* English*` span.

It is not ready to replace the default because:

- it cannot resolve identical-source intent conflicts;
- the current corpus is too small and too close to the proposed heuristic;
- matching closer-side context from opener handling adds algorithmic and performance complexity;
- `japanese-boundary` already provides an explicit relaxed policy.

If implemented, it should begin as an experimental mode and must pass:

1. a separate holdout author-intent corpus;
2. no-regression checks for current fail-closed and mixed-text cases;
3. `compatible` parity tests;
4. plugin-order and map checks;
5. paired performance benchmarks for no-op, normal, malformed, and delimiter-heavy inputs.

## Revisit Conditions

Reconsider the default only when all of the following are available:

- a larger corpus not primarily designed around the existing guard;
- a held-out set that was not used to tune the candidate;
- output-equivalence-aware scoring rather than preferred-name counts alone;
- explicit classification of over-conversion versus missed intended emphasis;
- full correctness and performance gates.
