# Changelog

## [0.4.0](https://github.com/icepeng/agentchan/compare/v0.3.0...v0.4.0) (2026-05-07)


### Features

* add browser-safe session subpath ([df91d8d](https://github.com/icepeng/agentchan/commit/df91d8ddb1665be215586ca0499db5fb5e32224e)), closes [#173](https://github.com/icepeng/agentchan/issues/173)
* **build:** add startup smoke test to build:exe (closes [#153](https://github.com/icepeng/agentchan/issues/153)) ([f00b527](https://github.com/icepeng/agentchan/commit/f00b527834589eafbb3eb1dae57aa7ec620e1064))
* **config:** context window/max tokens 기본값을 모델 메타데이터에 연동 ([0b2fec9](https://github.com/icepeng/agentchan/commit/0b2fec9716023dd75deec6a10b4df415c0c4501a))
* **config:** 기본 추론 effort를 medium으로, off는 명시 영구화 ([#109](https://github.com/icepeng/agentchan/issues/109)) ([ceaa4dc](https://github.com/icepeng/agentchan/commit/ceaa4dcb5fb8c3054dd4168daad6cab43f5c24b4))
* **creative-agent:** session header에 version 필드 추가 ([#117](https://github.com/icepeng/agentchan/issues/117)) ([68cf0e2](https://github.com/icepeng/agentchan/commit/68cf0e239dbc1a987ceb24e38eee7abc9ceb049b))
* **i18n:** 슬래시 커맨드 description 다국어 적용 ([#107](https://github.com/icepeng/agentchan/issues/107)) ([3971b4a](https://github.com/icepeng/agentchan/commit/3971b4ab77864db34949e83ef6930915105afefe))
* **onboarding:** 3단계 확장 — 첫 프로젝트 템플릿 선택 + Templates 방어선 ([3675b86](https://github.com/icepeng/agentchan/commit/3675b8650178bb3bd7b7ec9cc5085b7d7bd3e781))
* **onboarding:** featured 템플릿을 three-winds-ledger → tides-of-moonhaven으로 교체 ([37ac517](https://github.com/icepeng/agentchan/commit/37ac517de62905da9290c7812921b432c6891861))
* **playtest:** 템플릿 자가검증 skill 추가 ([b46b313](https://github.com/icepeng/agentchan/commit/b46b31301e65cfdfeb9f48d1a7dbc2b4f12afb2c))
* **providers:** zai whitelist + GitHub Copilot subscription 연동 ([fcc983e](https://github.com/icepeng/agentchan/commit/fcc983eb81e2d963d7bb2a8bcced452811844138))
* **release:** ship prod-only renderer vendor fixture, drop runtime sidecar (closes [#164](https://github.com/icepeng/agentchan/issues/164), PRD [#160](https://github.com/icepeng/agentchan/issues/160)) ([c1ee2cb](https://github.com/icepeng/agentchan/commit/c1ee2cb133c2574c4d1dbcc89796862d0bfcd295))
* **renderer-vendor:** auto-prepare dev fixtures on bun run dev (closes [#163](https://github.com/icepeng/agentchan/issues/163), PRD [#160](https://github.com/icepeng/agentchan/issues/160)) ([97a0679](https://github.com/icepeng/agentchan/commit/97a067953eaebfd55c38eafd96e0d720b51e5cb2))
* **renderer:** externalize baseline React via importmap (closes [#162](https://github.com/icepeng/agentchan/issues/162), PRD [#160](https://github.com/icepeng/agentchan/issues/160)) ([9a54d5d](https://github.com/icepeng/agentchan/commit/9a54d5d878791d5ec332b170977508bf9537a93f))
* **renderer:** make v1 contract React-first ([#123](https://github.com/icepeng/agentchan/issues/123)) ([7c0ea13](https://github.com/icepeng/agentchan/commit/7c0ea13789c06c65f56f1b95b6e7a0f2ef746e9e))
* **renderer:** 스트리밍 중 pending 상태를 렌더러에 주입 ([#80](https://github.com/icepeng/agentchan/issues/80)) ([2b77c80](https://github.com/icepeng/agentchan/commit/2b77c80cec030f5eed9b7cace42e5954d68ee264))
* **renderer:** 프로젝트 전환 시 렌더러 cross-fade + 테마 transition 300ms 통일 ([ddf8644](https://github.com/icepeng/agentchan/commit/ddf8644ec49e90b760359dde310da7d97457d137))
* **rpg-chat:** Scriptorium Ritual 대기 UI + 템플릿 전면 개편 ([#102](https://github.com/icepeng/agentchan/issues/102)) ([770e39b](https://github.com/icepeng/agentchan/commit/770e39bd9ab0920616478b419fc3e42dfcdd832a))
* **rpg-chat:** Vellum Day 렌더러 재디자인 + 캐릭터 색 교정 ([2f311cb](https://github.com/icepeng/agentchan/commit/2f311cb0130f312ff63ada815e4d3ab5e06ce4b5))
* **rpg-chat:** 살레른 항구 3막 서사 RPG로 템플릿 개편 ([fdd90ad](https://github.com/icepeng/agentchan/commit/fdd90ad776e13f9cd27188d03e95d0a516aa8097))
* **rpg-chat:** 우측 appendix 카드 margin gloss 재디자인 ([2792874](https://github.com/icepeng/agentchan/commit/27928745e0efd4640d1dcd276f4b74006ae7e937))
* **script-tool:** sqlite/stat capability 추가 + journal-search 마이그레이션 ([4107424](https://github.com/icepeng/agentchan/commit/4107424eb4d15e9bc9b248c49e0b0967e1086250))
* **sentinel:** 수사극 깊이 강화 — 반전·단서 게이트·엔딩 분기 도입 ([551d375](https://github.com/icepeng/agentchan/commit/551d375f810e2a37c833254270d07f99ce6b54d9))
* **template:** rpg-chat을 Tides of Moonhaven으로 리브랜딩 ([#106](https://github.com/icepeng/agentchan/issues/106)) ([33a06d3](https://github.com/icepeng/agentchan/commit/33a06d3995092da95512c47c5b489a6a2671ed97))
* **template:** three-winds-ledger pending UI를 채팅바 위 sentinel로 고정 + RPG 문구 치환 ([5b22ba8](https://github.com/icepeng/agentchan/commit/5b22ba8b1c04c658c422e262ca998ac892850e64))
* **tides-of-moonhaven:** append 도구 ritual scene 추가 ([08c006d](https://github.com/icepeng/agentchan/commit/08c006d03e8b9d6011bf6e8a78031e50bc46ee73))
* **webui:** auto-select most recent creative session on project entry ([5e7f7cc](https://github.com/icepeng/agentchan/commit/5e7f7cc8f53745453b3e5f940e632fff8630c230))
* **webui:** 외부 템플릿 신뢰 동의 시스템 추가 ([#120](https://github.com/icepeng/agentchan/issues/120)) ([bc36cfa](https://github.com/icepeng/agentchan/commit/bc36cfaa33bee878e5f3f5d3bcd682acbc11b130))
* 새 버전 출시 알림 기능 추가 ([91e1ba7](https://github.com/icepeng/agentchan/commit/91e1ba77de9ec2da5c0973d176dba9dcce88506a))


### Bug Fixes

* **afk:** recover from partial-fail in git worktree remove on Windows ([177fdef](https://github.com/icepeng/agentchan/commit/177fdef10f705fa55c774fec0442c9eee220107b))
* **afk:** scope worktree cleanup to bun descendants only ([14583cc](https://github.com/icepeng/agentchan/commit/14583ccc36e5994d2783aea6f95676f4f686630b))
* **agent:** convert Pi custom message roles to LLM-compatible messages ([b305b2d](https://github.com/icepeng/agentchan/commit/b305b2de93aabad2bf910f44af90acb7c923c314))
* **config:** thinkingLevel을 서버 DTO로 내려보내 client runtime import 제거 ([e939223](https://github.com/icepeng/agentchan/commit/e93922361be950e791bae6b27df4e5f577e7316c))
* **editor:** SWR 이주 이후 발생한 회귀 버그 수정 ([d53d683](https://github.com/icepeng/agentchan/commit/d53d683a050e4dcf994b5e097e90a62fa80ab987))
* **hooks:** husky 훅에 shebang 추가로 Windows Exec format error 대응 ([7d1e64d](https://github.com/icepeng/agentchan/commit/7d1e64d9c5f3aa6c87630d22ca3b7054141d3b99))
* **project:** off-screen 전환 시 stale 렌더러 출력 회귀 방지 ([e12a067](https://github.com/icepeng/agentchan/commit/e12a0670b26d91302a48424d5164f566e08a8723))
* **project:** 스트리밍 중 pending UI 갱신으로 스크롤이 끌려내려가는 문제 수정 ([338a9ad](https://github.com/icepeng/agentchan/commit/338a9ad05b7e93c0149f49d491a8dbbe8d69457a))
* **renderer-vendor:** React identity 단일화 + import binding mutability 복원 (PRD [#160](https://github.com/icepeng/agentchan/issues/160)) ([7e6bad0](https://github.com/icepeng/agentchan/commit/7e6bad0a2767ebc15bdf2a28ae0ee49699efdbe6))
* **script-tool:** description을 LLM 호출 인터페이스로 복원 ([#110](https://github.com/icepeng/agentchan/issues/110)) ([8bcbb5d](https://github.com/icepeng/agentchan/commit/8bcbb5dd4c847ae56884e73dbdf5317f075e6750))
* **stream:** pi AgentState subset으로 AgentPanel + Renderer 인터페이스 통일 ([#108](https://github.com/icepeng/agentchan/issues/108)) ([eeef624](https://github.com/icepeng/agentchan/commit/eeef624e658a80b8ad202cd005385900dc82b5d6))
* **three-winds-ledger:** 전투 모드 테마를 렌더러 바깥까지 확장 ([#71](https://github.com/icepeng/agentchan/issues/71)) ([23d58ad](https://github.com/icepeng/agentchan/commit/23d58add4b04a26d1d070892527f61d059b7720a))
* **tides-of-moonhaven:** character builder listener 누적 버그 국소 패치 ([6fb1000](https://github.com/icepeng/agentchan/commit/6fb100033d62dfb4e72bdf894f75b2c31228c1e6))
* **tides-of-moonhaven:** core cast eager read + 첫 장면 등장 유보 ([5aa45e9](https://github.com/icepeng/agentchan/commit/5aa45e96e36a6b3e59ba54cd04d1eda4bf0e0be5))
* Usage 표기 불일치 ([#156](https://github.com/icepeng/agentchan/issues/156)) ([f59454b](https://github.com/icepeng/agentchan/commit/f59454b74ed4453956e15aab339ec7c0fc91f81d))
* **webui:** CodeMirror state/view/language dedupe로 syntax highlighting 회귀 수정 ([6d96ecd](https://github.com/icepeng/agentchan/commit/6d96ecd9fe6a49130a7b8bc693cc6c9fe1ec301a))
* **webui:** StreamingMessage 멀티스텝 툴 호출 플리커 제거 ([#119](https://github.com/icepeng/agentchan/issues/119)) ([c5c33f6](https://github.com/icepeng/agentchan/commit/c5c33f6e43a6e859d60aa5ebf64be408c1185917))
* **webui:** trigger SWR fetch in useProject orchestration ([54555ad](https://github.com/icepeng/agentchan/commit/54555ad7889d2da039d8368bd09f08a6a6c2e444))
* **webui:** 알림 클릭 시 탭 배지 즉시 해제 ([#116](https://github.com/icepeng/agentchan/issues/116)) ([3c7c5b0](https://github.com/icepeng/agentchan/commit/3c7c5b0b6d465ddbf7da0fb7de5675efa56b8bfc))
* **webui:** 에디터 복귀 시 렌더러 invisible 회귀 — layerHandle ref로 closure capture race 해소 ([1c66553](https://github.com/icepeng/agentchan/commit/1c665531c046cfcd756e0f10dfc960364ad03cbc))
* 프로젝트 전환 시 테마 flash 제거 + 부드러운 색상 전환 ([#67](https://github.com/icepeng/agentchan/issues/67)) ([3b76e94](https://github.com/icepeng/agentchan/commit/3b76e945129635e45663942faf672157d6acde20))


### Performance

* **editor:** CodeMirror로 buffer 승격해 keystroke당 리렌더 제거 ([c9155c8](https://github.com/icepeng/agentchan/commit/c9155c8898b522a44919e76de6d501fe4a8ce207))


### Refactoring

* **afk:** bound memory, idle timeout, and resumable state ([8c41979](https://github.com/icepeng/agentchan/commit/8c41979a08e0b67be74984a92adc4f223427aabe))
* **agent:** split orchestration helpers ([cdbc4fb](https://github.com/icepeng/agentchan/commit/cdbc4fbdc8add8e5ceaa6b1d50584f57f5657738))
* **agent:** split orchestration helpers ([92564dc](https://github.com/icepeng/agentchan/commit/92564dc92ae607402ae85d7160a7ace4ab2305b5))
* **appshell:** resolvedTheme useMemo 제거 ([60bfd72](https://github.com/icepeng/agentchan/commit/60bfd7241bf6e4c6fea06b746a60808977c64f5e))
* **build:** split smoke-test stream reader from chunk handlers ([c271bd1](https://github.com/icepeng/agentchan/commit/c271bd1ccb8c8bb6d56f6922b81aa9e4ee9e7930))
* **chat,settings:** chat 보조 훅 + useTheme 수동 메모 제거 ([b649290](https://github.com/icepeng/agentchan/commit/b6492903f5b0ffe4b585fcd7c0d90e3dd5759cd7))
* **chat:** AgentPanel useMemo 제거 (React Compiler 위임) ([73acc91](https://github.com/icepeng/agentchan/commit/73acc91343ea8d7e8b2557f7c1c2d784622a0be6))
* **chat:** MessageBubble useMemo 3개 제거 (React Compiler) ([62f8825](https://github.com/icepeng/agentchan/commit/62f88259c9eba8380d4b90f913306409c2894916))
* **chat:** stream 종료 후에도 multi-tool agent 턴을 단일 bubble로 유지 ([#79](https://github.com/icepeng/agentchan/issues/79)) ([170b18c](https://github.com/icepeng/agentchan/commit/170b18c48ac21ac5ef4bc208ee8942cabe9746e9))
* **chat:** useSession의 수동 메모이제이션 제거 ([b440b20](https://github.com/icepeng/agentchan/commit/b440b2053df7d3a4c9f7f15aa466cc9623465e21))
* **chat:** useStreaming ref-sync effect 7개 통합 + 하드코딩 i18n 처리 ([9ac06f1](https://github.com/icepeng/agentchan/commit/9ac06f1ab86c25dfc5cf5cd2ad3561140a68f379))
* **chat:** useStreaming regenerate useCallback 제거 ([5c2d780](https://github.com/icepeng/agentchan/commit/5c2d780feff0ee64e99d0700242481db884e4681))
* **client:** SWR로 서버-상태 캐싱 이주 ([9d84021](https://github.com/icepeng/agentchan/commit/9d840215da35c35593ca0589dbc4842dd1490520))
* Conversation → Session, Session(runtime) → ProjectRuntime ([#81](https://github.com/icepeng/agentchan/issues/81)) ([f952db7](https://github.com/icepeng/agentchan/commit/f952db726e9457db28cf86d38f954546ea2a0610))
* **creative-agent:** pi-coding-agent thin wrapper 제거 ([7ff687f](https://github.com/icepeng/agentchan/commit/7ff687fa867ab1314c2d4b5fd39293f5ffb63dc7))
* **creative-agent:** vendor pi-coding-agent session helpers (closes [#155](https://github.com/icepeng/agentchan/issues/155)) ([05c8f2d](https://github.com/icepeng/agentchan/commit/05c8f2d3f1e58092c6a4b7007aa9a7caf6c1113e))
* **editor:** client-first 동기 모델로 회귀 — SWR 읽기 경로 제거 ([442b601](https://github.com/icepeng/agentchan/commit/442b601c7a9bb1b6d00688d472d87c29761ab4fa))
* **editor:** FileEditor/EditModePanel 수동 useCallback 제거 ([3a9fc95](https://github.com/icepeng/agentchan/commit/3a9fc955b393e2a8688c74d050cc087c97639310))
* **editor:** FileTree 수동 메모이제이션 제거 ([fde8ec3](https://github.com/icepeng/agentchan/commit/fde8ec3296658a8abaf2a38cf5e0fef3fc6bb687))
* **editor:** SWR을 단일 source of truth로 — 파생 dirty/fileContent ([2323dec](https://github.com/icepeng/agentchan/commit/2323decf6ff7509caa13ccff467fb6416fa9015c))
* **entities:** project-runtime을 stream/renderer/selection으로 분해 ([#82](https://github.com/icepeng/agentchan/issues/82)) ([942af3f](https://github.com/icepeng/agentchan/commit/942af3fa1c17dd2c0a3b9b6978a723dec413a80f))
* **oauth:** features/oauth 모듈 추출 + 온보딩 GitHub Copilot 지원 ([9e0b7e5](https://github.com/icepeng/agentchan/commit/9e0b7e5034ff62f890cc4ccb430d74f48b058a0d))
* **project,editor:** useProject / useEditMode의 useCallback 23개 제거 ([49fe1e9](https://github.com/icepeng/agentchan/commit/49fe1e95b40fdf13f40f29fed2d4ffabfc36fc8c))
* **ProjectPage:** React Compiler 적용으로 불필요한 useCallback 제거 ([c748f60](https://github.com/icepeng/agentchan/commit/c748f60e0f97b287580cd51033aafcd72d2b8cb3))
* **project:** ProjectTabs useCallback 제거 (React Compiler 위임) ([b7297a8](https://github.com/icepeng/agentchan/commit/b7297a8c5e292b2211c8aa2c1352dcebd5695929))
* **project:** SaveAsTemplateModal 수동 메모이제이션 제거 ([67686a3](https://github.com/icepeng/agentchan/commit/67686a34445fb22e674479b0d492ed959da61fb5))
* renderer message contract cleanup (closes [#172](https://github.com/icepeng/agentchan/issues/172)) ([2772686](https://github.com/icepeng/agentchan/commit/277268682133dddc1a3f2c75f318f4fbcf435b64))
* **renderer:** move builder pipeline to @agentchan/renderer/build (closes [#159](https://github.com/icepeng/agentchan/issues/159)) ([cd7145b](https://github.com/icepeng/agentchan/commit/cd7145b3cb2e1af5067b2093e9c94b5e01f7b3f5))
* **ResizeHandle:** remove unnecessary useCallback for handleMouseDown ([61e73e3](https://github.com/icepeng/agentchan/commit/61e73e3feab02e70b8c95347ca01e55ab4d9aef6))
* **script-tool:** (args, ctx) 패턴으로 주입 인터페이스 확정 ([#105](https://github.com/icepeng/agentchan/issues/105)) ([93ccf73](https://github.com/icepeng/agentchan/commit/93ccf73c3beb1c58c034cdc6067fe7128040fc9f))
* **sentinel:** 스킬 분리 + 감정 삽화 파이프라인 정리 ([8cb1f73](https://github.com/icepeng/agentchan/commit/8cb1f7398a88a16ab5be2865cde663baef6927d4))
* **session:** SessionState 대칭화 + conversation 엔티티 분리 ([#76](https://github.com/icepeng/agentchan/issues/76)) ([a74882c](https://github.com/icepeng/agentchan/commit/a74882c2bdb542db9627d3880fbf3bc115905cb2))
* simplify llm conversion message contract ([719ec4e](https://github.com/icepeng/agentchan/commit/719ec4edbfa1ba9028681bd31c8a6362c21da2e7))
* **stream:** reducer 헬퍼 + rAF tick guard + 죽은 export 정리 ([49da6ee](https://github.com/icepeng/agentchan/commit/49da6ee2cfb9d96898d7f0ba556f7212c71a1f76))
* **stream:** tool call 수명주기를 선형 phase markers + result sentinel로 재정비 ([01f1d59](https://github.com/icepeng/agentchan/commit/01f1d59a49dac31df61c0a10bee493df260a43f7))
* **stream:** tool call의 dead `parallel` 축 제거 ([869243e](https://github.com/icepeng/agentchan/commit/869243ea6f74eaaa835486f73e17ec676f939607))
* **swr:** selectProject 중복 GET 제거 + invariant 코멘트 ([f7be69b](https://github.com/icepeng/agentchan/commit/f7be69be3f1ee176b429344d6a4ddd5b724a036e))
* **templates:** 불필요한 useCallback/useMemo 제거 (React Compiler) ([2e1932b](https://github.com/icepeng/agentchan/commit/2e1932be29eb6ce974673a574efe372d3643610d))
* **template:** three-winds-ledger SYSTEM.md UI 어휘 제거 + 턴 전체 트레이스 예시로 교체 ([a0dc5ee](https://github.com/icepeng/agentchan/commit/a0dc5ee149301eb0e007a1d3e5ef1d5ceb9f1f80))
* **template:** three-winds-ledger 상태 원천화 + intent 분할 + 문서 축약 ([90fa17d](https://github.com/icepeng/agentchan/commit/90fa17df33ac9d443a0d1969a204a0a90923f1a1))
* **three-winds-ledger:** XML 마커 전환 + 프롬프트 재구조 + references 분리 ([#75](https://github.com/icepeng/agentchan/issues/75)) ([d3dd94b](https://github.com/icepeng/agentchan/commit/d3dd94bd2c56b7147fd43af2c0726226b7e707d0))
* UpdateBanner 접근성 수정 + useUpdateStatus fetch 공유 ([c9ccdc6](https://github.com/icepeng/agentchan/commit/c9ccdc6656d99ed8c37f68feb0ed527dffa5c58c))
* **webui:** consolidate navigation into a single view discriminated union ([8c4e435](https://github.com/icepeng/agentchan/commit/8c4e435a5396813104b4133f49f593380ae87767))
* **webui:** consolidate session-to-open resolution in useProject ([1c65fcf](https://github.com/icepeng/agentchan/commit/1c65fcfdea2d19d97e3d09a43feb03a363b99848))
* **webui:** edit mode localStorage persist 제거 ([74a2af2](https://github.com/icepeng/agentchan/commit/74a2af27260494c07d34086aef3b8f780d23024d))
* **webui:** localStorage를 shared/storage.ts로 중앙집중 + ESLint rule로 강제 ([0b9fe61](https://github.com/icepeng/agentchan/commit/0b9fe613d3c93f90bc0e14c68bedcbb35aff1782))
* **webui:** move project file serving into service ([ce524f8](https://github.com/icepeng/agentchan/commit/ce524f8c8c2527b9ee00af8c799b966fde19d958))
* **webui:** move project file serving into service ([8339a4d](https://github.com/icepeng/agentchan/commit/8339a4d2cb70905cd93fd090e589c9b3e66b2ba8))
* **webui:** onboarding/oauth useMemo 제거 ([7751b65](https://github.com/icepeng/agentchan/commit/7751b65ab081f41f389c4ff21b9d64f23d007968))
* **webui:** renderer presentation lifecycle as pure reducer (closes [#148](https://github.com/icepeng/agentchan/issues/148)) ([#157](https://github.com/icepeng/agentchan/issues/157)) ([7cb5177](https://github.com/icepeng/agentchan/commit/7cb517763c82d805a15898fd5613c48200ad579f))
* **webui:** split config service helpers ([35ae783](https://github.com/icepeng/agentchan/commit/35ae783f6d06b1ae7c7a2a6aad35617f99eb4666))
* **webui:** split config service helpers ([56832d5](https://github.com/icepeng/agentchan/commit/56832d59df785cb5e0b8512289e1966849c2fdd0))
* **webui:** split settings view components ([79a7e9b](https://github.com/icepeng/agentchan/commit/79a7e9bf083d771e3b071879b9de5f21ac6b2c80))
* **webui:** split settings view components ([7a4cd9e](https://github.com/icepeng/agentchan/commit/7a4cd9eebe01db0341b9ec6c94dfe52ed63a2666))
* **webui:** tidy viewReducer helpers and tighten view-state access ([3b7c88e](https://github.com/icepeng/agentchan/commit/3b7c88eb5db1d0b174c741d643cfc846e53d0384))
* **webui:** 좌하단 스킬 목록 UI 제거 ([fc6a30d](https://github.com/icepeng/agentchan/commit/fc6a30d118e5500a6e3f712b48c179c63052868a))

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
