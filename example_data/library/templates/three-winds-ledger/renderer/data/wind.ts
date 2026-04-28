import type { LedgerEntry, WindBalance, WindKey, WorldState } from "./types";

const NORTH_HINTS = ["북풍", "경비대", "수도원", "성 엘렌", "마샬", "테렌", "셀렌", "귀족", "watch", "north"];
const EAST_HINTS = ["동풍", "황동", "길드", "장부", "알라나", "선적", "상인", "brass", "ledger", "guild", "east"];
const SOUTH_HINTS = ["남풍", "암시장", "고아", "리우", "카엘렌", "아랫부두", "underwharf", "south"];

function classifyText(text: string): WindKey | null {
  const lower = text.toLowerCase();
  for (const h of NORTH_HINTS) if (lower.includes(h.toLowerCase())) return "north";
  for (const h of EAST_HINTS) if (lower.includes(h.toLowerCase())) return "east";
  for (const h of SOUTH_HINTS) if (lower.includes(h.toLowerCase())) return "south";
  return null;
}

export function deriveWindBalance(
  ledger: readonly LedgerEntry[],
  world: WorldState,
): WindBalance {
  const counts = { north: 0, east: 0, south: 0 };
  counts[mapActDefault(world.act)] += 0.6;

  for (const entry of ledger) {
    const wind = entry.wind ?? classifyEntry(entry);
    if (wind) {
      const weight = entry.status === "resolved" ? 0.4 : entry.status === "linked" ? 1.2 : 0.8;
      counts[wind] += weight;
    }
  }

  const total = counts.north + counts.east + counts.south || 1;
  const balance = {
    north: counts.north / total,
    east: counts.east / total,
    south: counts.south / total,
  };
  const dominant: WindKey =
    balance.north >= balance.east && balance.north >= balance.south
      ? "north"
      : balance.east >= balance.south
        ? "east"
        : "south";

  return { ...balance, dominant };
}

function classifyEntry(entry: LedgerEntry): WindKey | null {
  const haystack = [entry.title, entry.clue ?? "", entry.note ?? "", ...entry.links].join(" ");
  return classifyText(haystack);
}

function mapActDefault(act: number): WindKey {
  if (act <= 1) return "south";
  if (act === 2) return "east";
  return "north";
}

export const WIND_LABEL: Record<WindKey, string> = {
  north: "북풍",
  east: "동풍",
  south: "남풍",
};

export const WIND_SUBLABEL: Record<WindKey, string> = {
  north: "오래된 질서",
  east: "장부의 질서",
  south: "물밑의 질서",
};

export const WIND_COLOR: Record<WindKey, string> = {
  north: "#7a8aa3",
  east: "#b6822a",
  south: "#9a3a4a",
};

export const WIND_ANGLE: Record<WindKey, number> = {
  north: 0,
  east: 120,
  south: 240,
};

export function classifyLink(link: string): WindKey | null {
  return classifyText(link);
}
