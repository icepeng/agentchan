# Architecture Decision Records

ADRs in this directory record decisions that should change future engineering
behavior. They are not plans, specs, changelogs, or explanations of a completed
implementation.

When an ADR conflicts with an older draft, temporary spec, or stale project
note, the accepted ADR wins until it is superseded by a later ADR.

## Accepted

- [0001. 렌더러는 React 기반의 주 화면이다](0001-renderer-primary-surface-react-contract.md)
- [0002. 프로젝트 디렉토리는 얇은 런타임 계약만 가진다](0002-project-directory-contract.md)
- [0003. files/는 시스템이 해석하지 않는 사용자 콘텐츠 workspace다](0003-files-workspace-contract.md)
- [0004. 세션 영속화는 Pi SessionManager entry model을 따른다](0004-session-pi-entry.md)
- [0005. 창작 세션과 메타 세션을 분리한다](0005-meta-session.md)
- [0006. Web UI는 server 3-layer와 client FSD 계층을 유지한다](0006-webui-layering.md)
- [0007. 에이전트는 prompt 계약과 project-scoped tools로 동작한다](0007-agent-prompt-tool-boundary.md)

## 관련 계획

- [리팩터 현대화 계획](../refactor-modernization-plan.md)
