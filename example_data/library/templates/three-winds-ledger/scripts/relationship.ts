#!/usr/bin/env bun
/**
 * scripts/relationship.ts
 *
 * Applies a trust cue event to an NPC (or riwu). Checks cooldown against
 * recent scene history, clamps value to [-5, +5], outputs [STAT] marker and
 * YAML patch.
 *
 * YAML 읽기는 Bun.YAML.parse, 쓰기는 field-level 문자열 치환 (주석·포맷 보존).
 *
 * Usage:
 *   scripts/relationship.ts --npc <slug> --event <trigger_slug> --delta <+N|-N>
 *                           [--skip-cooldown]      (bypass 3-scene cooldown for plot-critical)
 *                           [--cooldown-scenes <N>] (override default 3)
 *
 * 동작: trust 값을 clamp([-5,+5])하여 stats.yaml 또는 party.yaml 을 직접 수정.
 * stdout 마지막 줄에 JSON: {"changed":[...],"deltas":{...},"summary":"...","scene_block":"[STAT] ..."}
 * scene_block 은 scene.md 에 append 할 한 줄 마커 (변화 없을 때도 방향 'steady' 로 포함).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  npc: string;
  event: string;
  delta: number;
  skipCooldown: boolean;
  cooldownScenes: number;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--skip-cooldown") { args.skipCooldown = true; continue; }
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1];
      i++;
    }
  }
  const npc = args.npc as string;
  const event = args.event as string;
  const deltaStr = args.delta as string;
  if (!npc || !event || deltaStr === undefined) {
    console.error("Usage: scripts/relationship.ts --npc <slug> --event <trigger> --delta <+N|-N>");
    process.exit(1);
  }
  // Delta parse: accepts "+1", "-2", "1", "-3"
  const delta = parseInt(deltaStr.replace(/^\+/, ""), 10);
  if (isNaN(delta)) { console.error(`--delta must be integer. got: ${deltaStr}`); process.exit(1); }
  if (Math.abs(delta) > 3) { console.error(`--delta must be in [-3, +3]. SYSTEM.md §5 forbids ±4+`); process.exit(1); }
  return {
    npc,
    event,
    delta,
    skipCooldown: !!args.skipCooldown,
    cooldownScenes: args["cooldown-scenes"] ? parseInt(args["cooldown-scenes"] as string, 10) : 3,
  };
}

// ─── Cooldown check ──────────────────────────────────────────────────────────

function checkCooldown(npc: string, event: string, windowScenes: number): { blocked: boolean; reason?: string } {
  if (!existsSync("files/scenes/scene.md")) return { blocked: false };
  const raw = readFileSync("files/scenes/scene.md", "utf-8");
  const statusMatches = Array.from(raw.matchAll(/\[\/STATUS\]/g));
  if (statusMatches.length === 0) return { blocked: false };

  // Window = from (N+1)-th-from-last [/STATUS] marker to EOF
  let windowStart = 0;
  if (statusMatches.length > windowScenes) {
    const anchor = statusMatches[statusMatches.length - windowScenes - 1];
    windowStart = anchor.index! + anchor[0].length;
  }
  const window = raw.slice(windowStart);

  // Look for matching [STAT] line
  const rx = new RegExp(
    `\\[STAT\\]\\s+${npc}\\s+[+-]?\\d+\\s+\\(${event.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\)`,
    "g",
  );
  const hit = rx.test(window);
  return hit
    ? { blocked: true, reason: `최근 ${windowScenes}씬 내 동일 이벤트(${event}) 이미 발생 — 쿨다운` }
    : { blocked: false };
}

// ─── Read current trust ──────────────────────────────────────────────────────

function readCurrentTrust(npc: string): { value: number; source: "stats.yaml" | "party.yaml" } {
  if (npc === "riwu") {
    const data = Bun.YAML.parse(readFileSync("files/party.yaml", "utf-8")) as
      { companions?: { riwu?: { trust?: number } } };
    const v = data?.companions?.riwu?.trust;
    if (typeof v !== "number") { console.error("riwu.trust not found in party.yaml"); process.exit(1); }
    return { value: v, source: "party.yaml" };
  } else {
    const data = Bun.YAML.parse(readFileSync("files/stats.yaml", "utf-8")) as
      { npcs?: Record<string, number> };
    const v = data?.npcs?.[npc];
    if (typeof v !== "number") { console.error(`${npc} not found in stats.yaml npcs: block`); process.exit(1); }
    return { value: v, source: "stats.yaml" };
  }
}

// ─── Update trust value ──────────────────────────────────────────────────────

function updateTrust(npc: string, newVal: number, source: "stats.yaml" | "party.yaml"): string {
  if (source === "stats.yaml") {
    const path = "files/stats.yaml";
    const raw = readFileSync(path, "utf-8");
    const rx = new RegExp(`^(  ${npc}:\\s*)-?\\d+`, "m");
    const newRaw = raw.replace(rx, `$1${newVal}`);
    writeFileSync(path, newRaw, "utf-8");
    return path;
  } else {
    const path = "files/party.yaml";
    const raw = readFileSync(path, "utf-8");
    const blockRx = /(^  riwu:[\s\S]*?trust:\s*)-?\d+/m;
    const newRaw = raw.replace(blockRx, `$1${newVal}`);
    writeFileSync(path, newRaw, "utf-8");
    return path;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  // Cooldown
  if (!args.skipCooldown) {
    const cd = checkCooldown(args.npc, args.event, args.cooldownScenes);
    if (cd.blocked) {
      console.log(JSON.stringify({
        changed: [],
        deltas: {},
        summary: `쿨다운 적용 — trust 변화 없음 (${cd.reason})`,
      }));
      return;
    }
  }

  const { value: oldVal, source } = readCurrentTrust(args.npc);
  const newVal = Math.max(-5, Math.min(5, oldVal + args.delta));
  const actualDelta = newVal - oldVal;

  const direction: "rising" | "falling" | "steady" =
    actualDelta > 0 ? "rising" : actualDelta < 0 ? "falling" : "steady";

  const deltaStr = actualDelta >= 0 ? `+${actualDelta}` : `${actualDelta}`;
  const statLine = `[STAT] ${args.npc} ${deltaStr} (${args.event}) ${direction}`;

  const changed: string[] = [];
  if (actualDelta !== 0) {
    const updatedPath = updateTrust(args.npc, newVal, source);
    changed.push(updatedPath);
  }

  const result = {
    changed,
    deltas: {
      [`${args.npc}.trust`]: { from: oldVal, to: newVal, delta: actualDelta, direction },
      event: args.event,
    },
    summary:
      actualDelta === 0
        ? `${args.npc} trust ${newVal} — 경계값 도달, 변화 없음 (event ${args.event})`
        : `${args.npc} trust ${oldVal} → ${newVal} (${deltaStr} ${direction}, event ${args.event})`,
    scene_block: statLine,
  };

  console.log(JSON.stringify(result));
}

main();
