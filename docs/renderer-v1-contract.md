# Renderer V1 Contract

Status: archived draft
Date: 2026-04-24
Superseded by: [ADR 0001: Renderer Is A React Primary Surface](./adr/0001-renderer-primary-surface-react-contract.md)

This document is kept only as a historical marker. Do not use it to guide
renderer implementation or template authoring.

The active contract is:

- Project renderers live at `renderer/index.tsx`.
- The entrypoint default-exports a React component receiving
  `Agentchan.RendererProps`.
- Optional project page colors are exported as a named `theme(snapshot)`
  function.
- Renderer source may import `agentchan:renderer/v1`, `react`, relative modules
  inside `renderer/`, and CSS from that graph.
- Renderer source does not export `mount(host)` or an adapter-produced module.

Runtime details such as ShadowRoot mounting, React root lifecycle, Blob import,
subscription wiring, and a future iframe transport belong to Agentchan, not to
renderer authors.
