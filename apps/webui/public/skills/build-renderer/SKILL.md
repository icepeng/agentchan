---
name: build-renderer
description: "프로젝트의 renderer/ 폴더 안에 iframe으로 동작하는 HTML/TS 웹 앱을 생성하거나 수정한다."
environment: meta
metadata:
  author: agentchan
  version: "2.0"
---

renderer/ 폴더는 agentchan 호스트가 `<iframe src="/api/projects/{slug}/renderer/">`로 로드하는 독립된 sandboxed 웹 앱이다. 본 스킬은 그 앱의 초기 작성 · 수정을 담당한다.

## 워크플로우

1. renderer/index.html · renderer/index.ts 를 Read. 없으면 신규 생성
2. SYSTEM.md 를 읽어 프로젝트의 출력 의도를 파악
3. files/ 하위 대표 파일을 몇 개 열어 frontmatter · 구조 파악
4. 사용자에게 스타일 방향(배경, 폰트, 레이아웃) 확인
5. renderer/index.html + renderer/index.ts 를 작성 또는 편집
6. validate-renderer 도구로 transpile 검증
7. 사용자에게 좌측 iframe 결과 확인 요청

## 폴더 구조

```
{slug}/
├── tsconfig.json         ← 호스트가 자동 관리. 편집 금지
└── renderer/
    ├── index.html        ← entry. <head>·<body> 둘 다 렌더러 소유
    ├── index.ts          ← 메인 스크립트. `import type from "@agentchan/types"` 사용
    └── style.css         ← (선택)
```

## 데이터 수신

**Files catalog** (프로젝트 파일 전체):
```ts
const slug = location.pathname.match(/\/projects\/([^/]+)\//)![1];
const res = await fetch(`/api/projects/${slug}/files`);
const files: ProjectFile[] = await res.json();
```

**AgentState 실시간 구독** — SSE 한 채널, 8종 이벤트:
```ts
const sse = new EventSource(`/api/projects/${slug}/state/stream`);
sse.addEventListener("snapshot", (e) => { state = JSON.parse(e.data).state; render(); });
sse.addEventListener("append", (e) => { state.messages.push(JSON.parse(e.data).message); render(); });
sse.addEventListener("streaming", (e) => { state.streamingMessage = JSON.parse(e.data).message; state.isStreaming = true; render(); });
sse.addEventListener("streaming_clear", () => { state.streamingMessage = undefined; state.isStreaming = false; loadFiles().then(render); });
sse.addEventListener("tool_pending_set", (e) => { state.pendingToolCalls = JSON.parse(e.data).ids; render(); });
sse.addEventListener("agent_start", () => { state.isStreaming = true; render(); });
sse.addEventListener("error", (e) => { state.errorMessage = JSON.parse(e.data).message; render(); });
```

파일 변경 신호는 별도 채널 없음. `streaming_clear` 수신 시 `/files` 를 재fetch하여 자연 동기화.

## 액션 전송 (렌더러 → 호스트)

```ts
// 사용자 입력창에 문자열 설정만
fetch(`/api/projects/${slug}/actions/fill`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text: "hello" }),
});

// 입력창에 설정 + 즉시 전송 (스트리밍 중이면 무시됨)
fetch(`/api/projects/${slug}/actions/send`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text: "hello" }),
});

// 씬·모드별 테마 오버라이드. theme: null = 해제
fetch(`/api/projects/${slug}/actions/setTheme`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    theme: {
      base: { accent: "#8b0000", fg: "#e8e8e8" },
      prefersScheme: "dark",
    },
  }),
});
```

## 타입

```ts
import type { AgentState, ProjectFile, AgentMessage } from "@agentchan/types";
```

`@agentchan/types` 는 프로젝트 tsconfig.json 이 agentchan source `.d.ts` 를 직접 매핑. install 불필요.

## Morph 기본

DOM 업데이트는 idiomorph 를 호스트가 self origin 으로 제공:

```ts
import { Idiomorph } from "/api/host/lib/idiomorph.js";

function render() {
  const html = buildHTML(state, files);
  Idiomorph.morph(root, html, { morphStyle: "innerHTML" });
}
```

`innerHTML` 직접 대입은 스크롤/포커스/선택을 초기화하므로 사용하지 않는다.

자체 framework(lit · preact 등) 선호 시: `renderer/lib/` 에 vendor copy 또는 `_project.json` 의 `renderer.allowedDomains` 에 `"esm.sh"` 등을 선언.

## 클릭 핸들러 모범 예시

```html
<button data-action="send" data-text="계속 진행">▶ 진행</button>
```

```ts
root.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
  if (!target) return;
  const action = target.dataset.action;
  const text = target.dataset.text ?? target.textContent?.trim() ?? "";
  if (!text) return;
  if (action === "send" || action === "fill") {
    fetch(`/api/projects/${slug}/actions/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }
});
```

## 옵셔널 호스트 토큰

```html
<link rel="stylesheet" href="/api/host/tokens.css">
```

`--color-*` · `--font-family-*` 변수를 노출한다. 폰트는 system fallback.

## CSS / 뷰포트

- 호스트가 viewport padding 을 주지 않는다. 풀블리드 배경/그라디언트 자유
- 한국어 노출 영역에 monospace 폰트는 사용하지 않는다
- 인라인 `<style>` · `<link>` · 자체 CSS 파일 모두 허용

## 외부 도메인

기본 차단. 외부 스크립트/스타일/폰트/이미지 사용 시 `_project.json` 갱신:
```json
{
  "renderer": { "allowedDomains": ["esm.sh"] }
}
```

`connect-src` 는 항상 self 만 — 외부 fetch/XHR/WebSocket 은 allowedDomains 에 선언해도 차단된다. 데이터는 호스트 엔드포인트에서만 가져온다.
