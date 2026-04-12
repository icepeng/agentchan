---
name: journal-search
description: files/memory/journal.md에서 여러 키워드 조합으로 과거 사건을 BM25 검색으로 회수한다. 단순 read 또는 고유명사 1개 grep이 아닌, 관계·감정·테마 기반 복합 회수에서 활성화한다.
metadata:
  author: agentchan
  version: "1.0"
---

# Journal Search

`files/memory/journal.md`에서 과거 사건을 회수하는 검색 도구. 저널이 수백 항목으로 자란 연재형 RP에서 관련 사건만 선별적으로 불러오기 위해 사용한다.

## 언제 활성화하는가

**활성화**:
- 여러 키워드 조합이 필요한 회수 (예: "마렉 + 등대 + 일지")
- 관계·감정·테마 기반 검색 (예: "엘라라가 처음 마음을 연 순간")
- 저널이 길어 전체 read가 비효율적일 때

**활성화하지 않음**:
- 세션 시작의 최근 사건 확인 — 단순 `read files/memory/journal.md`
- 단일 고유명사 1개의 위치 확인 — `grep -n "마렉" files/memory/journal.md`가 더 빠르다
- 저장이 목적인 경우 — 규칙은 SYSTEM.md에 있고 이 스킬과 무관하다

## 경로 1: BM25 검색

```
script: bun skills/journal-search/assets/search.ts "엘라라 인정 마렉"
```

**동작**:
- 프로젝트 루트를 cwd로 하여 실행한다 (즉 `files/memory/journal.md`가 스크립트에서 보이는 경로다)
- 첫 실행 시 `files/memory/.journal-index.db` (hidden sidecar)에 FTS5+BM25 인덱스 생성
- 이후 실행은 mtime 비교로 증분 재인덱싱
- 결과: `[BM25점수] 파일:줄범위` + snippet. top-8

**옵션**:
- `--rebuild`: 인덱스 강제 재빌드 (스키마 변경 또는 오염 복구)

**한국어 키워드 팁**:
- 어간·명사만 3~5개 조합 (문장 ❌)
- 1~2글자 CJK 토큰은 trigram이 못 잡으므로 자동 LIKE 폴백
- 인명·지명·사건명 선호

## 경로 2: Grep 폴백

인덱스 빌드 전이거나 고유명사 1개의 모든 등장 위치만 필요할 때:

```
grep -n "마렉" files/memory/journal.md
```

## 결과의 사용

- BM25 결과의 줄 범위를 보고 필요한 부분만 `read offset/limit`로 보충한다
- 전체 파일을 한 번에 읽지 않는다 (저널이 길 때 낭비)
- 회수한 사실을 캐릭터 행동에 자연스럽게 녹인다 (SYSTEM.md "회수의 사용" 규칙 준수)
