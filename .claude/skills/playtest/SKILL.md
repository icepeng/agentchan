---
name: playtest
description: agentchan 템플릿을 서버 API로 직접 플레이하며 자가검증. 시스템 규칙·스키마·files/ 업데이트·OOC 경계·분기를 턴 단위로 관측하고 회귀를 매트릭스로 보고. UI 없이 CLI + 파일 조회만으로 진행.
argument-hint: "[검증 시나리오 자유 서술 — 비우면 템플릿 목록 보고 제안]"
disable-model-invocation: true
---

# /playtest — 템플릿 자가검증 워크플로우

Claude가 플레이어 역할로 서버에 요청을 보내고, 템플릿이 **주장하는 규칙**이 실제 턴에서 지켜지는지 관측한다.

**시나리오**: `$ARGUMENTS`

## Context

- Portless: !`portless list 2>/dev/null || echo "(not running)"`
- Play state: !`cat .claude/skills/playtest/scripts/.play-state.json 2>/dev/null || echo "(none)"`

## CLI

스크립트: `bun .claude/skills/playtest/scripts/play.ts <cmd>`

| cmd | 용도 |
|---|---|
| `templates` | 사용 가능한 템플릿 목록 |
| `new <template> [name]` | 프로젝트 + 대화 생성 |
| `use <slug> [convId]` | 기존 프로젝트에 state 바인딩 |
| `conv` | 현재 프로젝트에 새 대화 |
| `send "<text>"` | 메시지 전송 (SSE 실시간 출력) |
| `read <path>` | 프로젝트 파일 읽기 |
| `write <path> [content\|@<file>]` | 파일 쓰기 (`@`로 로컬 파일 주입) |
| `clear <path>` | 파일 비우기 |
| `tree` | 프로젝트 트리 |
| `state` / `raw` / `config [k=v]` | 상태·node 덤프·config |

**Env**: `AGENTCHAN_URL=http://localhost:<port>` (기본 `:4244`), `PLAYTEST_STATE_FILE` (state 파일 경로 오버라이드)

## 절차

### 1. 환경 준비

Context의 Portless가 비어 있으면 서버 기동: `cd <agentchan> && bun run dev` (`run_in_background: true`). 출력에서 포트 추출 → `AGENTCHAN_URL` 세팅.

**주의**: `https://agentchan.localhost`는 Bun fetch에서 `ConnectionRefused` — `http://localhost:<port>`로 우회.

### 2. 시나리오 확정

- `$ARGUMENTS`가 있으면: 자유 서술 해석 → 대상 템플릿·검증 목표·예상 턴 수 도출해 사용자에 제시
- 비었으면: `play.ts templates`로 목록 조회 → 각 템플릿의 `README.md`·`SYSTEM.md` 요약 읽고 **무엇을 검증할 가치가 있는지 2~3개 제안** → 사용자 선택

### 3. 템플릿 분석 → 체크리스트 도출

대상 템플릿의 `example_data/library/templates/<name>/`을 읽고, 이번 시나리오에 해당하는 체크 항목을 **템플릿에 맞춰** 구성한다. 템플릿마다 규칙·상태·분기 구조가 다르므로 매번 새로 뽑는다.

공통 범주 뼈대 (각 범주 내 체크는 템플릿별):

| 범주 | 관측 대상 |
|---|---|
| **(a) 시드** | 첫 턴 후 `files/` 하위에 템플릿이 초기화하는 파일이 규칙대로 생성되는가. frontmatter·스키마·필수 필드 존재 |
| **(b) 시스템 규칙 준수** | SYSTEM.md가 선언한 행동 규칙(변화량 제약, 쿨다운, 금지 사항 등)이 턴에서 지켜지는가 |
| **(c) files/ 업데이트** | 어떤 조건에 어떤 파일이 어떻게 갱신되는가. append/overwrite 규칙, 프론트매터 일관성 |
| **(d) OOC ↔ 씬 경계** | 어시스턴트 응답과 파일 변경이 의도대로 구분되는가. 템플릿이 금지한 OOC 패턴(메타 표기·수치 보고·tool content 재출력 등) 노출 |
| **(e) 분기·엔딩** | 템플릿이 분기를 정의했다면 각 진입 경로가 트리거 조건대로 작동하고, 결과 씬의 구조(구분선·에필로그·상태 보존 규칙 등)가 지켜지는가 |
| **(f) 회귀 재검증** | 규칙 위반 발견 후 `example_data/` 패치 → `bash scripts/copy-example-data.sh --force` → 새 프로젝트로 같은 시나리오 반복 |

체크리스트는 매 범주 ✅/❌/⚠️ + 메모 컬럼으로 표 작성.

### 4. 플레이 루프

- 입력은 인게임 행동(`*동작*` + 대사). `send` 호출 결과에서 tool call·스트림·파일 변경 관측
- 매 턴 후 `read`/`tree`로 `files/` 변화, `raw`로 conversation node 확인
- 템플릿이 "LLM 전용" 파일(범인·세계관 진실 등)을 정의했다면 **검증자만 참조** — 플레이 입력에 단어를 그대로 옮기지 말고 "모르는 척" 자연스러운 대사로 위장

### 5. 회귀 발견 시

1. 분류 — 규칙 위반 vs 디자인 해석 충돌
2. `example_data/library/templates/<name>/` 내 파일만 편집 (SYSTEM.md·README.md 등)
3. `bash scripts/copy-example-data.sh --force`
4. **새 프로젝트** (`play.ts new`)로 재검증. 기존 프로젝트는 생성 시점 SYSTEM.md 스냅샷이라 재사용 불가

### 6. 보고

- 매트릭스 (범주별)
- 회귀 목록 (재현 조건 + 빈도)
- 패치 diff + 재검증 결과
- 다음 검증 제안

## 가드레일

- 템플릿의 "LLM 전용" 파일 내용을 플레이어 입력에 그대로 노출 금지 (몰입 보존)
- 트리거 문구는 템플릿 정의에 맞춰 정확히 — 예: 엔딩이 "선언형 지목"을 요구하면 질문형(`"너야?"`)은 트리거 되지 않을 수 있음
- SYSTEM.md 변경은 **새 프로젝트**에만 반영 (기존 프로젝트는 스냅샷 격리)
- `.play-state.json`은 단일 플레이 세션만 추적 — 여러 프로젝트 병렬은 `PLAYTEST_STATE_FILE` 분리
