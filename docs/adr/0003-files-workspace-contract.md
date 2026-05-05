# Project content는 시스템이 도메인 의미로 해석하지 않는다

Project의 `files/` 아래 항목은 모두 Project content다. Runtime은 `files/`를 재귀 스캔해 단순 파일 목록으로 제공하지만, 파일 안의 frontmatter, YAML key, JSON field가 무엇을 뜻하는지는 해석하지 않는다. Project content의 도메인 의미는 SYSTEM.md, Skill, Renderer가 정한다.

Runtime이 제공하는 표현 단위는 세 종류다.

- Text: 본문과 optional frontmatter dict.
- Data: 파싱된 YAML/JSON data와 format tag.
- Binary: text/data로 다루지 않는 파일.

YAML/JSON 파싱이 실패하면 text로 fallback한다. 잘못된 YAML이 Project content 전체를 시스템 에러로 만들지 않기 위한 안전망이다. Path는 `files/` 기준 상대 경로와 `/` separator로 통일한다. Digest는 cache identity로만 쓰며 해시 알고리즘이나 포맷을 public contract로 노출하지 않는다.

Motivation: Agentchan은 캐릭터 챗, 소설, RPG, 미스터리처럼 서로 다른 장르의 Project를 같은 core 위에 얹는다. 장르마다 필요한 도메인 객체가 다르기 때문에 core가 의미를 해석하기 시작하면 특정 장르의 schema가 runtime에 새겨지고, Template 실험이 core 변경 속도에 묶인다.

## Considered Options

- **Frontmatter 키를 코어가 해석해 표준 타입으로 제공**: 기각. Runtime API가 특정 Project genre의 객체 모델을 알게 된다.
- **YAML/JSON 파싱 실패를 Project error로 처리**: 기각. 작성 중인 Project content 하나가 깨졌다는 이유로 list/read 같은 범용 파일 조작까지 실패하면 Project editor와 agent tool이 취약해진다.

## Consequences

- frontmatter schema가 시스템 release와 독립적으로 진화한다. 한 Template의 frontmatter 변경이 다른 Template을 깨뜨리지 않는다.
- 같은 field name이 Template마다 다른 의미를 가질 수 있다. Cross-template 가정을 만들지 않는다.
- Server와 agent tool은 범용 Project content 파일 조작(read / write / list / delete)만 제공한다. 도메인 query API는 두지 않는다.
- Project content 관습을 바꾸면 같은 Template의 SYSTEM.md · Skill · Renderer를 함께 맞춰야 한다. 코어가 강제하지 않기 때문이다.
