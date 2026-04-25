# ADR 0007: 에이전트는 prompt 계약과 project-scoped tools로 동작한다

Status: Accepted  
Date: 2026-04-25

## Context

Agentchan의 agent는 프로젝트별 행동 규칙, on-demand 절차, 파일 작업 도구를
함께 사용한다. 경계가 불명확하면 모델이 숨겨진 runtime 상태나 UI 구현에
의존하게 되고, compaction 이후 어떤 지침이 살아남는지도 모호해진다.

또한 일반 shell 접근을 열어두면 프로젝트 경계, packaged executable, end
user 환경이 모두 복잡해진다.

## Decision

Agent system prompt는 다음 레이어를 합성한다.

- hardcoded base prompt
- session mode에 맞는 `SYSTEM.md` 또는 `SYSTEM.meta.md`
- session mode에 맞는 skill catalog

Skill body는 catalog에 포함하지 않는다. 모델이 `activate_skill`을 호출하거나
사용자가 slash command로 요청할 때만 body가 conversation context에 들어간다.

Agent tools는 project directory에 scope된 등록 도구로 제한한다. 일반 shell
도구는 제공하지 않는다. 프로젝트/skill이 제공한 helper code 실행은 script
tool을 통해 수행한다.

Agent는 renderer host, session storage implementation, UI context에 직접
접근하지 않는다. 프로젝트에 영향을 주는 기본 경로는 project-scoped file
tools로 파일을 읽고 쓰는 것이다.

## Consequences

- `SYSTEM.md`와 skill catalog는 compaction 이후에도 다시 구성할 수 있다.
- Skill body는 on-demand라 token 비용과 활성화 시점이 명확하다.
- 프로젝트 파일 경계가 agent와 UI 사이의 공용 계약으로 남는다.
- Packaged executable 환경에서 shell 의존을 줄일 수 있다.
- 범용 shell 대신 script tool과 skill별 helper를 준비해야 한다.
- 모델이 어떤 skill을 활성화할지는 catalog description 품질에 의존한다.

## Reconsider When

- project-scoped tools만으로 해결할 수 없는 core workflow가 반복된다.
- packaged app 밖의 developer-only automation이 agent runtime 안으로 들어와야
  한다.
- skill activation의 token 비용이나 timing을 더 강하게 통제해야 한다.
