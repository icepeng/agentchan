---
name: implement
description: 요구사항 정리, 계획, 구현, 검증, 브라우저 확인까지 피처 개발을 끝까지 진행할 때 사용한다.
argument-hint: "[요구사항 설명]"
disable-model-invocation: true
---

# Implement

요구사항을 코드 변경과 검증까지 연결하는 end-to-end 워크플로우다. `$ARGUMENTS`가 충분히 구체적이면 바로 진행하고, 불명확하거나 위험한 결정만 짧게 질문한다.

## 1. 요구사항 정리

- 문제, 대상 사용자, 기대 플로우를 한 문단으로 정리한다.
- UI 변경이면 확인할 브라우저 시나리오를 1~3개로 잡는다.
- 범위가 넓으면 먼저 작은 완료 단위로 자른다.

## 2. 코드베이스 탐색

- 관련 route/service/repository/component/type/i18n 파일을 읽는다.
- 기존 레이어 규칙을 따른다.
  - Server: Route → Service → Repository
  - Client: app → pages → features → entities → shared
  - 사용자 노출 텍스트: `i18n/en.ts`와 `i18n/ko.ts` 동시 갱신
- `@agentchan/creative-agent`는 client에서 `import type`만 사용한다.

## 3. 구현 계획

작업이 두 단계 이상이면 짧은 체크리스트를 만들고 진행 중 상태를 갱신한다.

포함할 내용:

- 수정/생성 파일
- 구현 단계
- 검증 명령
- 브라우저 확인 시나리오

## 4. 구현

- 기존 패턴을 우선한다.
- 불필요한 추상화와 관련 없는 리팩토링은 피한다.
- `example_data/`를 수정하면 `bash scripts/copy-example-data.sh --force`로 런타임 데이터에 반영한다.
- 스킬·시스템 프롬프트 파일은 실행 지침으로 작성하고, 변천사·설계 합리화·중복 guard를 넣지 않는다.

## 5. 빌드 검증

변경 범위에 맞게 실행한다.

```bash
cd apps/webui && bunx tsc --noEmit
bun run lint
bun run test
```

`packages/creative-agent` 변경 시:

```bash
cd packages/creative-agent && bunx tsc --noEmit
```

실패하면 원인을 고쳐 같은 검증을 다시 실행한다.

## 6. 브라우저 검증

UI 변경이나 사용자가 볼 수 있는 흐름이면 `agent-browser`로 확인한다.

1. 실행 중인 서버 확인: `portless list`
2. 없으면 dev 서버를 백그라운드로 시작: `bun run dev`
3. URL 확인:
   - main worktree: `https://agentchan.localhost`
   - linked worktree: `portless list`의 branch 서브도메인
4. `agent-browser open <URL>` → `agent-browser snapshot -i`
5. 계획한 시나리오를 click/fill/wait/screenshot으로 검증한다.

실패 시 콘솔, 네트워크, 스크린샷 증거를 확인하고 수정 후 재검증한다.

## 7. 정리와 보고

- 변경 파일과 핵심 동작을 짧게 요약한다.
- 실행한 검증과 실패/미실행 사유를 명시한다.
- 사용자가 요청한 경우에만 커밋, push, PR 생성을 진행한다.
- PR 본문은 한국어로 작성한다.
