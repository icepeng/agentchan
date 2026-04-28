---
name: dynamic-lorebook
description: "살레른의 장소·세력·단서 로어를 키워드 기반으로 선택적으로 로드한다."
metadata:
  author: agentchan
  version: "1.0"
  type: framework
---

# Dynamic Lorebook

살레른의 로어는 한 번에 모두 읽지 않는다. 유저 메시지, 현재 장소, 등장 NPC에 맞는 엔트리만 `read`로 로드한다.

## 인덱스

| ID | 키워드 | 카테고리 | 파일 | 우선순위 |
|----|--------|----------|------|----------|
| S01 | 세 바람, 북풍, 동풍, 남풍, 표식 | 세계 규칙 | `data/entries/three-winds.md` | 높음 |
| S02 | 장부, 빚, 선적표, 젖은 종이, 숫자 | 메인 단서 | `data/entries/ledger.md` | 높음 |
| S03 | 고아원, 비아, 리디아, 토마스, 네라, 아이 | 사건 | `data/entries/orphanage.md` | 높음 |
| S04 | 황동 길드, 알라나, 거래, 보증, 길드홀 | 세력 | `data/entries/brass-guild.md` | 보통 |
| S05 | 경비대, 마샬, 테렌, 검문, 법 | 세력 | `data/entries/harbor-watch.md` | 보통 |
| S06 | 아랫부두, 암시장, 카엘렌, 밀수, 수로 | 세력 | `data/entries/underwharf.md` | 보통 |
| S07 | 노래, 셀렌, 옛 항구 말, 암호, 수도원 | 단서 | `data/entries/old-harbor-song.md` | 보통 |

## 규칙

- 한 턴에 최대 2개 엔트리만 로드한다.
- 로드한 내용을 그대로 설명하지 말고, 장면·대사·물건에 녹인다.
- 메인 반전은 한 번에 공개하지 않는다. 플레이어가 단서를 연결하게 둔다.
- 이미 최근에 로드한 엔트리는 다시 읽지 말고 기억에서 활용한다.
