/**
 * scripts/quest-progress.ts
 *
 * Updates a quest's status or step in quests.yaml. On completion, adds the
 * completion_flag to campaign.yaml's flags array (for endings DSL).
 *
 * Self-contained — block-based YAML patching via regex.
 *
 * Usage: --quest <slug> --event <progress|complete|fail> [--step "<description>"]
 *
 * 동작: quests.yaml 을 직접 수정. 완료 시 campaign.yaml flags 에 플래그 추가.
 * 반환 JSON: {changed, deltas, summary, scene_block?}.
 * scene_block 은 quest:<slug> 마커 한 줄 — scene.md 에 append.
 */

import type { ScriptContext } from "@agentchan/creative-agent";

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  quest: string;
  event: "progress" | "complete" | "fail";
  step?: string;
}

function parseQuestArgs(argv: readonly string[], ctx: ScriptContext): Args {
  const { values } = ctx.util.parseArgs({
    args: [...argv],
    options: {
      quest: { type: "string" },
      event: { type: "string" },
      step: { type: "string" },
    },
    strict: true,
  });
  const quest = values.quest;
  const event = values.event;
  if (!quest || !event) {
    throw new Error("Usage: --quest <slug> --event <progress|complete|fail> [--step \"...\"]");
  }
  if (!["progress", "complete", "fail"].includes(event)) {
    throw new Error("--event must be progress|complete|fail");
  }
  return { quest, event: event as Args["event"], step: values.step };
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

function addCampaignFlag(ctx: ScriptContext, flag: string): boolean {
  const path = "files/campaign.yaml";
  if (!ctx.project.exists(path)) return false;
  const raw = ctx.project.readFile(path);
  const m = raw.match(/^flags:\s*\[([^\]]*)\]/m);
  if (!m) return false;
  const inner = (m[1] ?? "").trim();
  if (inner.split(",").map((s) => s.trim()).includes(flag)) return false;
  const newInner = inner ? `${inner}, ${flag}` : flag;
  const newRaw = raw.replace(/^flags:\s*\[([^\]]*)\]/m, `flags: [${newInner}]`);
  ctx.project.writeFile(path, newRaw);
  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function (rawArgs: readonly string[], ctx: ScriptContext) {
  const args = parseQuestArgs(rawArgs, ctx);

  const qpath = "files/quests.yaml";
  if (!ctx.project.exists(qpath)) throw new Error(`Missing: ${qpath}`);
  const raw = ctx.project.readFile(qpath);

  const block = locateQuest(raw, args.quest);
  if (!block) throw new Error(`Quest '${args.quest}' not found in quests.yaml`);

  const { newBody, completionFlag } = applyEvent(block.body, args.event, args.step);
  const newRaw = raw.slice(0, block.start) + newBody + raw.slice(block.end);
  ctx.project.writeFile(qpath, newRaw);

  const changed: string[] = [qpath];
  let flagAdded = false;
  if (completionFlag) {
    flagAdded = addCampaignFlag(ctx, completionFlag);
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

  return {
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
}
