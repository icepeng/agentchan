#!/usr/bin/env bun
/**
 * scripts/travel.ts
 *
 * Moves the party between locations. Validates via door_to mesh (BFS),
 * computes time cost, updates world-state.yaml.
 * YAML 읽기는 Bun.YAML.parse, 쓰기는 line 치환 (주석·포맷 보존).
 *
 * Usage:
 *   scripts/travel.ts --to <location-slug>
 *
 * 동작: world-state.yaml 의 time/day/location 을 직접 수정.
 * stdout 마지막 줄에 JSON 한 줄: {"changed":[...],"deltas":{...},"summary":"..."}
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Args ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { to: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  if (!args.to) { console.error("Usage: scripts/travel.ts --to <location-slug>"); process.exit(1); }
  return { to: args.to };
}

// ─── Read world state ─────────────────────────────────────────────────────────

interface WorldState {
  time: string;  // "HH:MM"
  day: number;
  location: string;
  raw: string;
}

function readWorldState(): WorldState {
  const path = "files/world-state.yaml";
  if (!existsSync(path)) { console.error(`Missing: ${path}`); process.exit(1); }
  const raw = readFileSync(path, "utf-8");
  const data = Bun.YAML.parse(raw) as { time?: string; day?: number; location?: string };
  if (typeof data?.time !== "string" || typeof data.day !== "number" || typeof data.location !== "string") {
    console.error(`world-state.yaml missing required fields (time/day/location)`); process.exit(1);
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

function parseLocationFile(path: string): LocationNode | null {
  const raw = readFileSync(path, "utf-8");
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm = Bun.YAML.parse(fmMatch[1]) as {
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

function readLocations(): Map<string, LocationNode> {
  const dir = "files/locations";
  if (!existsSync(dir)) { console.error(`Missing: ${dir}/`); process.exit(1); }
  const mesh = new Map<string, LocationNode>();
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".md")) continue;
    const node = parseLocationFile(join(dir, entry));
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

function main() {
  const { to } = parseArgs(process.argv.slice(2));
  const ws = readWorldState();

  if (ws.location === to) {
    console.log(JSON.stringify({
      changed: [],
      deltas: {},
      summary: `이미 ${to} 에 있음. 이동 없음.`,
    }));
    return;
  }

  const mesh = readLocations();
  if (!mesh.has(to)) {
    console.error(`Unknown location: ${to}. Known: ${[...mesh.keys()].join(", ")}`);
    process.exit(1);
  }
  if (!mesh.has(ws.location)) {
    console.error(`Current location not in mesh: ${ws.location}`);
    process.exit(1);
  }

  const path = findShortestPath(mesh, ws.location, to);
  if (!path) {
    console.error(`No path from ${ws.location} to ${to} via door_to mesh.`);
    process.exit(1);
  }

  const fromName = mesh.get(ws.location)!.name;
  const toName = mesh.get(to)!.name;
  const arrival = addMinutes(ws.time, ws.day, path.totalMinutes);
  const pathStr = path.nodes.map(s => mesh.get(s)?.name ?? s).join(" → ");

  const newRaw = rewriteWorldState(ws.raw, arrival.time, arrival.day, to);
  writeFileSync("files/world-state.yaml", newRaw, "utf-8");

  const result = {
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

  console.log(JSON.stringify(result));
}

main();
