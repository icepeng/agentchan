# React hook test harness

Web UI hook/DOM tests run on `bun:test` with Testing Library and Happy DOM.

## Harness

- Hook/DOM test files import `../setup/happydom.js` and `../setup/testing-library.js` before importing Testing Library.
- Test files can import `render`, `renderHook`, `act`, and `waitFor` from `@testing-library/react` directly.
- Do not create a per-file DOM `Window` unless a test needs a custom global such as mocked `fetch`.
- Testing Library cleanup runs after each test from the shared preload.

## Provider wrapper convention

Hook tests should exercise public slice interfaces and mount the same Providers that production code relies on.

```tsx
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import "../setup/happydom.js";
import "../setup/testing-library.js";
import { SessionProvider, useAgentStream } from "@/client/session/index.js";

function Wrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

const { result } = renderHook(() => useAgentStream("project-slug"), {
  wrapper: Wrapper,
});
```

Each `SessionProvider` mount owns a fresh stream store and event bus, so tests should prefer a new wrapper mount per test over manual singleton reset.

Mock cross-slice dependencies only at the boundary being orchestrated. For example, a `useSession` test may mock SWR and server mutations, but should still call `useSession()` through the exported hook.
