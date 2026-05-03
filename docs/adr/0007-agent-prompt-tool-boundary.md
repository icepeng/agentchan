# 에이전트는 prompt 계약과 project-scoped tools로 동작한다

Agent system prompt는 hardcoded base prompt, session mode별 `SYSTEM.md`/`SYSTEM.meta.md`, mode별 skill catalog를 합성하되 skill body는 `activate_skill` 또는 slash command 시점에만 conversation context에 넣는다.
Agent tools는 project directory에 scope된 등록 도구로 제한하고 Bash와 같은 일반 shell을 제공하지 않아, 모델이 host UI나 session storage 구현 대신 project files라는 공용 계약을 통해 작업하게 한다.
