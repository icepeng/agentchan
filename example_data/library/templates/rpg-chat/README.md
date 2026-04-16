---
name: RPG Chat
description: 저무는 항구 도시 살레른 — 사라진 아이들을 쫓는 3막 서사 RPG. 9 엔딩·고정 동료·이중 테마 UI.
---

# RPG 챗 — 살레른 항구의 3막 서사

전쟁 후 5년, 쇠락하는 항구 도시 **살레른**. 세 권력(몰락 귀족·상인 길드·암시장)이 도시를 갈라 쥔 밤. 이름 없는 여행자(유저)로 도착해 실종된 고아들의 행방을 쫓고, 3막 동안 **9가지 엔딩** 중 하나로 수렴하는 서사 RPG 템플릿입니다.

## 무엇이 들어있나

- **4 속성 판정** — 힘 / 민첩 / 통찰 / 화술. DC 10/14/18 + 어드밴티지
- **전사·도적·학자** 3 프리셋. 학자는 **9 주문 3 학파**(원소·회복·환영) 중 4개 선택
- **고정 동료 리우** — 견습 도적. 개인 퀘스트 `옛 길드의 유령`과 3 경로 분기(돕기·무시·배신)
- **8 NPC** — 각자의 표면·진심·거짓말. 관계 축 `trust` −5 ~ +5 로 정보 잠금
- **3 막 고정 + 9 엔딩** — `campaign.yaml` 의 막 게이트 조건식이 자연스러운 전환 시점 판단
- **라운드제 전투** — 4 카테고리(공격·방어·마법·아이템) + 소프트 죽음(의식불명 → 3라운드 유예)
- **분 단위 시간 + 장소 메쉬** — `door_to` 로 연결된 7 장소, 이동에 실제 시간 소모
- **이중 테마** — 평상(양피지) ↔ 전투(촛불·피)로 `[STATUS] mode` 값에 따라 자동 전환
- **3분할 UI** — 좌 파티 카드 · 중앙 씬 · 우 탭(퀘스트/인벤/관계/로그). 모두 순수 CSS, JS 없음

## 이렇게 쓰세요

**첫 턴**에 3 프리셋 카드가 뜨면 하나 선택. Act 1 오프닝 씬이 자동 생성됩니다.
이후 자유 입력 + `[CHECK]` 판정 버튼으로 진행. 핵심 메카닉은 전부 스크립트가 계산하므로, 서사의 흐름에 집중하면 됩니다.

## 파일 구성

```
files/
├── pc.md                        # 플레이어 시트 (프리셋 선택 후 채워짐)
├── party.yaml                   # PC + 리우 HP/MP/trust/상태이상
├── stats.yaml                   # 비-동료 NPC 8명의 trust
├── inventory.yaml               # 소지품 + 증거
├── quests.yaml                  # 메인 / 동료 / 사이드 3 트랙
├── world-state.yaml             # 현재 시각·장소·날씨·막
├── spells.yaml                  # 9 주문 카탈로그
├── campaign.yaml                # [숨김] 3막 게이트·9엔딩 조건·진상
├── companion-secrets.yaml       # [숨김] 리우 개인 퀘스트·배신 트리거
├── npc-intents.yaml             # [숨김] NPC 8명의 내심·거짓말·해금 조건
├── characters/                  # NPC + 동료 카드 (감정별 에셋 포함)
├── locations/                   # 7 장소 메쉬 (door_to 연결)
├── pregens/                     # 전사·도적·학자 프리셋 카드
├── personas/                    # 기본 페르소나
├── references/                  # RP · 전투 서사 가이드
├── scenes/scene.md              # 씬 본문 (append-only)
└── world/
    ├── setting.md               # 세계관 개요
    └── lore/*.md                # 집단·장소·문화·역사 (10종, 필요시 read)
```

**숨김 파일 3개**는 `[숨김]` 표시된 것으로, 에이전트만 read로 참조하고 씬·대사·OOC에 직접 노출되지 않습니다. 렌더러도 이 파일들은 UI에 표시하지 않습니다.

## 커스터마이즈 가이드

### `SYSTEM.md`
프로젝트 행동의 단일 원천. 14 섹션으로 구성되어 있습니다:
- 역할 · 세션 플로우 · 출력 형식 마커 · **스크립트 호출 규약** · 4속성 판정
- 관계 · 전투 · **마법** · 세계 시뮬 · 3막 게이트 · 동료 관계
- 엔딩 수렴 · 죽음 규칙 · 숨김 파일 규약 · 세션 이어가기 · 금칙

톤·규칙·세계관 근본을 바꾸고 싶으면 여기를 편집.

### `files/campaign.yaml` · `companion-secrets.yaml` · `npc-intents.yaml`
서사의 뼈대. 다른 사건으로 리스킨하려면:
- `campaign.yaml`: 진상(culprit/motivation) · 9 엔딩의 `act3_gate` 조건식
- `companion-secrets.yaml`: 리우의 자리에 다른 동료 프로필 + 개인 퀘스트
- `npc-intents.yaml`: 8 NPC의 표면·진심·거짓말·해금 조건

### 난이도 조절
- **쉽게**: `campaign.yaml` 의 `act_gates` 에서 `clues_found>=3` 을 `>=2` 로. `spells.yaml` 의 `dc` 낮추기
- **어렵게**: 숨김 파일의 `reveal_conditions` 에 `confront` (거짓말 깨부수기) 게이트를 늘림. `trust_threshold` 를 +5 로 상향

### 엔딩 커스터마이즈
9 엔딩 중 일부를 바꾸려면 `campaign.yaml endings.<slug>.act3_gate` 조건식만 수정. 조건식 문법은 파일 상단 주석 참조.

## 구현 상태

- ✅ **M0**: DataFile variant (packages/creative-agent)
- ✅ **M1**: 숨김 파일 3종 + SYSTEM.md 14섹션 + 초기 상태 파일 6종
- ✅ **M2**: 결정론 스크립트 7종 (dice-roll / combat / travel / relationship / quest-progress / act-transition / ending-check) + 세션 1회성 skill 3종 (start-scene / act-transition / ending-check) + 제작 meta skill 3종 (build-renderer / characters / world-building). 빈번 스크립트는 skill 래핑 없이 SYSTEM.md §3a 트리거 표로 직접 호출
- ✅ **M3**: 세계관 콘텐츠 (8 NPC 카드·7 장소·3 프리젠) + 로어 문서 10종 (`files/world/lore/`)
- ✅ **M4**: 렌더러 전면 재작성 (3분할 + 이중 테마)
- ✅ **M5**: 자가검증 완료 — 트랜스파일·타입·린트·숨김파일 가드·마커 파싱 모두 통과

**스크립트 출력 규약**: 모든 스크립트가 파일을 **직접 수정** 하고 stdout 마지막 줄에 `{changed, deltas, summary, scene_block?}` JSON 한 줄을 반환. 에이전트는 결과를 받아 내러티브에 녹이고 (`scene_block` 이 있으면 그대로 `scene.md` 에 append) — 파일 재적용 단계 없음.

## 더 알아보기

- 수사·서스펜스 톤을 더 순수하게 즐기고 싶으면 **Sentinel** 템플릿이 더 집중적입니다
- RPG 메카닉을 빼고 분위기만 즐기고 싶으면 **Character Chat** 이 더 가볍습니다
- 세션 중에 규칙을 바꾸고 싶으면 OOC 로 요청하거나 Edit Mode 에서 `SYSTEM.md` 를 손보세요
