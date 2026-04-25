# ADR 0003: files/는 시스템이 해석하지 않는 사용자 콘텐츠 workspace다

Status: Accepted  
Date: 2026-04-25

## Context

Agentchan은 캐릭터 챗, 소설, RPG, 미스터리처럼 서로 다른 프로젝트 타입을
지원한다. 각 타입마다 캐릭터, 장면, 퀘스트, 메모리, 단서 같은 도메인
객체가 다르다.

시스템이 이 객체를 직접 해석하면 특정 장르의 스키마가 코어에 새겨지고
템플릿 실험이 느려진다.

## Decision

`files/` 안의 모든 항목은 사용자 콘텐츠로 취급한다. 시스템은 재귀 스캔해
`ProjectFile[]`을 만들지만 도메인 의미는 해석하지 않는다.

현재 파일 계약은 다음이다.

- `TextFile`: `type`, `path`, `content`, `frontmatter`, `modifiedAt`, `digest`
- `DataFile`: `type`, `path`, `content`, `data`, `format`, `modifiedAt`, `digest`
- `BinaryFile`: `type`, `path`, `modifiedAt`, `digest`

Markdown frontmatter는 파싱하지만 의미를 해석하지 않는다. YAML/JSON은
`DataFile`로 파싱하고, parse failure는 `TextFile`로 fallback한다. Dotfile과
dotdir은 스캔하지 않는다. `path`는 `files/` 기준 상대 경로이며 `/`
separator를 사용한다.

`digest`는 cache identity로만 사용한다. hash 알고리즘이나 포맷을 파싱하지
않는다.

## Consequences

- frontmatter 스키마가 시스템 릴리즈와 독립적으로 진화한다.
- 템플릿은 자기 장르에 맞는 디렉토리와 필드를 자유롭게 정의한다.
- 서버와 에이전트 도구는 범용 파일 조작만 제공하면 된다.
- 타입 안정성은 코어가 아니라 renderer, skill, template tests가 책임진다.
- 같은 field name이 template마다 다른 의미를 가질 수 있다.
- 파일 관습을 바꾸면 `SYSTEM.md`, skills, renderer를 함께 맞춘다.

## Reconsider When

- 여러 template에서 같은 data shape가 반복되고, 중복 parser/validator가
  실제 유지보수 비용이 된다.
- user-authored files를 안전하게 migration해야 하는 core schema가 필요해진다.
