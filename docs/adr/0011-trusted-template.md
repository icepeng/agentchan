# Trusted template

Project는 **Trusted template**에서만 만들 수 있다. Trust 검사는 Project 생성 service에서 수행한다. Client의 trust dialog는 User에게 결정을 받는 UI일 뿐이고, server가 신뢰되지 않은 Template으로부터 Project 생성을 차단한다.

Trusted template이 되는 경로는 세 가지다. 제품이 함께 제공하는 built-in Template은 처음부터 trusted다. User가 trust dialog에서 명시적으로 신뢰한 Template은 Template slug를 install-scoped server setting에 저장한다. User가 자기 Project를 Template으로 저장한 경우에도 해당 Template slug를 trusted set에 넣는다.

Trust는 실행 sandbox가 아니다. Trusted template에서 만들어진 `*.ts`, Renderer code는 별도 sandbox 없이 실행/합성된다. 이 ADR은 Project 생성 전의 origin gate만 다룬다.

Motivation: Template은 새 Project의 root entry를 복사한다. 복사 대상에는 `renderer/`, script tool에 사용될 `*.ts`처럼 임의의 스크립트가 들어간다. 따라서 낯선 Template으로 Project를 만든다는 것은 낯선 source의 지침과 코드를 실행 재료로 받아들이는 일이다.

## Considered Options

- **User별 trust 정책**: 기각. Agentchan은 현재 single-user desktop 앱이고, User 인증/권한 모델을 도입할 단계가 아니다.
- **Template signature 검증**: 보류. 더 강하지만, 구현 범위가 지나치게 늘어난다. Template 배포 채널이 User 간 공유나 registry fetch로 확장되면 다시 검토한다.

## Consequences

- Built-in Template을 추가할 때는 `builtin-templates.json`에 등록한다.
- Trust setting에는 hash나 signature가 아니라 Template slug 목록을 저장한다.
- Built-in 등록이 빠진 Template은 User에게 trust dialog가 뜬다.
