# Agentchan

Agentchan은 사용자가 만든 프로젝트(작품)를 위해 LLM agent를 호스팅하고, 프로젝트별 renderer를 화면에 띄우는 데스크톱-스타일 web app이다. 이 문서는 프로젝트 어휘 중 코드만으로는 흐릿한 개념을 박아둔다.

## Language

### Renderer 영역

**Renderer**:
프로젝트별 시각 표면을 구성하는 사용자 작성 코드. `renderer/index.ts(x)`에서 named export `renderer`를 제공한다.
_Avoid_: view, template, theme

**Renderer surface**:
Renderer 작성자가 의존할 수 있는 안정 작성 계약 — `@agentchan/renderer/core`, `@agentchan/renderer/react`의 공개 API.
_Avoid_: API, contract — "renderer surface"로 지칭

**Renderer bundle**:
Renderer source를 host가 import 가능한 형태로 빌드한 결과물(`{ js, css }`).
_Avoid_: build, output

**Renderer snapshot**:
`{ slug, baseUrl, files, state }` — host가 renderer에 전달하는 데이터.
_Avoid_: data, props, view-model

**Renderer presentation machine**:
Renderer가 화면에 들어오고 사라지는 *전이 규칙*을 가진 host 측 deep module. 외부 이벤트(slug 변화, bundle/snapshot 도착, error)를 받아 `{ phase, theme, error, layerClassName }` snapshot을 노출한다. 의존성(layer 핸들, module importer, clock)은 DI로 받는다.
_Avoid_: renderer host, host machine, host state machine — "presentation machine"으로 지칭

**Renderer layer**:
Renderer module을 실제로 mount하는 ShadowRoot DOM adapter. Presentation machine은 layer 핸들을 통해 mount/clear/updateSnapshot을 일으킨다.
_Avoid_: container, root

### Navigation 영역

**View**:
"지금 무엇을 보여주는가"의 단일 표현. discriminated union으로 page와 selection을 한 곳에 모은 SSoT.
_Avoid_: page, route, screen — "view"로 지칭

**View kind**:
**View** union의 분기 — `templates`, `settings`, `project`.
_Avoid_: page, tab

**View mode**:
`project` **view kind** 안의 작업 화면 토글 — `chat | edit`. 다른 view kind에는 없는 필드.
_Avoid_: edit mode, chat mode, "mode" 단독 사용 — 항상 "view mode"로 지칭

**Session memory**:
프로젝트별 마지막 세션 id를 기억하는 reducer cache. **project view** 진입 시 default session 결정에 쓰인다. 영속화하지 않는다.
_Avoid_: last session, session cache — "session memory"로 지칭

### Session 영역

**Session**:
한 프로젝트 안의 대화 단위. JSONL 파일 하나로 저장되며, 첫 줄은 header이고 이후 줄은 entry append-only다.
_Avoid_: conversation, chat — "session"으로 지칭

**Session entry**:
세션 JSONL의 한 줄. `message`, `compaction`, `session_info`, `custom_message`, `model_change`, `label`, `thinking_level_change`, `branch_summary`, `custom` 9 variant 중 하나. `id`, `parentId`, `timestamp`는 storage가 단독 배정한다.
_Avoid_: log line, history item, turn — 기록 단위는 "entry"로 통일

**Branch**:
한 entry에서 갈라지는 대화 흐름. 파일에 영속화하지 않고 `leafId`에서 `parentId` chain을 따라 root까지 추출하는 derived view다.
_Avoid_: thread, fork — derived view라는 점이 핵심

**LeafId**:
한 entry 그래프 안에서 "현재 선택된 끝 지점"을 가리키는 storage 연산 입력. session header나 별도 파일에 저장하지 않는 — client가 들고 다니는 임시 selection.
_Avoid_: cursor, selection, head — leafId는 path derive의 출발점일 뿐, 영속 상태가 아님

**Compaction**:
같은 entry 그래프 위 한 줄짜리 `CompactionEntry`. 이전 대화를 summary로 대체하지만 *별도 파일이나 `compactedFrom` 포인터가 아니라 같은 그래프 안*에 머문다. `firstKeptEntryId`가 cut point.
_Avoid_: summarization, archive — agentchan 도메인에서 "compaction"은 entry 그래프 내 in-place 연산

**Wire format**:
세션의 on-disk JSONL shape — header `type`, entry union, field 이름, `version` 정수. **Schema**·**vendored implementation**과 다른 카테고리.
_Avoid_: file format, schema(중첩 의미라 헷갈림)

**Schema**:
`Session entry`/`SessionHeader` 등의 타입 정의와 그 변경 권한. Agentchan이 단독 소유한다. **Wire format**(현재 Pi v3 호환)과 분리된다 — wire format은 Pi와 호환을 유지하되, schema 결정권은 Agentchan이다.
_Avoid_: data model, types — agentchan은 wire format / schema / vendored implementation 3층 distinction을 쓴다

**Vendored implementation**:
Agentchan 코드베이스 안에 둔 *외부 출처*에서 유래한 코드. 현재는 pi-coding-agent의 session helper들이 해당. cherry-pick 정책으로 원본과 sync하지만 owner는 agentchan.
_Avoid_: copy, fork — vendored는 "출처 명시 + sync 정책 박힌 자체 소유" 상태

**Creative session**:
작품 본업의 대화/작업 세션. **Meta session**과 분리되어, 프로젝트 진입 시 자동선택 대상.
_Avoid_: chat session, main session — "creative session"으로 지칭

**Meta session**:
프로젝트 구성 작업(예: renderer 빌드) 전용 세션. 슬래시 명령 또는 SessionTabs 명시 클릭으로만 진입한다 (자동선택 대상이 아님).
_Avoid_: build session, system session — "meta session"으로 지칭

**Session mode**:
**Session**의 영구 속성 — `creative | meta`. **view mode**와 직교한다.
_Avoid_: "mode" 단독 사용 — 항상 "session mode"로 지칭

## Relationships

- **Renderer presentation machine**은 `slug`, `bundle`, `snapshot`, `error` 변화를 외부 이벤트로 받아 라이프사이클을 진행하고, **renderer layer**에 mount/clear 명령을 일으킨다.
- **Renderer surface**(작성자 측 계약)는 ADR-0001 범위이며 host의 **renderer presentation machine** 구현과 독립적이다 — runtime backend는 ADR-0001 외부 사항으로 자유롭게 바꿀 수 있다.
- **Renderer bundle**과 **renderer snapshot**은 server에서 fetch한 _데이터_고, **renderer presentation machine**의 _상태_와 다른 카테고리다. 두 가지를 같은 store에 합치지 않는다.
- **View kind** 가 `project`일 때만 **view mode** 필드가 존재한다. 다른 kind에서 view mode를 묻는 것은 type level에서 의미가 없다.
- **Session mode**(creative/meta)와 **view mode**(chat/edit)는 직교한다. 네 조합 모두 의미 있다 — creative+chat, creative+edit, meta+chat, meta+edit.
- **Session memory**는 active **project view**의 slug에 바인딩되며, **view kind** 가 project가 아닐 때는 갱신되지 않는다.
- **Session**의 **wire format**과 **schema**는 다른 layer다 — 한쪽은 *디스크 표현*, 다른 쪽은 *type 결정권*. wire format은 Pi와 호환을 유지하지만 schema 결정권은 Agentchan에 있다.
- **Branch**는 `entries`에서 **leafId**를 입력으로 *derive*하는 view라, "branch를 저장한다"는 표현은 자체 모순이다. 저장되는 것은 entries와 그 `parentId` chain뿐이고, **compaction**도 별도 파일이 아닌 같은 그래프의 한 entry로 머문다.

## Example dialogue

> **Dev:** "프로젝트를 전환했는데 이전 프로젝트의 화면이 잠깐 보였어요. 어디를 고치죠?"
> **Maintainer:** "그건 **renderer presentation machine**의 책임이에요. 전이는 거기서 닫혀야 해요. 외부에서 entity reducer를 직접 비우는 게 아니라 `slug-changed` 이벤트를 보내면 됩니다."

> **Dev:** "**Renderer surface**가 바뀐 건가요?"
> **Maintainer:** "아뇨, **renderer surface**는 ADR-0001이 정한 작성자 계약이에요. 화면 전이는 host implementation detail이라 **renderer presentation machine** 한 곳에서만 바뀝니다."

> **Dev:** "templates 페이지에서 프로젝트 탭을 누르면 active project가 바뀌는데 화면은 templates에 머물러요."
> **Maintainer:** "**View**가 단일 SSoT라 transition은 `OPEN_PROJECT(slug)` 한 dispatch로 끝나야 해요. **View kind**와 slug를 동시에 바꾸지 않으면 그 어긋남이 생깁니다."

> **Dev:** "**Meta session**일 때 edit mode로 토글해도 되나요?"
> **Maintainer:** "**Session mode**(creative/meta)와 **view mode**(chat/edit)는 직교해요. meta 세션이라도 view mode 토글은 독립적으로 동작합니다."

## Flagged ambiguities

- "mode"는 두 직교하는 개념에 쓰여 혼선이 발생한다: **session mode**(creative/meta — 세션 데이터의 영구 속성)와 **view mode**(chat/edit — project view의 작업 화면 토글). 코드/문서에서 "mode"를 단독으로 쓰지 않고 둘 중 하나로 명시한다.
