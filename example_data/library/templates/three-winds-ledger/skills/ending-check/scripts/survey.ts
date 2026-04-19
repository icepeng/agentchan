/**
 * ending-check/survey.ts
 *
 * Evaluates all 9 ending gates in campaign.yaml against the current state.
 * Reports which endings are OPEN, which are closest (by satisfied atom ratio),
 * and remaining gap for top 3 candidates.
 *
 * 반환: {changed:[], deltas:{open:[...],top3:[...]}, summary}.
 */

import type { ScriptContext } from "@agentchan/creative-agent";

function loadYaml<T = unknown>(ctx: ScriptContext, path: string): T | null {
  if (!ctx.project.exists(path)) return null;
  return ctx.yaml.parse(ctx.project.readFile(path)) as T;
}

// ─── State aggregation ───────────────────────────────────────────────────────

interface State {
  trust: Record<string, number>;
  flags: string[];
  evidence: string[];
  choices: Record<string, boolean>;
}

function readState(ctx: ScriptContext): State {
  const trust: Record<string, number> = {};

  const stats = loadYaml<{ npcs?: Record<string, number> }>(ctx, "files/stats.yaml");
  if (stats?.npcs) for (const [k, v] of Object.entries(stats.npcs)) {
    if (typeof v === "number") trust[k] = v;
  }

  const party = loadYaml<{ companions?: { riwu?: { trust?: number } } }>(ctx, "files/party.yaml");
  const riwuTrust = party?.companions?.riwu?.trust;
  if (typeof riwuTrust === "number") trust.riwu = riwuTrust;

  const campaign = loadYaml<{ flags?: string[]; choices?: Record<string, boolean> }>(ctx, "files/campaign.yaml");
  const flags = Array.isArray(campaign?.flags)
    ? campaign.flags.filter((s): s is string => typeof s === "string")
    : [];
  const choices: Record<string, boolean> = {};
  if (campaign?.choices) for (const [k, v] of Object.entries(campaign.choices)) {
    if (typeof v === "boolean") choices[k] = v;
  }

  const inventory = loadYaml<{ evidence?: Array<{ slug?: string } | string> }>(ctx, "files/inventory.yaml");
  const evidence: string[] = [];
  if (Array.isArray(inventory?.evidence)) for (const e of inventory.evidence) {
    if (typeof e === "string") evidence.push(e);
    else if (e && typeof e === "object" && typeof e.slug === "string") evidence.push(e.slug);
  }

  return { trust, flags, evidence, choices };
}

// ─── DSL evaluator ───────────────────────────────────────────────────────────

interface AtomResult { atom: string; value: boolean; explain: string; }
interface EvalResult { value: boolean; atoms: AtomResult[]; }

function evalCondition(cond: string, state: State): EvalResult {
  const atoms: AtomResult[] = [];
  const atomTable = new Map<string, boolean>();

  function sub(text: string, rx: RegExp, resolver: (...args: string[]) => { value: boolean; explain: string }): string {
    return text.replace(rx, (match, ...groups) => {
      const { value, explain } = resolver(...groups);
      const placeholder = `__ATOM_${atomTable.size}__`;
      atomTable.set(placeholder, value);
      atoms.push({ atom: match, value, explain });
      return placeholder;
    });
  }

  let js = cond;
  js = sub(js, /trust:(\w+)\s*(>=|<=|==|>|<)\s*([+-]?\d+)/g, (npc, op, n) => {
    const t = state.trust[npc] ?? 0;
    const num = parseInt(n, 10);
    const pass = op === ">=" ? t >= num : op === "<=" ? t <= num : op === "==" ? t === num : op === ">" ? t > num : t < num;
    return { value: pass, explain: `trust:${npc}(${t})${op}${num}` };
  });
  js = sub(js, /flag:(\w+)/g, (name) => ({
    value: state.flags.includes(name),
    explain: `flag:${name}=${state.flags.includes(name)}`,
  }));
  js = sub(js, /evidence:(\w+)/g, (slug) => ({
    value: state.evidence.includes(slug),
    explain: `evidence:${slug}=${state.evidence.includes(slug)}`,
  }));
  js = sub(js, /choice:(\w+)\s*=\s*(true|false)/g, (slug, val) => {
    const actual = state.choices[slug];
    const pass = actual !== undefined && String(actual) === val;
    return { value: pass, explain: `choice:${slug}=${actual ?? "unset"}→want ${val}` };
  });
  js = sub(js, /clues_found\s*(>=|<=|==|>|<)\s*(\d+)/g, (op, n) => {
    const c = state.evidence.length;
    const num = parseInt(n, 10);
    const pass = op === ">=" ? c >= num : op === "<=" ? c <= num : op === "==" ? c === num : op === ">" ? c > num : c < num;
    return { value: pass, explain: `clues_found(${c})${op}${num}` };
  });

  js = js.replace(/\bAND\b/g, "&&").replace(/\bOR\b/g, "||").replace(/\bNOT\b/g, "!");
  js = js.replace(/__ATOM_(\d+)__/g, (_, n) => String(atomTable.get(`__ATOM_${n}__`) ?? false));

  let value = false;
  try { value = !!new Function(`return (${js})`)(); }
  catch (e) { throw new Error(`DSL eval failed: ${cond}\n  → ${js}\n  → ${e}`); }

  return { value, atoms };
}

// ─── Read campaign endings ───────────────────────────────────────────────────

interface Ending {
  slug: string;
  title: string;
  primary_axis: string;
  summary: string;
  act3_gate: string;
  tone: string;
}

function readEndings(ctx: ScriptContext): Ending[] {
  const data = loadYaml<{
    endings?: Record<string, { title?: string; primary_axis?: string; summary?: string; act3_gate?: string; tone?: string }>;
  }>(ctx, "files/campaign.yaml");
  if (!data?.endings) throw new Error("campaign.yaml missing endings: block");

  const endings: Ending[] = [];
  for (const [slug, e] of Object.entries(data.endings)) {
    const gate = e?.act3_gate;
    if (typeof gate !== "string" || !gate) continue;
    endings.push({
      slug,
      title: typeof e.title === "string" ? e.title : slug,
      primary_axis: typeof e.primary_axis === "string" ? e.primary_axis : "unknown",
      summary: typeof e.summary === "string" ? e.summary : "",
      act3_gate: gate,
      tone: typeof e.tone === "string" ? e.tone : "",
    });
  }
  return endings;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface Evaluated extends Ending {
  result: EvalResult;
  satisfiedRatio: number;
}

export default function (_args: readonly string[], ctx: ScriptContext) {
  const state = readState(ctx);
  const endings = readEndings(ctx);

  if (endings.length === 0) {
    return {
      changed: [],
      deltas: { total: 0, open: [], top3: [] },
      summary: "캠페인 파일에 엔딩이 정의되지 않음 — ending-check 건너뜀",
    };
  }

  const evaluated: Evaluated[] = endings.map((e) => {
    const result = evalCondition(e.act3_gate, state);
    const total = result.atoms.length;
    const passed = result.atoms.filter((a) => a.value).length;
    const satisfiedRatio = total === 0 ? 0 : passed / total;
    return { ...e, result, satisfiedRatio };
  });

  const openList = evaluated.filter((e) => e.result.value);
  const closed = evaluated.filter((e) => !e.result.value).sort((a, b) => b.satisfiedRatio - a.satisfiedRatio);
  const top3 = closed.slice(0, 3);

  return {
    changed: [],
    deltas: {
      total: endings.length,
      open: openList.map((e) => ({
        slug: e.slug, title: e.title, primary_axis: e.primary_axis, tone: e.tone,
      })),
      top3: top3.map((e) => {
        const passed = e.result.atoms.filter((a) => a.value).length;
        const total = e.result.atoms.length;
        const missing = e.result.atoms.filter((a) => !a.value).map((a) => a.atom);
        return {
          slug: e.slug,
          title: e.title,
          primary_axis: e.primary_axis,
          tone: e.tone,
          ratio: Math.round(e.satisfiedRatio * 100),
          passed,
          total,
          missing,
        };
      }),
    },
    summary:
      `엔딩 조사 (${endings.length}개) — OPEN ${openList.length}, 근접 top3: ` +
      top3.map((e) => `${e.slug}(${Math.round(e.satisfiedRatio * 100)}%)`).join(", ") +
      (openList.length > 0 ? `. OPEN 후보: ${openList.map((e) => e.slug).join(", ")}` : ""),
  };
}
