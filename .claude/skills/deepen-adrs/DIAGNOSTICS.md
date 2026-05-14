# ADR Diagnostics

The full version of `SKILL.md`'s seven tests, a catalog of shallow signals, and how to apply each refinement move.

## Depth tests (run these explicitly)

### Deletion test

> If this ADR vanished, could a future engineer rediscover the same decision on their own?

- "Yes — the code shape alone makes it obvious" ⇒ the ADR is a pass-through. The decision is self-evident; **delete** candidate.
- "No — code alone doesn't reveal *why this shape*" ⇒ the ADR carries leverage. **keep**.

Read the code alongside the ADR. If the ADR's *why* is already engraved in the code's *form*, the ADR duplicates it.

### Single-sentence test

> State the decision in one sentence. Does it come out naturally?

- If one sentence bundles two decisions ("we adopt X and also introduce Y"), it's a **split** candidate.
- If one sentence is technically possible but the reader has to re-read the opening two or three times, the surface is bloated — **tighten**.

### Re-litigation test

For each rejected option, ask:

> Six months from now, would someone actually propose this again?

- "Plausibly yes" ⇒ the option earns leverage. Keep one line for the rejection reason.
- "Nobody would" ⇒ padding. **prune**.

### Load-bearing why test

Ask the same question of each sentence of rationale:

> Will this *why* carry the same weight six months from now?

- Permanent constraint / trade-off ⇒ load-bearing. Keep.
- "We didn't have time right now" / "the current team happens to know X" ⇒ ephemeral. Signal that the ADR itself is shaky — worth dropping back into `/grill-with-docs`.

### Vocabulary alignment test

Are the nouns in the surface (opening paragraph + decision statement) canonical `CONTEXT.md` terms?

- Synonyms / ad-hoc phrasing get corrected immediately. When in conflict with an _Avoid_ entry, the ADR always loses.
- Architecture vocabulary (module / interface / depth / seam) aligns with `improve-codebase-architecture/LANGUAGE.md`.

### Optional section test

Treat each of the three optional sections from `grill-with-docs/ADR-FORMAT.md` — `Status` / `Considered Options` / `Consequences` — as a **separate module** and run the deletion test on it. Default assumption: "absence is correct."

#### Status frontmatter

- **Keep** — Only when the ADR has been revisited (superseded / deprecated). If superseded, the line must say *by which ADR* (`superseded by ADR-NNNN`).
- **Strip** — If every ADR carries `accepted`, the frontmatter is noise. Status earns its keep only when a minority of ADRs have one — that's what makes it a signal.
- **Missing check** — If the body claims this ADR supersedes another but the superseded ADR has no status, flag for repair.

#### Considered Options

Already covered by `Re-litigation test` and `Padded options`. Additionally:

- **Every ADR has Considered Options** ⇒ someone is filling out a template. ADRs with no real alternatives should leave the section out.
- **Rejection reasons restate the body's *why*** ⇒ unconcentrated rationale. If the body's *why* already implies the rejection, collapse the option to one line or remove it entirely.

#### Consequences

- **Keep** — Only for *non-obvious downstream effects*. "Going with X locks us into Y's migration model" / "this decision makes Z context own ID issuance."
- **Strip** — "Maintenance gets easier" / "performance improves" / restating the decision in different words = padding.
- **Promote** — If the Consequences section is actually the load-bearing *why*, move it up into the opening paragraph. A Consequences section that hides the real trade-off makes the surface lie.

#### Diagnosis markers

Use these in the audit table's `Diagnosis` column:

- `status-missing` — Body describes a supersession but frontmatter is absent.
- `status-noise` — Same status repeated across all ADRs.
- `options-template` — Looks dutifully filled-in rather than load-bearing.
- `consequences-padding` — Consequences restates the decision.
- `consequences-load-bearing` — Consequences holds the real *why*; promote into the body.

## Shallow indicators

Signals that surface during a quick scan. If any fire, drop into the depth tests above to confirm.

### Meeting-notes shape

> "We first looked at X, then someone proposed Y, and we ended up at Z."

ADRs record the decision's *current state*, not the *flow* of the meeting. If the narrative is chronological, rewrite to pull out only the decision and its rationale.

### Padded options

The "Considered Options" section contains entries with one-line rejection reasons that don't actually constrain anything, or options that were never real candidates.

> "Option: just hardcode it. Rejected: hard to maintain."

These entries carry zero leverage. Delete.

### Tautological why

> "We adopt X because X fits our system best."

The rationale is just the decision restated. The ADR needs one more sentence naming *which* constraint makes X fit. If that sentence can't be written, the ADR itself is thin.

### Implementation log

The ADR body mentions specific function / file names / API signatures repeatedly.

The ADR's surface is the *shape of the decision*, not the *location of the implementation*. Leave concrete identifiers to the code; the ADR speaks one level above.

### Multi-decision bundling

> "We use a monorepo, the package manager is bun, and CI is wired through turborepo."

Fine if all three share the same *why*. If not, split into three ADRs.

### Self-evident decision

The decision is recoverable from the code / directory layout / standard tool conventions.

> "We use TypeScript."

No future re-litigation pressure. Delete.

### Korean writing test

Scan each Korean verb and noun. For any that maps to an English physical / spatial metaphor, ask:

> Would a Korean technical author have chosen this word without seeing the English source?

If no, swap to a native alternative. The table below is a **calibration set** that teaches the threshold, not an exhaustive ban list.

#### Seed calibration set

| English metaphor | Direct translation (avoid) | Natural alternatives |
|---|---|---|
| build (a system, pipeline) | 짓다, 짓는다 | 만들다, 구축하다, 개발하다 |
| crystallize (a decision) | 굳다, 결정화되다 | 확정되다, 윤곽이 잡히다, 명확해지다 |
| live in (a module, file) | 산다, 살고 있다 | 위치하다, 들어 있다, 모이다 |
| close over (assets, scope) | 닫힌다 (non-physical context) | 자족적이다, 안에서 완결된다, 외부 의존이 없다 |
| surface (a problem) | 표면화하다, 표면에 드러낸다 | 드러내다, 부각하다, 명시하다 |
| pin (a value, decision) | 박다, 박히다 | 고정하다, 못박다, 묶다 |

## Refinement moves

The *post-move shape* for each move. Real ADR text always starts with an opening of *decision + load-bearing reason* (one or two sentences), then the body / Considered Options follow.

### Tighten the surface

Before:

> After reviewing several approaches to separating a component's appearance from its behavior, we have decided to adopt a composition style based on render props. This approach ...

After:

> Component composition uses render props. The coupling between appearance and behavior must be decided at the call site.

Decision sentence + reason sentence. Elaboration goes in the next paragraph.

### Concentrate the rationale

Gather scattered *whys* into one place. If the same reason appears twice, fold it into one. If the body keeps saying "and additionally...", the rationale isn't yet concentrated.

### Prune options

Each rejected option must:

- Be a plausibly re-proposable alternative.
- Have a one-line rejection reason, only the *load-bearing* part.

If there are three or more, check whether they collapse into a single category.

### Split

If one ADR contains two *decisions* whose *whys* don't overlap:

1. Assign new ADR numbers (highest existing + 1, +2, ...).
2. Keep only the core decision in the original; move the rest into the new ADRs.
3. Add a one-line cross-reference in the original ("introduced alongside ADR-NNNN").

### Merge

Two adjacent ADRs share the same *why*:

1. Keep the more general (or older) one.
2. The absorbed file keeps only a `superseded by ADR-NNNN` frontmatter line; the body migrates to the absorbing ADR.
3. Add one sentence to the absorbing ADR's opening explaining that both decisions share a *why*.

## Output protocol

- Use the same table schema from `SKILL.md` when presenting diagnoses.
- All textual edits land as *Before / Output scan / After*:
  - **Before** — the original ADR text being changed.
  - **Output scan** — scan the planned After for words listed in the *Direct translation (avoid)* column of the `Korean writing test` calibration table, and for em dashes (—). List each hit with its native replacement; if none, write "no hits".
  - **After** — the planned text with all scan hits replaced. The user sees this once before any file write.
- When working through multiple ADRs, modify only one at a time. Don't touch other ADRs until the user moves on.

