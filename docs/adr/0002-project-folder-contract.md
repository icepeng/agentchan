# Project folder 계약

Project는 파일시스템 디렉토리에 저장한다. Runtime이 의미를 해석하는 root entry는 실제 실행에 필요한 항목으로 최소화한다. Slug의 단일 출처는 Project folder 이름이다.

Project root entry 중 runtime이 이름을 아는 항목은 두 종류다.

- **Known root**: `SYSTEM.md`, `SYSTEM.meta.md`, `skills/`, `renderer/`, `files/`, `README.md`, `COVER.*`. 이들은 Project editor에서 직접 고칠 수 있고, Template에서 Project로 복사된 뒤 Project마다 독립적으로 갈라질 수 있다.
- **Protected root**: `_project.json`, `sessions/`. 이 항목들은 Agentchan이 소유한다. Project editor와 server file API는 이 항목들을 tree에서 숨기고 직접 read/write/delete/rename을 차단한다.

Template에서 Project로 복사할 때는 root entry를 `readdir`로 모두 가져오는 단순 복사를 사용한다. 위 목록에 없는 root entry도 보존하지만, runtime은 의미를 해석하지 않는다.

## Considered Options

- **`_project.json` manifest로 root 구성을 자가 기술**: 기각. 이중 source(파일시스템 + manifest)가 drift할 자리만 늘린다. 특히 slug는 a72b397 이전에 계속 문제가 되어 제거했다.
- **Root의 모든 파일을 runtime 계약으로 해석**: 기각. Template type이 늘어날 때마다 core schema와 migration 부담이 커진다.
- **Root entry를 모두 일반 Project content처럼 편집 허용**: 기각. `_project.json`과 `sessions/`가 Project content처럼 편집되면 Project list, Session selection, append-only Session storage가 깨진다.

## Consequences

- `_project.json`은 metadata만 저장하게 된다.
- Rename은 Project folder 이름 변경으로 표현한다.
