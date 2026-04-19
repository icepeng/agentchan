/**
 * scripts/relationship.ts
 *
 * Applies a trust cue event to an NPC (or riwu). Checks cooldown against
 * recent scene history, clamps value to [-5, +5], outputs [STAT] marker and
 * YAML patch.
 *
 * Usage: --npc <slug> --event <trigger_slug> --delta <+N|-N>
 *        [--skip-cooldown] [--cooldown-scenes <N>]
 *
 * 반환 JSON: {changed, deltas, summary, scene_block}.
 */

import type { ScriptContext } from "@agentchan/creative-agent";

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  npc: string;
  event: string;
  delta: number;
  skipCooldown: boolean;
  cooldownScenes: number;
}

function parseRelArgs(argv: readonly string[], ctx: ScriptContext): Args {
  const { values } = ctx.util.parseArgs({
    args: [...argv],
    options: {
      npc: { type: "string" },
      event: { type: "string" },
      delta: { type: "string" },
      "skip-cooldown": { type: "boolean" },
      "cooldown-scenes": { type: "string" },
    },
    strict: true,
  });
  const { npc, event, delta: deltaStr } = values;
  if (!npc || !event || deltaStr === undefined) {
    throw new Error("Usage: --npc <slug> --event <trigger> --delta <+N|-N>");
  }
  const delta = parseInt(deltaStr.replace(/^\+/, ""), 10);
  if (isNaN(delta)) throw new Error(`--delta must be integer. got: ${deltaStr}`);
  if (Math.abs(delta) > 3) throw new Error("--delta must be in [-3, +3]. SYSTEM.md §5 forbids ±4+");
  return {
    npc,
    event,
    delta,
    skipCooldown: values["skip-cooldown"] === true,
    cooldownScenes: values["cooldown-scenes"] ? parseInt(values["cooldown-scenes"], 10) : 3,
  };
}

// ─── Cooldown check ──────────────────────────────────────────────────────────

function checkCooldown(ctx: ScriptContext, npc: string, event: string, windowScenes: number): { blocked: boolean; reason?: string } {
  if (!ctx.project.exists("files/scenes/scene.md")) return { blocked: false };
  const raw = ctx.project.readFile("files/scenes/scene.md");
  const statusMatches = Array.from(raw.matchAll(/<\/status>/gi));
  if (statusMatches.length === 0) return { blocked: false };

  let windowStart = 0;
  if (statusMatches.length > windowScenes) {
    const anchor = statusMatches[statusMatches.length - windowScenes - 1]!;
    windowStart = anchor.index! + anchor[0].length;
  }
  const window = raw.slice(windowStart);

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

function readCurrentTrust(ctx: ScriptContext, npc: string): { value: number; source: "stats.yaml" | "party.yaml" } {
  if (npc === "riwu") {
    const data = ctx.yaml.parse(ctx.project.readFile("files/party.yaml")) as
      { companions?: { riwu?: { trust?: number } } };
    const v = data?.companions?.riwu?.trust;
    if (typeof v !== "number") throw new Error("riwu.trust not found in party.yaml");
    return { value: v, source: "party.yaml" };
  } else {
    const data = ctx.yaml.parse(ctx.project.readFile("files/stats.yaml")) as
      { npcs?: Record<string, number> };
    const v = data?.npcs?.[npc];
    if (typeof v !== "number") throw new Error(`${npc} not found in stats.yaml npcs: block`);
    return { value: v, source: "stats.yaml" };
  }
}

// ─── Update trust value ──────────────────────────────────────────────────────

function updateTrust(ctx: ScriptContext, npc: string, newVal: number, source: "stats.yaml" | "party.yaml"): string {
  if (source === "stats.yaml") {
    const path = "files/stats.yaml";
    const raw = ctx.project.readFile(path);
    const rx = new RegExp(`^(  ${npc}:\\s*)-?\\d+`, "m");
    const newRaw = raw.replace(rx, `$1${newVal}`);
    ctx.project.writeFile(path, newRaw);
    return path;
  } else {
    const path = "files/party.yaml";
    const raw = ctx.project.readFile(path);
    const blockRx = /(^  riwu:[\s\S]*?trust:\s*)-?\d+/m;
    const newRaw = raw.replace(blockRx, `$1${newVal}`);
    ctx.project.writeFile(path, newRaw);
    return path;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function (rawArgs: readonly string[], ctx: ScriptContext) {
  const args = parseRelArgs(rawArgs, ctx);

  if (!args.skipCooldown) {
    const cd = checkCooldown(ctx, args.npc, args.event, args.cooldownScenes);
    if (cd.blocked) {
      return {
        changed: [],
        deltas: {},
        summary: `쿨다운 적용 — trust 변화 없음 (${cd.reason})`,
      };
    }
  }

  const { value: oldVal, source } = readCurrentTrust(ctx, args.npc);
  const newVal = Math.max(-5, Math.min(5, oldVal + args.delta));
  const actualDelta = newVal - oldVal;

  const direction: "rising" | "falling" | "steady" =
    actualDelta > 0 ? "rising" : actualDelta < 0 ? "falling" : "steady";

  const deltaStr = actualDelta >= 0 ? `+${actualDelta}` : `${actualDelta}`;
  const statLine = `[STAT] ${args.npc} ${deltaStr} (${args.event}) ${direction}`;

  const changed: string[] = [];
  if (actualDelta !== 0) {
    const updatedPath = updateTrust(ctx, args.npc, newVal, source);
    changed.push(updatedPath);
  }

  return {
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
}
