# Project Architecture Redesign — SPEC

> **Status**: Draft
> **Date**: 2026-04-11
> **Motivation**: "모든 것을 스킬로" 접근의 한계 극복. always-active 스킬의 중복 호출과 compaction 유실 문제를 구조적으로 제거한다.
>
> **관련 리서치**
> - [`research/skill-duplicate-invocation-prevention.md`](research/skill-duplicate-invocation-prevention.md) — 6개 프로젝트 조사
> - [`research/skill-wire-format-comparison.md`](research/skill-wire-format-comparison.md) — agentchan 구조적 취약점 식별

---

## 1. 설계 원칙

### 1.1 Location is Contract

디렉토리 구조가 런타임 행동을 결정한다. `kind`, `scope`, `always-active` 같은 메타데이터 플래그가 불필요하다.

### 1.2 시스템 개념은 2개

| 개념 | 위치 | 런타임 |
|------|------|--------|
| **System** | `SYSTEM.md` (프로젝트 루트) | system prompt에 주입 |
| **Skill** | `skills/*/SKILL.md` | tool catalog 등록, on-demand 활성화 |

나머지는 전부 **파일**이다. `files/` 디렉토리 안의 파일들은 시스템이 구조를 모른 채 스캔하여 렌더러에 전달한다.

### 1.3 파싱하되 해석하지 않음

시스템은 마크다운 파일의 YAML frontmatter를 파싱하지만, 그 값을 해석하지 않는다. `display-name`, `color`, `avatar-image` 같은 필드의 의미는 렌더러가 정의한다. 시스템은 중립적 전달자다.

---

## 2. 프로젝트 레이아웃

```
project/
├── SYSTEM.md              # → system prompt (plain markdown)
├── _project.json          # 내부: 프로젝트 메타데이터
├── skills/                # → tool catalog (on-demand 절차)
│   └── novel-writing/
│       ├── SKILL.md
│       ├── scripts/
│       ├── assets/
│       └── references/
├── sessions/              # 내부: 세션 데이터 (JSONL)
├── renderer.tsx           # 렌더링 React 컴포넌트
└── files/                 # 워크스페이스: 에이전트의 작업 공간
    ├── characters/
    │   └── elara-brightwell/
    │       ├── elara-brightwell.md
    │       └── assets/avatar.png
    ├── world/
    │   └── moonhaven.md
    ├── scenes/
    │   └── scene.md
    └── memory.md
```

### 2.1 경계 규칙

- `files/` 안 = 사용자 콘텐츠. 디렉토리 이름, 파일 이름, 구조 — 전부 프로젝트 작성자가 결정
- `files/` 밖 = 시스템 인프라. `SYSTEM.md`, `skills/`, `sessions/`, `_project.json`, `renderer.tsx`
- `files/` 내부에 시스템이 예약한 이름이나 구조는 없다

---

## 3. SYSTEM.md

- Plain markdown. frontmatter 없음, 시스템 처리 없음
- DEFAULT_SYSTEM_PROMPT 뒤에 원문 그대로 system prompt에 주입
- 프로젝트당 하나
- system prompt role에 위치하므로 compaction 대상이 아님

SYSTEM.md가 프로젝트 행동의 단일 원천이다. 모델이 프로젝트별로 다르게 행동하는 이유는 이 파일 하나. 파일 구조 관습, 캐릭터 진화 방식, 출력 규칙 — 전부 여기서 자연어로 지시한다.

### 3.1 이전 always-active 콘텐츠의 처리

기존에 always-active 스킬로 관리되던 상시 지침 (character-chat, hidden-spoiler, long-term-memory 등)은 SYSTEM.md에 직접 작성한다. SYSTEM.md는 compaction-safe하므로 always-active의 구조적 문제가 소멸한다.

---

## 4. Skill 시스템

### 4.1 포맷

기존 SKILL.md 포맷 그대로 유지. YAML frontmatter (`name`, `description`, `metadata`) + markdown body. `skills/*/` 디렉토리에 위치. `scripts/`, `assets/`, `references/` 하위 디렉토리 가능.

### 4.2 행동 제약

- **K3.** Skill catalog (name + description 목록)이 system prompt에 포함된다
- **K4.** Skill body는 system prompt에 포함되지 않는다. 활성화 시에만 대화 컨텍스트에 진입한다
- **K5.** 활성화는 모델의 판단 또는 사용자의 명시적 명령으로 발생한다

### 4.3 도출 특성

- **(K3+K5) 모델 자율 판단**: catalog이 항상 보이므로, 모델이 사용자 요청에 맞는 스킬을 스스로 선택
- **(K4) on-demand**: 활성화 전까지 body가 토큰을 소비하지 않음. 스킬 100개 = catalog 100줄의 비용
- **(K4) 휘발성**: body는 대화 컨텍스트에 있으므로 compaction 시 요약될 수 있다. 스킬은 절차(procedure)이므로 필요 시 재활성화 가능 — SYSTEM.md의 상시 지침과 생존 보장 수준이 본질적으로 다르다

### 4.4 구현 선택 (제약 밖 — eval로 결정)

| 선택지 | 후보 | 결정 시점 |
|--------|------|----------|
| body wire format | tool_result 직접 포함 / steered user message / read tool result | eval 후 |
| 활성화 트리거 | 전용 tool / 범용 read tool / 사용자 mention | eval 후 |
| catalog XML 형식 | `<available_skills>` / flat bullet / `<system-reminder>` | 구현 시 |
| tool 파라미터 타입 | free string / enum | 구현 시 |

---

## 5. Workspace (`files/`)

### 5.1 스캔 규칙

시스템은 `files/` 디렉토리를 재귀 스캔하여 `ProjectFile[]`을 생성한다.

```typescript
type ProjectFile = TextFile | BinaryFile;

interface TextFile {
  type: 'text';
  path: string;        // files/ 기준 상대경로
  content: string;
  frontmatter: Record<string, unknown> | null;  // .md YAML frontmatter 파싱 결과
  modifiedAt: number;
}

interface BinaryFile {
  type: 'binary';
  path: string;        // files/ 기준 상대경로
  modifiedAt: number;
}
```

- 텍스트 파일: content 포함. `.md` 파일에 YAML frontmatter가 있으면 파싱하여 `frontmatter`에 저장
- 바이너리 파일: path와 modifiedAt만. content 없음
- frontmatter는 파싱만 하고 해석하지 않음 — 값의 의미는 렌더러가 결정

### 5.2 구조 자유

`files/` 내부에 시스템이 강제하는 구조는 없다. `characters/`, `scenes/`, `chapters/`, `world/` — 프로젝트 작성자가 SYSTEM.md (모델용)와 renderer.tsx (UI용)에서 관습을 정의한다.

---

## 6. Renderer (`renderer.tsx`)

### 6.1 계약

```tsx
interface RendererActions {
  send(text: string): void;                   // 즉시 전송. 스트리밍 중 no-op
  fill(text: string): void;                   // 입력창 prefill
  setTheme(theme: unknown): void;             // 임시 stub
}

interface RendererProps {
  state: AgentState;                          // pi agent.state의 UI subset
  files: ProjectFile[];                       // files/ 전체 스캔 결과
  slug: string;                               // 활성 프로젝트 slug
  baseUrl: string;                            // 에셋 URL prefix
  actions: RendererActions;
}

// 렌더러가 export해야 하는 값
export default function Renderer(props: RendererProps): ReactElement;
// 선택: 프로젝트 페이지 한정 CSS 변수 오버라이드
export function theme?(ctx: { files: ProjectFile[] }): RendererTheme;
```

### 6.2 제약

- 입력은 `RendererProps` 뿐. sessions, skills, SYSTEM.md에 접근 불가. 에이전트 상태는 pi `AgentState`와 동일한 `{messages, streamingMessage?, pendingToolCalls, isStreaming}` view
- 단일 .tsx 파일. 서버에서 classic JSX로 transpile, 클라이언트에서 Blob URL import로 실행
- 외부 모듈 import 불가. 예외는 React 타입(`import type`)과 React hook(`import { useState } from "react"`) — 값 import는 호스트가 `globalThis.__rendererReact`로 브릿지
- 출력은 React 엘리먼트 트리. host가 Shadow DOM 안에서 마운트하고 재조정을 전담
- 인터랙션은 JSX 이벤트 핸들러 + `props.actions.send|fill` 직접 호출
- 스트리밍 구간(`state.isStreaming` true) 동안 `props.files`는 스트리밍 시작 시점의 스냅샷이다. 완료 시 full refresh로 1회 재동기화된다

### 6.3 도출 특성

- **순수 함수**: `files → HTML`. 부작용 없음
- **렌더러가 도메인 모델을 소유**: chat.ts의 ChatLine/ChatGroup 같은 타입은 렌더러 안에만 존재. 시스템은 모른다
- **duck typing으로 파일 해석**: frontmatter에 `display-name`과 `color`가 있는 파일이 캐릭터. 이 판단은 렌더러 코드 안에서 발생
- **이식성**: 렌더러 파일은 복사만으로 공유/커스터마이즈 가능

### 6.4 이미지 토큰

`[name:path]` 형식. 렌더러가 files에서 name을 매칭하여 resolve.

```
[elara-brightwell:assets/avatar]
→ 렌더러가 frontmatter에서 name="elara-brightwell"인 파일을 찾음
→ 해당 파일의 디렉토리 기준으로 assets/avatar 경로를 resolve
→ baseUrl + "/files/" + dir + "/assets/avatar" URL 생성
```

---

## 7. System Prompt 합성

```
┌─────────────────────────────────────────┐
│ [1] DEFAULT_SYSTEM_PROMPT               │
│     tool 사용 규칙, 출력 형식 등         │
│     (creative-agent 코드에 하드코딩)     │
├─────────────────────────────────────────┤
│ [2] SYSTEM.md body                      │
│     사용자 작성 프로젝트 지침            │
│     (원문 그대로, 시스템 수정 없음)      │
├─────────────────────────────────────────┤
│ [3] Skill catalog                       │
│     name + description 목록 (자동 생성)  │
└─────────────────────────────────────────┘
```

- [1]은 하드코딩. 사용자 수정 불가
- [2]는 원문 주입. 시스템이 수정하지 않음
- [3]은 skills/에서 자동 생성. body는 포함하지 않음
- 전체가 system/instruction role에 위치 → compaction-safe

---

## 8. 서브시스템 제약과 도출 특성

### 8.1 Workspace (`files/`)

**제약:**
- W1. 프로젝트의 모든 사용자 콘텐츠는 `files/` 안에 있다
- W2. `files/` 내부에 시스템이 예약한 이름이나 구조는 없다
- W3. 시스템은 `files/`를 스캔하여 `ProjectFile[]`을 생성한다. frontmatter는 파싱하지만 해석하지 않는다
- W4. 스캔 결과는 가공 없이 렌더러에 전달된다

**도출 특성:**
- (W2) 자유 구조 — 프로젝트에 맞는 디렉토리 이름을 쓴다
- (W3) 도메인 무지(domain-ignorant) 시스템 — 새 프로젝트 타입에 시스템 코드 변경 불필요
- (W3→W4) frontmatter는 렌더러 프로토콜 — 시스템은 YAML을 파싱해서 넘길 뿐
- (W1) 명확한 경계 — `files/` 안 = 사용자 콘텐츠, 밖 = 시스템 인프라

### 8.2 Renderer (`renderer.tsx`)

**제약:**
- R1. 입력은 `RendererProps { state, files, slug, baseUrl, actions }` 뿐이다. `state`는 pi `AgentState`의 UI subset — idle 시 `EMPTY_AGENT_STATE`
- R2. 출력은 React 엘리먼트 트리. host가 Shadow DOM 안에서 마운트
- R3. 단일 .tsx 파일. 서버에서 classic JSX로 transpile, 클라이언트에서 Blob URL import로 실행
- R4. 외부 모듈 import 불가. 예외는 React 타입/hook — 값 import는 호스트가 `globalThis.__rendererReact`로 브릿지
- R5. sessions, skills, SYSTEM.md에 접근 불가. 채팅과의 인터랙션은 `actions.send|fill`만 허용

**도출 특성:**
- (R1+R2) 순수 컴포넌트 — `props → JSX`. 부작용은 React hook 안으로 한정
- (R1+R5) 렌더러가 도메인 모델을 소유 — 시스템은 "캐릭터"를 모른다
- (R1+W3) duck typing으로 파일 해석 — frontmatter 필드로 파일 역할을 판단
- (R4) 이식성 — 복사만으로 공유 가능

### 8.3 SYSTEM.md

**제약:**
- S1. plain markdown. frontmatter 없음, 시스템 처리 없음
- S2. system prompt에 원문 그대로 주입
- S3. 프로젝트당 하나
- S4. system prompt role에 위치 → compaction 대상 아님

**도출 특성:**
- (S1+S2) WYSIWYG — 사용자가 쓴 텍스트 = 모델이 보는 텍스트
- (S4) compaction-safe — 대화 길이와 무관하게 지침 보존
- (S1) 학습 비용 제로 — 마크다운만 쓸 줄 알면 됨
- (S2+S3) 프로젝트 행동의 단일 원천 — 숨겨진 설정 없음

### 8.4 Skill 시스템

**제약:**
- K1. `skills/*/SKILL.md` = YAML frontmatter + markdown body
- K2. scripts/, assets/, references/ 하위 디렉토리 보유 가능
- K3. Skill catalog (name + description)이 system prompt에 포함된다
- K4. Skill body는 system prompt에 포함되지 않는다. 활성화 시에만 대화 컨텍스트에 진입한다
- K5. 활성화는 모델의 판단 또는 사용자의 명시적 명령으로 발생한다

**도출 특성:**
- (K3+K5) 모델 자율 판단 — catalog이 항상 보이므로 모델이 스스로 선택
- (K4) on-demand — 활성화 전까지 body가 토큰 미소비
- (K4) 휘발성 — body는 compaction 대상. 절차이므로 재활성화 가능

### 8.5 Agent & Tools

**제약:**
- A1. 시스템 프롬프트 = DEFAULT_SYSTEM_PROMPT + SYSTEM.md + skill catalog
- A2. 도구 = 파일 도구 (read, write, edit, append, grep, tree) + script + skill 활성화 도구
- A3. 파일 도구는 projectDir에 scope (path traversal 차단)
- A4. 에이전트는 렌더러, UI, session 저장소에 직접 접근 불가. 파일 도구를 통해서만 상호작용
- A5. compaction: system prompt 보존, 대화 히스토리의 오래된 tool result는 placeholder 교체

**도출 특성:**
- (A1+S4) 지침 영속성 — SYSTEM.md 내용은 compaction 후에도 보존
- (A2+A4) 파일이 유일한 인터페이스 — 에이전트가 렌더러에 영향을 미치는 유일한 경로는 files/에 파일을 쓰는 것
- (A3) 샌드박스 — projectDir 밖 접근 불가
- (A2) shell 없음 — script 도구만으로 코드 실행

### 8.6 Session 저장소

**제약:**
- V1. 트리 구조. 각 노드에 parentId → 분기/재생성 가능
- V2. JSONL 형식, 세션당 하나의 파일
- V3. 노드 = { id, parentId, role, content, meta, createdAt, ... }
- V4. append-only. 노드가 추가되지, 수정되거나 삭제되지 않음

**도출 특성:**
- (V1) 비파괴 탐색 — 분기해도 이전 경로 보존
- (V4) 감사 가능성 — 모든 이력이 완전 보존
- (V2) 격리 — 세션 간 독립

### 8.7 서브시스템 간 창발적 특성

**새 프로젝트 타입 = 코드 변경 0**
- (W2) workspace에 시스템 예약 구조 없음 + (R1) 렌더러는 files만 받음 + (S1) SYSTEM.md는 plain markdown
- → SYSTEM.md와 renderer.tsx만 쓰면 새로운 프로젝트 타입을 시스템 코드 수정 없이 만들 수 있다

**에이전트↔렌더러 간 파일 계약**
- (A4) 에이전트는 파일로만 세계와 상호작용 + (R1) 렌더러는 파일만 받음
- → 에이전트와 렌더러가 직접 통신하지 않는다. `files/`가 유일한 매개. SYSTEM.md(에이전트 행동)와 renderer.tsx(UI 해석)가 같은 관습에 동의하기만 하면 된다

**compaction이 깨뜨리는 것의 범위가 명확**
- (S4) SYSTEM.md는 안전 + (K4) 스킬 body는 요약될 수 있음 + (V4) 저장소는 append-only
- → compaction이 유실할 수 있는 것은 오직 "대화 중 activate된 스킬 body"뿐

**frontmatter 스키마의 독립적 진화**
- (W3) frontmatter를 파싱하지만 해석 안 함 + (R1) 렌더러가 해석
- → frontmatter 스키마가 시스템 릴리즈와 독립적으로 진화. 렌더러 작성자가 새 필드를 자유롭게 도입 가능

---

## 9. 기존 스킬 재분류

| 기존 스킬 | always-active | 신규 위치 | 이유 |
|----------|:---:|----------|------|
| character-chat | O | `SYSTEM.md` 본문 | 프로젝트 핵심 행동 규칙 |
| impersonate-character-chat | O | `SYSTEM.md` (다른 프로젝트) | 동일 |
| hidden-spoiler | O | `SYSTEM.md` 본문 | 상시 적용 연출 규칙 |
| long-term-memory | O | `SYSTEM.md` 본문 | 상시 적용 기억 관리 규칙 |
| dynamic-lorebook | O | `SYSTEM.md` 본문 | 상시 적용 로어 로딩 규칙 |
| elara-brightwell | O | `files/characters/elara-brightwell/` | 캐릭터 정보 |
| ren-blackwood | - | `files/characters/ren-blackwood/` | 캐릭터 정보 |
| moonhaven | O | `files/world/moonhaven.md` | 세계 정보 |
| novel-writing | - | `skills/novel-writing/SKILL.md` | on-demand 절차 (변경 없음) |

---

## 10. 미결정 사항

1. **Skill body wire format**: tool_result 직접 포함 vs 기존 steered user message — eval로 결정
2. **Skill catalog 위치**: system prompt (현 설계) vs user message (현 구현) — Gemini regression 재검증 필요
3. **에이전트 파일 접근 범위**: projectDir 전체 (현 구현) vs files/ 한정 (더 엄격한 샌드박스) — 추후 결정
4. **Library 구조**: starters (완전 템플릿) + skills + data + system modules + renderers — UI 설계와 함께 결정
5. **`files/` 디렉토리 이름**: `files/` 확정 또는 다른 후보 (`workspace/` 등)

---

## 11. 구현 우선순위

```
Phase 1: 핵심 구조 전환
  - SYSTEM.md 파싱 + system prompt 주입
  - files/ 디렉토리 도입 + ProjectFile 스캔
  - RenderContext 변경 (outputFiles+skills → files)
  - always-active 개념 제거
  - example_data 마이그레이션

Phase 2: Skill 최적화
  - Skill body wire format eval + 전환
  - Skill catalog 위치 검증
  - Skill dedup (activeSkills Set)

Phase 3: 전체 완성
  - Library 확장 (starters + 개별 항목)
  - UI 업데이트
  - 렌더러 마이그레이션 (chat.ts, novel.ts, default.ts)
```
