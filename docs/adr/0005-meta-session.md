# Creative session과 meta session을 분리한다

Session은 영구 속성으로 mode를 갖는다. Mode는 `creative` 또는 `meta`이며, session header에 한 필드로 저장한다. Mode가 없는 기존 Session은 `creative`로 해석한다.

Mode는 Session이 읽는 SYSTEM.md와 Skill 목록을 고른다. Creative session은 `SYSTEM.md`와 creative Skill을 사용하고, meta session은 `SYSTEM.meta.md`와 meta Skill을 사용한다. Skill은 frontmatter `environment: creative | meta`로 소속 mode를 표시한다.

Motivation: 한 Project 안에는 창작 놀이를 진행하는 대화(캐릭터 만들기, 장면 쓰기, 플롯 잡기)와 창작 놀이를 가능하게 하는 구성 작업(Renderer 작성, SYSTEM.md 수정, Project 구조 정리)이 함께 있다. 두 흐름은 같은 Project를 다루지만 필요한 SYSTEM.md와 Skill 목록이 다르다.

## Considered Options

- **Session 한 종류만 두고 SYSTEM.md와 Skill 노출을 동적으로 토글**: 기각. transcript는 한 흐름인데 도중에 SYSTEM.md가 바뀌면 LLM context replay가 일관되지 않고, 어떤 내부 왕복이 어느 mode에서 일어났는지를 entry마다 표시해야 한다.
- **Meta 작업을 Creative session transcript 안에 함께 기록**: 기각. Creative session 기록에 Renderer 빌드 로그와 Project 구성 작업이 섞이고, meta Skill이 창작 대화 중 모델에게 노출된다.

## Consequences

- Session list와 Session load는 mode를 header에서 읽어 creative/meta를 구분한다.
- Creative session 안에서 meta Skill의 Slash command를 입력하면 client가 새로운 meta session을 만든다.
- Skill discovery는 Session mode와 Skill `environment`를 함께 본다.
- Creative session에서 meta 작업으로 이동하는 UX는 같은 transcript의 mode mutation이 아니라 별도 meta session 생성/선택으로 구현한다.

## Reconsider When

- 창작 작업과 meta 작업을 같은 transcript에서 이어가는 UX가 mode 분리보다 더 가치 있어진다.
- meta 작업이 renderer 짜기 외로 다양해져 mode가 두 종류로는 부족해진다.
