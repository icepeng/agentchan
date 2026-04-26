# ADR 0005: 창작 세션과 메타 세션을 분리한다

Status: Accepted  
Date: 2026-04-25

## Context

Agentchan 프로젝트 안에는 작품 안에서 진행되는 창작 대화와, renderer 작성,
system prompt 수정, 프로젝트 구조 정리 같은 메타 작업이 함께 존재한다.

두 작업이 같은 session과 같은 system prompt를 공유하면 창작 transcript가
관리 작업으로 오염되고, renderer 작성 같은 메타 작업용 skill이 창작 세션에
노출된다.

## Decision

Session은 `mode: "creative" | "meta"`를 가진다. `mode`가 없으면 creative로
간주한다.

Mode에 따라 다음을 분리한다.

- creative: `SYSTEM.md`, creative skills
- meta: `SYSTEM.meta.md`, meta skills

Skill frontmatter의 `environment`는 `creative | meta`이며 기본값은
creative다. Creative session에서 meta skill slash command를 입력하면
클라이언트가 meta session을 생성하고 전환할 수 있다.

## Consequences

- 창작 transcript가 renderer 빌드나 프로젝트 관리 대화로 오염되지 않는다.
- renderer 작성 같은 관리 skill을 creative session에서 숨길 수 있다.
- 기존 session 파일은 mode가 없어도 creative로 읽힌다.
- Skill catalog와 available tools는 session mode에 따라 달라진다.

## Reconsider When

- 창작 대화와 메타 작업을 같은 transcript에서 이어가는 UX가 더 중요해진다.
- meta 작업이 renderer 외에도 많아져 mode가 둘 이상 필요해진다.
