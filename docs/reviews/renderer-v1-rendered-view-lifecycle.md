# Renderer V1 RenderedView Lifecycle Review

Status: review follow-up
Date: 2026-04-25

## Scope

This note reviews the React renderer host lifecycle in:

- `apps/webui/src/client/features/project/RenderedView.tsx`
- `apps/webui/src/client/entities/renderer/useRendererOutput.ts`
- `apps/webui/src/client/entities/renderer/RendererViewContext.tsx`

`example_data/` template changes are out of scope.

## Current State

`RenderedView` is now the host runtime for Renderer V1. It is responsible for:

- loading a bundled renderer module through a Blob URL
- validating the default React component export
- validating and applying optional `theme(snapshot)`
- creating ShadowRoots
- injecting renderer CSS artifacts
- creating and retaining layer React roots
- bridging `actions.send()` and `actions.fill()`
- providing snapshot updates through `useSyncExternalStore`
- refreshing renderer output during streaming
- responding to workspace file changes
- cross-fading between project renderers
- guarding stale async fetch/import results

The current implementation uses two renderer layers. One layer is active, the
other can temporarily remain as the exiting layer during cross-fade.

## Review Findings

### Too Many Responsibilities In One Component

`RenderedView.tsx` holds module loading, ShadowRoot setup, CSS injection,
external-store subscription, theme evaluation, action bridging, stream refresh,
and transition state.

This made regressions hard to isolate. Recent bugs crossed these concerns:

- stale fetch/import results could render the wrong project
- root unmount during React rendering caused a race
- fixed/exiting layers could flicker during transition
- host-provided behavior such as action delegation and scroll completion needed
  explicit contract decisions

The component now works better, but the blast radius remains high.

### Transition Logic Is Host-Specific

The hard part is not just opacity animation. The host must wait for the incoming
renderer to load, mount, and paint before fading out the previous renderer.

Generic animation helpers can simplify the exit/enter opacity state, but they do
not remove the need to manage:

- Blob import lifecycle
- ShadowRoot lifecycle
- CSS artifact lifecycle
- snapshot subscription lifecycle
- stale async result guards
- theme updates

This is why an animation library alone would not have fixed the race bugs.

### AnimatePresence May Still Help After Decomposition

`AnimatePresence` is not a replacement for the renderer host lifecycle, but it
can own a narrow piece: keeping the exiting layer mounted long enough to animate
opacity.

It is worth re-evaluating after the host is decomposed. The target should be to
remove hand-managed transition state such as `phase`, `exitingLayer`,
`frontPaintKey`, `capturePaintKey`, and cleanup timers if a library can express
the same behavior with less custom code.

### Same-Slug Bundle Generations Need Explicit Identity

Current stale guards reject async results whose slug no longer matches the
active project. Effect cleanup usually covers same-slug bundle replacement, but
the invariant would be clearer with an explicit generation token for each
bundle/import attempt.

This matters when the same project renderer is edited repeatedly and builds
resolve out of order.

## Improvement Plan

### 1. Split RenderedView Into Lifecycle Units

Keep `RenderedView` as orchestration, but extract focused units.

Suggested shape:

```text
features/project/renderer-host/
  RenderedView.tsx
  RendererLayer.tsx
  useRendererModule.ts
  useRendererSnapshots.ts
  useRendererTransition.ts
  rendererRuntime.ts
```

Initial boundaries:

- `rendererRuntime.ts`: install global runtime and import bundled module
- `RendererLayer`: ShadowRoot, CSS injection, React root, module render
- `useRendererSnapshots`: `useSyncExternalStore` listener sets and snapshot refs
- `useRendererTransition`: active/exiting layer state and fade cleanup
- `RenderedView`: wires project selection, output refresh, stream refresh, and
  error display

### 2. Add Bundle Generation Guards

Assign a monotonically increasing generation id whenever a bundle render attempt
starts. Async import results should apply only if:

- component is still mounted
- layer is still the intended active layer
- active project slug still matches
- generation id still matches

This makes same-slug rapid edits deterministic.

### 3. Re-evaluate AnimatePresence For Layer Exit

After layer responsibilities are isolated, prototype `AnimatePresence` around
the host layer list.

Adopt it only if it removes custom transition state without obscuring renderer
load/paint readiness. Keep direct implementation if the library forces unclear
workarounds around ShadowRoot or paint gating.

### 4. Preserve Paint-Gated Cross-Fade

Any refactor must preserve the current behavioral requirement:

- outgoing renderer remains visible while the incoming renderer loads
- fade-out starts only after the incoming renderer has mounted and painted
- rapid A -> B -> C switches do not let stale B cleanup erase C

### 5. Add Browser Regression Checks

Use `agent-browser` or an equivalent browser-level check for:

- quick switching across renderer projects
- quick switching between renderer project and missing-renderer project
- repeated same-project renderer edits
- no console warning for synchronous React root unmount
- active sidebar project matches active ShadowRoot renderer text/CSS

## Completion Criteria

- `RenderedView.tsx` no longer owns every lifecycle concern directly.
- Async renderer import uses explicit generation guards.
- Cross-fade behavior remains paint-gated.
- Decision on `AnimatePresence` is documented with a small prototype result.
- Browser QA covers rapid transitions and console warnings.
- `cd apps/webui && bunx tsc --noEmit` and `bun run lint` pass.

## Follow-Up Result

Implemented decomposition under
`apps/webui/src/client/features/project/renderer-host/`:

- `rendererRuntime.tsx`: V1 runtime installation and Blob module import/export
  validation.
- `RendererLayer.tsx`: ShadowRoot creation, CSS artifact injection, retained
  React root, and module rendering.
- `useRendererSnapshots.ts`: per-layer snapshot refs and
  `useSyncExternalStore` subscriptions.
- `useRendererTransition.ts`: active/exiting layer state, paint-gated fade, and
  fade cleanup.
- `useRendererModule.ts`: bundle import, explicit generation guard, stale
  result rejection, and paint notification.
- `RenderedView.tsx`: project/output refresh orchestration, streaming refresh,
  action bridge, theme/error dispatch, and layer wiring.

`useRendererOutput()` now also assigns a refresh generation before fetching the
bundle and workspace files, so same-slug renderer rebuilds cannot let an older
fetch result replace a newer one.

The renderer host transition is a single-surface statechart:

```text
stable
  -> fading-out
  -> waiting-for-import
  -> applying-theme
  -> mounting
  -> fading-in
  -> stable
```

Import may finish before fade-out completes, but the host only stores the
pending renderer. It applies the next theme after fade-out, then mounts the next
renderer after the theme transition window. The next renderer is therefore never
visible before the previous renderer has faded out.

### AnimatePresence Decision

Prototype result: `apps/webui` does not currently depend on `framer-motion` or
`motion`. After switching to the single-surface statechart, there is no exiting
renderer layer to keep mounted for opacity animation, so `AnimatePresence` no
longer fits this lifecycle.

Do not adopt `AnimatePresence` for renderer project switches.
