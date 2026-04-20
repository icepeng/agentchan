---
name: chapter-writing
description: 아웃라인에 따라 소설 챕터를 집필한다. 문체 가이드와 챕터 템플릿을 사용한다. 챕터 작성, 소설 집필에서 활성화한다.
metadata:
  author: agentchan
  version: "1.0"
---

# 챕터 집필

아웃라인에 따라 소설 챕터를 집필하는 스킬입니다.

첫 챕터 시작 전에 [references/prose-style-guide.md](references/prose-style-guide.md)를 읽으세요. 각 챕터 파일의 구조는 [assets/chapter-template.md](assets/chapter-template.md)를 사용합니다.

## 집필 규칙

1. **한 번에 한 챕터.** 각 챕터를 `files/chapters/XX-제목.md`에 저장 (예: `files/chapters/01-the-arrival.md`)
2. **이전 챕터 참조** — 새 챕터를 쓰기 전에 직전 챕터(`files/chapters/` 마지막 파일)를 읽어 연속성·문체·톤을 확인한다
3. **아웃라인을 따르되** 이야기가 요구하면 변경 가능 -- 벗어날 때는 `files/outline.md`를 업데이트
4. **보여주기, 말하지 않기.** 요약보다 장면(행동 + 대사)을 선호
5. **긴장감으로 챕터 마무리** -- 질문, 반전, 또는 클리프행어
6. **분량 추적** -- 3~5챕터마다 `script` 도구로 `scripts/word-count.ts`를 실행 (인자: `["files"]`, 또는 목표 단어 수가 있다면 `["files", "--target", "80000"]`)

## 기본 스타일 (사용자 선호에 따라 변경 가능)

- 시점: 밀착 3인칭, 챕터당 단일 시점
- 시제: 과거형
- 챕터 길이: 2,000~4,000 단어
- 장면 전환: `---`로 표시
