# ADR 0011: Template은 origin trust로 게이팅한다

Status: Accepted
Date: 2026-05-02

## Context

Template은 새 **Project**의 출발점으로 root entry를 그대로 복사한다(ADR-0002).
복사 대상에는 단순한 사용자 콘텐츠뿐 아니라 *실행 의미를 가진* 파일들이 포함된다.

- `skills/*/SKILL.md` 본문은 `activate_skill` 또는 slash command로 LLM
  conversation에 주입된다 — 즉 prompt injection의 직접 통로.
- `renderer/index.ts(x)`는 esbuild로 ESM bundle이 빌드되어 사용자 브라우저에
  올라간다 — 즉 임의 코드 실행.
- `SYSTEM.md`는 agent system prompt로 합성된다.

따라서 "낯선 template으로 프로젝트를 만든다"는 행위는 의미상 *낯선 source의
코드와 prompt를 신뢰하는 행위*다. UX 단계의 confirmation만으로는 categorical
boundary가 약하다 — code path 어디서든 새 project를 만들면 구분 없이 실행 의미가
주입된다.

## Decision

Template은 **trusted** 또는 **untrusted** 두 상태 중 하나를 가진다. **Project**
생성은 trusted template만 허용하며, untrusted template으로 시도하면 server
layer에서 `TrustRequiredError`로 차단한다.

### Trust origin

Trust 결정의 출처는 두 가지뿐이다.

1. **Built-in 등록**: `apps/webui/src/server/builtin-templates.json`에 slug가
   포함된 template은 항상 trusted. 토글 불가.
2. **사용자 명시 동의**: 사용자가 UI prompt(`TemplatesPage`, `ProjectTabs`의
   trust dialog)에서 명시적으로 trust한 template은 `app_settings.trust.templates`
   key의 JSON array에 slug로 영속된다.

"Save as template" 흐름으로 만들어진 template은 사용자 본인 출처이므로 자동
trusted를 부여한다(`template.service.ts`).

### Enforcement layer

Trust check는 server의 `project.service.ts` 단일 지점에서 강제한다. UI는
trust dialog로 사용자에게 결정을 묻지만, *실제 게이팅 권한은 server*다.
client 측 trust check는 UX hint이며 보안 boundary가 아니다.

### What "trust" doesn't do

이 결정은 *실행 시점의 sandbox*가 아니다. Trusted template으로 만들어진
프로젝트의 skill body, renderer code는 sandbox 없이 실행된다. Trust는 origin
gate일 뿐이며 ongoing isolation은 별도 결정의 영역이다.

## Consequences

- 신규 template type을 만들 때 trust 처리를 우회할 수 없다 — built-in 등록 또는
  사용자 동의 둘 중 하나를 거쳐야 한다.
- Built-in template 추가는 `builtin-templates.json` 등록과 함께 들어가야 한다.
  registry 누락은 사용자에게 trust prompt가 뜨는 형태로 드러난다.
- Trust 상태는 install-scoped 영속 — `settings.db`(server settings)에 산다.
  브라우저 간 동기화되지 않으며, install reset은 trust도 reset한다.
- "Save as template"은 사용자가 origin이라는 가정에 의존한다. 외부 import 흐름이
  추가될 때는 그 흐름이 자동 trust를 받지 않도록 분리해야 한다.
- Skill/renderer의 *실행 시점* 위험(예: skill body의 prompt injection, renderer
  bundle의 임의 코드)은 본 ADR이 다루지 않는다. 별도 결정이 필요하다.

## Reconsider When

- Template 배포 채널이 multi-source로 확장되어(예: 사용자 간 공유, registry
  fetch) 단순 trusted/untrusted boolean으로 origin 차이를 표현하기 어려워진다.
  이 시점엔 origin별 trust level 또는 signature 기반 verification으로 진화.
- Renderer/skill 실행 시점의 sandbox가 도입되어 origin trust가 더 이상 *유일한*
  경계가 아니게 된다.
- Built-in 등록과 사용자 동의가 같은 카테고리에 묶이는 가정이 깨진다(예:
  built-in도 사용자가 disable해야 하는 경우).
