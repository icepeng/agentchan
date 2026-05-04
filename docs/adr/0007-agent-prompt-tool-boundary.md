# Creative agent는 Agent instructions 합성과 Project folder 경계 도구로만 동작한다

Creative agent가 Project 안에서 무엇을 알고 무엇을 할 수 있는지의 경계가 흐릿하면 두 가지가 망가진다 — 모델이 숨겨진 runtime 상태나 UI 구현 세부에 의존해 host 변경에 깨지고, compaction(대화 요약 후 재시작) 이후 어떤 지침이 살아남았는지가 모호해진다. 또 일반 shell access를 열어두면 Project folder 경계가 무력해지고, packaged executable에서는 host shell 환경 의존이 배포를 어렵게 만든다. 이 경계를 두 면에서 고정한다.

System prompt는 *합성*이고, 합성 재료는 셋뿐이다 — hardcoded base prompt, session mode에 맞는 `SYSTEM.md` 또는 `SYSTEM.meta.md`, session mode에 맞는 Skill catalog. 목록에는 Skill 이름과 설명만 들어가고 body는 들어가지 않는다. body는 모델이 `activate_skill` tool을 호출하거나 User가 Slash command로 부를 때만 Session context에 들어간다. 이 분리 덕분에 catalog는 늘 합성 가능하면서 body 토큰 비용은 활성화 시점에만 든다.

Tool은 Project folder에 *scope된* 등록 도구로 한정한다. 일반 shell 도구(Bash 등)는 제공하지 않는다. Skill이나 Project가 helper code 실행이 필요하면 *script tool*이라는 등록된 경로로 돌린다 — script 자체도 Project 안에 있는 코드여야 한다. 이 결과 Creative agent는 Renderer host의 React tree, Session 저장 implementation, UI context 같은 host 내부에 직접 닿지 않고, Project 파일이 Creative agent와 host 사이의 *유일한 공용 계약*으로 남는다.
