# Changelog

## [0.3.0](https://github.com/icepeng/agentchan/compare/v0.2.0...v0.3.0) (2026-04-14)


### Features

* "General" 기본 프로젝트 자동 생성 제거 + 0개 상태 지원 ([#63](https://github.com/icepeng/agentchan/issues/63)) ([a95d0fb](https://github.com/icepeng/agentchan/commit/a95d0fb57c76f1bd2fef5924f7a67b61c392ca9a))
* add edit mode — unified tree view + CodeMirror editor for all project files ([5d77805](https://github.com/icepeng/agentchan/commit/5d778051f7ac3c94323fca4f3b1c92bcd1e5ea45))
* always-active skills and slash-command invocation ([6ac79d3](https://github.com/icepeng/agentchan/commit/6ac79d3dff22a53179cb199b669e01013bbc819b))
* character-chat 계열 템플릿에 페르소나 컨셉 추가 ([#48](https://github.com/icepeng/agentchan/issues/48)) ([486c769](https://github.com/icepeng/agentchan/commit/486c76902b1f2cf0cf76654cbb4b62922fd6c96f))
* character-chat 렌더러를 The Chamber Theatre로 재설계 ([#57](https://github.com/icepeng/agentchan/issues/57)) ([ec9942d](https://github.com/icepeng/agentchan/commit/ec9942d691daade0d01efd8bea7e63cd6c253c5c))
* character-chat 템플릿에 impersonate 스킬 추가 ([#47](https://github.com/icepeng/agentchan/issues/47)) ([054d81a](https://github.com/icepeng/agentchan/commit/054d81ae82a8c74213fdadd7f4746afb89d4718d))
* **client:** expose new-project options as a menu ([#19](https://github.com/icepeng/agentchan/issues/19)) ([7f1fcf4](https://github.com/icepeng/agentchan/commit/7f1fcf468128c76359de72fe417f2b939c927ea4))
* CodeMirror 에디터에 history, search, closeBrackets, autocomplete, activeLine 추가 ([f3faa92](https://github.com/icepeng/agentchan/commit/f3faa9274e4f1d93908ef955e66497f25d761b08))
* long-term memory v1.0 — append-only journal + memory-chat template ([#29](https://github.com/icepeng/agentchan/issues/29)) ([1936ee4](https://github.com/icepeng/agentchan/commit/1936ee45de7007aa74408f9ae21600c9eb8bf3da))
* ls 도구를 tree 도구로 대체하여 세션 시작 비용 절감 ([#53](https://github.com/icepeng/agentchan/issues/53)) ([2e2f379](https://github.com/icepeng/agentchan/commit/2e2f3799311f3e5cdaf33be18fdc98a1efef9549))
* meta 세션 + build-renderer 스킬 ([#32](https://github.com/icepeng/agentchan/issues/32)) ([f02fcbb](https://github.com/icepeng/agentchan/commit/f02fcbb648cea7de6ad99e185d2663f3fada63b8))
* mystery-suspense 템플릿 + 캐릭터 이미지 스킬/UI 보조 개선 ([#61](https://github.com/icepeng/agentchan/issues/61)) ([78aa97f](https://github.com/icepeng/agentchan/commit/78aa97fb9aa6125e36e7d77cb160d03ad2d7d13b))
* novel 템플릿 탭 헤더를 sticky로 고정 ([#40](https://github.com/icepeng/agentchan/issues/40)) ([af6c9dc](https://github.com/icepeng/agentchan/commit/af6c9dc5fc3e640ea1a54c03f5ea755ae0093f4a))
* portless 도입으로 dev server 포트 관리를 named URL 방식으로 전환 ([0862132](https://github.com/icepeng/agentchan/commit/08621326e5e81131ac3a798d9378c5c5693c7010))
* README.md 컨벤션 + 템플릿 선택 "The Library" 리디자인 ([#59](https://github.com/icepeng/agentchan/issues/59)) ([50205a5](https://github.com/icepeng/agentchan/commit/50205a5c42f45cdea15dfad0250a8697bf1e652d))
* replace bash tool with script tool using bundled Bun runtime ([#22](https://github.com/icepeng/agentchan/issues/22)) ([be02c20](https://github.com/icepeng/agentchan/commit/be02c205f85b57c780e416011e6df3fc79cee004))
* RPG chat 템플릿 및 dice-roll 스킬 ([#11](https://github.com/icepeng/agentchan/issues/11)) ([84704dc](https://github.com/icepeng/agentchan/commit/84704dc8de332d1eb0edaa3ff960d6f97a6d3d4d))
* SPEC Phase 2-3 — skill wire format + library systems ([1dcf53b](https://github.com/icepeng/agentchan/commit/1dcf53b898e89eaf72ba0edbf03498f0ff81cdd6))
* Vercel AI Gateway provider 지원 추가 ([#42](https://github.com/icepeng/agentchan/issues/42)) ([621a3c5](https://github.com/icepeng/agentchan/commit/621a3c55a40fd786b54114dddce391775ce20cc9))
* 렌더러 액션 시스템 추가 (send/fill) ([#31](https://github.com/icepeng/agentchan/issues/31)) ([799ee97](https://github.com/icepeng/agentchan/commit/799ee9732dbd5b8e0373edff75b884d0e4c46c18))
* 렌더러 주도 테마 + 사이드바 접기 ([#58](https://github.com/icepeng/agentchan/issues/58)) ([56385f3](https://github.com/icepeng/agentchan/commit/56385f3755e08e78427e1b3b237b2cdcedcb18bc))
* 에디터 트리뷰 우클릭 메뉴에 '탐색기에서 열기' 기능 추가 ([353a2f1](https://github.com/icepeng/agentchan/commit/353a2f1c7d3b8857a7fcf6c44d443f2e3a8dfb81))
* 에디터 트리뷰 컨텍스트 메뉴 기능 추가 ([#50](https://github.com/icepeng/agentchan/issues/50)) ([2c4e013](https://github.com/icepeng/agentchan/commit/2c4e0139f5950bcfb8e134b63145b4da4d45cdb8))
* 에디터 트리뷰에 우클릭 파일 삭제 기능 추가 ([188970c](https://github.com/icepeng/agentchan/commit/188970c944d0d6e5dbd18ad66dcd0f6823585e23))
* 에디터 헤더에 예상 토큰 수 표시 복원 ([476390d](https://github.com/icepeng/agentchan/commit/476390dbadaf081b4b69f3e7a685021cfeeb857c))
* 에이전트 패널 인라인 마크다운 + 문장 애니메이션 ([#33](https://github.com/icepeng/agentchan/issues/33)) ([553dac5](https://github.com/icepeng/agentchan/commit/553dac56451789a9b095b755bc9a2ec5b8e34224))
* 채팅 렌더러 리디자인 — 좌측 인라인 persona, no-bubble 스타일 ([e3e7ccd](https://github.com/icepeng/agentchan/commit/e3e7ccd69b62af9e1c26381c068e2c2618ef337c))
* 캐릭터 생성·세계관 구축 스킬을 캐릭터챗 템플릿에 추가 ([#52](https://github.com/icepeng/agentchan/issues/52)) ([f6464b0](https://github.com/icepeng/agentchan/commit/f6464b08a0721620924ef8b2add8c81eb60daa56))
* 템플릿 드래그-드롭 순서 변경 + 프로젝트 "새로 만들기" 배치 조정 ([#64](https://github.com/icepeng/agentchan/issues/64)) ([e7c70de](https://github.com/icepeng/agentchan/commit/e7c70de8ab8b791c09bd6d4f785313a691ede218))
* 프로젝트 단위 병렬 스트리밍 + 백그라운드 완료 알림 ([9ee4e7f](https://github.com/icepeng/agentchan/commit/9ee4e7ffd4ba561b95f899e089e1383d4ca481d0))
* 프로젝트·템플릿 커버 이미지 지원 — COVER.* 컨벤션 기반 ([#54](https://github.com/icepeng/agentchan/issues/54)) ([1b24e0a](https://github.com/icepeng/agentchan/commit/1b24e0a28bb0afd5c3f74ed27edd5b3ce5de98a6))
* 프로젝트를 템플릿으로 저장하는 기능 추가 ([#34](https://github.com/icepeng/agentchan/issues/34)) ([542ee88](https://github.com/icepeng/agentchan/commit/542ee8816331e75a37124baddf6209af77ccb98f))


### Bug Fixes

* allow custom providers without API key ([#16](https://github.com/icepeng/agentchan/issues/16)) ([44c4f0c](https://github.com/icepeng/agentchan/commit/44c4f0cc1a99bebb60356dbaf478760977b3530d))
* edit 모드 토글을 input에서 AgentPanel 헤더 및 collapsed strip으로 이동 ([#36](https://github.com/icepeng/agentchan/issues/36)) ([b80c9c1](https://github.com/icepeng/agentchan/commit/b80c9c1bb9a537ab4af215c9b98d8052fef5f443))
* edit 모드에서 에이전트 패널 대화가 길 때 body 스크롤 발생하는 레이아웃 버그 수정 ([7892762](https://github.com/icepeng/agentchan/commit/7892762f1ae7e91b2ffad86c9502fb12c8b79762))
* ESLint 전체 오류 수정 ([#41](https://github.com/icepeng/agentchan/issues/41)) ([2172197](https://github.com/icepeng/agentchan/commit/2172197677689c043312b403c7553c1d4ca52fd5))
* include skill body in slash command llmText to prevent duplicate activation ([cbf6cca](https://github.com/icepeng/agentchan/commit/cbf6cca0a370188aea9c44b62e85bc0b73c9282e))
* keep chat input enabled during streaming ([#26](https://github.com/icepeng/agentchan/issues/26)) ([8dc5aec](https://github.com/icepeng/agentchan/commit/8dc5aec37751e94e673ebbc29d3fc95b601a8964))
* mystery-suspense 템플릿에 README.md 추가 + _template.json 레거시 정리 ([e31c335](https://github.com/icepeng/agentchan/commit/e31c335c4137c01d9119da0931ff4e93b273ef3a))
* pi-agent-core API 변경 및 TreeNode 구조에 맞춰 테스트 수정 ([#51](https://github.com/icepeng/agentchan/issues/51)) ([3ef3ff0](https://github.com/icepeng/agentchan/commit/3ef3ff0d24b970c6edf449f662263b76a879e989))
* prevent slash command popup from being hidden behind project content ([#28](https://github.com/icepeng/agentchan/issues/28)) ([3639638](https://github.com/icepeng/agentchan/commit/36396387fa482a0aa10064aaca0ca9d122ca3009))
* ResizeHandle 드래그 시 패널이 min/max로 튀는 회귀 버그 수정 ([56a6dad](https://github.com/icepeng/agentchan/commit/56a6dad68a1469904d9feeac5f699619bc68a5f5))
* ScrollArea Viewport에 높이 제약 추가하여 스크롤 회귀 수정 ([#39](https://github.com/icepeng/agentchan/issues/39)) ([6cb761d](https://github.com/icepeng/agentchan/commit/6cb761df19c9294c2bb44e7c2f0e2d3e24f4667b))
* 모델 설정 파라미터 persistence 복원 ([#55](https://github.com/icepeng/agentchan/issues/55)) ([c72794d](https://github.com/icepeng/agentchan/commit/c72794d49690f034a67257683ea3847bab1af6c4))
* 템플릿 페이지에서 빠져나갈 수 없는 네비게이션 버그 수정 ([#37](https://github.com/icepeng/agentchan/issues/37)) ([4046dce](https://github.com/icepeng/agentchan/commit/4046dcef4ae74255c078ef92d55228b199898395))
* 템플릿→프로젝트 복사 시 allowlist를 readdir+denylist로 변경 ([#49](https://github.com/icepeng/agentchan/issues/49)) ([87411fe](https://github.com/icepeng/agentchan/commit/87411fee1ba12dd00d2aed105a97dfc89382b10e))


### Refactoring

* Base UI ScrollArea 컴포넌트 도입으로 스크롤 처리 통합 ([#35](https://github.com/icepeng/agentchan/issues/35)) ([6a155ce](https://github.com/icepeng/agentchan/commit/6a155cec6e1169b6a361b7bd456a1a8ace200810))
* change project duplicate from settings-only to full copy ([afb61dc](https://github.com/icepeng/agentchan/commit/afb61dc35b0ac887e592b3ca378cebd0fbcae4b1))
* dedupe skill bootstrap and batch node appends ([79f4552](https://github.com/icepeng/agentchan/commit/79f4552d52658140553d29c89a99212c4be29b88))
* drop redundant /clear and /help slash commands ([6e1f69f](https://github.com/icepeng/agentchan/commit/6e1f69fecbbda2eee2caad2d1de0272eab13237c))
* drop skill compatibility field ([#24](https://github.com/icepeng/agentchan/issues/24)) ([fe11064](https://github.com/icepeng/agentchan/commit/fe11064e1b7e1bf91cb5d461ad68b8c56f28c062))
* drop unused discoverSkills and parseCommandSerialization ([8cdb2b5](https://github.com/icepeng/agentchan/commit/8cdb2b5c223a24de9e8ff7d8e4af2c3caf17b90c))
* make chat skills always-active and align eval assertions ([ea2df61](https://github.com/icepeng/agentchan/commit/ea2df61cae24fa6fd03a93433103535498bcb264))
* migrate inline SVGs to lucide-react ([#20](https://github.com/icepeng/agentchan/issues/20)) ([3bee4db](https://github.com/icepeng/agentchan/commit/3bee4db679c6a765731405c19c4f41b8c16e854a))
* move skill catalog into system-reminder user message ([c85b19f](https://github.com/icepeng/agentchan/commit/c85b19f66a0c83a41b2b28f4933127e35c54b114))
* **mystery-suspense:** 렌더러 라벨 간소화 + 한국어 가독성 개선 ([a6246c6](https://github.com/icepeng/agentchan/commit/a6246c6ed0b06f87eacaac37c4672afbbb2c22b2))
* Project 타입을 ProjectMeta + slug로 분리 ([a72b397](https://github.com/icepeng/agentchan/commit/a72b39738e33b768a494ffc64575f3ff846ce0c6))
* remove license field from skill frontmatter ([#27](https://github.com/icepeng/agentchan/issues/27)) ([e8a912a](https://github.com/icepeng/agentchan/commit/e8a912a60b24471c680333399091268f83d9be52))
* remove onSkillLoad callback and clean up Phase 1 remnants ([7a1bb13](https://github.com/icepeng/agentchan/commit/7a1bb13ce68ce35fe7e08fffbe0e87c9766e51f0))
* replace always-active skills with SYSTEM.md + files/ workspace ([e8e3a67](https://github.com/icepeng/agentchan/commit/e8e3a6715347781ee9fa5f92ca3f58386cfb13c0))
* replace CreativeWorkspace/Session with stateless conversation module ([c8735df](https://github.com/icepeng/agentchan/commit/c8735df0221dce42864f8c396e77c25c0de935a8))
* replace Library (individual items) with Template (complete project presets) ([0a7c200](https://github.com/icepeng/agentchan/commit/0a7c200443bdaf86ca4e7884b645adfff17c366f))
* simplify creative-agent internals — flatten layers, trim API surface ([2a929d5](https://github.com/icepeng/agentchan/commit/2a929d56e428a7ca026230ed53e95cd33b558e72))
* simplify skill catalog and align eval harness with production ([63456d8](https://github.com/icepeng/agentchan/commit/63456d837990c24d3f8381e624a1901d2d7ce36f))
* slash command 팝업 — fuzzy 매칭과 listbox a11y 도입 ([#56](https://github.com/icepeng/agentchan/issues/56)) ([53d5949](https://github.com/icepeng/agentchan/commit/53d5949dd3ae09b778c07c285115308d13a9e737))
* split creative-agent into conversation (data) and agent (LLM) layers ([cadb2db](https://github.com/icepeng/agentchan/commit/cadb2db66d08d61ba84e9c9535bde422638bd543))
* split monolithic novel-writing skill into 5 independent skills ([a9a5625](https://github.com/icepeng/agentchan/commit/a9a562572797a5277b638744b0dca5f9d670a336))
* switch microCompact from count-based to token-budget retention ([7f50664](https://github.com/icepeng/agentchan/commit/7f506645577fd263bbc53031e98035809a835054))
* thin webui server via CreativeWorkspace + CreativeSession ([fc495ce](https://github.com/icepeng/agentchan/commit/fc495ce65506ee1e8139386451d5d1c03f1bb1c3))
* tighten module boundaries and dedupe shared types ([271c031](https://github.com/icepeng/agentchan/commit/271c03168480dbf3720f30c8d06711df93d8128f))
* TreeNode에 pi-ai AgentMessage 직접 저장, ContentBlock/StoredMessage/convert.ts 제거 ([32c0a80](https://github.com/icepeng/agentchan/commit/32c0a805e4c3c684a7266913fb22f7ab99dd5e19))
* trim skill catalog reminder to a bare name list ([0b084ef](https://github.com/icepeng/agentchan/commit/0b084ef7db67a2272c29f9266c938ec4667ce351))
* unify skill-injection paths under meta:"skill-load" ([d268223](https://github.com/icepeng/agentchan/commit/d2682234623011327d70f66a5e671cbe7d470ef5))
* update system prompts ([fed6236](https://github.com/icepeng/agentchan/commit/fed62362bed4431feeab72319e15020cf34e23c3))
* 예제 데이터의 어색한 '호(arc)' 표현을 '서사 곡선'으로 통일 ([a181290](https://github.com/icepeng/agentchan/commit/a1812902bd2db35d3cddafd22f86de5083c81f6b))
* 인라인 삽화 지침을 캐릭터 파일에서 SYSTEM.md로 이동 ([#38](https://github.com/icepeng/agentchan/issues/38)) ([776759a](https://github.com/icepeng/agentchan/commit/776759a36523fd563fce00eabb46911c5e7aadb1))

## [0.2.0](https://github.com/icepeng/agentchan/compare/v0.1.2...v0.2.0) (2026-04-06)


### Features

* add custom API provider support ([#5](https://github.com/icepeng/agentchan/issues/5)) ([a956cca](https://github.com/icepeng/agentchan/commit/a956cca66ff8416e1390a0bb1b170165687e6b60))
* add resizable split pane between output and chat panel ([#9](https://github.com/icepeng/agentchan/issues/9)) ([6ce3471](https://github.com/icepeng/agentchan/commit/6ce34715dec43793d4694eadcc746579ed8af2b0))


### Bug Fixes

* remove iconArgs; crashing on ubuntu ci ([c1aa0db](https://github.com/icepeng/agentchan/commit/c1aa0db6c1dae0400550d945d82fd2199b748f36))


### Refactoring

* **server:** 3-layer architecture with Hono Context DI ([#7](https://github.com/icepeng/agentchan/issues/7)) ([ee120d1](https://github.com/icepeng/agentchan/commit/ee120d19c498359cb3f7bf020783eae9f7ff3913))

## [0.1.2](https://github.com/icepeng/agentchan/compare/v0.1.1...v0.1.2) (2026-04-05)


### Bug Fixes

* use correct --windows-icon flag for exe build ([1d85bb2](https://github.com/icepeng/agentchan/commit/1d85bb2fb22384e3642a038a1d7a2b620021dfc0))

## [0.1.1](https://github.com/icepeng/agentchan/compare/v0.1.0...v0.1.1) (2026-04-05)


### Bug Fixes

* use explicit Bun.serve() for compiled exe to stay alive ([8d82dbf](https://github.com/icepeng/agentchan/commit/8d82dbf3bf1b5bf74bd13e3a324f690eda2bd8ac))

## [0.1.0](https://github.com/icepeng/agentchan/compare/v0.0.1...v0.1.0) (2026-04-05)


### Features

* add release automation ([80dd58d](https://github.com/icepeng/agentchan/commit/80dd58d91253e40b806eb4514282f4d71564cfbd))


### Refactoring

* rename project duplicate i18n keys to clarify settings-only copy ([88f2221](https://github.com/icepeng/agentchan/commit/88f2221f58afa98d3f39c9c6b6cb18f13c2dcfcc))
