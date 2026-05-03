# Template은 origin trust로 게이팅한다

Template은 `SYSTEM.md`, skills, renderer처럼 prompt와 code execution 의미를 가진 파일을 Project에 그대로 복사하므로, Project 생성은 trusted template에만 허용한다.
Trust origin은 built-in registry 등록 또는 사용자 명시 동의뿐이며, 실제 enforcement는 UI hint가 아니라 server `project.service.ts`의 단일 gate에서 수행한다.
