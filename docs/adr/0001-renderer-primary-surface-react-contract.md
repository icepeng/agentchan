# ADR 0001: Renderer Is A React Primary Surface

Status: Accepted  
Date: 2026-04-25

## Context

The renderer is the main screen users spend time with, not a secondary extension
panel. Earlier Renderer V1 drafts explored a generic renderer module contract
where templates owned lifecycle details. That would have made the runtime
flexible, but pushed lifecycle complexity into template code.

The current templates exposed the problem: HTML-string renderers relied on DOM
morphing, inline script workarounds, and listener cleanup rules. Keeping a
generic lifecycle contract would optimize for hypothetical framework diversity
over the product's primary surface quality.

Other products usually avoid this middle ground: they either expose a restricted
declarative UI, choose one framework/component model, or use a full iframe or
webview boundary with message passing. Agentchan should choose a primary
authoring model now and keep runtime transport replaceable later.

## Decision

Renderer authoring is React-first and React-only for the public V1 contract.

Project renderers should be written as `renderer/index.tsx` and default-export a
React component:

```tsx
import { Agentchan } from "agentchan:renderer/v1";

export default function Renderer({ snapshot, actions }: Agentchan.RendererProps) {
  return <main>...</main>;
}

export function theme(snapshot: Agentchan.RendererSnapshot): Agentchan.RendererTheme {
  return { base: { accent: "#3d7a6d" } };
}
```

The public renderer surface is:

- `Renderer({ snapshot, actions })`
- optional named `theme(snapshot)`
- `Agentchan.fileUrl(snapshot, fileOrPath)`
- type helpers from `agentchan:renderer/v1`
- relative imports and CSS imports inside `renderer/`

Host lifecycle, snapshot subscription, ShadowRoot, iframe, Blob import, and
message transport are runtime implementation details. They should not be part
of the renderer authoring API.

## Consequences

Future renderer work should preserve these properties:

- Templates should be converted to React components instead of adding adapter
  authoring paths around HTML strings or template-owned lifecycle hooks.
- Do not add generic renderer-module authoring paths to committed template
  instructions unless a later ADR changes this decision.
- Do not reintroduce inline `<script>` output, host-side script re-execution, or
  renderer HTML string morphing as a primary authoring path.
- Keep renderer state and animation continuity in React terms: stable component
  types, stable keys, local state, and effects.
- Keep iframe migration possible by making snapshots serializable, actions
  asynchronous-safe, file access go through `Agentchan.fileUrl`, and renderer
  code independent from host DOM globals.

Runtime code may still use lifecycle functions internally to load and dispose
the React renderer. That shape is not a public template contract.

## Reconsider When

Revisit this ADR only if one of these becomes real:

- A committed template needs a non-React renderer that cannot reasonably be
  wrapped in a React component with `ref` and effects.
- Agentchan starts supporting third-party renderer packages with independent
  release cycles and framework choices.
- Security requirements force iframe sandboxing where the React component
  contract cannot be preserved over message passing.
- A restricted declarative UI becomes more valuable than custom React surfaces.
