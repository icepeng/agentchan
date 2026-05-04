# Project content는 시스템이 도메인 의미로 해석하지 않는다

Agentchan은 캐릭터 챗·소설·RPG·미스터리처럼 *서로 다른 장르*의 Project를 같은 코어 위에 얹는다. 장르마다 도메인 객체가 다르다 — 캐릭터, 장면, 퀘스트, 메모리, 단서. 시스템이 이 객체들을 도메인 의미로 직접 다루기 시작하면 특정 장르의 schema가 코어에 새겨지고, 새 장르를 시도할 때마다 코어 변경이 필요해진다. Template 실험이 코어 코드 변경 속도에 묶인다.

이 분리를 구조로 잡는다. Project의 `files/` 안의 모든 항목은 *Project content*로 취급한다. 시스템은 `files/`를 재귀 스캔해 텍스트 / 데이터 / 바이너리로 분류된 단순 파일 목록을 만들지만, 그 안의 frontmatter나 YAML 키가 무엇을 *뜻하는지*는 해석하지 않는다. 의미는 Renderer · Skill · Agent instructions가 책임진다.

표현 단위는 세 종류다. 텍스트 파일은 본문과 (있으면) frontmatter dict, YAML/JSON은 파싱된 data와 format tag, 그 외는 binary로 분류한다. YAML/JSON 파싱이 실패하면 텍스트 파일로 fallback한다 — 잘못된 YAML이 시스템 에러로 번지지 않게 하는 의도된 안전망이다. Path는 `files/` 기준 상대 경로 + `/` separator로 통일한다. Digest는 cache identity로만 쓰며 해시 알고리즘이나 포맷을 노출하지 않는다.

## Considered Options

- **Frontmatter 키를 코어가 해석해 표준 타입으로 제공** — 기각. 같은 키 이름이 template마다 다른 의미를 가질 수 있어 — 한 template의 `tags`는 단순 메타데이터, 다른 template의 `tags`는 검색 인덱스 — 코어가 의미를 못 박는다.

## Consequences

- frontmatter schema가 시스템 release와 독립적으로 진화한다. 한 Template의 frontmatter 변경이 다른 Template을 깨뜨리지 않는다.
- 같은 field name이 Template마다 다른 의미를 가질 수 있다. Cross-template 가정을 만들지 않는다.
- Server와 agent tool은 *범용* Project content 파일 조작(read / write / list / delete)만 제공한다. 도메인 query API는 두지 않는다.
- Project content 관습을 바꾸면 같은 Template의 Agent instructions · Skill · Renderer를 함께 맞춰야 한다 — 코어가 강제하지 않기 때문이다.
