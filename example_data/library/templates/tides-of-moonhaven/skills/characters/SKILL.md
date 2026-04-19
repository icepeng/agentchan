---
name: characters
description: 아키타입과 동기 프레임워크를 사용하여 RP 캐릭터를 설계한다. 캐릭터 개발, 인물 설계, 캐릭터 시트 작성, NPC 만들기에서 활성화한다.
metadata:
  author: agentchan
  version: "1.0"
---

# 캐릭터 설계

아키타입과 동기 프레임워크를 사용하여 RP 캐릭터를 설계하는 스킬입니다.

## 절차

[references/character-archetypes.md](references/character-archetypes.md)에서 아키타입과 동기 프레임워크를 읽은 뒤, [assets/character-sheet.md](assets/character-sheet.md)를 템플릿으로 사용하여 캐릭터 시트를 작성합니다.

### 1. 컨셉 논의

사용자에게 다음을 확인합니다:
- **역할** — 어떤 캐릭터를 원하는가? (NPC, 동반자, 적대자 등)
- **분위기** — 성격의 방향 (따뜻한, 미스터리한, 거친 등)
- **이미 존재하는 캐릭터** — `files/characters/`에 다른 캐릭터가 있다면 읽고 관계 설정에 참고

### 2. 캐릭터 설계

아키타입 프레임워크를 참고하여 캐릭터를 설계합니다:
1. 아키타입을 출발점으로 선택한 뒤, 전복하거나 심화
2. 성격의 핵심 특성, 결함, 모순을 정의
3. 화법을 설계 — 어휘, 말투, 말버릇, 회피하는 것
4. 롤플레이 지침 3~5개 작성 (이 캐릭터로 글을 쓸 때의 행동 규칙)
5. 주요 대사 예시 2개 이상 작성

### 3. Frontmatter 생성

캐릭터 시트 상단에 YAML frontmatter를 반드시 포함합니다:
- `name` — 케밥 케이스 슬러그 (예: `elara-brightwell`)
- `display-name` — 표시 이름 (예: `Elara Brightwell`)
- `color` — 캐릭터 테마 색상, hex (예: `"#fbbf24"`)
- `avatar-image` — `assets/avatar` (고정값)
- `names` — 쉼표 구분 이름 변형 목록, 한국어+영어 (예: `"엘라라 브라이트웰, 엘라라, Elara Brightwell, Elara"`)

### 4. 감정 삽화 (선택)

사용자에게 감정 삽화를 추가할지 확인합니다. 원하는 경우:
- 감정 삽화 테이블을 작성합니다 (최소 4가지 감정)
- 토큰 형식: `[슬러그:assets/감정]` (예: `[elara-brightwell:assets/happy]`)

### 5. 저장

완성된 캐릭터 시트를 `files/characters/<슬러그>/<슬러그>.md`에 저장합니다.

감정 삽화를 추가한 경우, 사용자에게 이미지 파일 배치 경로를 안내합니다:
- `files/characters/<슬러그>/assets/` 디렉토리에 다음 이미지를 배치
- `avatar.png` — 기본 아바타 (필수)
- 감정별 이미지 — 삽화 테이블에 정의한 감정명과 동일 (예: `happy.png`, `sad.png`, `surprised.png`, `thinking.png`)
