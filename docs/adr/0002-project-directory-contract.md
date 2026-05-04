# Project folder 계약은 runtime이 알아야 하는 root entry로 좁히고, 폴더명을 slug 출처로 둔다

Project는 파일시스템 디렉토리에 저장된다. 같은 root 아래에 시스템이 직접 다루는 인프라 파일(Agent instructions 합성·Session 저장·Renderer build가 의존)과 Template이 자유롭게 채우는 Project content가 함께 산다.

이 경계가 두꺼우면 — 시스템이 root의 모든 파일을 의미 있게 해석하려 들면 — 새 Template type마다 코어 변경/migration이 필요해진다.
너무 느슨하면 — 어떤 root 파일이 시스템에 의미 있는지 정해지지 않으면 — UI나 agent tool이 안전하게 root를 다룰 수 없다.

가운데를 잡는다. 시스템 계약에 들어가는 root entry는 *runtime이 실제로 알아야 하는 것*만으로 한정한다. 이 외 root 파일은 Template이 무엇을 두든 시스템이 해석하지 않고 그대로 보존한다. Template → Project 복사는 root entry를 readdir로 모두 가져오는 단순 복사이며, 시스템이 모르는 파일도 같이 복사된다.

Project root entry는 편집 가능성 기준으로 다시 나눈다.

- **User-editable root** — `SYSTEM.md`, `SYSTEM.meta.md`, `skills/`, `renderer/`, `files/`, `README.md`, `COVER.*`. 이들은 Project editor에서 직접 고칠 수 있고, Template에서 Project로 복사된 뒤 Project마다 독립적으로 갈라질 수 있다.
- **Protected root** — `_project.json`, `sessions/`. 이들은 runtime-owned root다. Project editor와 server file API는 이 항목들을 tree에서 숨기고 직접 read/write/delete/rename을 차단한다.
- **Unknown root** — 시스템 계약에 없는 나머지 root entry. Template → Project 복사와 duplicate에서는 보존하지만, runtime은 의미를 해석하지 않는다. Project editor/file API에서는 dotfile root와 protected root만 가린다.

Protected root는 "UI에서만 숨기는 파일"이 아니라 file API의 접근 경계다. `_project.json`은 Project identity와 metadata의 persistence artifact이고, `sessions/`는 Session 저장소이므로 Project editor에서 Project content처럼 편집되면 Project list, Session selection, append-only Session storage가 깨진다. 반대로 `SYSTEM.md`, `skills/`, `renderer/`는 실행 의미가 있지만 User가 의도적으로 고쳐야 하는 Project 구성요소이므로 protected root가 아니다.

slug는 별도 필드로 저장하지 않고 *폴더명*을 단일 출처로 삼는다. `_project.json`에 slug 필드를 들고 있으면 폴더명과 두 출처가 drift할 위험이 있고, rename은 폴더명 변경이라는 자연스러운 연산을 잃는다.

## Considered Options

- **`_project.json` manifest로 root 구성을 자가 기술** — 기각. 이중 source(파일시스템 + manifest)가 drift할 자리만 늘린다. 여러 runtime version 공존이 실제 문제가 되기 전엔 도입하지 않는다.
