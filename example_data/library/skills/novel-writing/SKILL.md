---
name: novel-writing
description: 소설의 기획, 집필, 교정을 체계적으로 지원한다. 소설 쓰기, 줄거리 구성, 캐릭터 개발, 챕터 집필, 원고 교정 등의 작업에서 활성화한다.
license: MIT
compatibility: Bun(consistency-check.ts용) 및 bash(셸 스크립트용) 필요
allowed-tools: bash
metadata:
  author: agentchan
  version: "1.0"
  recommended-renderer: novel
  project-type: "novel"
---

# 소설 집필 스킬

소설의 기획, 집필, 교정을 위한 체계적 워크플로우입니다.

## 워크플로우 개요

소설 집필은 네 단계로 진행됩니다. 각 단계에는 전용 리소스가 있으며, 해당 단계에 진입할 때 로드합니다(미리 로드하지 마세요).

```
1단계: 전제     → 컨셉, 장르, 주제 정의
2단계: 구조     → 플롯 구성, 캐릭터 설계, 세계관 구축
3단계: 집필     → 아웃라인에 따라 챕터 작성
4단계: 교정     → 일관성 점검, 문체 다듬기, 원고 편집
```

## 1단계: 전제

사용자에게 다음을 확인합니다:
- **장르** (판타지, SF, 순문학, 추리, 로맨스 등)
- **로그라인** — 주인공, 갈등, 위험을 하나의 문장으로 요약
- **주제** — 이야기가 탐구하는 핵심 질문
- **목표 분량** — 단편 소설(~5만 단어), 표준(~8만 단어), 장편(~12만 단어 이상)

사용자가 확신이 없으면 브레인스토밍을 도와줍니다. 강력한 로그라인은 다음 공식을 따릅니다:
> [사건]이 벌어졌을 때, [주인공]은 [목표]를 이루어야 한다. 그러지 않으면 [위험].

## 2단계: 구조

### 2-A. 플롯 아웃라인

[references/story-structure.md](references/story-structure.md)에서 3막 비트 시트를 읽은 뒤, [assets/outline-template.md](assets/outline-template.md) 템플릿으로 아웃라인을 생성합니다.

주요 단계:
1. 사용자의 전제를 비트 시트에 매핑 (1막 → 2막 → 3막)
2. 아웃라인 템플릿을 장면 수준의 디테일로 채우기
3. 완성된 아웃라인을 `output/outline.md`에 저장

### 2-B. 캐릭터 설계

[references/character-archetypes.md](references/character-archetypes.md)에서 아키타입과 동기 프레임워크를 읽은 뒤, [assets/character-sheet.md](assets/character-sheet.md)로 주요 캐릭터별 시트를 작성합니다.

캐릭터별 작업:
1. 아키타입을 출발점으로 선택한 뒤, 전복하거나 심화
2. 욕망(외적 목표) vs. 필요(내적 성장) 정의
3. 한 문단 분량의 배경 이야기 작성
4. 각 시트를 `output/characters/<이름>.md`에 저장

### 2-C. 세계관 및 배경

`output/world.md` 파일을 생성하여 다음을 기록합니다:
- 시대 및 지리
- 사회 구조, 권력 역학
- 규칙 (마법 체계, 기술, 법률)
- 감각 팔레트 — 이 세계가 어떻게 보이고, 냄새 나고, 들리는가?

## 3단계: 집필

첫 챕터 시작 전에 [references/prose-style-guide.md](references/prose-style-guide.md)를 읽으세요. 각 챕터 파일의 구조는 [assets/chapter-template.md](assets/chapter-template.md)를 사용합니다.

### 집필 규칙

1. **한 번에 한 챕터.** 각 챕터를 `output/chapters/XX-제목.md`에 저장 (예: `output/chapters/01-the-arrival.md`)
2. **아웃라인을 따르되** 이야기가 요구하면 변경 가능 — 벗어날 때는 `output/outline.md`를 업데이트
3. **보여주기, 말하지 않기.** 요약보다 장면(행동 + 대사)을 선호
4. **긴장감으로 챕터 마무리** — 질문, 반전, 또는 클리프행어
5. **분량 추적** — 3~5챕터마다 `scripts/word-count.sh output`을 실행

### 기본 스타일 (사용자 선호에 따라 변경 가능)

- 시점: 밀착 3인칭, 챕터당 단일 시점
- 시제: 과거형
- 챕터 길이: 2,000~4,000 단어
- 장면 전환: `---`로 표시

## 4단계: 교정

### 4-A. 일관성 점검

자동 일관성 검사기를 실행합니다:

```bash
bun run scripts/consistency-check.ts --project output
```

모든 챕터 및 캐릭터 파일에서 다음을 검사합니다:
- 캐릭터 이름/특성 모순
- 타임라인 불일치
- 배경 설정 불일치
- 아웃라인에 언급된 미해결 플롯 스레드

결과를 검토하고 지적된 문제를 수정합니다.

### 4-B. 문체 교정

각 챕터에 대해 확인합니다:
- [ ] 오프닝 훅 — 첫 문단이 독자를 끌어당기는가?
- [ ] 대사 — 각 캐릭터가 구분되는 목소리를 갖고 있는가?
- [ ] 페이싱 — 문장 길이에 변화를 주고, 늘어지는 부분은 삭제
- [ ] 감각 묘사 — 장면당 최소 두 가지 감각
- [ ] 필터 단어 — "그는 느꼈다", "그녀는 보았다", "그들은 생각했다" 등 가능한 한 제거

### 4-C. 원고 편집

모든 챕터 교정이 완료되면 편집합니다:

```bash
scripts/compile.sh output <제목>
```

이렇게 하면 `output/manuscript.md`가 생성되며, 표지, 목차, 전체 챕터가 하나로 합쳐집니다.

## 파일 구성

모든 소설 파일은 렌더러가 표시할 수 있도록 `output/` 디렉토리 아래에 작성해야 합니다. 소설 이름으로 별도 폴더를 만들지 마세요.

```
output/
├── outline.md
├── world.md
├── characters/
│   ├── protagonist.md
│   ├── antagonist.md
│   └── ...
├── chapters/
│   ├── 01-chapter-title.md
│   ├── 02-chapter-title.md
│   └── ...
└── manuscript.md          (compile.sh로 생성)
```

워크플로우가 진행됨에 따라 이 디렉토리와 파일을 생성합니다.
