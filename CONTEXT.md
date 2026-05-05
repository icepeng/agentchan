# Agentchan

Agentchan은 일을 위한 에이전트가 아니라 놀이를 위한 에이전트를 만들고, 공유하고, 각자의 방식으로 즐기는 앱이다.

## Language

### People

**User**:
**Project**를 만들고, 편집하고, **Creative agent**와 대화하며 창작 놀이를 이어가는 사람.
_Avoid_: creator, consumer, audience

**Author**:
다른 **User**가 시작점으로 삼을 **Template**을 만드는 **User**.
_Avoid_: creator, maker

### Agent setup

**Creative agent**:
창작 글쓰기 기반의 놀이를 함께 진행하는 agent.
_Avoid_: work agent, assistant, chatbot

**Provider**:
**Creative agent**를 실제 LLM으로 실행하기 위해 연결하는 외부 AI 서비스.
_Avoid_: model, backend, vendor

**Built-in provider**:
agentchan이 기본 선택지로 제공하는 **Provider**.
_Avoid_: default provider, stock provider

**Custom provider**:
**User**가 직접 연결 정보를 추가한 **Provider**.
_Avoid_: user provider, external provider

**Active provider**:
현재 **Creative agent** 실행에 쓰는 **Provider**.
_Avoid_: selected provider, default provider

**Active model**:
현재 **Creative agent** 실행에 쓰는 model.
_Avoid_: model setting, selected model

**API key**:
**Provider**에 연결하기 위해 저장하는 비밀 값.
_Avoid_: token, credential, secret

**OAuth connection**:
**Provider**에 로그인해 얻은 연결 상태.
_Avoid_: OAuth credential, login token

**Context window**:
**Creative agent**가 한 번에 참고할 수 있는 **Session** 맥락의 한계.
_Avoid_: token limit, usage, prompt size

**Context usage**:
현재 **Session**이 **Context window**를 얼마나 쓰고 있는지 보여주는 상태.
_Avoid_: usage, token usage, cost

### Project building blocks

**Agent instructions**:
**Creative agent**가 **Project**에서 어떤 역할로 행동할지 정하는 지침.
_Avoid_: system prompt, prompt file, personality

**Project content**:
**Project**에서 창작 놀이의 재료나 진행 결과가 되는 내용.
_Avoid_: files, assets, workspace

**Skill**:
**Creative agent**가 특정 창작 작업이나 놀이 방식을 더 잘 수행하도록 **Author**가 붙이는 추가 능력.
_Avoid_: plugin, command, instruction

**Renderer**:
**Project**의 창작 놀이를 화면에 어떻게 보여줄지 정하는 표현 layer.
_Avoid_: theme, view, UI

**Project theme**:
**Renderer**가 **Project**의 분위기에 맞게 agentchan 화면 색을 제안하는 표현 설정.
_Avoid_: app theme, appearance preference, global theme

**Project README**:
사람이 **Template**이나 **Project**를 시작하고 다루는 법을 읽는 안내문.
_Avoid_: guide, manual, docs

**Cover**:
**Template**이나 **Project**를 대표해 **Library**와 Project 목록에 보이는 이미지.
_Avoid_: thumbnail, hero image, preview image

### Sharing

**Library**:
**User**가 다시 쓸 수 있는 **Template**을 모아두는 곳. **Skill**도 포함하도록 확장될 가능성이 있다.
_Avoid_: gallery, marketplace, collection

**Template**:
**Author**가 다른 **User**의 시작점으로 공유하는 창작 놀이의 원형.
_Avoid_: starter, blueprint, sample

**Trusted template**:
**User**가 **Project**의 시작점으로 써도 된다고 신뢰한 **Template**.
_Avoid_: approved template, verified template, safe template

### Projects

**Project**:
**User**의 창작 놀이가 이어지는 독립 단위.
_Avoid_: work, story, piece

**Project folder**:
하나의 **Project**를 받치는 로컬 폴더.
_Avoid_: workspace, repo, directory

**Project editor**:
**User**가 **Project**의 내용을 직접 고치는 편집 표면.
_Avoid_: edit mode, file editor, workspace editor

### Sessions

**Session**:
**Project** 안에서 **User**와 **Creative agent**가 이어가는 하나의 대화 흐름.
_Avoid_: chat, conversation, thread

**Branch**:
**Session**에서 한 지점부터 다른 가능성으로 이어지는 진행.
_Avoid_: thread, fork, alternate chat

**Compaction**:
긴 **Session**을 계속 이어가기 위해 이전 대화를 요약해 context를 줄이는 일.
_Avoid_: archive, deletion, memory

**Creative session**:
**User**가 **Creative agent**와 창작 놀이를 이어가는 **Session**.
_Avoid_: main session, normal session

**Meta session**:
**Project**의 구성이나 표현 방식을 고치기 위한 **Session**.
_Avoid_: build session, system session

### Commands

**Slash command**:
**User**가 `/`로 시작하는 입력으로 **Session** 안에서 기능을 호출하는 명령.
_Avoid_: command, prompt, shortcut

## Relationships

- **Author**는 **Project**를 다시 **Template**으로 저장해 **Library**에 더할 수 있다.
- **User**는 **Trusted template**에서만 **Project**를 만들 수 있다.
- 제품이 함께 제공하는 **Template**은 처음부터 **Trusted template**이다.
- **Author**가 자기 **Project**를 **Template**으로 저장하면 그 **Template**은 자기 출처이므로 신뢰된 것으로 본다.
- 한 **Project**는 하나의 **Project folder**로 보관된다.
- 같은 **Template**에서 만든 여러 **Project**는 서로 다른 **Project folder**를 가진 독립 단위다.
- **Project folder**는 **User**가 직접 고치거나, 복사하거나, git으로 관리할 수 있다.
- **Template**은 처음 복사될 **Agent instructions**, **Skill**, **Renderer**, **Project content**, **Project README**, **Cover**를 제공할 수 있다.
- 복사 이후 **Project content**, **Project README**, **Cover**, **Skill**, **Renderer**는 **Project**마다 독립적으로 갈라진다.
- **Creative agent**는 **Agent instructions**, **Skill**, **Project content**, **Session**을 바탕으로 실행된다.
- **Creative agent**는 tool을 사용해 **Project content**를 읽고 쓸 수 있다.
- **Project**에서 **User**는 **Creative agent**와 대화하며 창작 놀이를 이어간다.
- **Creative agent**와 대화하려면 **Active provider**와 **Active model**이 필요하다.
- **Provider**는 **API key** 또는 **OAuth connection**을 요구할 수 있다.
- **Built-in provider**와 **Custom provider**는 둘 다 **Creative agent**를 실행할 수 있다.
- **Creative agent** 실행이나 설치 전체에 필요한 값은 서버에 저장하고, 현재 브라우저의 표시 선호만 바꾸는 값은 브라우저에 저장한다.
- **Project content**는 **Agent instructions**, **Skill**, **Renderer**, **Project README**, **Cover**와 구분된다.
- **Project content**의 장르별 의미는 **Project**의 **Agent instructions**, **Skill**, **Renderer**가 함께 정하며, agentchan core는 이를 고정하지 않는다.
- **Project README**는 **Agent instructions**와 다르다. 하나는 사람이 읽는 안내이고, 다른 하나는 **Creative agent**의 행동 지침이다.
- **Renderer**는 창작 놀이의 표현 방식을 정하지만, 놀이의 원본은 **Project**에 파일로 남는다.
- **Renderer**는 **Project theme**을 제안할 수 있다.
- **Project theme**은 **User**의 앱 appearance preference와 다르다. 하나는 **Project**의 표현이고, 다른 하나는 브라우저의 표시 선호다.
- **Project theme**은 **Project**의 chat surface에서만 적용되고, **Project editor**, Settings, **Library**에서는 기본 앱 테마로 돌아간다.
- **Skill**은 장르별 창작 작업을 담을 수 있지만, agentchan core가 그 의미를 고정하지 않는다.
- **Skill**은 **Creative agent**가 스스로 선택해 사용할 수도 있고, **User**가 **Slash command**로 직접 호출할 수도 있다.
- **Author**는 특정 **Skill**을 **User**가 직접 호출할 때만 쓰이도록 제한할 수 있다.
- **Project editor**에서 **User**는 **Project content**, **Agent instructions**, **Skill**, **Renderer**를 고칠 수 있다.
- **Project editor**는 **Project**의 작성 가능한 구성요소를 고치지만, Project identity나 **Session** 저장소 같은 runtime-owned root는 직접 편집하지 않는다.
- **Project editor**는 **Session**과 다르다. 하나는 직접 편집 표면이고, 다른 하나는 **Creative agent**와의 대화 흐름이다.
- 한 **Project**는 여러 **Session**을 가질 수 있다.
- **Session**은 **Project content**와 다르다. 대화 기록은 놀이의 진행 기록이고, content는 놀이의 재료나 결과다.
- 한 **Session**은 여러 **Branch**를 가질 수 있다.
- **User**는 같은 장면이나 선택에서 다른 **Branch**로 창작 놀이를 이어갈 수 있다.
- **Branch**는 **Project content**를 자동으로 복제하지 않는다. 필요한 변경은 대화나 파일 편집으로 **Project content**에 반영된다.
- **Session**이 **Context window**에 가까워지면 **Compaction**이 필요할 수 있다.
- **Context usage**가 **Context window**를 넘으면 agentchan은 입력을 막거나 **Compaction**을 요구해야 한다.
- **Context usage**는 비용이 아니라 계속 대화할 수 있는 맥락 여유를 나타낸다.
- **Compaction**은 **Session**의 이전 흐름을 요약해 context를 줄이지만, **Project content**를 대신하거나 대화를 삭제하지 않는다.
- **Compaction** 이후에도 **User**는 같은 **Session**을 이어갈 수 있다.
- 한 **Project**는 **Creative session**과 **Meta session**을 모두 가질 수 있다.
- **Creative session**은 놀이를 진행하고, **Meta session**은 놀이를 가능하게 하는 구성을 고친다.
- **Meta session**에서 바꾼 **Agent instructions**, **Skill**, **Renderer**, **Project content**는 이후 **Creative session**에 영향을 줄 수 있다.
- **Compaction** 같은 **Session** 기능도 **Slash command**로 호출될 수 있다.
- **Slash command**는 창작 놀이의 일부일 수도 있고, **Project**를 관리하기 위한 동작일 수도 있다.

## Example dialogue

> **Dev:** "A가 RPG 캐릭터 원형을 만들고, B가 그걸 받아 대화하면 둘 다 creator인가요?"
> **Domain expert:** "A는 **Author**이고, B는 **User**예요. **Author**도 agentchan을 쓰는 **User**지만, 다른 사람이 시작점으로 삼을 **Template**을 만들 때만 **Author**라고 부릅니다."

> **Dev:** "A가 공유한 원형과 B가 받아서 대화하는 단위를 둘 다 project라고 불러도 되나요?"
> **Domain expert:** "아니요. A가 만든 시작점은 **Template**이고, B가 받아 자기 놀이를 이어가는 독립 단위는 **Project**예요."

> **Dev:** "**Creative agent**는 **Project** 안에 저장돼 있나요?"
> **Domain expert:** "아니요. 저장되는 건 **Agent instructions**, **Skill**, **Project content**, **Session** 같은 실행 재료예요. **Creative agent**는 그 재료를 바탕으로 실행되고, tool을 사용해 **Project content**를 읽고 쓸 수 있습니다."

> **Dev:** "캐릭터 파일이나 원고 파일은 core가 의미를 이해하나요?"
> **Domain expert:** "아니요. 그것들은 **Project content**예요. 장르별 의미는 **Agent instructions**, **Skill**, **Renderer**가 정하고, agentchan core는 고정 schema로 해석하지 않습니다."

> **Dev:** "대화가 너무 길어져서 context가 꽉 차면 어떻게 되죠?"
> **Domain expert:** "**Context usage**가 **Context window**에 가까워지면 **Compaction**이 필요해요. 이건 대화를 삭제하는 게 아니라 같은 **Session**을 이어가기 위한 context 관리입니다."

## Flagged ambiguities

- **"creator"** - **User**와 **Author**의 경계를 흐리므로 피한다.
- **"work" / "story" / "piece"** - 장르를 좁히거나 완성물처럼 들리므로 **Project**의 canonical term으로 쓰지 않는다.
- **"workspace"** - IDE workspace나 repo root로 읽히기 쉬우므로 쓰지 않는다. 창작 재료와 결과는 **Project content**, **Project**를 받치는 로컬 폴더는 **Project folder**라고 부른다.
- **"edit mode"** - UI 상태 이름으로는 남을 수 있지만 도메인 용어로는 **Project editor**를 쓴다.
- **"turn"** - **User**가 하나의 응답처럼 보는 UI grouping과 **Session**의 저장 단위가 다르다. 저장되는 것은 append-only entry들이며, tool call이 끼면 한 **User** 입력에 여러 assistant entry가 생길 수 있다. Turn이 필요할 때는 저장 단위가 아니라 derived UI grouping인지 먼저 확인한다.
