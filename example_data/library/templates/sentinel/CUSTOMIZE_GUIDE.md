# 커스터마이즈 가이드

## `SYSTEM.md`
프로젝트의 행동 원천. 장면 배경, 세션 흐름, 경계↔신뢰 규칙("큐 이벤트" 정의), 출력 형식이 전부 여기 들어 있습니다. **톤·규칙·세계관 배경**을 바꾸고 싶으면 여기를 편집합니다.

## `renderer.ts`
`files/`를 받아 좌측 패널 HTML을 만드는 순수 함수. 씬 파싱(이미지 토큰, 캐릭터 대사·지문), 스탯 바, 페르소나 카드 등 시각화 전체를 담당합니다. 상단의 **`CHARACTER_META`에 세 캐릭터 id가 하드코딩**되어 있어, 캐릭터를 교체하려면 렌더러도 함께 수정해야 합니다.

## `files/characters/{id}/`
**NPC 정의 + 감정 삽화**.
- `{id}.md` — frontmatter의 `name` 값이 렌더러의 캐릭터 매칭 키입니다 (씬 속 토큰 `[iseo:assets/tense]`의 `iseo`가 곧 이 `name`). 그 외 `display-name`, `color`, `avatar-image`, `names`(별칭 목록)가 쓰입니다.
- `assets/` — 3장 한 세트: `calm` / `tense` / `cracked`. 씬 안에서 `[id:assets/표정]`으로 참조. 확장자는 서버가 자동 탐색하므로 `.png`/`.jpg` 무관.
- **캐릭터 교체 체크리스트**: 디렉토리명, `{id}.md`의 `name` frontmatter, `stats.md`의 키, `renderer.ts`의 `CHARACTER_META` — 이 네 곳을 함께 바꿔야 합니다.

## `files/personas/*.md`
유저 페르소나. frontmatter에 `role: persona`가 있어야 렌더러가 인식합니다. `position` 필드(`senior` / `peer` / `junior` / `outsider`)에 따라 세 NPC의 호칭·태도가 자동 전환됩니다. 파일을 지우면 이름 없는 외부 조사자로 동작. 여러 페르소나를 두고 원하는 것만 남기는 방식으로 전환해도 됩니다.

## `files/scenes/scene.md`
RP 씬이 append로 누적되는 파일. 렌더러는 `scenes/`로 시작하는 **모든 텍스트 파일**을 읽으므로, 챕터를 나누고 싶으면 `scene-02.md`처럼 추가 파일을 둬도 됩니다. 처음부터 다시 시작하려면 파일을 비우세요.

## `files/stats.md`
경계↔신뢰 스탯 저장소. frontmatter의 캐릭터 키(`iseo`, `hangyeol`, `minji`)에 −5 ~ +5 숫자가 들어갑니다. 큐 이벤트 발생 턴에만 에이전트가 overwrite합니다. 캐릭터 id를 바꾸면 이 키도 같이 갱신해야 렌더러가 스탯을 표시합니다.

## `files/suspects-truth.md` *(세션 첫 턴에 자동 생성)*
에이전트가 사건의 진실을 통째로 기록하는 **LLM 전용** 파일. 씬이나 대사에 직접 노출되지 않으며, 유저가 수사로 발견해야 합니다. 저장 내용:

- **사건 뼈대** — 범인(`culprit`), 표면 동기, 방법, 알리바이 흠
- **반전**(`twist`) — `hidden_motive` · `accomplice` · `framed` · `self_sabotage` 중 1종. 표면 동기 뒤에 감춰진 진짜 그림
- **핵심 단서 4개**(`clues`) — 각각 `unlock` 방식: `evidence`(물리 증거로 확보) · `trust:<npc>:+N`(신뢰 수치 도달) · `confront:<npc>`(거짓말 깨부수기). 4개 중 최소 1개 `evidence`, 1개 `confront`
- **NPC별 비밀**(`secrets`) — 3명 각각 `trust_threshold` + 사건 연관도(`culprit_direct` / `red_herring` / `none`). 범인의 비밀은 가장 높은 임계값에
- **엔딩 힌트**(`ending`) — 완전 해결 / 부분 해결 / 오판 / 열린 결말 중 어느 쪽으로 갈지의 기준값

범인을 새로 뽑고 싶으면 이 파일을 삭제하고 `scene.md`도 비우세요 — 첫 턴에 다시 결정됩니다.

## 난이도 조절
쉬운 수사로 만들고 싶으면 `suspects-truth.md`의 `clues`를 3개로 줄이거나 `secrets[*].trust_threshold`를 낮춥니다. 반대로 `trust_threshold: +5`를 늘리고 `confront` 게이트가 걸린 단서를 늘리면 더 어려운 수사가 됩니다. `ending.full_resolution_requires.clues_revealed`로 엔딩 판정 기준도 바꿀 수 있습니다.
