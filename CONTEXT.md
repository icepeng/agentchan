# Agentchan

Agentchan은 사용자가 만든 프로젝트(작품)를 위해 LLM agent를 호스팅하고, 프로젝트별 renderer를 화면에 띄우는 데스크톱-스타일 web app이다. 이 문서는 Builder Agent가 코드를 수정할 때 도메인 용어와 설계상 중요한 내부 개념을 일관되게 쓰기 위한 canonical glossary다.

## Language

### Project 영역

**Project**:
agentchan의 작품 단위이며, 시스템 계약 영역과 사용자 콘텐츠 영역을 함께 가진 파일시스템 디렉토리다.
_Avoid_: work, story, document — "project"로 지칭

**Template**:
새 **Project** 생성의 출발점이 되는 README-backed 복사 원본이다.
_Avoid_: starter, base, blueprint

**Trusted template**:
**Project** 생성에 사용할 수 있도록 origin trust가 확인된 **Template** 상태다.
_Avoid_: approved, allowed, verified — "trusted"로 지칭

**Slug**:
filesystem-backed **Project** 또는 **Template**의 단일 식별자이며, 디렉터리명이 source of truth다.
_Avoid_: id, name, project key

**Cover**:
**Project** 또는 **Template** 루트의 대표 이미지다.
_Avoid_: thumbnail, image, hero

**System prompt file**:
**Session mode**에 따라 agent system prompt 합성에 쓰이는 **Project** 루트의 prompt 파일이다.
_Avoid_: prompt file 단독, instructions

### Workspace 영역

**Workspace**:
한 **Project** 안의 `files/` 사용자 콘텐츠 영역이며, 여러 **Project**를 포함하는 IDE workspace가 아니다.
_Avoid_: files 단독, content, assets

**ProjectFile**:
**Workspace** 안의 파일을 renderer와 **Skill**에 전달하기 위해 표현한 단위이며, **Project** root 전체의 파일을 뜻하지 않는다.
_Avoid_: file 단독, asset

**Digest**:
**ProjectFile**의 내용을 구분하기 위한 opaque cache identity이며, renderer는 값의 형식에 의존하지 않는다.
_Avoid_: hash, checksum, fingerprint

### Creative Agent 영역

**Skill**:
agentchan의 사용자 정의 절차이며, **Session mode**에 따라 노출되는 agentchan 내부 개념이다.
_Avoid_: instruction, plugin, command

**Skill catalog**:
**Session mode**에 노출되는 **Skill** 목록이며, agent system prompt에 합성되지만 **Skill body**는 포함하지 않는다.
_Avoid_: skill list, manifest

**Skill body**:
활성화 시점에만 conversation context에 주입되는 **Skill**의 본문이다.
_Avoid_: skill content, activation payload

**Slash command**:
사용자가 `/` 접두사로 입력해 즉시 효과를 일으키는 conversation-time 명령이다.
_Avoid_: command 단독, /-command

**Local slash command**:
agentchan 코드가 직접 처리하고 LLM에는 도달하지 않는 **slash command**다.
_Avoid_: builtin command, system command

**Skill slash command**:
사용자 입력으로 **Skill body**를 conversation에 주입하는 **slash command**다.
_Avoid_: skill command, /skill

**Project-scoped tool**:
**Project** 디렉터리 경계 안에서만 agent에게 제공되는 등록 도구다.
_Avoid_: tool 단독, agent tool, shell tool

**Script tool**:
**Project** 또는 **Skill**의 helper code를 실행하는 **Project-scoped tool**이다.
_Avoid_: exec, run script, helper tool

### Settings 영역

**Custom provider**:
사용자가 **Server settings**에 추가한 LLM provider다.
_Avoid_: external provider, user provider

**Built-in provider**:
agentchan UI에 제품이 기본 노출하는 LLM provider다.
_Avoid_: stock provider, default provider

**Server settings**:
agent가 읽는 설정, 시크릿, install-scoped 상태를 서버 측에 영속한 값이다.
_Avoid_: settings 단독, config, server config

**Browser preferences**:
브라우저에 영속되는 per-browser 값이며, agent가 읽지 않는 UI state와 device preference에 한정한다.
_Avoid_: localStorage 단독, UI settings, client settings

**localStore registry**:
모든 **Browser preferences** key의 단일 등록 지점이며, registry 밖 직접 browser storage 접근은 금지한다.
_Avoid_: storage 단독, localStorage wrapper

### Renderer 영역

**Renderer**:
**Project**의 시각 표면을 구성하는 사용자 작성 코드이며, `renderer/index.ts(x)`에서 named export `renderer`를 제공한다.
_Avoid_: view, template, theme

**Renderer surface**:
Renderer 작성자가 의존할 수 있는 안정 작성 계약이며, runtime backend는 이 계약 밖에 둔다.
_Avoid_: API, contract — "renderer surface"로 지칭

**Renderer bundle**:
**Renderer** source를 host가 import 가능한 형태로 빌드한 결과물이다.
_Avoid_: build, output

**Renderer snapshot**:
host가 **Renderer**에 전달하는 선언적 **Project** 상태이며, shape은 `{ slug, baseUrl, files, state }`다.
_Avoid_: data, props, view-model

**Renderer actions**:
**Renderer**가 선언적 **Renderer snapshot**으로 표현할 수 없는 host command를 요청하는 통로다.
_Avoid_: callbacks, handlers, API

**Renderer theme**:
**Renderer**가 **Renderer snapshot**에서 계산해 host에 제안하는 project page 한정 theme token이다.
_Avoid_: theme 단독, app theme, global theme

**Renderer presentation machine**:
**Renderer**가 화면에 들어오고 사라지는 host 측 전이 규칙을 소유하는 개념이다.
_Avoid_: host machine, host state machine — "presentation machine"으로 지칭

**Renderer layer**:
**Renderer** module을 실제 DOM에 mount/update/unmount하는 host adapter다.
_Avoid_: container, root

### Navigation 영역

**View**:
"지금 무엇을 보여주는가"의 단일 표현. discriminated union으로 page와 selection을 한 곳에 모은 SSoT.
_Avoid_: page, route, screen — "view"로 지칭

**View kind**:
**View** union의 최상위 분기다.
_Avoid_: page, tab

**View mode**:
`project` **View kind** 안에만 존재하는 작업 화면 토글이다.
_Avoid_: edit mode, chat mode, "mode" 단독 사용 — 항상 "view mode"로 지칭

### Editor 영역

**Edit mode**:
**project view**의 **View mode**가 `edit`일 때의 작업 표면이며, **Hidden root**를 제외한 **Project** root를 편집 대상으로 삼는다.
_Avoid_: workspace editor, file editor, edit screen

**Hidden root**:
**Project** root에서 **edit mode**와 file API 양쪽에 노출되지 않는 root item 집합이다.
_Avoid_: hidden file, system file, internal

### Session 영역

**Session**:
한 프로젝트 안의 대화 단위. JSONL 파일 하나로 저장되며, 첫 줄은 header이고 이후 줄은 entry append-only다.
_Avoid_: conversation, chat — "session"으로 지칭

**Session entry**:
**Session** JSONL의 append-only 기록 단위이며, id와 parent link는 저장 시점에 배정된다.
_Avoid_: log line, history item, message 단독 — 기록 단위는 "entry"로 통일

**Branch**:
한 **Session entry**에서 갈라지는 대화 흐름이며, 파일에 영속화하지 않는 derived view다.
_Avoid_: thread, fork — derived view라는 점이 핵심

**LeafId**:
한 entry graph 안에서 **Branch**를 derive할 끝 지점을 가리키는 임시 selection이다.
_Avoid_: cursor, selection, head — leafId는 path derive의 출발점일 뿐, 영속 상태가 아님

**Turn**:
한 user **Session entry**에 대한 응답으로 묶이는 연속된 assistant **Session entry** 묶음이며, 파일에 저장하지 않는 derived UI grouping이다.
_Avoid_: assistant message 단독, response group, bubble — 한 turn 안에 assistant entry가 여러 개 들어갈 수 있다는 점이 핵심

**Compaction**:
이전 대화를 LLM 호출 결과 summary로 대체하는 같은 entry graph 안의 **Session entry**다.
_Avoid_: summarization, archive — agentchan 도메인에서 "compaction"은 entry 그래프 내 in-place 연산

**Creative session**:
작품 본업의 대화/작업 세션. **Meta session**과 분리되어, 프로젝트 진입 시 자동선택 대상.
_Avoid_: chat session, main session — "creative session"으로 지칭

**Meta session**:
프로젝트 구성 작업(예: renderer 빌드) 전용 세션. 슬래시 명령 또는 SessionTabs 명시 클릭으로만 진입한다 (자동선택 대상이 아님).
_Avoid_: build session, system session — "meta session"으로 지칭

**Session mode**:
**Session**의 영구 속성 — `creative | meta`. **View mode**와 직교한다.
_Avoid_: "mode" 단독 사용 — 항상 "session mode"로 지칭

### Agent runtime 영역

**Agent state**:
프로젝트별 in-memory agent runtime 상태이며, persisted **Session entry**와 in-flight row가 섞인 render-facing view를 포함한다.
_Avoid_: state 단독, agent runtime, conversation state

**Usage**:
한 LLM 호출의 token·cost 사실 묶음이며, `@mariozechner/pi-ai`의 `Usage` 타입을 그대로 받는다.
_Avoid_: usage 단독으로 derive view를 가리키지 않는다 — derive view는 **Session usage**·**Turn usage**·**Context usage**다

**Session usage**:
**Session** 파일 안 모든 persisted assistant **Session entry**의 **Usage** 누적 view이며, **Branch** 선택과 무관하다.
_Avoid_: usage 단독, token usage, billing, branch usage 단독, "cost 합산"으로 환원

**Turn usage**:
한 **Turn** 안 모든 assistant **Session entry**의 **Usage** 누적 view다.
_Avoid_: turn cost 단독, message usage, last-entry usage

**Context usage**:
활성 **Branch**의 마지막 assistant **Session entry**의 **Usage**에서 derive한 다음 LLM 호출 input 크기 추정이며, 합산이 아닌 단일 entry view다.
_Avoid_: usage 단독, context tokens 단독, context percent

## Relationships

- **Renderer presentation machine**은 project identity, **Renderer bundle**, **Renderer snapshot**, error 변화를 외부 이벤트로 받아 라이프사이클을 진행하고, **Renderer layer**에 mount/clear 명령을 일으킨다.
- **Renderer surface**(작성자 측 안정 계약)는 host의 **Renderer presentation machine** 구현과 독립적이다 — runtime backend는 그 계약 밖이라 자유롭게 바꿀 수 있다.
- **Renderer bundle**과 **Renderer snapshot**은 server에서 fetch한 _데이터_고, **Renderer presentation machine**의 _상태_와 다른 카테고리다. 두 가지를 같은 store에 합치지 않는다.
- **Renderer snapshot**은 host가 **Renderer**에 전달하는 선언적 상태이고, **Renderer actions**는 **Renderer**가 host에게 요청하는 command 통로다. Renderer가 server session, storage, routing을 직접 소유한다는 뜻이 아니다.
- **Renderer theme**은 **Renderer**가 제안하고 host가 project page 범위에서 적용한다 — host app 전체의 global theme 소유권을 **Renderer**에 넘기지 않는다.
- **View kind** 가 `project`일 때만 **View mode** 필드가 존재한다. 다른 kind에서 view mode를 묻는 것은 type level에서 의미가 없다.
- **Session mode**(creative/meta)와 **View mode**(chat/edit)는 직교한다. 네 조합 모두 의미 있다 — creative+chat, creative+edit, meta+chat, meta+edit.
- **Project view** 재진입 시 마지막 **Session**은 기억하지만 **View mode**는 기억하지 않는다. 세션 선택은 작업 연속성이고, chat/edit 토글은 view를 떠나면 끝나는 작업 의도다.
- **Branch**는 `entries`에서 **LeafId**를 입력으로 *derive*하는 view라, "branch를 저장한다"는 표현은 자체 모순이다. 저장되는 것은 entries와 그 `parentId` chain뿐이고, **Compaction**도 별도 파일이 아닌 같은 그래프의 한 entry로 머문다.
- **Turn**은 활성 **Branch**에서 user→assistant 경계를 입력으로 *derive*하는 grouping이다 — **Branch**와 같은 카테고리(저장되지 않는 view)이고, **Session entry**(append-only 기록 단위)와는 다른 카테고리다. "turn을 저장한다"는 표현은 자체 모순이다.
- 한 **Turn** 안에 LLM round-trip이 여러 번 일어날 수 있다 — tool 호출이 끼면 assistant **Session entry**가 두 개 이상 생기고 모두 같은 **Turn**에 들어간다. 그래서 **Turn usage**는 그 turn 안 *모든* assistant entry **Usage**의 합이지, 마지막 한 entry의 값이 아니다.
- **Project**의 시스템 계약 영역(`_project.json`, `SYSTEM.md`, `skills/`, `renderer/`, `sessions/`)과 **Workspace**의 사용자 콘텐츠 영역은 분리된 결정이다 — 전자는 *시스템이 다루는* 인프라 파일, 후자는 *시스템이 해석하지 않는* 사용자 콘텐츠다.
- **Template** → **Project** 복사는 일회성이다. README를 가진 **Template** 디렉터리가 복사 단위이며, 이후 template 변경은 기존 **Project**에 자동 반영되지 않는다.
- **Trusted template**만 **Project** 생성에 쓸 수 있다. Trust 결정의 출처는 두 가지 — built-in 등록과 사용자 명시 동의 — 이며 같은 카테고리에 모인다. "Save as template"으로 만들어진 template은 사용자 본인 출처라 자동 trusted가 된다.
- **Trusted template**은 origin gate이지 runtime sandbox가 아니다. Trusted template으로 만든 **Project**의 **Skill body**, **Renderer**, **System prompt file**은 그대로 실행/합성되므로, trust는 출처 동의 경계이고 실행 격리 경계가 아니다.
- **Project slug**는 **Project** 폴더명이 source of truth라, "slug를 바꾼다"는 곧 폴더명 rename이다. `_project.json`에 별도 필드로 저장하면 두 출처가 drift한다.
- **Template slug**는 **Template** 디렉터리명이 source of truth이며, trust/order/create-from-template 흐름에서 같은 식별자로 참조된다.
- **System prompt file** 선택은 **Session mode**(creative/meta)와 1:1로 묶인다 — creative ↔ `SYSTEM.md`, meta ↔ `SYSTEM.meta.md`.
- **Skill catalog**와 **Skill body**는 다른 token 카테고리다. catalog는 system prompt에 항상 있고, body는 활성화 시점에만 conversation에 들어간다. 같은 store나 같은 prompt section으로 묶지 않는다.
- **Skill body** 활성화 경로는 두 가지 — model이 호출하는 `activate_skill` tool과 사용자가 입력하는 **Skill slash command** — 이며 효과는 같다. 다만 skill의 `disableModelInvocation: true` flag는 전자를 차단해, 그 skill은 *오직 사용자만* **Skill slash command**로 활성화할 수 있게 격리한다.
- **Local slash command**의 효과 위치는 분산되어 있다 — `/edit`은 **View mode**, `/new`·`/compact`는 **Session**, `/model`·`/provider`는 **Server settings**, `/readme`는 UI. "slash command가 무엇을 바꾸나"를 단일 위치로 가정하지 않는다.
- **Project-scoped tool**은 일반 shell 접근과 다른 카테고리다. **Script tool**은 helper code 실행이 필요할 때 쓰는 project-scoped 경로다.
- **Custom provider**와 **Built-in provider**는 UI 노출 규칙이 다르다. **Built-in provider**는 제품 코드의 provider 등록과 model allowlist가 모두 필요하고, **Custom provider**는 사용자 settings로만 등장한다.
- **Server settings**와 **Browser preferences**는 *agent가 읽는가?* / *device 단위 값인가?* 로 갈린다. agent가 읽거나 install 전체에 적용되는 값은 **Server settings**에 두고, 특정 브라우저의 UI state·device preference·dismissal signal은 **Browser preferences**에 둔다.
- 같은 값을 **Server settings**와 **Browser preferences** 양쪽에 중복 저장하지 않는다. 경계가 애매하면 agent가 읽는지 먼저 묻고, 읽는다면 **Server settings**가 source of truth다.
- 모든 **Browser preferences** key는 **localStore registry**를 통해 추가한다. feature code에서 registry를 우회해 browser storage를 직접 읽고 쓰면 **Browser preferences** 경계가 깨진다.
- **Custom provider**·**Built-in provider**의 API key와 OAuth credential은 **Server settings**에 산다 — agent가 호출 시 읽기 때문에 **Browser preferences** 카테고리가 아니다.
- **Agent state**(runtime, in-memory)와 **Session usage**(persistence-derived)는 다른 source 위에 산다 — 같은 store에 합치지 않는다. "지금 streaming 중인가"는 **Agent state**, "세션에서 지금까지 청구된 사용량"은 **Session usage**다.
- 한 assistant **Session entry**는 한 LLM 호출에 대응하며 그 호출의 **Usage**를 들고 있다.
- **Session usage**는 **Branch** 전환에 따라 변하면 잘못된 신호다. 폐기된 **Branch**의 **Session entry**도 파일에 남고 비용은 이미 청구됐다 — UI에서 안 보일 뿐 합산에서 빠지지 않는다.
- **Agent state**의 `messages`는 persisted **Session entry** rebuild와 in-flight tool result row가 한 배열에 섞인 형태다. *"agent state가 곧 session 데이터"라는 등치*는 깨진다 — consumer는 `role` 분기로 in-flight인지 확인해야 한다.
- **Edit mode**의 편집 대상은 **Project** root에서 **Hidden root**를 뺀 전체이며, 이 범위에는 시스템 계약 파일(`SYSTEM.md`, `skills/`, `renderer/` 등)도 포함된다. "edit mode가 **Workspace**로 한정된다"는 가정은 ADR-0002의 결정과 어긋난다.
- **Hidden root**의 멤버는 file API와 **edit mode** 양쪽이 동시에 가린다 — "edit에서 안 보이는데 agent tool로는 보인다" 같은 비대칭은 없다.

## Example dialogue

> **Dev:** "프로젝트를 전환했는데 이전 프로젝트의 화면이 잠깐 보였어요. 어디를 고치죠?"
> **Maintainer:** "그건 **Renderer presentation machine**의 책임이에요. 전이는 거기서 닫혀야 해요. 외부에서 entity reducer를 직접 비우는 게 아니라 project 전환 이벤트를 보내면 됩니다."

> **Dev:** "Renderer에서 세션 API를 직접 호출해도 되나요?"
> **Maintainer:** "아뇨. **Renderer snapshot**은 host가 전달하는 선언적 상태이고, **Renderer actions**는 host에게 command를 요청하는 통로예요. **Renderer**가 server session이나 routing을 직접 소유하지 않습니다."

> **Dev:** "templates 페이지에서 프로젝트 탭을 누르면 active project가 바뀌는데 화면은 templates에 머물러요."
> **Maintainer:** "**View**가 단일 SSoT라 project 열기 transition은 한 dispatch로 끝나야 해요. **View kind**와 slug를 동시에 바꾸지 않으면 그 어긋남이 생깁니다."

> **Dev:** "**Meta session**일 때 edit mode로 토글해도 되나요?"
> **Maintainer:** "**Session mode**(creative/meta)와 **View mode**(chat/edit)는 직교해요. meta 세션이라도 view mode 토글은 독립적으로 동작합니다."

> **Dev:** "Trusted template이면 renderer code와 skill body도 sandbox 안에서 실행되는 거죠?"
> **Maintainer:** "아니요. **Trusted template**은 origin gate예요. 그 **Template**으로 만든 **Project**의 **Renderer**, **Skill body**, **System prompt file**은 그대로 실행/합성되므로, trust는 실행 격리가 아니라 출처 동의 경계입니다."

> **Dev:** "edit mode에서 보이는 파일들을 전부 renderer snapshot의 files로 보내면 되나요?"
> **Maintainer:** "아니요. **Edit mode**는 **Hidden root**를 제외한 **Project** root를 다루지만, **Renderer snapshot**의 `files`는 **Workspace**에서 스캔한 **ProjectFile**만 포함합니다."

> **Dev:** "알림 설정을 server settings에 저장해도 되나요?"
> **Maintainer:** "agent가 읽지 않는 per-browser 값이면 **Browser preferences**입니다. 반대로 provider, model, API key처럼 agent가 읽거나 install 전체에 적용되는 값은 **Server settings**에 둡니다."

## Flagged ambiguities

- "mode"는 두 직교하는 개념에 쓰여 혼선이 발생한다: **Session mode**(creative/meta — 세션 데이터의 영구 속성)와 **View mode**(chat/edit — project view의 작업 화면 토글). 코드/문서에서 "mode"를 단독으로 쓰지 않고 둘 중 하나로 명시한다.
- "file"은 두 의미가 충돌한다: **Workspace** 디렉터리(`files/`)와 그 안의 단위(**ProjectFile**). 디렉터리는 **Workspace**, 단위는 **ProjectFile**로 명시한다.
- "workspace"는 일반 IDE workspace처럼 여러 **Project**를 포함하는 뜻으로 읽히기 쉽다. 현재 **Workspace**는 한 **Project** 안의 `files/` 사용자 콘텐츠 영역만 뜻한다. future rename 후보는 **Project content** 또는 **Content root**다.
- "skill"은 Builder Agent의 Skill과 충돌한다. 이 코드베이스 도메인에서 **Skill**은 항상 agentchan **Skill**(SKILL.md)을 의미한다.
- "provider"는 단독으로 쓰지 않는다 — **Custom provider** 또는 **Built-in provider**로 명시한다.
- "setting"/"settings"는 단독으로 쓰지 않는다. 서버 측은 **Server settings**, 브라우저 측은 **Browser preferences**로 명시한다 — 둘은 영속 위치도 다르고 agent가 읽는지 여부도 다르다.
- "edit"는 단독으로 쓰지 않는다. **View mode**의 값(`edit`)과 **Edit mode**(작업 표면)는 다른 카테고리지만 단어가 겹친다 — 표면을 가리킬 땐 항상 "edit mode"로 명시한다.
- **Session usage**가 LLM provider 청구액과 일치하는지는 미해결이다. **Compaction**은 LLM 호출이라 **Usage**가 발생하지만 현재 `CompactionEntry`(pi-coding-agent와 동일)에 `usage` 필드가 없어 합산에서 누락된다. pi 측 디자인 의도 확인 후 schema 처리 방향을 결정한다 — 그때까지 "**Session usage** = 청구액"이라고 단정하지 않는다.
