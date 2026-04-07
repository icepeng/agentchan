---
name: long-term-memory
description: "세션 간 기억을 파일로 영속하는 장기 기억 프레임워크. 영속 사실은 memory/MEMORY.md에 큐레이션하고, 사건 저널은 memory/journal.md에 append-only로 누적한다. 사건 발생 그 턴에 두 파일을 함께 갱신해 항상 coherent한 상태를 유지한다. 캐릭터 챗에서 장기적인 관계 발전과 스토리 연속성이 필요할 때 활성화한다."
metadata:
  author: agentchan
  version: "3.0"
  type: framework
---

# Long-Term Memory Skill

세션을 넘는 파일 기반 기억. 영속 사실(memory/MEMORY.md)과 raw 사건 로그(memory/journal.md)를 분리해 관리하되, **사건이 발생한 그 턴 안에서** 두 파일을 함께 갱신한다.

## 파일 구조

메모리 파일은 **프로젝트 작업 디렉토리(cwd)의 `memory/`** 직속에 둔다 — `skills/long-term-memory/` 내부가 아니다. 모든 경로는 cwd 기준 상대 경로(`memory/MEMORY.md`, `memory/journal.md`)다.

```
<cwd>/
└── memory/
    ├── MEMORY.md     ← 큐레이션된 영속 기억 (항상 컨텍스트 포함, 150줄 이내 목표)
    └── journal.md    ← append-only 사건 로그 (`## ` 헤딩이 BM25 청크 단위)
```

| 파일 | 허용 도구 | 금지 |
|------|----------|------|
| `memory/MEMORY.md` | `read`, `edit` | `write`, `append` (첫 생성 1회만 `write` 예외) |
| `memory/journal.md` | `read`, `append`, `grep` | `write`, `edit` (첫 생성 1회만 `write` 예외) |

> 빈 결과로 기억을 통째로 날리는 사고를 막기 위한 안전 규칙. 무엇을 저장할지 모르겠으면 **아무것도 저장하지 않는다**.

### MEMORY.md 템플릿

```markdown
# Long-Term Memory

## Core Facts
- [예: 아리아는 마법 없는 평민 출신, 표류목 등불에서 이방인]
- [예: 엘라라는 정보 중개인 — 단골들의 비밀을 알지만 발설하지 않는다]

## Relationship State
- 엘라라 ↔ 아리아: [현재 관계 상태 한 줄]

## Open Threads
- [예: 마렉의 행방 — 엘라라가 알면서도 말하지 않는다]

## Timeline
- [예: 04-07 — 아리아가 표류목 등불에 도착, 엘라라와 첫 만남]
```

### journal.md 형식

```markdown
# Journal

## 04-07 14:32 — 첫 만남
아리아가 표류목 등불에 도착. 엘라라가 문워시 언급에 손이 멈춤.
→ Open: 엘라라가 뭔가 알고 있다.
```

- `## ` 헤딩이 청킹 경계 — 새 사건마다 새 헤딩
- 헤더 = `날짜 시각 — headline` (시각은 작중/실제 어느 쪽이든)
- 본문 1~3줄. raw하므로 정돈하지 않는다 — 길어져도 BM25가 헤딩 단위로 검색한다

## 회수 (Recall) — 답변 *전에* 수행

이전 사건·약속·관계·복선이 답변에 영향을 줄 가능성이 있다면 추측하지 말고 먼저 메모리를 확인한다.

### 새 세션 시작 시 (최우선)

세션의 첫 턴에서 **다른 모든 행동보다 먼저**:

1. `read memory/MEMORY.md` — 영속 기억 전체 로드 (이게 진짜 작업 메모리다)
2. `read memory/journal.md` — 끝부분만 (큰 파일이면 `offset`으로 마지막 ~200줄)

memory/MEMORY.md는 eager capture로 항상 직전 턴까지 coherent하다 — 이 단계만으로 최신 영속 상태가 모두 들어온다. journal은 raw 디테일 보충용.

**첫 세션 (파일 없음)**: 두 파일을 빈 템플릿으로 `write` **1회 생성**. 그 이후 `write` 절대 금지 — memory/MEMORY.md는 `edit`, memory/journal.md는 `append`만.

### 답변 중 특정 주제가 떠오를 때

이전 사건·인물·관계가 답변에 필요하지만 컨텍스트에 없을 때 검색한다. **journal은 단일 파일이지만 회수 grain은 헤딩 단위 청크**라 파일 크기와 무관하게 장면 단위로 분산 검색된다.

#### `search.ts` (기본) — BM25 랭킹

`assets/search.ts`는 Bun 내장 SQLite (FTS5 + trigram) 기반 청크 랭킹 검색. 의존성 0, 인덱스(`memory/.index.db`)는 자동 생성·mtime 기반 증분 갱신.

```bash
bun skills/long-term-memory/assets/search.ts "엘라라 마렉 인정"
bun skills/long-term-memory/assets/search.ts --rebuild   # 강제 재빌드
```

출력: `[BM25점수] 파일경로:줄범위` + 매칭부 하이라이트 snippet. 점수가 높을수록 관련도가 높다.

**키워드 작성 (한국어 핵심)**:
- **어간/명사만 쓴다.** "엘라라가 인정한 순간" ❌ → "엘라라 인정" ✅
- 도구는 형태소 분석을 하지 않는다 — "마렉이"와 "마렉을"은 다른 토큰. 어간만 쓰면 모든 활용형을 잡는다
- 자연어 문장 전체를 던지지 말고 핵심어 3~5개로
- 1~2글자 한국어 토큰(예: "렌")도 자동 LIKE 폴백으로 매칭

#### `grep` (특수 경우)

- 고유명사 한 단어의 모든 등장 위치 망라 (예: "마렉" 첫 언급 추적)
- search.ts 인덱스 빌드 전인데 결과 1개만 필요할 때

**전체 파일을 한꺼번에 읽지 않는다.** search.ts로 좁힌 뒤 해당 줄 범위만 `read offset/limit`로 보충한다.

## 저장 (Eager Capture) — 사건 발생 그 턴에

기록할 가치가 있는 사건이 발생하면 그 턴 안에서 다음을 묶어 수행한다. 미루지 않는다.

### 항상: `append memory/journal.md`

```
## MM-DD HH:MM — 한 줄 헤드라인
1~3줄 요약
```

- `append`는 항상 줄바꿈으로 시작 (`\n## ...`) — 도구가 기존 끝에 그대로 붙이기 때문
- 헤딩(`## `)은 BM25 청킹 경계 — 새 사건마다 새 헤딩
- 날짜 접두사(MM-DD/YYYY-MM-DD) 권장 — 날짜 검색·위치 파악에 유리

### 영속 상태에 영향 있으면: 같은 턴에 `edit memory/MEMORY.md`

| 사건 종류 | 갱신할 섹션 | 동작 |
|---|---|---|
| 캐릭터 간 관계 변화 | Relationship State | 해당 줄 갱신 |
| 새 영구 사실/세계관 디테일 | Core Facts | 한 줄 추가 |
| 새 약속·결심·거짓말·복선 | Open Threads | 한 줄 추가 |
| 미해결 사건의 해결 | Open Threads | 해당 항목 제거 |
| 의미 있는 timeline 항목 | Timeline | 한 줄 추가 |

한 사건이 여러 섹션에 영향 줄 수 있다 — `edit`을 여러 번 호출해도 OK. 영향이 없으면 journal append만으로 끝낸다. 모든 사건이 memory/MEMORY.md에 갈 필요는 없다.

> **왜 같은 턴인가**: AI는 자기 세션의 끝을 감지할 수 없다. 매 턴이 마지막일 수 있다. 그래서 모든 갱신을 사건 발생 그 턴에 atomic commit해야 memory/MEMORY.md가 항상 직전 턴까지 coherent하다.

### 기록할 것 / 안 할 것

기록 (journal append):
- 캐릭터 간 관계 변화, 스토리 영향 사건
- 캐릭터의 약속·결심·거짓말
- 유저의 선택과 그 결과
- 새 미해결 사건 또는 기존 사건 해결

기록하지 않음:
- 인사·일상 대화
- 캐릭터의 기본 성격 (이미 캐릭터 스킬)
- 세계관 기본 설정 (이미 월드 스킬·로어북)
- 구체적 대사 (요약만)

> 저장할 게 없는 턴이 대부분이다. 무리해서 기록하지 않는다.

## 압축 — MEMORY.md가 150줄을 초과할 때

**사용자 명시 요청 시에만 수행** (자동 금지 — 데이터 손실 위험). Eager capture가 memory/MEMORY.md를 항상 coherent하게 유지하므로 압축의 책임은 *추가*가 아니라 *축약*이다.

- **Timeline**: 가장 오래된 여러 줄을 한 줄로 재요약
- **Core Facts**: 중복·파생 사실 제거
- **Open Threads**: 이미 해결된 항목 제거
- **Relationship State**: 가장 최신 상태만 남김

압축도 항상 `edit`. 큰 변경이라도 섹션별로 나눠 여러 번 호출. `memory/journal.md`는 압축하지 않는다 — raw 로그는 누적하고 search.ts로 접근한다.

## 안전 규칙 요약

- ❌ `write` memory/MEMORY.md / memory/journal.md — 첫 생성 1회 외 절대 금지
- ❌ `edit memory/journal.md` — 과거 로그는 수정하지 않는다
- ❌ "나중에 promotion할게" — 사건 발생 턴에 memory/journal.md와 memory/MEMORY.md를 함께 갱신
- ✅ 저장할 게 없으면 그냥 응답한다 — 빈 내용을 강제하지 않는다
- ✅ 큰 journal은 search.ts로 좁힌 뒤 `read offset/limit`로 부분만

## 회수한 기억의 사용

- **자연스럽게 녹인다.** 매 대사에 과거를 언급하지 않는다 — 자연스러운 순간에만
- **회수했다는 사실 자체를 노출하지 않는다**: "메모리를 확인해보니..." 금지. 캐릭터는 항상 *기억하고 있는 것처럼* 행동
- 행동 변화로 표현 (예: 신뢰가 쌓인 캐릭터는 더 많은 정보 공유)
- character-chat / expression-chat과 함께 사용. 로어북(고정 세계관)·페르소나와 직교한다
