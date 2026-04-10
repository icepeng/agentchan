#!/usr/bin/env bun
/**
 * consistency-check.ts — 소설 프로젝트 파일의 일관성을 검사합니다.
 *
 * 사용법:
 *   bun run scripts/consistency-check.ts --project <프로젝트-디렉토리>
 *
 * 검사 항목:
 *   1. 챕터에 언급되었지만 characters/에 없는 캐릭터 이름
 *   2. 캐릭터 특성 모순 (눈 색, 나이 등)
 *   3. 미해결 아웃라인 항목 (체크되지 않은 할 일)
 *   4. 순서 문제를 위한 타임라인 마커
 *   5. 아웃라인에서 참조되지 않는 고아 챕터
 */

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

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
  traits: Map<string, string>; // 특성 키 → 값 (예: "eye color" → "blue")
}

// --- 헬퍼 ---

async function readMarkdown(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

function extractNames(content: string): string[] {
  // 대문자로 시작하는 단어 중 캐릭터 이름으로 보이는 것을 매칭
  // 휴리스틱: 대문자로 시작하는 2글자 이상 단어, 일반 단어 제외
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

async function checkCharacterConsistency(
  projectDir: string,
): Promise<{ profiles: CharacterProfile[]; issues: Issue[] }> {
  const issues: Issue[] = [];
  const profiles: CharacterProfile[] = [];

  const charFiles = await listMdFiles(join(projectDir, "characters"));

  for (const file of charFiles) {
    const content = await readMarkdown(file);
    const name = basename(file, ".md");
    const traits = extractTraits(content);
    profiles.push({ name, file, traits });
  }

  // 챕터에서 특성 모순 검사
  const chapterFiles = await listMdFiles(join(projectDir, "chapters"));

  for (const chFile of chapterFiles) {
    const content = await readMarkdown(chFile);
    const chapterTraits = extractTraits(content);
    const chName = basename(chFile);

    for (const profile of profiles) {
      // 이 캐릭터가 챕터에 언급된 경우에만 검사
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

async function checkChapterReferences(
  projectDir: string,
  knownNames: string[],
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const chapterFiles = await listMdFiles(join(projectDir, "chapters"));
  const knownSet = new Set(knownNames.map((n) => n.toLowerCase()));

  for (const file of chapterFiles) {
    const content = await readMarkdown(file);
    const names = extractNames(content);
    const chName = basename(file);

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

async function checkOutline(projectDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const outline = await readMarkdown(join(projectDir, "outline.md"));

  if (!outline) {
    issues.push({
      type: "outline",
      severity: "warning",
      file: "outline.md",
      message: "프로젝트 디렉토리에 outline.md가 없습니다",
    });
    return issues;
  }

  // 체크되지 않은 할 일 확인
  const unchecked = outline.match(/- \[ \] .+/g) || [];
  for (const item of unchecked) {
    issues.push({
      type: "outline",
      severity: "warning",
      file: "outline.md",
      message: `미해결: ${item.replace("- [ ] ", "")}`,
    });
  }

  // 아웃라인에서 참조하는 챕터 vs. 실제 존재하는 챕터 확인
  const chapterFiles = await listMdFiles(join(projectDir, "chapters"));
  const chapterNames = new Set(
    chapterFiles.map((f) => basename(f, ".md")),
  );

  // 아웃라인에 참조되지 않는 챕터 찾기
  for (const name of chapterNames) {
    if (!outline.toLowerCase().includes(name.toLowerCase().replace(/^\d+-/, ""))) {
      issues.push({
        type: "orphan",
        severity: "warning",
        file: `chapters/${name}.md`,
        message: `챕터 "${name}"이(가) 아웃라인에서 참조되지 않을 수 있습니다`,
      });
    }
  }

  return issues;
}

async function checkTimeline(projectDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const chapterFiles = await listMdFiles(join(projectDir, "chapters"));

  const timelineEntries: Array<{ file: string; marker: string; order: number }> = [];

  for (const file of chapterFiles) {
    const content = await readMarkdown(file);
    const chName = basename(file);

    // 챕터 메타데이터에서 타임라인 마커 추출
    const timelineMatch = content.match(/>\s*\*\*Timeline\*\*:\s*(.+)/);
    if (timelineMatch) {
      const order = parseInt(chName.match(/^(\d+)/)?.[1] || "0");
      timelineEntries.push({ file: chName, marker: timelineMatch[1].trim(), order });
    }
  }

  // 중복 또는 누락된 타임라인 마커 확인
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

async function main() {
  const projectFlag = process.argv.indexOf("--project");
  if (projectFlag === -1 || !process.argv[projectFlag + 1]) {
    console.error("사용법: bun run consistency-check.ts --project <프로젝트-디렉토리>");
    process.exit(1);
  }

  const projectDir = process.argv[projectFlag + 1];
  console.log(`\n=== 일관성 검사: ${projectDir} ===\n`);

  const allIssues: Issue[] = [];

  // 1. 캐릭터 일관성
  const { profiles, issues: charIssues } = await checkCharacterConsistency(projectDir);
  allIssues.push(...charIssues);

  // 2. 알 수 없는 캐릭터 참조
  const knownNames = profiles.map((p) => p.name);
  const refIssues = await checkChapterReferences(projectDir, knownNames);
  allIssues.push(...refIssues);

  // 3. 아웃라인 검사
  const outlineIssues = await checkOutline(projectDir);
  allIssues.push(...outlineIssues);

  // 4. 타임라인 검사
  const timelineIssues = await checkTimeline(projectDir);
  allIssues.push(...timelineIssues);

  // --- 보고서 ---
  const errors = allIssues.filter((i) => i.severity === "error");
  const warnings = allIssues.filter((i) => i.severity === "warning");

  if (errors.length > 0) {
    console.log(`오류 (${errors.length}):`);
    for (const issue of errors) {
      console.log(`  [${issue.type}] ${issue.file}: ${issue.message}`);
    }
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`경고 (${warnings.length}):`);
    for (const issue of warnings) {
      console.log(`  [${issue.type}] ${issue.file}: ${issue.message}`);
    }
    console.log();
  }

  if (allIssues.length === 0) {
    console.log("발견된 문제가 없습니다. 원고의 일관성이 유지되고 있습니다.");
  } else {
    console.log(`합계: 오류 ${errors.length}건, 경고 ${warnings.length}건`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
