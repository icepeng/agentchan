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
5. Report what changed and ask the user to check the renderer preview. If the
   preview shows a policy or build error, fix it and ask the user to re-check.

## Contract

Use the React renderer contract:

```tsx
import { createRenderer, fileUrl, type RendererProps, type RendererSnapshot, type RendererTheme } from "@agentchan/renderer/react";
import { useState } from "react";
import "./index.css";

function Renderer({ snapshot, actions }: RendererProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <button onClick={() => void actions.fill(selected ?? "Next scene")}>
      Fill prompt
    </button>
  );
}

function theme(snapshot: RendererSnapshot): RendererTheme | null {
  return { base: { accent: "#6aa" } };
}

export const renderer = createRenderer(Renderer, { theme });
```

Rules:

- Use `renderer/index.tsx` for React renderers. Use `renderer/index.ts` only for vanilla `defineRenderer` renderers, and do not create both.
- Export `const renderer = createRenderer(Component, options?)`.
- CSS must be part of the renderer graph, usually `import "./index.css"`.
- Relative imports must stay inside `renderer/`.
- External browser libraries must be vendored under `renderer/`.
- Allowed bare imports are `@agentchan/renderer/react`, `@agentchan/renderer/core`, `react`, `react-dom/client`.
- Do not import URL modules, `node:*`, host app internals, or browser storage.
- Do not emit `<script>` tags or inline event-handler attributes.
- Do not use `window.parent`, `window.top`, `document.body`, or
  `document.documentElement`.
- Use `fileUrl(snapshot, file)` for assets under `files/` when
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
