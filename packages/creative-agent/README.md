# `@agentchan/creative-agent`

Agentchan의 agent runtime을 owning하는 패키지. session storage, agent
orchestrator, LLM-touching ops, workspace scan 등이 여기에 산다. 패키지의
main entry는 fs / network / LLM runtime을 자유롭게 사용한다.

## 공개 subpath

| Import path | 용도 | 소비자 |
| --- | --- | --- |
| `@agentchan/creative-agent` | full agent runtime + Pi-compatible session storage | webui server (`apps/webui/src/server`), CLI 스크립트 |
| `@agentchan/creative-agent/browser` | browser-safe types + 순수 함수 (no fs / `node:*` / LLM) | webui client, (post-iframe) iframe-side adapter |

## `/browser` subpath contract

`@agentchan/creative-agent/browser`는 host webui client와 (이후 도입될)
iframe-side adapter가 같이 import하는 browser-safe surface다. 이 subpath는
fs / `node:*` / LLM runtime을 들이지 않는다는 contract를 가지며, owning
대상은 message/session/workspace 타입과 순수 함수 (예: `applyAgentEvent`,
`buildSessionContext`, `branchFromLeaf`, `parseFrontmatter`,
`stringifyFrontmatter`, `parseSlashInput`, `slugify`)뿐이다. host와
iframe-side가 같은 `applyAgentEvent` reducer를 공유하므로 streaming 중
state drift가 발생하지 않는다. `tests/browser-subpath.test.ts`가
`Bun.build({ target: "browser" })`를 실행해 그래프에 fs / `node:*` / LLM
의존이 없음을 CI 게이트로 검증한다.

## 테스트

```sh
bun run --cwd packages/creative-agent test
```

`tests/browser-subpath.test.ts`는 위 contract의 회귀 가드다. 새 export를
`/browser`에 추가할 때, 그 export가 fs / Node primitive를 transitively
끌어들이지 않는지 이 테스트로 확인한다.
