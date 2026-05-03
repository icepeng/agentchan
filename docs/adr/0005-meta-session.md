# 창작 세션과 메타 세션을 분리한다

Project 안의 session은 작품 본업을 다루는 creative session과 renderer 작성, system prompt 수정, project 구조 정리 같은 보조 작업을 다루는 meta session으로 분리한다.
두 세션은 기본 시스템 프롬프트, SYSTEM.md/SYSTEM.meta.md, 툴 목록, 스킬 목록 등 모든 것이 달라질 수 있는 별개의 agent로 다뤄야 하지만, 구현 편의상 creative-agent의 간단한 분기로 처리한다.
