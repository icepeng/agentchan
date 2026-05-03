# 프로젝트 디렉토리는 얇은 런타임 계약만 가진다

Project directory의 시스템 계약은 `_project.json`, `SYSTEM.md`, `SYSTEM.meta.md`, `skills/`, `renderer/`, `files/`, `sessions/`, `README.md`, `COVER.*`처럼 runtime이 알아야 하는 최소 root entry로 제한한다.
Folder name을 project slug의 단일 원천으로 삼고, template이 추가하는 다른 root 파일은 복사되더라도 core 계약으로 해석하지 않아 template migration 비용을 줄인다.
