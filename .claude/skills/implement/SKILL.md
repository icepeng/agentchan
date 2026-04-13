---
name: implement
description: 요구사항 인터뷰 → 계획 → 구현 → 브라우저 검증 → 코드 정리 → PR 생성까지 전체 피처 개발 워크플로우
argument-hint: "[요구사항 설명]"
disable-model-invocation: true
---

# /implement — Full Feature Development Workflow

요구사항 인터뷰부터 PR 생성까지 피처 개발의 전체 라이프사이클을 오케스트레이션한다. 각 Phase를 순서대로 수행하며, Phase를 건너뛰지 않는다.

## Context

- Branch: !`git branch --show-current`
- Git status: !`git status --short`
- Portless routes: !`portless list 2>/dev/null || echo "(portless not running)"`

Initial request: $ARGUMENTS

---

## Phase 1: Requirements Interview

**Goal**: 사용자의 요구사항을 깊이 이해하고, 브라우저 검증 시나리오까지 도출한다.

EnterPlanMode tool을 호출하여 plan mode에 진입한다.

AskUserQuestion tool로 구조화된 인터뷰를 수행한다. 한 번에 모든 질문을 쏟지 말고, 라운드별로 나눠 이전 답변에 기반한 후속 질문을 한다.

**Round 1 — 핵심 의도:**
- 이 기능이 해결하는 문제는 무엇인가?
- 대상 사용자는 누구인가? (최종 사용자, 개발자, 에이전트)
- 기대하는 사용자 플로우는?

**Round 2 — 범위와 제약:**
- 영향받는 기존 코드/페이지/컴포넌트는?
- 엣지 케이스나 에러 상태는?
- 성능이나 호환성 우려사항은?
- 이 기능이 하지 말아야 할 것은? (범위 경계)

**Round 3 — UI/UX** (해당 시):
- 시각적 기대? (레이아웃, 인터랙션, 반응형)
- 참고할 디자인이나 기존 패턴?
- i18n 필요? (이 프로젝트는 en.ts/ko.ts 사용)

**Round 4 — 검증 시나리오:**
- 브라우저에서 무엇을 확인하면 이 기능이 동작하는 걸 확신할 수 있는가?
- 2-3개의 구체적인 수동 테스트 시나리오를 설명해달라고 요청
- 확인: "구현 후 agent-browser로 이 시나리오들을 자동화하겠습니다. 추가로 검증할 것이 있나요?"

$ARGUMENTS가 이미 충분히 상세하면 중복 질문은 생략하되, **검증 시나리오는 반드시 확인한다**.

명백한 질문을 하지 마라. 사용자가 고려하지 않았을 수 있는 어려운 부분을 파고들어라.

---

## Phase 2: Plan Creation

**Goal**: 검증 시나리오를 포함한 상세 구현 계획을 작성한다.

여전히 plan mode 상태다. 코드베이스를 탐색하여 변경 대상을 파악한다:

1. 관련 기존 파일 읽기 (routes, services, components, types)
2. 생성/수정해야 할 모든 파일 식별
3. 따라야 할 기존 패턴 파악 (FSD 레이어, Route→Service→Repo 등)

계획은 다음 구조로 작성한다:

```
## Summary
기능을 한 문단으로 설명.

## Files to Create/Modify
- path/to/file.ts — 무엇을 왜 변경하는지

## Implementation Steps
1. 구체적인 단계
2. 구체적인 단계
...

## Verification Scenarios
각 시나리오별:
- 시나리오 이름
- 방문할 URL
- 단계 (navigate, click, fill, wait, assert)
- 기대 결과 (스냅샷/스크린샷에서 확인할 내용)

## Build Verification
- bunx tsc --noEmit (apps/webui/)
- bunx tsc --noEmit (packages/creative-agent/) — creative-agent 변경 시
- bun run lint
- bun run test
```

---

## Phase 3: Approval Gate

**Goal**: 사용자 승인을 받고 plan mode를 종료한다.

ExitPlanMode tool을 호출하여 사용자에게 계획을 제시한다.

- 사용자가 수정을 요청하면 계획을 수정하고 다시 제시
- 승인되면 Phase 4로 진행

---

## Phase 4: Implementation

**Goal**: 계획에 따라 기능을 구현한다.

1. 계획에서 식별한 모든 파일을 읽어 전체 컨텍스트를 확보
2. 계획의 단계를 순서대로 구현
3. CLAUDE.md의 코드 컨벤션을 엄격히 준수:
   - Server: Route → Service → Repository 패턴
   - Client: FSD 레이어 (app → pages → features → entities → shared)
   - i18n: 사용자 노출 텍스트는 en.ts와 ko.ts 동시 갱신
   - Types: 하위 호환성을 위해 새 필드는 optional
4. 구현 완료 후 빌드 검증:

```bash
cd apps/webui && bunx tsc --noEmit
```

```bash
bun run lint
```

```bash
bun run test
```

creative-agent 변경 시:
```bash
cd packages/creative-agent && bunx tsc --noEmit
```

빌드 에러가 있으면 모두 수정한 후 Phase 5로 진행한다. 빌드 에러가 있는 상태로 넘어가지 않는다.

---

## Phase 5: Browser Verification

**Goal**: agent-browser로 dev 서버에서 기능을 검증한다.

### Step 1: Dev 서버 기동

Context의 portless routes를 확인하여 dev 서버가 이미 실행 중인지 파악한다.

실행 중이 아니면 dev 서버를 background로 시작한다:

```bash
bun run dev
```

`run_in_background: true`로 실행한다.

서버 준비 후 URL을 확인한다:
- Main worktree: `https://agentchan.localhost`
- Linked worktree: `portless list`에서 branch 서브도메인 확인

서버 접근 가능 여부를 검증한다:

```bash
agent-browser open <URL> && agent-browser wait --load networkidle && agent-browser snapshot -i
```

### Step 2: 검증 시나리오 실행

계획의 Verification Scenarios를 하나씩 실행한다. 각 시나리오는 agent-browser 워크플로우를 따른다:

1. Navigate: 대상 URL로 이동
2. Snapshot: `agent-browser snapshot -i`로 element refs 획득
3. Interact: refs로 click, fill, select 등 수행
4. Wait: 결과 대기 (networkidle, element, URL 패턴)
5. Re-snapshot/Screenshot: 기대 상태 확인

### Step 3: 실패 시 재시도 (최대 3회)

시도 횟수를 1부터 추적한다.

검증 시나리오 실패 시:

1. **분석**: 실패 원인 파악
   - `agent-browser screenshot evidence.png` — 증거 스크린샷
   - `agent-browser console` — 브라우저 콘솔 에러
   - `agent-browser network requests --status 4xx,5xx` — 실패한 네트워크 요청
2. **수정**: 코드에서 원인을 찾아 수정
3. **빌드 재검증**: `bunx tsc --noEmit` + `bun run lint` + `bun run test`
4. **재검증**: 실패한 시나리오 다시 실행

3회 실패 시 사용자에게 증거(스크린샷, 콘솔 에러, 네트워크 로그)와 함께 보고하고, 어떻게 진행할지 물어본다.

### Step 4: 정리

모든 시나리오 통과 후 (또는 사용자가 진행 결정 후):

```bash
agent-browser close
```

---

## Phase 6: Simplify

**Goal**: 변경된 코드의 품질을 정리한다.

Skill tool로 `"simplify"` skill을 호출한다. 변경된 코드의 재사용성, 품질, 효율성을 검토하고 문제를 수정한다.

Simplify 완료 후 빌드 재검증:

```bash
cd apps/webui && bunx tsc --noEmit
```

```bash
bun run lint
```

```bash
bun run test
```

Simplify가 도입한 문제가 있으면 수정한다.

---

## Phase 7: Code Quality Verification

**Goal**: 변경 범위에 따라 전문 스킬로 코드 품질을 추가 검증한다.

`git diff --name-only main...HEAD`(또는 `git diff --name-only --cached`로 커밋 전 변경 파일)을 확인하여 변경된 파일 목록을 얻는다.

### React 변경 검증

변경된 파일 중 `src/client/` 하위의 `.tsx` 또는 `.ts` 파일이 있으면:

Skill tool로 `"vercel-react-best-practices"` skill을 호출하여, 변경된 React 코드가 성능 best practices를 준수하는지 검증한다. 발견된 문제를 수정한다.

### Shared UI 변경 검증

변경된 파일 중 `src/client/shared/` 하위 파일이 있으면:

Skill tool로 `"vercel-composition-patterns"` skill을 호출하여, shared UI 컴포넌트의 composition 패턴이 적절한지 검증한다. 발견된 문제를 수정한다.

### 빌드 재검증

위 스킬에서 코드를 수정했다면 빌드를 재검증한다:

```bash
cd apps/webui && bunx tsc --noEmit
```

```bash
bun run lint
```

```bash
bun run test
```

두 조건 모두 해당하지 않으면 이 Phase를 건너뛴다.

---

## Phase 8: Commit, Push & PR

**Goal**: 깔끔한 커밋을 만들고 PR을 연다.

Skill tool로 `"commit-commands:commit-push-pr"` skill을 호출한다. 이 skill이:

1. main에 있으면 새 브랜치 생성
2. 적절한 메시지로 커밋
3. origin에 push
4. `gh pr create`로 PR 생성

PR이 생성되면 사용자에게 PR URL을 보고한다.

---

## Guidelines

- **검증을 건너뛰지 않는다.** 빌드 체크와 브라우저 검증은 PR 전 필수다.
- **한 번에 하나의 기능.** 이 커맨드는 단일 기능을 end-to-end로 처리한다.
- **변경 내역을 명시한다.** 계획이나 PR에서 수정한 모든 파일을 나열한다.
- **PR 본문은 한국어로.** CLAUDE.local.md에 따라 PR 본문을 한국어로 작성한다.
- **리서치 디렉토리를 수정하지 않는다.** CLAUDE.local.md에 나열된 디렉토리는 읽기 전용이다.
