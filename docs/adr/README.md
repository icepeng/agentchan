# Architecture Decision Records

이 디렉터리의 ADR은 앞으로의 엔지니어링 판단을 바꿔야 하는 결정을 기록한다.
ADR은 계획, 사양서, changelog, 완료된 구현 설명이 아니다.

ADR이 오래된 초안, 임시 spec, stale project note와 충돌하면, 더 나중에 승인된
ADR이 supersede하기 전까지 accepted ADR이 우선한다.

## 승인됨

- [0001. 렌더러는 프로젝트 앱 표면으로 실행된다](0001-renderer-app-surface-contract.md)
- [0002. 프로젝트 디렉토리는 얇은 런타임 계약만 가진다](0002-project-directory-contract.md)
- [0003. files/는 시스템이 해석하지 않는 사용자 콘텐츠 workspace다](0003-files-workspace-contract.md)
- [0004. 세션은 JSONL tree 파일로 저장한다](0004-session-jsonl-tree.md)
- [0005. 창작 세션과 메타 세션을 분리한다](0005-meta-session.md)
- [0006. Web UI는 server 3-layer와 client FSD 계층을 유지한다](0006-webui-layering.md)
- [0007. 에이전트는 prompt 계약과 project-scoped tools로 동작한다](0007-agent-prompt-tool-boundary.md)
