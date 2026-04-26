# Agentchan Renderer Runtime

This directory is Agentchan's internal baseline dependency sidecar for renderer
bundling in compiled executable builds.

It is not a public per-project dependency sandbox. Stable renderers should only
use the public imports documented in the renderer ADR and template instructions.

If this environment is missing or corrupted in a local build artifact, repair it
with:

```powershell
bun install
```
