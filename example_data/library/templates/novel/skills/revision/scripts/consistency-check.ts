/**
 * consistency-check.ts — 소설 프로젝트 파일의 일관성을 검사합니다.
 *
 * 사용법: (인자 없음)
 *
 * 검사 항목:
 *   1. 챕터에 언급되었지만 characters/에 없는 캐릭터 이름
 *   2. 캐릭터 특성 모순 (눈 색, 나이 등)
 *   3. 미해결 아웃라인 항목 (체크되지 않은 할 일)
 *   4. 순서 문제를 위한 타임라인 마커
 *   5. 아웃라인에서 참조되지 않는 고아 챕터
 */

import type { ScriptContext } from "@agentchan/creative-agent";

// --- 타입 ---

interface Issue {
  type: "character" | "timeline" | "outline" | "orphan";
  severity: "error" | "warning";
  file: string;
  message: string;
}

interface CharacterProfile {
  name: string;
  file: string;
  traits: Map<string, string>;
}

// --- 헬퍼 ---

function readMarkdown(ctx: ScriptContext, path: string): string {
  return ctx.project.exists(path) ? ctx.project.readFile(path) : "";
}

function listMdFiles(ctx: ScriptContext, dir: string): string[] {
  if (!ctx.project.exists(dir)) return [];
  return ctx.project
    .listDir(dir)
    .filter((name: string) => name.endsWith(".md"))
    .map((name: string) => `${dir}/${name}`);
}

function baseName(path: string, ext = ""): string {
  const withExt = path.split(/[\\/]/).pop() ?? path;
  if (ext && withExt.endsWith(ext)) return withExt.slice(0, -ext.length);
  return withExt;
}

function extractNames(content: string): string[] {
  const commonWords = new Set([
    "The", "This", "That", "There", "Then", "They", "Their", "These", "Those",
    "When", "Where", "What", "Which", "While", "With", "Would", "Will",
    "Chapter", "Scene", "Act", "Part", "Note", "Setup", "Monday", "Tuesday",
    "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December",
    "North", "South", "East", "West", "Here", "How", "His", "Her",
  ]);

  const matches = content.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  return [...new Set(matches.filter((w) => !commonWords.has(w)))];
}

const TRAIT_PATTERNS: Array<{ key: string; regex: RegExp }> = [
  { key: "eye color", regex: /(?:eyes?|irises?)\s*(?:are|were|:)\s*(\w+)/gi },
  { key: "hair color", regex: /(?:hair)\s*(?:is|was|:)\s*(\w+)/gi },
  { key: "age", regex: /(?:age|aged|years?\s*old)\s*(?::|is|was)?\s*(\d+)/gi },
  { key: "height", regex: /(?:height|tall)\s*(?::|is|was)?\s*([\d'"\s.cmft]+)/gi },
];

function extractTraits(content: string): Map<string, string> {
  const traits = new Map<string, string>();
  for (const { key, regex } of TRAIT_PATTERNS) {
    const match = regex.exec(content);
    if (match?.[1]) {
      traits.set(key, match[1].trim().toLowerCase());
    }
    regex.lastIndex = 0;
  }
  return traits;
}

// --- 검사 ---

function checkCharacterConsistency(ctx: ScriptContext): { profiles: CharacterProfile[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const profiles: CharacterProfile[] = [];

  for (const file of listMdFiles(ctx, "files/characters")) {
    const content = readMarkdown(ctx, file);
    const name = baseName(file, ".md");
    const traits = extractTraits(content);
    profiles.push({ name, file, traits });
  }

  for (const chFile of listMdFiles(ctx, "files/chapters")) {
    const content = readMarkdown(ctx, chFile);
    const chapterTraits = extractTraits(content);
    const chName = baseName(chFile);

    for (const profile of profiles) {
      if (!content.includes(profile.name)) continue;
      for (const [key, profileValue] of profile.traits) {
        const chapterValue = chapterTraits.get(key);
        if (chapterValue && chapterValue !== profileValue) {
          issues.push({
            type: "character",
            severity: "error",
            file: chName,
            message: `${profile.name}의 ${key}이(가) 캐릭터 시트에서는 "${profileValue}"이지만 이 챕터에서는 "${chapterValue}"입니다`,
          });
        }
      }
    }
  }

  return { profiles, issues };
}

function checkChapterReferences(ctx: ScriptContext, knownNames: string[]): Issue[] {
  const issues: Issue[] = [];
  const knownSet = new Set(knownNames.map((n) => n.toLowerCase()));

  for (const file of listMdFiles(ctx, "files/chapters")) {
    const content = readMarkdown(ctx, file);
    const names = extractNames(content);
    const chName = baseName(file);

    for (const name of names) {
      if (!knownSet.has(name.toLowerCase())) {
        issues.push({
          type: "character",
          severity: "warning",
          file: chName,
          message: `"${name}"이(가) 캐릭터 이름으로 보이지만 캐릭터 시트가 없습니다`,
        });
      }
    }
  }

  return issues;
}

function checkOutline(ctx: ScriptContext): Issue[] {
  const issues: Issue[] = [];
  const outline = readMarkdown(ctx, "files/outline.md");

  if (!outline) {
    issues.push({
      type: "outline",
      severity: "warning",
      file: "files/outline.md",
      message: "프로젝트 디렉토리에 files/outline.md가 없습니다",
    });
    return issues;
  }

  const unchecked = outline.match(/- \[ \] .+/g) || [];
  for (const item of unchecked) {
    issues.push({
      type: "outline",
      severity: "warning",
      file: "files/outline.md",
      message: `미해결: ${item.replace("- [ ] ", "")}`,
    });
  }

  const chapterFiles = listMdFiles(ctx, "files/chapters");
  const chapterNames = new Set(chapterFiles.map((f) => baseName(f, ".md")));

  for (const name of chapterNames) {
    if (!outline.toLowerCase().includes(name.toLowerCase().replace(/^\d+-/, ""))) {
      issues.push({
        type: "orphan",
        severity: "warning",
        file: `files/chapters/${name}.md`,
        message: `챕터 "${name}"이(가) 아웃라인에서 참조되지 않을 수 있습니다`,
      });
    }
  }

  return issues;
}

function checkTimeline(ctx: ScriptContext): Issue[] {
  const issues: Issue[] = [];

  const timelineEntries: Array<{ file: string; marker: string; order: number }> = [];

  for (const file of listMdFiles(ctx, "files/chapters")) {
    const content = readMarkdown(ctx, file);
    const chName = baseName(file);

    const timelineMatch = content.match(/>\s*\*\*Timeline\*\*:\s*(.+)/);
    if (timelineMatch) {
      const order = parseInt(chName.match(/^(\d+)/)?.[1] || "0");
      timelineEntries.push({ file: chName, marker: timelineMatch[1]!.trim(), order });
    }
  }

  const seen = new Map<string, string>();
  for (const entry of timelineEntries) {
    if (seen.has(entry.marker)) {
      issues.push({
        type: "timeline",
        severity: "warning",
        file: entry.file,
        message: `동일한 타임라인 마커 "${entry.marker}"이(가) ${seen.get(entry.marker)}에도 있습니다`,
      });
    }
    seen.set(entry.marker, entry.file);
  }

  return issues;
}

// --- 메인 ---

export default function (_args: readonly string[], ctx: ScriptContext) {
  const lines: string[] = [];
  lines.push("");
  lines.push("=== 일관성 검사 ===");
  lines.push("");

  const allIssues: Issue[] = [];

  const { profiles, issues: charIssues } = checkCharacterConsistency(ctx);
  allIssues.push(...charIssues);

  const knownNames = profiles.map((p) => p.name);
  allIssues.push(...checkChapterReferences(ctx, knownNames));
  allIssues.push(...checkOutline(ctx));
  allIssues.push(...checkTimeline(ctx));

  const errors = allIssues.filter((i) => i.severity === "error");
  const warnings = allIssues.filter((i) => i.severity === "warning");

  if (errors.length > 0) {
    lines.push(`오류 (${errors.length}):`);
    for (const issue of errors) {
      lines.push(`  [${issue.type}] ${issue.file}: ${issue.message}`);
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push(`경고 (${warnings.length}):`);
    for (const issue of warnings) {
      lines.push(`  [${issue.type}] ${issue.file}: ${issue.message}`);
    }
    lines.push("");
  }

  if (allIssues.length === 0) {
    lines.push("발견된 문제가 없습니다. 원고의 일관성이 유지되고 있습니다.");
  } else {
    lines.push(`합계: 오류 ${errors.length}건, 경고 ${warnings.length}건`);
  }

  return lines.join("\n");
}
