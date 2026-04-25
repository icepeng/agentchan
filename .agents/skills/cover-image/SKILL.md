---
name: cover-image
description: |
  Generates agentchan template/project COVER image — single key-visual illustration
disable-model-invocation: true
---

# Cover Image

Single-shot illustration — 템플릿/프로젝트의 `COVER` 이미지. `character-images`의 `gen-image.ts`를 그대로 재사용한다.

```
[README + SYSTEM이 가리키는 파일들] → COVER.{png|jpg}
```

## Prerequisites

- 프로젝트 루트에서 실행 (bun이 `.env` auto-load)
- `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`

## 대상 경로

| 대상 | 위치 |
|---|---|
| 템플릿 cover | `example_data/library/templates/{name}/COVER.{png\|jpg}` |
| 프로젝트 cover | `apps/webui/data/projects/{slug}/COVER.{png\|jpg}` |

`probeCover()`는 `webp/png/jpg/jpeg/gif/svg/avif` 순으로 탐색. `gen-image.ts`는 `.png`를 요청해도 모델이 jpeg를 반환하면 `.jpg`로 자동 저장하므로 둘 다 허용.

## 1. 입력 수집

- `README.md` frontmatter의 `name`/`description` — 템플릿의 한 줄 정체성
- `SYSTEM.md` body — 장르·톤·핵심 장면
- **SYSTEM.md가 참조하는 `files/…` 경로를 따라 자연스럽게 읽어** 무대·캐스트·분위기의 실제 묘사를 흡수

요약해둘 것:
- 무대 (시공간·공간 성격)
- 중심 갈등 또는 핵심 순간
- 톤 키워드 2~3개

대상 개수와 **개수 × $0.02–0.04 비용**을 공지하고 승인 받는다.

## 2. 스타일 한 줄 결정

템플릿 장르·톤을 한 줄 style anchor로:

| 장르 | style anchor 예시 |
|---|---|
| 판타지 RPG | `고전 JRPG 키비주얼 스타일의 판타지 일러스트` |
| 서스펜스/미스터리 | `네오 누아르 웹코믹 풍의 심야 서스펜스 일러스트` |
| 소설/드라마 | `영화 포스터 스타일의 시네마틱 드라마 일러스트` |
| 게임북/인터랙티브 | `비주얼 노벨 타이틀 화면 스타일` |
| 일상/캐릭터 챗 | `Studio Ghibli 톤의 부드러운 장면 일러스트` |

## 3. 기존 파일 정리

새 cover를 쓰기 **전에** 같은 디렉토리의 모든 확장자 cover를 삭제:

```bash
rm -f example_data/library/templates/{name}/COVER.{png,jpg,jpeg,webp,svg,gif,avif}
```

## 4. 생성

프롬프트 템플릿:

```
{style}로 그린 {장르} 키비주얼.

장면: {무대 한 줄 묘사}
구성: {중심 소재}, {조명·색감}, {카메라 거리/앵글}
무드: {톤 키워드}

좌우로 넓은 와이드 구도, 중앙에 주 피사체. 화면 전체에 분위기.
어떤 글자·텍스트·로고·배지·상표·자막·간판 문구도 없이.
```

각 대상마다 아래 블록을 병렬 발행 (전부 `&`), 마지막에 `wait`:

```bash
bun run .agents/skills/character-images/scripts/gen-image.ts \
  "example_data/library/templates/{name}/COVER.png" --aspect 16:9 <<'PROMPT' &
{prompt}
PROMPT

# ... 대상마다 위 블록 1회씩

wait
```

## 5. 검증

```bash
for T in <targets>; do
  DIR="example_data/library/templates/$T"
  F="$(ls "$DIR"/COVER.png "$DIR"/COVER.jpg 2>/dev/null | head -1)"
  [ -z "$F" ] && { echo "MISSING: $T"; continue; }
  file "$F" | grep -Eq "PNG image|JPEG image" || echo "BAD: $T ($F)"
  ls -l "$F" | awk '{ print $5, $NF }'
done
```

기준: 시그니처가 PNG/JPEG image, 크기 100KB 이상.

## 6. 런타임 동기화 (템플릿 대상)

```bash
bun run example-data:copy -- --force
```

## 실패 복구

| 증상 | 원인 | 복구 |
|---|---|---|
| `file`이 `data`만 표시 | stderr가 stdout 오염 | 완전 재생성 |
| 모델이 텍스트·로고를 넣음 | 네거티브 미흡 | 텍스트 금지 구문을 프롬프트 끝에 더 강하게 |
| 인물 얼굴이 너무 전면 | 구도 지시 부족 | "중앙 피사체는 실루엣/미디엄 샷, 분위기 중심" 추가 |

## 제한

- 모델: `gemini-3.1-flash-image-preview` (변경은 `character-images/scripts/gen-image.ts`의 `MODEL` 상수)
- Aspect: `1:1, 3:4, 4:3, 9:16, 16:9` 중 선택. 카드 배너는 **16:9**
