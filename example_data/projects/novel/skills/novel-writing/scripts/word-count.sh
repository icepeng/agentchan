#!/usr/bin/env bash
#
# word-count.sh — 소설 챕터별 단어 수 및 글자 수를 추적합니다.
#
# 사용법:
#   ./scripts/word-count.sh <프로젝트-디렉토리>
#   ./scripts/word-count.sh <프로젝트-디렉토리> --target 80000
#
# chapters/*.md를 스캔하여 챕터별 및 전체 수를 보고합니다.

set -euo pipefail

PROJECT_DIR="${1:?Usage: word-count.sh <project-dir> [--target N]}"
TARGET=0

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

CHAPTERS_DIR="$PROJECT_DIR/chapters"

if [[ ! -d "$CHAPTERS_DIR" ]]; then
  echo "오류: $PROJECT_DIR 에 chapters/ 디렉토리가 없습니다" >&2
  exit 1
fi

echo "=== 소설 단어 수 ==="
echo ""

TOTAL_WORDS=0
TOTAL_CHARS=0
CHAPTER_COUNT=0

printf "%-35s %8s %10s\n" "챕터" "단어" "글자"
printf "%-35s %8s %10s\n" "-------" "-----" "----------"

for file in "$CHAPTERS_DIR"/*.md; do
  [[ -f "$file" ]] || continue

  CHAPTER_COUNT=$((CHAPTER_COUNT + 1))
  FILENAME=$(basename "$file")

  # 정확한 카운트를 위해 HTML 코멘트와 YAML 메타데이터 라인 제거
  CONTENT=$(sed '/^<!--/,/-->/d; /^>/d; /^#/d; /^---$/d' "$file")

  WORDS=$(echo "$CONTENT" | wc -w | tr -d ' ')
  CHARS=$(echo "$CONTENT" | wc -m | tr -d ' ')

  TOTAL_WORDS=$((TOTAL_WORDS + WORDS))
  TOTAL_CHARS=$((TOTAL_CHARS + CHARS))

  printf "%-35s %8s %10s\n" "$FILENAME" "$WORDS" "$CHARS"
done

echo ""
printf "%-35s %8s %10s\n" "합계 (${CHAPTER_COUNT}개 챕터)" "$TOTAL_WORDS" "$TOTAL_CHARS"

if [[ $TARGET -gt 0 ]]; then
  echo ""
  PERCENT=$((TOTAL_WORDS * 100 / TARGET))
  REMAINING=$((TARGET - TOTAL_WORDS))
  echo "목표: $TARGET 단어"
  echo "진행률: $PERCENT% (${REMAINING}단어 남음)"

  if [[ $CHAPTER_COUNT -gt 0 ]]; then
    AVG=$((TOTAL_WORDS / CHAPTER_COUNT))
    if [[ $AVG -gt 0 ]]; then
      CHAPTERS_LEFT=$(( (REMAINING + AVG - 1) / AVG ))
      echo "챕터당 평균 단어: $AVG"
      echo "예상 남은 챕터: ~$CHAPTERS_LEFT"
    fi
  fi
fi
