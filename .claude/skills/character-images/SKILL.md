---
name: character-images
description: |
  Generates agentchan character avatar + emotion portraits
disable-model-invocation: true
---

# Character Images

Agentchan 런타임 UI용 캐릭터 포트레이트를 만든다. 목표는 키비주얼이 아니라 **반복 가능하고 배경 제거 가능한 단독 인물 PNG**다.

Star graph: 모든 emotion은 같은 기준 컷을 참조한다. emotion끼리 체인하지 않는다.

```
[text] → raw/avatar.jpg ─┬→ raw/happy.jpg      ─┬→ happy.png
                         ├→ raw/sad.jpg        ├→ sad.png
                         ├→ raw/surprised.jpg  ├→ surprised.png
                         └→ raw/thinking.jpg   └→ thinking.png
```

## Prerequisites

- 프로젝트 루트에서 실행 (bun이 `.env` auto-load)
- `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`
- `rembg` CLI: `pip install rembg`
- 검증용 Pillow: `pip install pillow`

## 1. 캐릭터 파일 파싱

`{char-dir}/{char-name}.md`에서 추출:

| 필드 | 용도 |
|---|---|
| frontmatter `name` | kebab-case 파일명 |
| `display-name` | 프롬프트 이름 |
| `## 정체성` | 나이·역할·종족·성별 |
| `## 외모` | 비주얼 bullet |
| `## 감정 삽화` 테이블 | 생성할 emotion 키 목록 |

대상 범위와 **생성 개수 × $0.02-0.04 비용**을 공지하고 승인 받는다. 모호하면 먼저 묻는다.

## 2. 스타일 한 줄 결정

템플릿 톤을 한 줄로 정하고 avatar와 모든 emotion 프롬프트에서 동일하게 반복한다.

- `Persona 5 cover art 스타일의 만화 포트레이트`
- `Punishing Gray Raven visual novel 스타일`
- `Studio Ghibli 톤의 부드러운 일러스트`

사용자가 생존 작가, 특정 스튜디오, 특정 작품의 스타일을 요청하면 이름을 그대로 프롬프트에 넣지 말고 시각적 특성으로 치환한다.

예: `고채도 팝 누아르 애니, 강한 실루엣, 날카로운 선, 선명한 셀 셰이딩, 과장된 표정, 그래픽한 포즈`

## 3. 기준 컷 생성

프롬프트 템플릿:

```
Create a solo character portrait for an Agentchan runtime UI.
Aesthetic direction: {스타일}. Do not imitate any named artist.

{display-name}, {age}세 {gender}, {role}.

외모:
- {외모 bullet 5~6줄}

Pose and framing: exactly one person, centered upper body, front-facing, clear silhouette.
Background: flat simple studio background for background removal. No venue, no crowd, no furniture.
Strict negatives: no text, no logo, no watermark, no second face, no group, no duplicate character, no scene background, no cropped head, no malformed hands.
```

출력은 먼저 `assets/raw/{base}.jpg` 또는 `assets/raw/{base}.png`에 둔다. 최종 노출 파일은 rembg 후에만 `assets/{base}.png`로 만든다.

```bash
bun run .claude/skills/character-images/scripts/gen-image.ts \
  "files/characters/{name}/assets/raw/{base}.jpg" --aspect 3:4 <<'PROMPT'
{prompt}
PROMPT
```

생성 직후 이미지를 눈으로 확인한다. 아래 중 하나라도 보이면 해당 기준 컷을 폐기하고 다시 생성한다.

- 인물이 2명 이상이거나 다른 얼굴/몸이 섞임
- 장면 배경, 웨딩홀, 가구, 군중이 들어감
- 글자, 로고, 워터마크, 읽히는 표식이 들어감
- 얼굴, 손, 머리카락, 상반신 구도가 UI 포트레이트로 쓰기 어려움

## 4. Emotion 생성

항상 기준 컷을 `--ref`로 넣는다. 기준 컷이 실패했으면 emotion을 만들지 않는다.

프롬프트 템플릿:

```
Using the attached reference image, recreate the exact same character:
{display-name}, same face, hair, outfit, props, proportions, line art, shading, and color palette.
Change only the expression and body tension.

새 표정: {modifier}

Keep: exactly one person, centered upper-body front-facing portrait, flat simple studio background.
Strict negatives: no text, no logo, no watermark, no second face, no other person, no duplicate character, no scene background, no malformed hands.
```

emotion 토큰이 물리 손상으로 오해될 수 있으면 프롬프트에서 풀어 쓴다.

| 토큰 예 | 프롬프트 표현 |
|---|---|
| `cracked` | `emotional collapse, not physical damage; face and skin are normal and undamaged` |
| `broken` | `emotionally devastated, no broken body, no wounds` |
| `damaged` | `shaken and guilty, no physical injury` |

예시:

```bash
bun run .claude/skills/character-images/scripts/gen-image.ts \
  "files/characters/{name}/assets/raw/{emo}.jpg" \
  --ref "files/characters/{name}/assets/raw/{base}.jpg" \
  --aspect 3:4 <<'PROMPT'
{prompt}
PROMPT
```

각 emotion 생성 후에도 기준 컷과 같은 시각 검수를 반복한다.

## 5. 배경 제거

최종 노출 파일은 반드시 `assets/{emotion}.png`다. 배경 있는 raw 이미지를 `avatar-image`나 감정 토큰이 직접 참조하지 않게 한다.

먼저 고품질 모델을 쓰고, 메모리 실패나 0바이트 출력이 생기면 가벼운 모델로 재시도한다.

```bash
rembg i -m bria-rmbg "files/characters/{name}/assets/raw/{emo}.jpg" "files/characters/{name}/assets/{emo}.png"

# bria-rmbg 실패 시
rm -f "files/characters/{name}/assets/{emo}.png"
rembg i -m u2netp "files/characters/{name}/assets/raw/{emo}.jpg" "files/characters/{name}/assets/{emo}.png"
```

## 6. 검증

파일 존재나 MIME만 보지 말고, PIL로 실제 이미지를 열어 RGBA/alpha/0바이트를 확인한다.

```bash
python - <<'PY'
from PIL import Image
from pathlib import Path

for p in sorted(Path("files/characters").glob("*/assets/*.png")):
    im = Image.open(p)
    alpha = im.getchannel("A") if im.mode == "RGBA" else None
    transparent = alpha is not None and alpha.getextrema()[0] < 255
    if p.stat().st_size <= 0 or im.mode != "RGBA" or not transparent:
        print(f"BAD: {p} size={p.stat().st_size} mode={im.mode} transparent={transparent}")
    else:
        print(f"OK: {p} {im.size} {im.mode}")
PY
```

검증 후 최종 이미지를 다시 눈으로 확인한다. 투명 배경 뷰어가 검은색으로 보일 수 있으므로 alpha 검증 결과와 함께 판단한다.

## 실패 복구

| 증상 | 원인 | 복구 |
|---|---|---|
| 다중 인물, 장면 배경, 군중 | 프롬프트가 키비주얼/장면으로 열림 | `solo`, `studio background`, `no crowd`, `no scene background`를 강화해 기준 컷부터 재생성 |
| 캐릭터별 emotion 얼굴이 다름 | ref 미사용 또는 체인 생성 | 기준 컷을 `--ref`로 emotion 전부 재생성 |
| `cracked`가 얼굴 균열로 나옴 | 토큰의 문자적 해석 | `emotional collapse, not physical damage`로 재생성 |
| 0바이트 PNG 또는 PIL open 실패 | rembg 실패 중 출력 생성 | 파일 삭제 후 `u2netp`로 재시도 |
| rembg `bria-rmbg` 메모리 실패 | ONNX 모델 메모리 부족 | `u2netp` fallback 사용 |
| 텍스트·로고가 들어감 | 네거티브 미흡 | strict negatives를 강화해 raw부터 재생성 |

## 출력 구조

```
files/characters/{name}/assets/
├── raw/             (생성/검수 중에만 사용, 최종 반영 전 삭제 권장)
│   ├── avatar.jpg
│   └── ...
├── avatar.png       (896×1200, RGBA, transparent)
├── happy.png
├── sad.png
├── surprised.png
└── thinking.png
```

character.md frontmatter의 `avatar-image: assets/avatar`처럼 확장자 없이 둔다. `/files/:path` 라우트의 확장자 폴백이 처리한다.

## 스크립트

```
scripts/gen-image.ts <output> [--ref <path>] [--aspect <ratio>] < stdin
```

- 지원 aspect: `1:1`, `3:4`(기본), `4:3`, `9:16`, `16:9`
- 프롬프트는 stdin (긴 한국어 이스케이핑 회피)

## 제한

- 모델: `gemini-3.1-flash-image-preview` (변경은 `scripts/gen-image.ts`의 `MODEL` 상수)
