---
name: deepen-adrs
description: Audit and refine ADRs in docs/adr/ using the deep-module framing — a good ADR is a deep module of decision, not a dump of discussion. Use when reviewing ADRs produced by grill-with-docs, when an ADR feels meeting-notes-shaped or bloated, or when the user wants to tighten a decision record before merging.
---

# Deepen ADRs

Audit and refine ADRs through the **deep-module lens**.

- **Good ADR = deep module of decision.** Small surface (a one-line quote suffices to use it) with concentrated non-obvious context, rejected alternatives, and constraints behind it. A future reader reconstructs the same judgment from the same spot.
- **Bad ADR = dump of discussion.** Bloated surface (long meeting-notes prose), or no leverage behind the surface (self-evident rationale, options nobody would seriously propose, multiple decisions bundled together).

This skill *re-tailors* ADRs that `/grill-with-docs` *produced*. Whether an ADR should exist at all is delegated to [grill-with-docs/ADR-FORMAT.md](../grill-with-docs/ADR-FORMAT.md) — don't re-litigate that here.

## Glossary

Treat the ADR itself as a module. Reuse the architecture vocabulary from [improve-codebase-architecture/LANGUAGE.md](../improve-codebase-architecture/LANGUAGE.md) verbatim — don't swap in synonyms.

- **Decision** — the single stance the ADR picks. The core of the surface.
- **Surface** — what a reader must read to *use* the ADR. Shorter = deeper.
- **Concentrated rationale** — the non-obvious context / rejection reasons / constraints behind the surface. The body that earns depth while keeping the surface small.
- **Leverage** — the ADR's power to prevent future re-litigation. "This option was already rejected" collapses N future debates into one line.
- **Locality** — one decision's *why* lives in one ADR. If the same *why* is scattered across multiple ADRs, they're merge candidates; if two distinct *whys* live in one ADR, it's a split candidate.

## Tests

Full versions in [DIAGNOSTICS.md](./DIAGNOSTICS.md). The seven tests:

- **Deletion test** — If this ADR vanished, would a future engineer rediscover the same decision on their own? If yes, it's a pass-through ADR.
- **Single-sentence test** — Can the decision be stated in one sentence? If not, the surface is bloated or two decisions are bundled.
- **Re-litigation test** — Would any of the rejected options *actually* be re-proposed in the future? Options nobody would suggest are padding.
- **Load-bearing why test** — Is the rationale a situation-independent constraint/trade-off, or a momentary preference? If the latter, the ADR's foundation is weak.
- **Vocabulary alignment test** — Is the surface written in `CONTEXT.md`'s canonical terms? Synonyms / ad-hoc phrasing get corrected on sight.
- **Optional section test** — Apply the deletion test *separately* to each of `Status` / `Considered Options` / `Consequences`. If removing the section loses information, keep it; otherwise strip it. Default is "absence is correct" — per `ADR-FORMAT.md`, "Most ADRs won't need them".
- **Korean writing test** — Does the prose read as native Korean technical writing, not translated English? Translationese and English metaphor calques are flagged.

## Process

### 1. Audit

Read the target ADRs (one or many) and for each:

1. Extract the **decision sentence** from the opening paragraph. If extraction feels forced, that's a _shallow_ signal.
2. Apply the six tests above. Note where signals fire.
3. Summarize in a table:

   | ADR | Decision sentence | Diagnosis | Recommendation |
   |---|---|---|---|
   | NNNN | ... | one or more codes from §Tests, or `ok` | tighten · split · merge · delete · keep |

No need to sweep every ADR at once. If the user scopes it, only audit that scope.

**Code grounding (on explicit request only).** If the user explicitly asks to verify against the code, use `Agent` with `subagent_type=Explore` on the area each ADR constrains, and let the findings sharpen the `Deletion` / `Self-evident decision` / `Implementation log` signals.

### 2. Refinement loop

Once the user picks an ADR, **work one decision at a time in conversation**. Always present the change before touching the file.

- **Tighten the surface** — Compress the opening to *decision sentence + load-bearing reason sentence*. Push elaboration to the next paragraph. Cut self-evident commentary.
- **Concentrate the rationale** — Pull scattered context / rejection reasons / constraints into one place. If the same reason appears twice, the rationale isn't concentrated yet.
- **Prune options** — Keep only options that could plausibly be re-proposed. One line per rejection reason, only the *load-bearing* portion.
- **Split** — If two decisions live in one ADR and don't share a *why*, split them. Assign new numbers, mark the original as superseded if its content was wholly absorbed elsewhere.
- **Merge** — If adjacent ADRs share the same *why*, merge them. The absorbed file keeps only a `superseded by ADR-NNNN` frontmatter line; the body moves to the absorbing ADR.

Stay inside [grill-with-docs/ADR-FORMAT.md](../grill-with-docs/ADR-FORMAT.md)'s format and publish criteria — resist the urge to fill empty sections.

### 3. Cross-ADR coherence

When auditing multiple ADRs, finish with:

- Flag contradicting or duplicating ADR pairs.
- If one ADR depends on another's *implicit premise*, suggest surfacing that dependency explicitly.
- Flag missing `superseded by` links.

## When NOT to deepen

- If the ADR is one paragraph and the decision is self-evident, leave it alone. "Let's add more" is the anti-pattern.
- Zero rejected options is not a defect. If there were no real alternatives, leave the section out.
- If the user disagrees with the ADR's *facts*, this skill is out of scope — drop back into `/grill-with-docs`.
- Don't treat codegen outputs or auto-generated docs as ADRs.