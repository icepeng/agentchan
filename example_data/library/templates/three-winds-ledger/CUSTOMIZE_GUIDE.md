# 커스터마이즈 가이드

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
├── characters/                  # NPC + 동료 카드 (감정별 에셋 포함)
│   └── <slug>/intent.yaml       # [숨김] 개별 NPC 의 내심·거짓말·해금 조건
├── locations/                   # 7 장소 메쉬 (door_to 연결)
├── pregens/                     # 전사·도적·학자 프리셋 카드
├── personas/                    # 기본 페르소나
├── references/                  # RP · 전투 서사 가이드
├── scenes/scene.md              # 씬 본문 (append-only)
└── world/
    ├── setting.md               # 세계관 개요
    └── lore/*.md                # 집단·장소·문화·역사 (10종, 필요시 read)
```

**[숨김] 표시된 파일들**은 에이전트만 read로 참조하고 씬·대사·OOC에 직접 노출되지 않습니다. 렌더러도 이 파일들은 UI에 표시하지 않습니다. `characters/<slug>/intent.yaml`은 캐릭터마다 하나씩 존재 — 에이전트는 해당 씬에 등장하는 NPC의 intent만 read.

## `SYSTEM.md`
프로젝트 행동의 단일 원천. 14 섹션으로 구성되어 있습니다:
- 역할 · 세션 플로우 · 출력 형식 마커 · **스크립트 호출 규약** · 4속성 판정
- 관계 · 전투 · **마법** · 세계 시뮬 · 3막 게이트 · 동료 관계
- 엔딩 수렴 · 죽음 규칙 · 숨김 파일 규약 · 세션 이어가기 · 금칙

톤·규칙·세계관 근본을 바꾸고 싶으면 여기를 편집.

## `files/campaign.yaml` · `companion-secrets.yaml` · `characters/<slug>/intent.yaml`
서사의 뼈대. 다른 사건으로 리스킨하려면:
- `campaign.yaml`: 진상(culprit/motivation) · 9 엔딩의 `act3_gate` 조건식
- `companion-secrets.yaml`: 리우의 자리에 다른 동료 프로필 + 개인 퀘스트
- `characters/<slug>/intent.yaml`: 개별 NPC의 표면·진심·거짓말·해금 조건 (NPC마다 한 파일)

## 난이도 조절
- **쉽게**: `campaign.yaml` 의 `act_gates` 에서 `clues_found>=3` 을 `>=2` 로. `spells.yaml` 의 `dc` 낮추기
- **어렵게**: 숨김 파일의 `reveal_conditions` 에 `confront` (거짓말 깨부수기) 게이트를 늘림. `trust_threshold` 를 +5 로 상향

## 엔딩 커스터마이즈
9 엔딩 중 일부를 바꾸려면 `campaign.yaml endings.<slug>.act3_gate` 조건식만 수정. 조건식 문법은 파일 상단 주석 참조.

