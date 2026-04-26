# ADR 0002: 프로젝트 디렉토리는 얇은 런타임 계약만 가진다

Status: Accepted  
Date: 2026-04-25

## Context

Agentchan 프로젝트는 파일시스템 디렉토리다. 같은 루트 아래에 시스템이
직접 다루는 인프라 파일과 템플릿이 자유롭게 구성하는 창작 파일이 함께
있다. 계약이 두꺼워지면 템플릿마다 migration이 필요하고, 계약이 너무
느슨하면 UI와 agent 도구가 안전하게 접근할 수 없다.

현재 구현은 `_project.json`과 `sessions/`를 hidden root로 막고, `files/`
만 renderer snapshot으로 스캔한다. Template → Project 복사는 선택한
template directory의 루트 엔트리를 `readdir`로 모두 복사한다.

## Decision

프로젝트 디렉토리의 시스템 계약은 다음으로 제한한다.

- `_project.json`: `name`, `createdAt`, `updatedAt`, `notes?` metadata.
  `slug`는 저장하지 않는다.
- 폴더명: project slug의 단일 원천.
- `SYSTEM.md`: creative session system prompt.
- `SYSTEM.meta.md`: meta session system prompt. 없으면 빈 값.
- `skills/*/SKILL.md`: skill catalog와 activation body.
- `renderer/`: renderer app source. entrypoint는 `renderer/index.ts` 또는
  `renderer/index.tsx`.
- `files/`: renderer snapshot과 creative workspace로 스캔되는 사용자 콘텐츠.
- `sessions/`: JSONL session storage. file API와 edit tree에서는 숨긴다.
- `README.md`: template/project documentation. Template metadata는 README
  frontmatter에서 읽는다.
- `COVER.*`: optional cover image. `hasCover`는 list API에서 계산한다.

## Consequences

- 새 프로젝트 타입은 시스템 코드 변경 없이 `SYSTEM.md`, `skills/`,
  `renderer/`, `files/` 조합으로 만든다.
- 새 루트 파일을 템플릿에 추가해도 프로젝트 생성 복사 allowlist를 수정하지
  않는다.
- 루트의 새 인프라 디렉토리를 추가할 때는 hidden root로 막을지 검토한다.
- `files/` 밖의 파일은 edit mode에서 보일 수 있지만 renderer snapshot에는
  들어가지 않는다.
- rename은 폴더명을 바꾸고 `_project.json` metadata만 갱신한다.

## Reconsider When

- 사용자 콘텐츠와 시스템 인프라가 같은 루트에 있는 구조가 반복적으로 file
  API 안전성 문제를 만든다.
- 여러 renderer/runtime 버전이 공존해 project manifest가 필요해진다.
