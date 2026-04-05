#!/usr/bin/env bash
#
# compile.sh — 챕터 파일들을 하나의 원고로 편집합니다.
#
# 사용법:
#   ./scripts/compile.sh <프로젝트-디렉토리> <제목> [--author "저자 이름"]
#
# 표지, 목차, 전체 챕터가 파일명 순서(01-*.md, 02-*.md, ...)로
# 합쳐진 manuscript.md를 생성합니다.

set -euo pipefail

PROJECT_DIR="${1:?Usage: compile.sh <project-dir> <title> [--author \"Author Name\"]}"
TITLE="${2:?Usage: compile.sh <project-dir> <title> [--author \"Author Name\"]}"
AUTHOR=""

shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --author) AUTHOR="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

CHAPTERS_DIR="$PROJECT_DIR/chapters"
OUTPUT="$PROJECT_DIR/manuscript.md"

if [[ ! -d "$CHAPTERS_DIR" ]]; then
  echo "오류: $PROJECT_DIR 에 chapters/ 디렉토리가 없습니다" >&2
  exit 1
fi

# 챕터 수 확인
CHAPTER_FILES=("$CHAPTERS_DIR"/*.md)
if [[ ! -f "${CHAPTER_FILES[0]}" ]]; then
  echo "오류: $CHAPTERS_DIR 에 .md 파일이 없습니다" >&2
  exit 1
fi

CHAPTER_COUNT=${#CHAPTER_FILES[@]}
echo "${CHAPTER_COUNT}개 챕터를 원고로 편집하는 중..."

# --- 표지 ---
{
  echo "# $TITLE"
  echo ""
  if [[ -n "$AUTHOR" ]]; then
    echo "**By $AUTHOR**"
    echo ""
  fi
  echo "---"
  echo ""

  # --- 목차 ---
  echo "## 목차"
  echo ""

  CHAPTER_NUM=0
  for file in "${CHAPTER_FILES[@]}"; do
    CHAPTER_NUM=$((CHAPTER_NUM + 1))
    FILENAME=$(basename "$file" .md)

    # 첫 번째 H1 제목에서 챕터 타이틀 추출 시도
    HEADING=$(grep -m1 '^# ' "$file" | sed 's/^# //' || echo "$FILENAME")

    echo "$CHAPTER_NUM. $HEADING"
  done

  echo ""
  echo "---"
  echo ""

  # --- 챕터 본문 ---
  for file in "${CHAPTER_FILES[@]}"; do
    # 챕터 내용 읽기, HTML 코멘트(작가 메모) 제거
    sed '/^<!--/,/-->/d' "$file"

    echo ""
    echo "---"
    echo ""
  done

  # --- 편집 정보 ---
  echo "*$(date +%Y-%m-%d)에 편집됨*"

} > "$OUTPUT"

# --- 요약 ---
TOTAL_WORDS=$(sed '/^<!--/,/-->/d; /^>/d; /^---$/d' "$OUTPUT" | wc -w | tr -d ' ')

echo ""
echo "=== 편집 완료 ==="
echo "출력:   $OUTPUT"
echo "챕터:   $CHAPTER_COUNT"
echo "단어:   $TOTAL_WORDS"
