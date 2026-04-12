#!/usr/bin/env bun
/**
 * word-count.ts — 소설 챕터별 단어 수 및 글자 수를 추적합니다.
 *
 * 사용법:
 *   bun run scripts/word-count.ts <프로젝트-디렉토리>
 *   bun run scripts/word-count.ts <프로젝트-디렉토리> --target 80000
 *
 * chapters/*.md를 스캔하여 챕터별 및 전체 수를 보고합니다.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

interface Args {
  projectDir: string;
  target: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error("사용법: word-count.ts <프로젝트-디렉토리> [--target N]");
    process.exit(1);
  }
  const projectDir = argv[0];
  let target = 0;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--target") {
      target = parseInt(argv[++i] ?? "0", 10);
      if (Number.isNaN(target)) target = 0;
    } else {
      console.error(`Unknown option: ${argv[i]}`);
      process.exit(1);
    }
  }
  return { projectDir, target };
}

function stripMeta(content: string): string {
  const noComments = content.replace(/<!--[\s\S]*?-->/g, "");
  return noComments
    .split("\n")
    .filter((line) => !/^>/.test(line) && !/^#/.test(line) && !/^---$/.test(line))
    .join("\n");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// String.length는 UTF-16 코드 유닛이라 BMP 외 문자(이모지 등)에서 어긋난다.
// for...of는 코드 포인트 단위로 순회하므로 배열 할당 없이 정확한 글자 수를 얻는다.
function countChars(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function padRight(s: string, n: number): string {
  // 한글 등 wide character를 고려한 표시 폭 보정
  let width = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    width += code > 0x1100 && code < 0xffff && !(code >= 0x2000 && code <= 0x206f) ? 2 : 1;
  }
  return width >= n ? s : s + " ".repeat(n - width);
}

async function main() {
  const { projectDir, target } = parseArgs();
  const chaptersDir = join(projectDir, "chapters");

  let files: string[];
  try {
    const entries = await readdir(chaptersDir, { withFileTypes: true });
    files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => join(chaptersDir, e.name))
      .sort();
  } catch {
    console.error(`오류: ${projectDir}에 chapters/ 디렉토리가 없습니다`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`오류: ${chaptersDir}에 .md 파일이 없습니다`);
    process.exit(1);
  }

  const contents = await Promise.all(files.map((f) => readFile(f, "utf-8")));

  console.log("=== 소설 단어 수 ===\n");
  console.log(`${padRight("챕터", 35)} ${padLeft("단어", 8)} ${padLeft("글자", 10)}`);
  console.log(`${padRight("-------", 35)} ${padLeft("-----", 8)} ${padLeft("----------", 10)}`);

  let totalWords = 0;
  let totalChars = 0;
  for (let i = 0; i < files.length; i++) {
    const stripped = stripMeta(contents[i]);
    const words = countWords(stripped);
    const chars = countChars(stripped);
    totalWords += words;
    totalChars += chars;
    console.log(
      `${padRight(basename(files[i]), 35)} ${padLeft(String(words), 8)} ${padLeft(String(chars), 10)}`,
    );
  }

  console.log();
  console.log(
    `${padRight(`합계 (${files.length}개 챕터)`, 35)} ${padLeft(String(totalWords), 8)} ${padLeft(String(totalChars), 10)}`,
  );

  if (target > 0) {
    console.log();
    const percent = Math.floor((totalWords * 100) / target);
    const remaining = target - totalWords;
    console.log(`목표: ${target} 단어`);
    console.log(`진행률: ${percent}% (${remaining}단어 남음)`);

    const avg = files.length > 0 ? Math.floor(totalWords / files.length) : 0;
    if (avg > 0) {
      const chaptersLeft = Math.ceil(remaining / avg);
      console.log(`챕터당 평균 단어: ${avg}`);
      console.log(`예상 남은 챕터: ~${chaptersLeft}`);
    }
  }
}

main();
