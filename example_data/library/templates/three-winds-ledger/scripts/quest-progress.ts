#!/usr/bin/env bun
/**
 * scripts/quest-progress.ts
 *
 * Updates a quest's status or step in quests.yaml. On completion, adds the
 * completion_flag to campaign.yaml's flags array (for endings DSL).
 *
 * Self-contained — block-based YAML patching via regex.
 *
 * Usage:
 *   scripts/quest-progress.ts --quest <slug> --event <progress|complete|fail> [--step "<description>"]
 *
 * 동작: quests.yaml 을 직접 수정. 완료 시 campaign.yaml flags 에 플래그 추가.
 * stdout 마지막 줄에 JSON: {"changed":[...],"deltas":{...},"summary":"...","scene_block"?:"..."}
 * scene_block 은 quest:<slug> 마커 한 줄 — scene.md 에 append.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  quest: string;
  event: "progress" | "complete" | "fail";
  step?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  if (!args.quest || !args.event) {
    console.error("Usage: scripts/quest-progress.ts --quest <slug> --event <progress|complete|fail> [--step \"...\"]");
    process.exit(1);
  }
  if (!["progress", "complete", "fail"].includes(args.event)) {
    console.error(`--event must be progress|complete|fail`); process.exit(1);
  }
  return { quest: args.quest, event: args.event as Args["event"], step: args.step };
}

// ─── Locate quest block ──────────────────────────────────────────────────────

interface QuestBlock {
  track: "main" | "companion" | "side";
  slug: string;
  start: number;  // char index of "    - slug: <slug>" line start
  end: number;    // char index of next quest/track boundary
  body: string;
}

function locateQuest(raw: string, slug: string): QuestBlock | null {
  // Find "    - slug: <slug>" (4-space indent, array entry under quest track)
  const rx = new RegExp(`^    - slug:\\s*${slug}\\s*$`, "m");
  const m = raw.match(rx);
  if (!m || m.index === undefined) return null;
  const start = m.index;

  // Find next boundary: next "    - slug:" line OR "  <track>:" line
  const afterIdx = start + m[0].length;
  const rest = raw.slice(afterIdx);
  const nextEntry = rest.match(/^    - slug:\s*\w+\s*$/m);
  const nextTrack = rest.match(/^  \w+:\s*$/m);

  let endOffset = rest.length;
  if (nextEntry?.index !== undefined) endOffset = Math.min(endOffset, nextEntry.index);
  if (nextTrack?.index !== undefined) endOffset = Math.min(endOffset, nextTrack.index);
  const end = afterIdx + endOffset;
  const body = raw.slice(start, end);

  // Determine track = LATEST track header appearing before `start`
  const tracks = ["main", "companion", "side"] as const;
  let latestTrackIdx = -1;
  let latestTrack: QuestBlock["track"] = "side";
  for (const t of tracks) {
    for (const match of raw.matchAll(new RegExp(`^  ${t}:\\s*$`, "gm"))) {
      if (match.index !== undefined && match.index < start && match.index > latestTrackIdx) {
        latestTrackIdx = match.index;
        latestTrack = t;
      }
    }
  }

  return { track: latestTrack, slug, start, end, body };
}

// ─── Apply event to quest body ───────────────────────────────────────────────

function applyEvent(body: string, event: Args["event"], step?: string): { newBody: string; completionFlag?: string } {
  let newBody = body;

  // Status update
  const newStatus = event === "progress" ? "active" : event === "complete" ? "complete" : "failed";
  newBody = newBody.replace(/^(\s+status:\s*)\w+/m, `$1${newStatus}`);

  // Current step
  if (step && event === "progress") {
    // Replace current_step line — may be `null` or a string
    newBody = newBody.replace(/^(\s+current_step:\s*).*$/m, `$1"${step}"`);
    // Also append to steps_completed the previous current_step if it was non-null
    const prevStep = body.match(/^\s+current_step:\s*"?([^"\n]+)"?\s*$/m);
    if (prevStep && prevStep[1].trim() !== "null" && !prevStep[1].startsWith("(")) {
      // Append previous step to steps_completed
      newBody = newBody.replace(
        /^(\s+steps_completed:\s*\[)([^\]]*)(\])/m,
        (_, p1, inner, p3) => {
          const items = inner.trim() ? `${inner.trim()}, "${prevStep[1].trim()}"` : `"${prevStep[1].trim()}"`;
          return `${p1}${items}${p3}`;
        },
      );
    }
  }
  if (event === "complete" || event === "fail") {
    newBody = newBody.replace(/^(\s+current_step:\s*).*$/m, `$1null`);
  }

  // Extract completion flag if present (on complete only)
  let completionFlag: string | undefined;
  if (event === "complete") {
    const flagMatch = body.match(/^\s+completion_flag:\s*(\w+)\s*$/m);
    if (flagMatch) completionFlag = flagMatch[1];
  }

  return { newBody, completionFlag };
}

// ─── Add flag to campaign.yaml ───────────────────────────────────────────────

// 반환값: 실제로 수정된 경우 true. 이미 존재하거나 파일이 없으면 false.
function addCampaignFlag(flag: string): boolean {
  const path = "files/campaign.yaml";
  if (!existsSync(path)) return false;
  const raw = readFileSync(path, "utf-8");
  const m = raw.match(/^flags:\s*\[([^\]]*)\]/m);
  if (!m) return false;
  const inner = m[1].trim();
  if (inner.split(",").map(s => s.trim()).includes(flag)) return false;  // already present (idempotent)
  const newInner = inner ? `${inner}, ${flag}` : flag;
  const newRaw = raw.replace(/^flags:\s*\[([^\]]*)\]/m, `flags: [${newInner}]`);
  writeFileSync(path, newRaw, "utf-8");
  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  const qpath = "files/quests.yaml";
  if (!existsSync(qpath)) { console.error(`Missing: ${qpath}`); process.exit(1); }
  const raw = readFileSync(qpath, "utf-8");

  const block = locateQuest(raw, args.quest);
  if (!block) {
    console.error(`Quest '${args.quest}' not found in quests.yaml`);
    process.exit(1);
  }

  const { newBody, completionFlag } = applyEvent(block.body, args.event, args.step);
  const newRaw = raw.slice(0, block.start) + newBody + raw.slice(block.end);
  writeFileSync(qpath, newRaw, "utf-8");

  const changed: string[] = [qpath];
  let flagAdded = false;
  if (completionFlag) {
    flagAdded = addCampaignFlag(completionFlag);
    if (flagAdded) changed.push("files/campaign.yaml");
  }

  // scene.md 에 append 할 마커 한 줄
  const markerLines: string[] = [];
  if (args.event === "progress" && args.step) {
    markerLines.push(`[quest:${args.quest} step="${args.step}"]`);
  } else if (args.event === "complete") {
    markerLines.push(`[quest:${args.quest} complete]`);
  } else if (args.event === "fail") {
    markerLines.push(`[quest:${args.quest} fail]`);
  }

  const result = {
    changed,
    deltas: {
      quest: args.quest,
      track: block.track,
      event: args.event,
      ...(args.step ? { step: args.step } : {}),
      ...(completionFlag ? { completion_flag: completionFlag, flag_added: flagAdded } : {}),
    },
    summary:
      `퀘스트 ${args.quest} (${block.track}) ${args.event}` +
      (args.step ? ` · step "${args.step}"` : "") +
      (completionFlag ? ` · flag ${flagAdded ? "+" : "="}${completionFlag}` : ""),
    ...(markerLines.length > 0 ? { scene_block: markerLines.join("\n") } : {}),
  };

  console.log(JSON.stringify(result));
}

main();
