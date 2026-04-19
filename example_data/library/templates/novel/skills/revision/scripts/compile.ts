/**
 * compile.ts — 챕터 파일들을 하나의 원고로 편집합니다.
 *
 * 사용법: <제목> [--author "저자 이름"]
 *
 * 표지, 목차, 전체 챕터가 파일명 순서(01-*.md, 02-*.md, ...)로
 * 합쳐진 manuscript.md를 생성합니다.
 */

import type { ScriptContext } from "@agentchan/creative-agent";

function parseCompileArgs(argv: readonly string[], ctx: ScriptContext): { title: string; author: string } {
  const { values, positionals } = ctx.util.parseArgs({
    args: [...argv],
    options: { author: { type: "string" } },
    strict: true,
    allowPositionals: true,
  });
  if (positionals.length < 1) {
    throw new Error('사용법: <제목> [--author "저자 이름"]');
  }
  return {
    title: positionals[0]!,
    author: values.author ?? "",
  };
}

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

export default function (args: readonly string[], ctx: ScriptContext) {
  const { title, author } = parseCompileArgs(args, ctx);

  if (!ctx.project.exists("files/chapters")) {
    throw new Error("오류: chapters/ 디렉토리가 없습니다");
  }
  const chapterFiles = ctx.project.listDir("files/chapters")
    .filter((name: string) => name.endsWith(".md"))
    .sort();
  if (chapterFiles.length === 0) {
    throw new Error("오류: chapters/ 에 .md 파일이 없습니다");
  }

  const lines: string[] = [];
  lines.push(`${chapterFiles.length}개 챕터를 원고로 편집하는 중...`);

  const contents = chapterFiles.map((name: string) => ctx.project.readFile(`files/chapters/${name}`));

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
    const h1Match = contents[i]!.match(/^# (.+)$/m);
    const heading = h1Match?.[1] ?? chapterFiles[i]!.replace(/\.md$/, "");
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
  ctx.project.writeFile("files/manuscript.md", manuscript);

  const totalWords = countWords(manuscript);
  lines.push("");
  lines.push("=== 편집 완료 ===");
  lines.push("출력:   files/manuscript.md");
  lines.push(`챕터:   ${chapterFiles.length}`);
  lines.push(`단어:   ${totalWords}`);

  return lines.join("\n");
}
