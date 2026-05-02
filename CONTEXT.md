# Agentchan

Agentchan은 사용자가 만든 프로젝트(작품)를 위해 LLM agent를 호스팅하고, 프로젝트별 renderer를 화면에 띄우는 데스크톱-스타일 web app이다.

## Language

### Project 영역

**Project**:
agentchan의 작품 단위. 파일시스템 디렉토리이며 시스템 계약(`_project.json`, `SYSTEM.md`, `skills/`, `renderer/`, `files/`, `sessions/`)과 자유 영역(`files/` 내부, `COVER.*`)을 함께 가진다. 시스템이 다루는 인프라 영역과 **Workspace**의 사용자 콘텐츠 영역은 분리된 카테고리다.
_Avoid_: work, story, document — "project"로 지칭

**Template**:
새 프로젝트 생성의 출발점. README frontmatter로 메타데이터를 노출하며, 생성 시 선택한 template 루트 엔트리가 프로젝트로 모두 복사된다. 복사 시점부터 두 디렉터리는 독립이며, 이후 template 변경은 기존 프로젝트에 자동 반영되지 않는다.
_Avoid_: starter, base, blueprint

**Preset**:
README를 가진 **Template** 디렉터리. README가 없는 디렉터리는 preset으로 취급하지 않는다.
_Avoid_: variant, sample

**Trusted template**:
**Project** 생성에 사용 가능한 **Template** 상태. Built-in template은 자동 trusted, 사용자 추가 template은 명시적 동의 후 trusted가 된다. Untrusted template으로 프로젝트를 만들면 `TrustRequiredError`로 차단된다. Template이 임의 코드(`skills/`, `renderer/`)와 prompt(`SYSTEM.md`)를 그대로 새 프로젝트에 복사하기 때문에 origin trust로 게이팅하는 결정이다.
_Avoid_: approved, allowed, verified — "trusted"로 지칭

**Slug**:
**Project**의 단일 식별자. 폴더명이 source of truth이며 `_project.json`에는 별도 필드로 저장하지 않는다. rename은 폴더명 변경으로 수행한다.
_Avoid_: id, name, project key

**Cover**:
**Project** 또는 **Template** 루트의 `COVER.*` 이미지. 인식 흐름은 `probeCover()`가 단독으로 결정한다. list API의 `hasCover`는 이 결과에서 derive된다.
_Avoid_: thumbnail, image, hero

**System prompt file**:
**Project** 루트의 `SYSTEM.md`(creative session) 또는 `SYSTEM.meta.md`(meta session). agent system prompt 합성에서 **session mode**에 따라 선택된다.
_Avoid_: prompt file 단독, instructions

### Workspace 영역

**Workspace**:
**Project**의 `files/` 하위 영역. 시스템이 의미를 해석하지 않는 사용자 콘텐츠 — 시스템은 재귀 스캔해 **ProjectFile** 배열로 만들지만 도메인 의미는 renderer와 **Skill**의 책임이다. **Renderer snapshot**의 `files`로 들어가는 단위.
_Avoid_: files 단독, content, assets

**ProjectFile**:
**Workspace** 항목의 union — `TextFile | DataFile | BinaryFile`. 안정 식별 키는 `path`, `modifiedAt`, `digest`. markdown frontmatter는 파싱하지만 의미는 해석하지 않는다.
_Avoid_: file 단독, asset

**Digest**:
**ProjectFile**의 cache identity. 알고리즘이나 포맷을 파싱하지 않는 opaque 값이다. renderer는 재사용 판단에만 쓰고, hash 형태에 의존하지 않는다.
_Avoid_: hash, checksum, fingerprint

### Creative Agent 영역

**Skill**:
agentchan의 사용자 정의 절차. `skills/*/SKILL.md` body가 `activate_skill` tool result 또는 slash command를 통해서만 conversation에 들어간다. frontmatter `environment: creative | meta`가 **session mode** 노출을 결정한다. Builder Agent측 skill과는 다른 카테고리다.
_Avoid_: instruction, plugin, command

**Skill catalog**:
**Session mode**에 노출되는 **Skill** 목록. agent system prompt에 합성되며 body는 포함하지 않는다.
_Avoid_: skill list, manifest

**Skill body**:
**Skill**의 본문. `activate_skill` 호출이나 **skill slash command** 입력 시점에만 conversation context에 주입된다. **Skill catalog**와 분리된 카테고리 — token 비용과 활성화 시점이 분리되어 명확해진다.
_Avoid_: skill content, activation payload

**Slash command**:
사용자가 `/` 접두사로 입력해 즉시 효과를 일으키는 conversation-time 명령. SlashEntry union의 두 분기 — **local slash command**와 **skill slash command** — 으로 나뉜다.
_Avoid_: command 단독, /-command

**Local slash command**:
agentchan 코드가 직접 처리하는 **slash command** 6종(`/new`, `/compact`, `/edit`, `/readme`, `/model`, `/provider`). 효과 위치는 view mode·session·server settings·UI 등으로 분산되며, LLM에는 도달하지 않는다.
_Avoid_: builtin command, system command

**Skill slash command**:
모든 **Skill**이 자동으로 노출하는 **slash command** entry. 입력 시 **skill body**가 conversation에 주입된다 — model이 호출하는 `activate_skill` tool과 효과는 같지만 *user-driven invocation*이라는 점이 카테고리 차이다.
_Avoid_: skill command, /skill

**Project-scoped tool**:
**Project** 디렉터리에 한정된 등록 도구. agent에게 일반 shell 접근은 제공하지 않는다. **Script tool**, **Tree tool** 등이 이 카테고리에 속한다.
_Avoid_: tool 단독, agent tool, shell tool

**Script tool**:
**Project**·**Skill**의 helper TS 코드를 실행하는 **Project-scoped tool**. dev에서는 사용자 `bun`을 spawn, exe에서는 `BUN_BE_BUN=1`로 자기 자신을 호출한다.
_Avoid_: exec, run script, helper tool

**Tree tool**:
세션 시작 시 **Project** 구조 파악용 **Project-scoped tool**. 과거 `ls` tool은 폐기됐고 되살리지 않는다.
_Avoid_: ls, list, dir

**Custom provider**:
사용자가 settings에 추가한 LLM provider. **Built-in provider**와 분리된 카테고리. server 타입과 client 타입은 미러링한다. reasoning은 Agent `options.reasoning`과 model 객체 `reasoning: true`가 모두 켜져야 한다.
_Avoid_: external provider, user provider

**Built-in provider**:
agentchan UI에 기본 노출되는 LLM provider. `config.providers.ts`의 `BUILTIN_PROVIDERS`와 `ALLOWED_MODELS` 두 등록 목록이 노출 결정권을 가진다. `pi-ai`에 provider 구현이 있어도 두 목록에 추가하지 않으면 built-in으로 노출되지 않는다.
_Avoid_: stock provider, default provider

### Settings 영역

**Server settings**:
서버 측 `settings.db`(SQLite)에 영속되는 값. agent가 읽는 설정·시크릿·install-scoped 상태가 들어간다. 세 카테고리 — API key, OAuth credential, 일반 app setting — 가 한 DB에 분리된 테이블로 산다.
_Avoid_: settings 단독, config, server config

**Browser preferences**:
**localStore registry**를 통해 브라우저 `localStorage`에 영속되는 per-browser 값. UI state, device preference, dismissal signal에 한정한다. **Server settings**와 카테고리가 다르며, agent가 읽지 않는다.
_Avoid_: localStorage 단독, UI settings, client settings

**localStore registry**:
모든 **browser preferences** key의 단일 등록 지점(`shared/storage.ts`). ESLint가 직접 `localStorage.*` 호출을 금지하므로 새 key는 이 registry를 통해서만 추가된다. registry 외 직접 접근은 금지된 카테고리다.
_Avoid_: storage 단독, localStorage wrapper

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

### Editor 영역

**Edit mode**:
**project view**의 **view mode**가 `edit`일 때의 작업 표면. 편집 대상은 **Project** root 전체에서 **hidden root**를 제외한 entries — 즉 **Workspace**(`files/`)뿐 아니라 시스템 계약 파일(`SYSTEM.md`, `SYSTEM.meta.md`, `skills/`, `renderer/`, `README.md`, `COVER.*`)도 모두 포함된다. "edit mode = Workspace 편집기"라는 좁은 해석은 잘못이다.
_Avoid_: workspace editor, file editor, edit screen

**Hidden root**:
**Project** root에서 **edit mode**와 file API 양쪽에 노출되지 않는 entry 집합 — 현재 `_project.json`, `sessions/`, dot-prefix entry. 새 시스템 인프라 디렉터리를 root에 추가할 때 hidden root로 막을지가 ADR-0002의 reconsider 트리거다.
_Avoid_: hidden file, system file, internal

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

### Agent runtime 영역

**Agent state**:
프로젝트별 in-memory runtime 상태. `isStreaming`, `streamingMessage`, `pendingToolCalls`, `messages`를 가지며, `messages`는 persisted branch entries(rebuilt to AgentMessage[])와 in-flight ToolResult row를 한 배열에 blend해 노출한다. 프로젝트 단위 map으로 격리되며, idle 프로젝트는 `EMPTY_AGENT_STATE`를 공유해 reference identity를 유지한다.
_Avoid_: state 단독, agent runtime, conversation state

**Session usage**:
활성 **branch**의 persisted assistant message entry에서 derive하는 token/cost 누적 — `inputTokens`, `outputTokens`, `cachedInputTokens`, `cacheCreationTokens`, `cost`, `contextTokens` 6개 필드. **Agent state**의 runtime 값이 아니라 session storage에서 다시 계산되는 view다.
_Avoid_: usage 단독, token usage, billing

## Relationships

- **Renderer presentation machine**은 `slug`, `bundle`, `snapshot`, `error` 변화를 외부 이벤트로 받아 라이프사이클을 진행하고, **renderer layer**에 mount/clear 명령을 일으킨다.
- **Renderer surface**(작성자 측 안정 계약)는 host의 **renderer presentation machine** 구현과 독립적이다 — runtime backend는 그 계약 밖이라 자유롭게 바꿀 수 있다.
- **Renderer bundle**과 **renderer snapshot**은 server에서 fetch한 _데이터_고, **renderer presentation machine**의 _상태_와 다른 카테고리다. 두 가지를 같은 store에 합치지 않는다.
- **View kind** 가 `project`일 때만 **view mode** 필드가 존재한다. 다른 kind에서 view mode를 묻는 것은 type level에서 의미가 없다.
- **Session mode**(creative/meta)와 **view mode**(chat/edit)는 직교한다. 네 조합 모두 의미 있다 — creative+chat, creative+edit, meta+chat, meta+edit.
- **Session memory**는 active **project view**의 slug에 바인딩되며, **view kind** 가 project가 아닐 때는 갱신되지 않는다.
- **Session**의 **wire format**과 **schema**는 다른 layer다 — 한쪽은 *디스크 표현*, 다른 쪽은 *type 결정권*. wire format은 Pi와 호환을 유지하지만 schema 결정권은 Agentchan에 있다.
- **Branch**는 `entries`에서 **leafId**를 입력으로 *derive*하는 view라, "branch를 저장한다"는 표현은 자체 모순이다. 저장되는 것은 entries와 그 `parentId` chain뿐이고, **compaction**도 별도 파일이 아닌 같은 그래프의 한 entry로 머문다.
- **Project**의 시스템 계약 영역(`_project.json`, `SYSTEM.md`, `skills/`, `renderer/`, `sessions/`)과 **Workspace**의 사용자 콘텐츠 영역은 분리된 결정이다 — 전자는 *시스템이 다루는* 인프라 파일, 후자는 *시스템이 해석하지 않는* 사용자 콘텐츠다.
- **Template** → **Project** 복사는 일회성이다. **Preset**(README가 있는 template 디렉터리)이 복사 단위이며, 이후 template 변경은 기존 **Project**에 자동 반영되지 않는다.
- **Trusted template**만 **Project** 생성에 쓸 수 있다. Trust 결정의 출처는 두 가지 — built-in 등록(`builtin-templates.json`)과 사용자 명시 동의 — 이며 같은 카테고리에 모인다. "Save as template"으로 만들어진 template은 사용자 본인 출처라 자동 trusted가 된다.
- **Slug**는 **Project** 폴더명이 source of truth라, "slug를 바꾼다"는 곧 폴더명 rename이다. `_project.json`에 별도 필드로 저장하면 두 출처가 drift한다.
- **System prompt file** 선택은 **Session mode**(creative/meta)와 1:1로 묶인다 — creative ↔ `SYSTEM.md`, meta ↔ `SYSTEM.meta.md`.
- **Skill catalog**와 **Skill body**는 다른 token 카테고리다. catalog는 system prompt에 항상 있고, body는 활성화 시점에만 conversation에 들어간다. 같은 store나 같은 prompt section으로 묶지 않는다.
- **Skill body** 활성화 경로는 두 가지 — model이 호출하는 `activate_skill` tool과 사용자가 입력하는 **skill slash command** — 이며 효과는 같다. 다만 skill의 `disableModelInvocation: true` flag는 전자를 차단해, 그 skill은 *오직 사용자만* **skill slash command**로 활성화할 수 있게 격리한다.
- **Local slash command**의 효과 위치는 분산되어 있다 — `/edit`은 **view mode**, `/new`·`/compact`는 **session**, `/model`·`/provider`는 **server settings**, `/readme`는 UI. "slash command가 무엇을 바꾸나"를 단일 위치로 가정하지 않는다.
- **Project-scoped tool**은 카테고리 이름이며 **Script tool**, **Tree tool** 등이 그 멤버다. 일반 shell 접근은 같은 카테고리에 들어오지 않는다.
- **Custom provider**와 **Built-in provider**는 UI 노출 규칙이 다르다. **Built-in provider**는 `BUILTIN_PROVIDERS`·`ALLOWED_MODELS` 두 등록이 모두 필요하고, **Custom provider**는 사용자 settings로만 등장한다.
- **Server settings**와 **browser preferences**는 *agent가 읽는가?* / *device 단위 값인가?* 로 갈린다. 같은 값을 양쪽에 두지 않는다 — agent readable이면 **server settings**, per-browser면 **browser preferences** 한쪽에만 둔다.
- **Custom provider**·**Built-in provider**의 API key와 OAuth credential은 **server settings**에 산다 — agent가 호출 시 읽기 때문에 **browser preferences** 카테고리가 아니다.
- **Agent state**(runtime, in-memory)와 **session usage**(persistence-derived)는 다른 source 위에 산다 — 같은 store에 합치지 않는다. "지금 streaming 중인가"는 **agent state**, "지금까지 누적 사용량"은 **session usage**다.
- **Agent state**의 `messages`는 persisted **session entry** rebuild와 in-flight tool result row가 한 배열에 섞인 형태다. *"agent state가 곧 session 데이터"라는 등치*는 깨진다 — consumer는 `role` 분기로 in-flight인지 확인해야 한다.
- **Edit mode**의 편집 대상은 **Project** root에서 **hidden root**를 뺀 전체이며, 이 범위에는 시스템 계약 파일(`SYSTEM.md`, `skills/`, `renderer/` 등)도 포함된다. "edit mode가 **Workspace**로 한정된다"는 가정은 ADR-0002의 결정과 어긋난다.
- **Hidden root**의 멤버는 file API와 **edit mode** 양쪽이 동시에 가린다 — "edit에서 안 보이는데 agent tool로는 보인다" 같은 비대칭은 없다.

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
- "file"은 두 의미가 충돌한다: **Workspace** 디렉터리(`files/`)와 그 안의 단위(**ProjectFile**). 디렉터리는 "Workspace" 또는 "`files/`"로, 단위는 "ProjectFile"로 명시한다.
- "skill"은 Builder Agent의 Skill과 충돌한다. 이 코드베이스 도메인에서 **Skill**은 항상 agentchan **Skill**(SKILL.md)을 의미한다.
- "provider"는 단독으로 쓰지 않는다 — **Custom provider** 또는 **Built-in provider**로 명시한다.
- "setting"/"settings"는 단독으로 쓰지 않는다. 서버 측은 **server settings**, 브라우저 측은 **browser preferences**로 명시한다 — 둘은 영속 위치도 다르고 agent가 읽는지 여부도 다르다.
- "edit"는 단독으로 쓰지 않는다. **view mode**의 값(`edit`)과 **edit mode**(작업 표면)는 다른 카테고리지만 단어가 겹친다 — 표면을 가리킬 땐 항상 "edit mode"로 명시한다.
