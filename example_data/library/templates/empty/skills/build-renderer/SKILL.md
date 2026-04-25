---
name: build-renderer
description: "Analyze files/ and create or update the React renderer."
environment: meta
metadata:
  author: agentchan
  version: "3.0"
---

Create or edit `renderer/index.tsx` based on the project's `files/` structure
and user intent.

## Workflow

1. Read the existing `renderer/` directory if it exists.
2. Read `SYSTEM.md` and the most important files under `files/`.
3. Ask the user about style, priorities, and whether to rewrite or make a
   targeted change when the desired renderer is ambiguous.
4. Edit the React renderer and its CSS or local helper modules.
5. Run `validate-renderer`. Fix failures and validate again before reporting
   success.

## Contract

Use the React primary-surface renderer contract:

```tsx
/** @jsxImportSource agentchan:renderer/v1 */
import { Agentchan } from "agentchan:renderer/v1";
import { useState } from "react";
import "./index.css";

export default function Renderer({ snapshot, actions }: Agentchan.RendererProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <button onClick={() => void actions.fill(selected ?? "Next scene")}>
      Fill prompt
    </button>
  );
}

export function theme(snapshot: Agentchan.RendererSnapshot): Agentchan.RendererTheme | null {
  return { base: { accent: "#6aa" } };
}
```

Rules:

- The only entrypoint is `renderer/index.tsx`.
- Default export a React component.
- CSS must be part of the renderer graph, usually `import "./index.css"`.
- Relative imports must stay inside `renderer/`.
- External browser libraries must be vendored under `renderer/`.
- External fonts may be declared with React 19 `<link rel="preconnect">` and
  `<link rel="stylesheet" precedence="renderer-fonts">`. Host CSP controls
  allowed origins; keep actual styling in renderer CSS.
- Allowed bare imports are `agentchan:renderer/v1` and `react` only.
- Do not import URL modules, `node:*`, host app internals, or browser storage.
- Do not emit `<script>` tags or inline event-handler attributes.
- Do not use `window.parent`, `window.top`, `document.body`, or
  `document.documentElement`.
- Use `Agentchan.fileUrl(snapshot, file)` for assets under `files/` when
  possible; file objects include digest-based cache busting.

## Snapshot

The renderer reads only the snapshot and host actions:

```ts
interface RendererSnapshot {
  slug: string;
  baseUrl: string;
  files: readonly ProjectFile[];
  state: {
    messages: readonly AgentMessage[];
    isStreaming: boolean;
    streamingMessage?: AssistantMessage;
    pendingToolCalls: readonly string[];
    errorMessage?: string;
  };
}

interface RendererActions {
  send(text: string): void | Promise<void>;
  fill(text: string): void | Promise<void>;
}
```

Each file has `path`, `modifiedAt`, and `digest`. Text files have
`content` and `frontmatter`; data files have `content`, `data`, and
`format`; binary files are loaded by URL.

## Design

- The renderer owns the full viewport. Put spacing and layout in renderer CSS.
- Avoid monospace fonts for Korean prose.
- Prefer a focused, content-aware interface over a generic dashboard.
- Use stable keys such as `${file.path}:${file.digest}` when rendering files.
- Keep actions explicit. Use `actions.fill()` or `actions.send()` only for real
  host actions.
