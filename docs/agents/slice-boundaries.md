# Slice Boundary Guardrails

이 문서는 Web UI client의 vertical slice 경계를 설명한다. 기준 PRD는 GitHub issue #192이고, Phase 0 가드레일 작업은 issue #193이다.

## 원칙

- 슬라이스 외부에서는 해당 슬라이스의 `index.ts`를 통해서만 import한다.
- 슬라이스 내부 파일은 같은 슬라이스 내부에서만 직접 import한다.
- `design-system`과 `platform`은 도메인 슬라이스를 import하지 않는다.
- `entity -> feature` 의존은 명백한 layer 위반이므로 즉시 실패한다.
- `entity -> entity`, `feature -> feature` cross-import는 transitional 위반이다. 현재는 경고로 보고하고, PRD #192의 vertical slice 이주 과정에서 제거한다.

## Slice DAG

PRD #192의 목표 DAG는 다음과 같다.

```text
shell -> project, library, project-editor, provider, onboarding, theme, update, app-settings
project -> session, library, project-editor
project-editor -> session
renderer-host -> session
onboarding -> provider, library
app-settings -> provider, theme, update, onboarding
session -> provider

모든 슬라이스 -> design-system, platform
design-system -> 없음
platform -> 없음
```

이 목록에 없는 slice 간 import는 금지한다.

## Phase 0 Baseline

현재 코드베이스는 아직 `features/`, `entities/`, `pages/`, `shared/`, `app/`, `i18n/` 구조를 사용한다. 따라서 oxlint 룰은 두 종류로 나뉜다.

- `agentchan/slice-boundary-baseline`: baseline으로 등록된 기존 transitional 위반을 경고로 보고한다.
- `agentchan/slice-boundary-new`: baseline에 없는 새 boundary 위반과 `entity -> feature` 위반을 오류로 보고한다.

새 코드는 가능한 한 목표 slice 이름과 `index.ts` surface를 먼저 만든 뒤 그 surface만 import한다. 기존 FSD 구조를 수정할 때도 새 deep import를 추가하지 않는다.
