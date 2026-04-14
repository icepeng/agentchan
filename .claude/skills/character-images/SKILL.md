---
name: character-images
description: |
  Generates agentchan character avatar + emotion portraits
  with Gemini 3.1 Flash Image Preview. Avatar is text-only; emotion images use the avatar
  as a reference image so face/hair/outfit stay identical. Backgrounds are stripped in one
  folder batch with rembg (bria-rmbg) and saved as RGBA PNGs to
  `files/characters/{name}/assets/`.
disable-model-invocation: true
---

# Character Images

Star graph — 모든 emotion은 같은 avatar를 참조 (체인 아님):

```
[text] → avatar.png ─┬→ happy.png
                     ├→ sad.png
                     ├→ surprised.png
                     └→ thinking.png
```

## Prerequisites

- 프로젝트 루트에서 실행 (bun이 `.env` auto-load)
- `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`
- `rembg` CLI — `pip install rembg`

## 1. 캐릭터 파일 파싱

`{char-dir}/{char-name}.md`에서 추출:

| 필드 | 용도 |
|---|---|
| frontmatter `name` | kebab-case 파일명 |
| `display-name` | 프롬프트 이름 |
| `## 정체성` | 나이·역할·종족·성별 |
| `## 외모` | 비주얼 bullet |
| `## 감정 삽화` 테이블 | 생성할 emotion 키 목록 |

대상 범위와 **개수 × $0.02–0.04 비용**을 공지하고 승인 받는다. 모호하면 먼저 묻는다.

## 2. 스타일 한 줄 결정

템플릿 톤을 한 줄로. avatar와 모든 emotion 프롬프트에서 **동일하게 반복 사용**:

- `Persona 5 cover art 스타일의 만화 포트레이트`
- `Punishing Gray Raven visual novel 스타일`
- `Studio Ghibli 톤의 부드러운 일러스트`

## 3. Avatar 생성

프롬프트 템플릿:

```
{스타일}로 1인 캐릭터만 생성해줘.

{display-name}, {age}세 {gender}, {role}.

외모:
- {외모 bullet 5~6줄}

화면 중앙에 1명, 상반신, 정면 응시, 단색 배경.
어떤 글자·텍스트·로고·배지·상표도 없이.
```

각 캐릭터마다 아래 블록을 반복 발행 (전부 `&`로 백그라운드), 마지막에 `wait`:

```bash
bun run .claude/skills/character-images/scripts/gen-image.ts \
  "files/characters/{name}/assets/avatar.png" --aspect 3:4 <<'PROMPT' &
{prompt}
PROMPT

# ... 각 캐릭터마다 위 블록 1회씩

wait
```

## 4. Emotion 생성 (avatar를 `--ref`로)

프롬프트 템플릿:

```
첨부된 레퍼런스 이미지는 {display-name}, {age}세 {gender}, {role}.
완전히 똑같은 캐릭터(얼굴·머리·의상·아트 스타일 모두 동일)로 표정만 변경.

새 표정: {modifier}

유지: 얼굴 비율·특징, 헤어, 의상, {스타일} 아트 스타일·라인워크·셰이딩·색감, 상반신 정면 구도
변경: 표정만

1인만, 단색 배경. 어떤 글자·텍스트·로고·배지·상표도 없이.
```

모든 `{name} × {emo}` 조합을 반복 발행 (전부 `&`), 마지막에 `wait`:

```bash
bun run .claude/skills/character-images/scripts/gen-image.ts \
  "files/characters/{name}/assets/{emo}.png" \
  --ref "files/characters/{name}/assets/avatar.png" \
  --aspect 3:4 <<'PROMPT' &
{prompt}
PROMPT

# ... 각 {name}×{emo} 조합마다 위 블록 1회씩

wait
```

## 5. 배치 rembg (캐릭터 폴더별 1회)

예시:

```bash
for CHAR in iseo hangyeol minji; do
  rembg p -m bria-rmbg \
    "files/characters/$CHAR/assets/" "files/characters/$CHAR/assets/"
done
```

## 6. 검증

예시:

```bash
for C in iseo hangyeol minji; do
  for F in avatar happy sad surprised thinking; do
    file "files/characters/$C/assets/$F.png" | grep -q RGBA || echo "BAD: $C/$F"
  done
done
```

## 실패 복구

| 증상 | 원인 | 복구 |
|---|---|---|
| `file`이 `data`만 표시 (PNG 시그니처 없음) | stderr가 stdout 오염 | 해당 이미지 완전 재생성 |

## 출력 구조

```
files/characters/{name}/assets/
├── avatar.png    (896×1200, RGBA)
├── happy.png
├── sad.png
├── surprised.png
└── thinking.png
```

character.md frontmatter의 `avatar-image: assets/avatar` — **확장자 없이**. `/files/:path` 라우트의 확장자 폴백이 처리한다.

## 스크립트

```
scripts/gen-image.ts <output> [--ref <path>] [--aspect <ratio>] < stdin
```

- 지원 aspect: `1:1`, `3:4`(기본), `4:3`, `9:16`, `16:9`
- 프롬프트는 stdin (긴 한국어 이스케이핑 회피)

## 제한

- 모델: `gemini-3.1-flash-image-preview` (변경은 `scripts/gen-image.ts`의 `MODEL` 상수)
