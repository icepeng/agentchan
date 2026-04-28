import type {
  DataFile,
  InventoryItem,
  LedgerEntry,
  ProjectFile,
  QuestEntry,
  RelationshipState,
  SalernStats,
  SalernStatus,
  WindKey,
  WorldMode,
  WorldState,
} from "./types";

function findDataFile(files: readonly ProjectFile[], path: string): DataFile | null {
  const file = files.find(
    (f): f is DataFile => f.type === "data" && f.path === path,
  );
  return file ?? null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asWind(value: unknown): WindKey | undefined {
  if (value === "north" || value === "east" || value === "south") return value;
  if (typeof value === "string") {
    if (/north|북/i.test(value)) return "north";
    if (/east|동/i.test(value)) return "east";
    if (/south|남/i.test(value)) return "south";
  }
  return undefined;
}

export function readStatusYaml(files: readonly ProjectFile[]): SalernStatus | null {
  const file = findDataFile(files, "status.yaml");
  if (!file) return null;
  const root = asObject(file.data);
  if (!root) return null;
  const hpObj = asObject(root.hp) ?? {};
  const mpObj = asObject(root.mp) ?? {};
  const conditionsRaw = Array.isArray(root.conditions) ? root.conditions : [];
  return {
    hp: { current: asNumber(hpObj.current, 0), max: asNumber(hpObj.max, 0) },
    mp: { current: asNumber(mpObj.current, 0), max: asNumber(mpObj.max, 0) },
    emotion: asString(root.emotion),
    location: asString(root.location),
    conditions: conditionsRaw
      .map((c) => (typeof c === "string" ? c : null))
      .filter((c): c is string => c !== null && c.length > 0),
  };
}

export function readStatsYaml(files: readonly ProjectFile[]): SalernStats | null {
  const file = findDataFile(files, "stats.yaml");
  if (!file) return null;
  const root = asObject(file.data);
  if (!root) return null;
  return {
    "힘": asNumber(root["힘"], 0),
    "민첩": asNumber(root["민첩"], 0),
    "통찰": asNumber(root["통찰"], 0),
    "화술": asNumber(root["화술"], 0),
  };
}

export function readInventoryYaml(files: readonly ProjectFile[]): InventoryItem[] {
  const file = findDataFile(files, "inventory.yaml");
  if (!file) return [];
  const root = asObject(file.data);
  if (!root) return [];
  const items = Array.isArray(root.items) ? root.items : [];
  const out: InventoryItem[] = [];
  for (const raw of items) {
    const obj = asObject(raw);
    if (!obj) continue;
    const slug = asString(obj.slug) ?? "";
    const name = asString(obj.name) ?? slug;
    if (!name) continue;
    const item: InventoryItem = { slug, name };
    if (typeof obj.qty === "number") item.qty = obj.qty;
    const note = asString(obj.note);
    if (note) item.note = note;
    out.push(item);
  }
  return out;
}

export function readLedgerYaml(files: readonly ProjectFile[]): LedgerEntry[] {
  const file = findDataFile(files, "ledger.yaml");
  if (!file) return [];
  const root = asObject(file.data);
  if (!root) return [];
  const entries = Array.isArray(root.entries) ? root.entries : [];
  const out: LedgerEntry[] = [];
  for (const raw of entries) {
    const obj = asObject(raw);
    if (!obj) continue;
    const id = asString(obj.id);
    const title = asString(obj.title);
    if (!id || !title) continue;
    const status = obj.status === "linked" || obj.status === "resolved" ? obj.status : "open";
    const linksRaw = Array.isArray(obj.links) ? obj.links : [];
    const links = linksRaw
      .map((l) => (typeof l === "string" ? l : null))
      .filter((l): l is string => l !== null && l.length > 0);
    out.push({
      id,
      title,
      status,
      clue: asString(obj.clue),
      note: asString(obj.note),
      links,
      wind: asWind(obj.wind),
    });
  }
  return out;
}

export function readQuestYaml(files: readonly ProjectFile[]): QuestEntry[] {
  const file = findDataFile(files, "quest.yaml");
  if (!file) return [];
  const root = asObject(file.data);
  if (!root) return [];
  const list = Array.isArray(root.quests) ? root.quests : [];
  const out: QuestEntry[] = [];
  for (const raw of list) {
    const obj = asObject(raw);
    if (!obj) continue;
    const id = asString(obj.id);
    const title = asString(obj.title);
    if (!id || !title) continue;
    out.push({
      id,
      title,
      status: obj.status === "done" ? "done" : "active",
      note: asString(obj.note),
    });
  }
  return out;
}

export function readRelationshipYaml(files: readonly ProjectFile[]): RelationshipState | null {
  const file = findDataFile(files, "relationship.yaml");
  if (!file) return null;
  const root = asObject(file.data);
  if (!root) return null;
  const riwu = asObject(root.riwu);
  if (!riwu) return null;
  return {
    trust: asNumber(riwu.trust, 0),
    stance: asString(riwu.stance),
    note: asString(riwu.note),
    lastShift: asString(riwu.last_shift),
  };
}

export function readWorldStateYaml(files: readonly ProjectFile[]): WorldState {
  const file = findDataFile(files, "world-state.yaml");
  const fallback: WorldState = { mode: "peace", act: 1 };
  if (!file) return fallback;
  const root = asObject(file.data);
  if (!root) return fallback;
  const mode: WorldMode = root.mode === "combat" ? "combat" : "peace";
  const act = asNumber(root.act, 1);
  return { mode, act: Math.min(3, Math.max(1, Math.round(act))) };
}
