/**
 * scripts/travel.ts
 *
 * Moves the party between locations. Validates via door_to mesh (BFS),
 * computes time cost, updates world-state.yaml.
 *
 * Usage: --to <location-slug>
 *
 * 동작: world-state.yaml 의 time/day/location 을 직접 수정.
 * 반환 JSON: {changed, deltas, summary}.
 */

import type { ScriptContext } from "@agentchan/creative-agent";

// ─── Args ────────────────────────────────────────────────────────────────────

function parseTravelArgs(argv: readonly string[], ctx: ScriptContext): { to: string } {
  const { values } = ctx.util.parseArgs({
    args: [...argv],
    options: { to: { type: "string" } },
    strict: true,
  });
  const to = values.to;
  if (!to) throw new Error("Usage: --to <location-slug>");
  return { to };
}

// ─── Read world state ─────────────────────────────────────────────────────────

interface WorldState {
  time: string;  // "HH:MM"
  day: number;
  location: string;
  raw: string;
}

function readWorldState(ctx: ScriptContext): WorldState {
  const path = "files/world-state.yaml";
  if (!ctx.project.exists(path)) throw new Error(`Missing: ${path}`);
  const raw = ctx.project.readFile(path);
  const data = ctx.yaml.parse(raw) as { time?: string; day?: number; location?: string };
  if (typeof data?.time !== "string" || typeof data.day !== "number" || typeof data.location !== "string") {
    throw new Error("world-state.yaml missing required fields (time/day/location)");
  }
  return { time: data.time, day: data.day, location: data.location, raw };
}

// ─── Read locations mesh ──────────────────────────────────────────────────────

interface LocationNode {
  slug: string;
  name: string;
  doorTo: string[];
  timeCost: Record<string, number>;
}

function parseLocationFile(ctx: ScriptContext, path: string): LocationNode | null {
  const raw = ctx.project.readFile(path);
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm = ctx.yaml.parse(fmMatch[1] ?? "") as {
    slug?: string; name?: string; door_to?: string[]; time_cost?: Record<string, number>;
  };
  if (typeof fm?.slug !== "string") return null;
  return {
    slug: fm.slug,
    name: typeof fm.name === "string" ? fm.name : fm.slug,
    doorTo: Array.isArray(fm.door_to) ? fm.door_to.filter((s): s is string => typeof s === "string") : [],
    timeCost: fm.time_cost && typeof fm.time_cost === "object"
      ? Object.fromEntries(Object.entries(fm.time_cost).filter(([, v]) => typeof v === "number")) as Record<string, number>
      : {},
  };
}

function readLocations(ctx: ScriptContext): Map<string, LocationNode> {
  const dir = "files/locations";
  if (!ctx.project.exists(dir)) throw new Error(`Missing: ${dir}/`);
  const mesh = new Map<string, LocationNode>();
  for (const entry of ctx.project.listDir(dir)) {
    if (!entry.endsWith(".md")) continue;
    const node = parseLocationFile(ctx, `${dir}/${entry}`);
    if (node) mesh.set(node.slug, node);
  }
  return mesh;
}

// ─── BFS pathfinding ──────────────────────────────────────────────────────────

interface Path {
  nodes: string[];      // e.g. ["pier", "inn", "brewery"]
  totalMinutes: number;
}

function findShortestPath(
  mesh: Map<string, LocationNode>,
  from: string,
  to: string,
): Path | null {
  if (from === to) return { nodes: [from], totalMinutes: 0 };
  if (!mesh.has(from) || !mesh.has(to)) return null;

  // BFS with predecessor tracking
  const visited = new Set<string>([from]);
  const queue: string[] = [from];
  const pred = new Map<string, string>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const node = mesh.get(curr)!;
    for (const next of node.doorTo) {
      if (visited.has(next)) continue;
      visited.add(next);
      pred.set(next, curr);
      if (next === to) {
        // Reconstruct path
        const path: string[] = [to];
        let p = to;
        while (pred.has(p)) {
          p = pred.get(p)!;
          path.unshift(p);
        }
        // Sum time costs along edges
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i], b = path[i + 1];
          const cost = mesh.get(a)!.timeCost[b] ?? 10;  // fallback 10min
          total += cost;
        }
        return { nodes: path, totalMinutes: total };
      }
      queue.push(next);
    }
  }
  return null;
}

// ─── Time arithmetic ──────────────────────────────────────────────────────────

function addMinutes(time: string, day: number, addMin: number): { time: string; day: number } {
  const [hh, mm] = time.split(":").map(n => parseInt(n, 10));
  const totalMin = hh * 60 + mm + addMin;
  const newDay = day + Math.floor(totalMin / (24 * 60));
  const remain = totalMin % (24 * 60);
  const newHh = Math.floor(remain / 60);
  const newMm = remain % 60;
  return {
    time: `${String(newHh).padStart(2, "0")}:${String(newMm).padStart(2, "0")}`,
    day: newDay,
  };
}

// ─── Output ───────────────────────────────────────────────────────────────────

function rewriteWorldState(raw: string, newTime: string, newDay: number, newLoc: string): string {
  return raw
    .replace(/^time:\s*"[^"]*"/m, `time: "${newTime}"`)
    .replace(/^day:\s*\d+/m, `day: ${newDay}`)
    .replace(/^location:\s*\w+/m, `location: ${newLoc}`);
}

export default function (rawArgs: readonly string[], ctx: ScriptContext) {
  const { to } = parseTravelArgs(rawArgs, ctx);
  const ws = readWorldState(ctx);

  if (ws.location === to) {
    return {
      changed: [],
      deltas: {},
      summary: `이미 ${to} 에 있음. 이동 없음.`,
    };
  }

  const mesh = readLocations(ctx);
  if (!mesh.has(to)) {
    throw new Error(`Unknown location: ${to}. Known: ${[...mesh.keys()].join(", ")}`);
  }
  if (!mesh.has(ws.location)) {
    throw new Error(`Current location not in mesh: ${ws.location}`);
  }

  const path = findShortestPath(mesh, ws.location, to);
  if (!path) throw new Error(`No path from ${ws.location} to ${to} via door_to mesh.`);

  const fromName = mesh.get(ws.location)!.name;
  const toName = mesh.get(to)!.name;
  const arrival = addMinutes(ws.time, ws.day, path.totalMinutes);
  const pathStr = path.nodes.map((s) => mesh.get(s)?.name ?? s).join(" → ");

  const newRaw = rewriteWorldState(ws.raw, arrival.time, arrival.day, to);
  ctx.project.writeFile("files/world-state.yaml", newRaw);

  return {
    changed: ["files/world-state.yaml"],
    deltas: {
      location: { from: ws.location, to },
      time: { from: ws.time, to: arrival.time },
      day: { from: ws.day, to: arrival.day },
      minutes: path.totalMinutes,
      path: path.nodes,
    },
    summary:
      `${fromName} → ${toName} · ${pathStr} · ${path.totalMinutes}분 ` +
      `(${ws.time} → ${arrival.time}${arrival.day !== ws.day ? `, ${arrival.day}일차` : ""})`,
  };
}
