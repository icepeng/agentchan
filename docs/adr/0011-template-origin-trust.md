# Template은 origin trust gate를 통과해야 Project 생성에 쓸 수 있다

Template은 새 Project의 출발점으로 root entry를 그대로 복사한다. 복사 대상에 *단순한 Project content뿐 아니라 실행 의미를 가진 파일*이 들어간다는 점이 이 결정의 핵심이다 — `skills/*/SKILL.md` 본문은 `activate_skill` 또는 Slash command를 통해 LLM Session context에 직접 주입되고(prompt injection의 직접 통로), `renderer/index.ts(x)`는 esbuild로 ESM bundle이 빌드돼 User 브라우저에서 임의 코드로 실행되며, Agent instructions는 agent system prompt로 합성된다. 즉 "낯선 Template으로 Project를 만든다"는 행위는 의미상 *낯선 source의 코드와 prompt를 신뢰하는 행위*다.

UX 단계 confirmation만으로는 이 경계가 약하다 — code path 어디서든 새 Project를 만들 수 있으면 confirmation을 우회한 path가 곧바로 실행 의미 주입이다. 그래서 trust를 *Project 생성 직전 server gate*로 격상한다. Template은 trusted 또는 untrusted 두 상태 중 하나만 갖고, Project 생성은 Trusted template만 허용한다 — untrusted로 시도하면 server에서 차단한다.

Trust의 *출처*는 두 가지뿐이다. 첫째, built-in 등록(제품이 동봉한 Template은 항상 trusted, 토글 불가). 둘째, User가 UI prompt에서 명시적으로 trust한 Template(install scoped server settings에 영속). "Save as template"으로 Author 본인이 만든 Template은 출처가 Author 자신이라 자동 trusted를 부여한다.

Enforcement는 *server 단일 지점*이다. UI는 trust dialog로 User에게 결정을 묻지만, 실제 게이팅은 server의 Project 생성 service에서 일어난다 — client 측 trust check는 UX hint이며 보안 boundary가 아니다.

이 결정이 *하지 않는* 것을 명시할 가치가 있다. Trust는 *실행 시점의 sandbox가 아니다*. Trusted template으로 만들어진 Project의 Skill body, Renderer code, Agent instructions는 sandbox 없이 그대로 실행/합성된다. Trust는 *origin gate*일 뿐이며 ongoing isolation은 별도 결정의 영역이다.

## Considered Options

1. **User별 trust(인증된 User 화이트리스트)** — 기각. agentchan은 single-user desktop 형태이고, 현재 단계에서 User 인증 / 다중 User 정책을 들이는 비용이 보호 가치를 넘는다.
2. **Template 자체에 signature를 박아 verify** — 보류. Template 배포 채널이 multi-source(User 간 공유, registry fetch)로 확장되기 전엔 single-bit trust로 충분하다. multi-source 확장 시 signature/level 모델로 진화 검토(reconsider 항목).

## Consequences

- 신규 Template type을 만들 때 trust 처리를 우회할 수 없다 — built-in 등록 또는 User 동의 둘 중 하나를 거친다.
- Built-in template 추가는 registry 등록과 함께 들어간다. 등록 누락은 User에게 *trust prompt가 뜨는 형태*로 드러난다 — silent failure가 아닌 점이 의도된 안전망이다.
