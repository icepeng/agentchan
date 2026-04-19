---
name: RPG Chat
description: 다음 행동 선택지·판정·페르소나 부트스트랩·분위기 테마가 묶인 가벼운 RPG RP 채팅.
---

# RPG 챗

캐릭터 롤플레이에 가벼운 RPG 메카닉을 얹은 템플릿입니다. 상태·인벤토리·퀘스트는 yaml로 분리해 안정적으로 관리하고, 다음 행동 선택지·판정·분위기 테마 전환으로 게임감을 더합니다.

## 이렇게 쓰세요

- **상태/인벤토리/퀘스트** — `files/status.yaml` `files/inventory.yaml` `files/quest.yaml` 에 매 턴 변동 시 overwrite. 헤더 게이지·Pack Manifest·Standing Charts 가 자동 갱신.
- **다음 행동 선택지** — 매 응답 끝에 `[CHOICES]…[/CHOICES]` 블록이 scene.md에 append. 버튼을 누르면 입력창에 자동으로 채워지고, 자유 입력도 가능합니다.
- **판정** — `dice-roll` 스킬이 실제 주사위(crypto RNG)로 판정. 선택지에 stat/dc 가 명시되어 있으면 해당 능력치로 자동 판정.
- **분위기 테마** — `files/world-state.yaml` 의 `mode` 필드 (peace ↔ combat) 로 양피지 ↔ 어두운 가죽 + 촛불 황금 팔레트 전체 전환.
- **캐릭터/페르소나/세계관/장면** — 캐릭터 챗과 같은 `files/` 구조입니다.

## 더 알아보기

- RPG 메카닉을 빼고 분위기만 즐기고 싶으면 **Character Chat** 이 더 가볍습니다.
- 더 농밀한 세션 운영(파티/관계도/숨김 파일)이 필요하면 **Three Winds Ledger** 를 살펴보세요. 단 LLM 비용·복잡도가 큽니다.
- 세션 중에 규칙을 바꾸고 싶으면 OOC로 요청하거나 Edit Mode에서 `SYSTEM.md` 를 손보세요.
