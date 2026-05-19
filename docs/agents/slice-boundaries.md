# Slice Boundary Guardrails

이 문서는 Web UI client의 vertical slice 경계를 설명한다. 기준 PRD는 GitHub issue #192이고, Phase 9 강화 작업은 issue #208이다.

## 슬라이스

`apps/webui/src/client/`의 도메인 코드는 다음 13개 슬라이스로 구성한다.

| 슬라이스 | 책임 |
|---|---|
| `shell` | Host chrome, project/settings/library 화면 합성 |
| `library` | Library, Template, Trusted template |
| `project` | Project lifecycle, project tabs, project settings |
| `creative-agent` | Session, Branch, Compaction, Creative agent 실행, 채팅 surface |
| `project-editor` | Project editor, file tree, file IO |
| `renderer-host` | Host 측 Renderer iframe seam |
| `provider` | Provider, API key, OAuth, Active model |
| `theme` | App theme, Appearance preference |
| `onboarding` | 첫 사용 wizard |
| `update` | Desktop app 업데이트 |
| `app-settings` | Settings page tab container |
| `design-system` | 도메인 비의존 UI primitive |
| `platform` | 도메인 비의존 infra adapter |

## 원칙

- 슬라이스 외부에서는 해당 슬라이스의 `index.ts`를 통해서만 import한다.
- 슬라이스 내부 파일은 같은 슬라이스 내부에서만 직접 import한다.
- `design-system`과 `platform`은 도메인 슬라이스를 import하지 않는다.
- `entity`, `feature`, `page`, `shared`, `app`, `i18n` 같은 이전 FSD 루트는 새 코드에서 만들지 않는다.
- 모든 slice boundary 위반은 `bun run lint`에서 error로 처리한다. Warning baseline은 더 이상 없다.

## Slice DAG

허용되는 slice 간 import는 다음뿐이다.

```text
shell -> project, library, project-editor, renderer-host, creative-agent, provider, onboarding, theme, update, app-settings
project -> shell, creative-agent, library, project-editor
project-editor -> shell, creative-agent
renderer-host -> creative-agent
onboarding -> provider, library
app-settings -> provider, theme, update, onboarding
creative-agent -> provider

모든 슬라이스 -> design-system, platform
design-system -> 없음
platform -> 없음
```

이 목록에 없는 slice 간 import는 금지한다.

현재 허용되는 비자명 cross-slice seam은 다음이다.

- `project -> creative-agent.cancelAgentRun`
- `project-editor -> creative-agent.useAgentRunSettleCount`
- `renderer-host -> creative-agent.useAgentStream`
- `renderer-host -> creative-agent.useAgentEventSubscription`
- `renderer-host -> creative-agent.useSessionInputDispatch`

Phase 8 기준으로 `creative-agent -> project.useProjects` read-only edge는 제거되었다. 알림 click의 Project 활성화는 `SessionProvider`가 주입받은 callback을 통해 shell로 되돌린다.

`app-settings/`는 settings page chrome만 소유한다. `provider/`, `theme/`, `update/`에서 settings tab/section component를 합성할 수 있지만, 해당 slice의 내부 hook이나 mutation API를 직접 사용하지 않는다. 허용된 합성 surface는 `ApiKeysTab`, `AppearanceTab`, `AboutSection`이다.

## 새 슬라이스 추가 컨벤션

새 슬라이스가 필요하면 먼저 별도 issue나 ADR에서 도메인 책임과 DAG edge를 확정한다. 구현 PR에서는 다음을 함께 갱신한다.

- `apps/webui/src/client/<slice>/index.ts` public surface를 만든다.
- `scripts/oxlint-agentchan-plugin.mjs`의 `FUTURE_SLICE_LAYERS`와 `FUTURE_SLICE_DAG`에 slice와 허용 edge를 추가한다.
- `apps/webui/tests/lint/slice-boundaries.test.ts`에 허용 edge와 금지 edge를 각각 하나 이상 추가한다.
- 이 문서의 슬라이스 표와 DAG를 갱신한다.

새 slice 내부 모듈을 다른 slice가 직접 import하게 만드는 임시 예외는 만들지 않는다. 합성이 필요하면 importing slice의 `index.ts` surface를 먼저 설계한다.
