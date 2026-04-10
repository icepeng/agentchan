#!/usr/bin/env bun
/**
 * compile.ts — 챕터 파일들을 하나의 원고로 편집합니다.
 *
 * 사용법:
 *   bun run scripts/compile.ts <프로젝트-디렉토리> <제목> [--author "저자 이름"]
 *
 * 표지, 목차, 전체 챕터가 파일명 순서(01-*.md, 02-*.md, ...)로
 * 합쳐진 manuscript.md를 생성합니다.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";

interface Args {
  projectDir: string;
  title: string;
  author: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error('사용법: compile.ts <프로젝트-디렉토리> <제목> [--author "저자 이름"]');
    process.exit(1);
  }
  const projectDir = argv[0];
  const title = argv[1];
  let author = "";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--author") {
      author = argv[++i] ?? "";
    } else {
      console.error(`Unknown option: ${argv[i]}`);
      process.exit(1);
    }
  }
  return { projectDir, title, author };
}

// HTML 코멘트는 작가 메모 — 최종 원고에서는 제거한다.
function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function countWords(text: string): number {
  const filtered = text
    .split("\n")
    .filter((line) => !/^>/.test(line) && !/^---$/.test(line))
    .join("\n");
  return filtered.split(/\s+/).filter(Boolean).length;
}

async function main() {
  const { projectDir, title, author } = parseArgs();
  const chaptersDir = join(projectDir, "chapters");
  const outputPath = join(projectDir, "manuscript.md");

  let chapterFiles: string[];
  try {
    const entries = await readdir(chaptersDir, { withFileTypes: true });
    chapterFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => join(chaptersDir, e.name))
      .sort();
  } catch {
    console.error(`오류: ${projectDir}에 chapters/ 디렉토리가 없습니다`);
    process.exit(1);
  }

  if (chapterFiles.length === 0) {
    console.error(`오류: ${chaptersDir}에 .md 파일이 없습니다`);
    process.exit(1);
  }

  console.log(`${chapterFiles.length}개 챕터를 원고로 편집하는 중...`);

  const contents = await Promise.all(chapterFiles.map((f) => readFile(f, "utf-8")));

  const parts: string[] = [];

  // --- 표지 ---
  parts.push(`# ${title}`);
  parts.push("");
  if (author) {
    parts.push(`**By ${author}**`);
    parts.push("");
  }
  parts.push("---");
  parts.push("");

  // --- 목차 ---
  parts.push("## 목차");
  parts.push("");
  for (let i = 0; i < chapterFiles.length; i++) {
    const h1Match = contents[i].match(/^# (.+)$/m);
    const heading = h1Match?.[1] ?? basename(chapterFiles[i], ".md");
    parts.push(`${i + 1}. ${heading}`);
  }
  parts.push("");
  parts.push("---");
  parts.push("");

  // --- 챕터 본문 ---
  for (const content of contents) {
    parts.push(stripComments(content));
    parts.push("");
    parts.push("---");
    parts.push("");
  }

  // --- 편집 정보 ---
  const today = new Date().toISOString().slice(0, 10);
  parts.push(`*${today}에 편집됨*`);

  const manuscript = parts.join("\n");
  await writeFile(outputPath, manuscript, "utf-8");

  // --- 요약 ---
  const totalWords = countWords(manuscript);
  console.log("");
  console.log("=== 편집 완료 ===");
  console.log(`출력:   ${outputPath}`);
  console.log(`챕터:   ${chapterFiles.length}`);
  console.log(`단어:   ${totalWords}`);
}

main();
