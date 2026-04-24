# Renderer V1 Implementation Plan

Status: archived draft
Date: 2026-04-24  
Superseded by: [ADR 0001: Renderer Is A React Primary Surface](./adr/0001-renderer-primary-surface-react-contract.md)

This document is kept only as a historical marker. Do not continue work from
the earlier generic renderer-module plan.

The implemented direction is React-first:

- Public renderer authoring uses only `renderer/index.tsx`.
- The entrypoint default export is a React component receiving
  `Agentchan.RendererProps`.
- A named `theme(snapshot)` export may provide page color tokens.
- The renderer helper surface is `Agentchan.fileUrl()` plus exported types.
- `Agentchan.react()`, `Agentchan.vanilla()`, public `mount(host)`, and
  `renderer/index.ts` are not part of the active plan.

When changing renderer behavior, update ADR 0001 or write a new ADR before
changing the public contract.
