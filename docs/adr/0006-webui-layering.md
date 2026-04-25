# ADR 0006: Web UI는 server 3-layer와 client FSD 계층을 유지한다

Status: Accepted  
Date: 2026-04-25

## Context

Web UI는 파일 저장소, session API, agent streaming, settings, templates,
renderer host를 모두 다룬다. 서버와 클라이언트 책임이 섞이면 작은 기능도
여러 방향으로 의존성이 번진다.

현재 코드의 server composition root는 repo → service → Hono DI → route를
조립한다. Client는 `app/`, `pages/`, `features/`, `entities/`, `shared/`
계층으로 나뉜다.

## Decision

Server:

- Route → Service → Repository 3-layer를 유지한다.
- `apps/webui/src/server/index.ts`는 composition root다.
- Routes는 HTTP 파싱/검증/응답만 담당하고 filesystem 경로 상수를 직접
  import하지 않는다.
- Services는 business workflow와 repo 조합을 담당한다.
- Repositories는 data access만 담당한다.

Client:

- `app/ → pages/ → features/ → entities/ → shared/` 의존 방향을 유지한다.
- Page는 조합만 담당한다.
- Cross-domain orchestration은 `features/` hook에서 수행한다.
- Domain state/API/type은 `entities/`에 둔다.
- `shared/`는 context에 접근하지 않는다.
- Renderer host처럼 복합 lifecycle을 가진 UI도 feature 내부 orchestration에
  두고, bundle/snapshot/theme 상태는 entity context에 둔다.

## Consequences

- API route 변경은 service/repo 계약을 통해 확산된다.
- Client domain state는 entity별 context로 독립된다.
- Project activation/delete처럼 여러 domain을 동시에 바꾸는 흐름은 features
  layer에 모인다.
- 순수 UI와 utility는 shared에 남아 재사용 가능하다.

## Reconsider When

- Route/service/repo boilerplate가 기능 속도를 크게 떨어뜨린다.
- Client feature orchestration이 커져 명시적 application service layer가
  필요해진다.
