# Creative agent 파일 Tool 경계

Creative agent의 파일시스템 접근 Tool은 Project folder 안의 path만 읽고 쓴다. `read`, `write`, `append`, `edit`, `grep`, `tree`는 입력 path를 Project folder 기준으로 해석하고, absolute path, `..` parent traversal, Windows alternate-drive path처럼 Project folder 밖으로 나가는 입력은 거부한다.

이 Tool 경계는 Project content 전용 경계가 아니라 Project folder 경계다. Creative agent는 `files/`뿐 아니라 `SYSTEM.md`, `skills/`, `renderer/`처럼 Project 안의 실행 재료도 읽고 쓸 수 있다. Project editor와 server file API가 `_project.json`, `sessions/` 같은 protected root를 숨기는 정책은 별도 계약이다.

## Considered Options

- **Host filesystem 전체 접근**: 기각. Creative agent가 Project 밖의 User 파일이나 Agentchan runtime 파일을 읽고 쓸 수 있게 된다.
- **`files/` 아래 Project content만 접근**: 기각. Project 구성 작업에서 `SYSTEM.md`, `skills/`, `renderer/`를 고칠 수 없다.
- **Server file API의 protected root 정책 재사용**: 기각. Creative agent Tool은 Project folder 안에서 실행 재료를 다루는 계약이고, Project editor의 숨김/차단 정책과 역할이 다르다.

## Consequences

- Creative agent 파일 Tool의 path error는 HTTP 404가 아니라 Tool 실행 error로 돌아간다.
- Tool path 검사는 symlink를 따라가지 않는 lexical boundary check다.
