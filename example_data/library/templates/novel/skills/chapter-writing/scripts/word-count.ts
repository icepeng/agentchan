/**
 * word-count.ts — 소설 챕터별 단어 수 및 글자 수를 추적합니다.
 *
 * 사용법: [--target <N>]
 *
 * chapters/*.md를 스캔하여 챕터별 및 전체 수를 보고합니다.
 * 사람이 읽는 다중 라인 텍스트를 반환합니다.
 */

import type { ScriptContext } from "@agentchan/creative-agent";

function parseWordCountArgs(argv: readonly string[], ctx: ScriptContext): { target: number } {
  const { values } = ctx.util.parseArgs({
    args: [...argv],
    options: { target: { type: "string" } },
    strict: true,
  });
  const raw = values.target;
  const target = raw ? parseInt(raw, 10) : 0;
  return { target: Number.isNaN(target) ? 0 : target };
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

function countChars(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function padRight(s: string, n: number): string {
  let width = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    width += code > 0x1100 && code < 0xffff && !(code >= 0x2000 && code <= 0x206f) ? 2 : 1;
  }
  return width >= n ? s : s + " ".repeat(n - width);
}

export default function (args: readonly string[], ctx: ScriptContext) {
  const { target } = parseWordCountArgs(args, ctx);

  if (!ctx.project.exists("files/chapters")) {
    throw new Error("오류: chapters/ 디렉토리가 없습니다");
  }
  const files = ctx.project.listDir("files/chapters")
    .filter((name) => name.endsWith(".md"))
    .sort();
  if (files.length === 0) {
    throw new Error("오류: chapters/ 에 .md 파일이 없습니다");
  }

  const lines: string[] = [];
  lines.push("=== 소설 단어 수 ===");
  lines.push("");
  lines.push(`${padRight("챕터", 35)} ${padLeft("단어", 8)} ${padLeft("글자", 10)}`);
  lines.push(`${padRight("-------", 35)} ${padLeft("-----", 8)} ${padLeft("----------", 10)}`);

  let totalWords = 0;
  let totalChars = 0;
  for (const name of files) {
    const stripped = stripMeta(ctx.project.readFile(`files/chapters/${name}`));
    const words = countWords(stripped);
    const chars = countChars(stripped);
    totalWords += words;
    totalChars += chars;
    lines.push(
      `${padRight(name, 35)} ${padLeft(String(words), 8)} ${padLeft(String(chars), 10)}`,
    );
  }

  lines.push("");
  lines.push(
    `${padRight(`합계 (${files.length}개 챕터)`, 35)} ${padLeft(String(totalWords), 8)} ${padLeft(String(totalChars), 10)}`,
  );

  if (target > 0) {
    lines.push("");
    const percent = Math.floor((totalWords * 100) / target);
    const remaining = target - totalWords;
    lines.push(`목표: ${target} 단어`);
    lines.push(`진행률: ${percent}% (${remaining}단어 남음)`);

    const avg = files.length > 0 ? Math.floor(totalWords / files.length) : 0;
    if (avg > 0) {
      const chaptersLeft = Math.ceil(remaining / avg);
      lines.push(`챕터당 평균 단어: ${avg}`);
      lines.push(`예상 남은 챕터: ~${chaptersLeft}`);
    }
  }

  return lines.join("\n");
}
