# Creative session과 meta session을 분리한다

한 Project 안에는 *창작 놀이를 진행하는 대화*(캐릭터 만들기, 장면 쓰기, 플롯 잡기)와 *창작 놀이를 가능하게 하는 구성 작업*(Renderer 짜기, Agent instructions 수정, Project 구조 정리)이 함께 있다. 두 작업이 같은 Session · 같은 Agent instructions · 같은 Skill 목록을 공유하면 두 가지가 동시에 망가진다 — Creative session 기록에 Renderer 빌드 로그가 섞여 들어가고, Renderer 작성용 Skill이 캐릭터 만들기 대화에 노출돼 모델이 잘못 활성화한다.

Session은 *영구 속성*으로 mode를 갖는다 — `creative` 또는 `meta`. mode는 session header에 한 필드로 둔다(없으면 creative로 해석). mode에 따라 Agent instructions(`SYSTEM.md` ↔ `SYSTEM.meta.md`)와 Skill 목록이 통째로 갈린다. Skill 자체도 frontmatter `environment: creative | meta`로 어느 쪽에 속하는지 표시한다.

Mode 전환은 *Session 단위*다. Creative session 안에서 Meta session용 Skill의 Slash command를 입력하면 client가 새 Meta session을 만들어 옮긴다 — 같은 Session의 mode를 도중에 바꾸지 않는다. 한 Session의 mode가 영구 속성이라는 점이 이 결정의 핵심이다.

## Considered Options

- **Session 한 종류만 두고 Agent instructions와 Skill 노출을 동적으로 토글** — 기각. transcript는 한 흐름인데 도중에 Agent instructions가 바뀌면 LLM context replay가 일관되지 않고, 어떤 내부 왕복이 어느 mode에서 일어났는지를 entry마다 표시해야 한다.

## Reconsider When

- 창작 작업과 meta 작업을 같은 transcript에서 이어가는 UX가 mode 분리보다 더 가치 있어진다.
- meta 작업이 renderer 짜기 외로 다양해져 mode가 두 종류로는 부족해진다.
