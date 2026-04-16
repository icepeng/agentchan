#!/usr/bin/env bun
/**
 * act-transition/check-gate.ts
 *
 * Evaluates the next act gate condition from campaign.yaml against the
 * current state (flags, choices, trust, evidence). Reports OPEN/CLOSED
 * and (if closed) which atoms are still failing.
 *
 * Reads YAML via Bun.YAML.parse (no external deps, YAML 1.2 compliant).
 *
 * Usage:
 *   check-gate.ts
 *
 * 동작: 파일 수정 없음 (순수 질의).
 * stdout 마지막 줄에 JSON: {"changed":[],"deltas":{act,gate,open,atoms,narrative_cue?,required_beats?},"summary":"..."}
 * 전환 자체(act 갱신 + 씬 작성)는 LLM 의 서사적 결정.
 */

import { readFileSync, existsSync } from "node:fs";

// ─── YAML 로딩 헬퍼 ──────────────────────────────────────────────────────────

function loadYaml<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  return Bun.YAML.parse(readFileSync(path, "utf-8")) as T;
}

// ─── State aggregation ───────────────────────────────────────────────────────

interface State {
  trust: Record<string, number>;
  flags: string[];
  evidence: string[];        // slugs from inventory.yaml evidence array
  choices: Record<string, boolean>;
}

function readState(): State {
  const trust: Record<string, number> = {};

  const stats = loadYaml<{ npcs?: Record<string, number> }>("files/stats.yaml");
  if (stats?.npcs) for (const [k, v] of Object.entries(stats.npcs)) {
    if (typeof v === "number") trust[k] = v;
  }

  const party = loadYaml<{ companions?: { riwu?: { trust?: number } } }>("files/party.yaml");
  const riwuTrust = party?.companions?.riwu?.trust;
  if (typeof riwuTrust === "number") trust.riwu = riwuTrust;

  const campaign = loadYaml<{ flags?: string[]; choices?: Record<string, boolean> }>("files/campaign.yaml");
  const flags = Array.isArray(campaign?.flags)
    ? campaign.flags.filter((s): s is string => typeof s === "string")
    : [];
  const choices: Record<string, boolean> = {};
  if (campaign?.choices) for (const [k, v] of Object.entries(campaign.choices)) {
    if (typeof v === "boolean") choices[k] = v;
  }

  const inventory = loadYaml<{ evidence?: Array<{ slug?: string } | string> }>("files/inventory.yaml");
  const evidence: string[] = [];
  if (Array.isArray(inventory?.evidence)) for (const e of inventory.evidence) {
    if (typeof e === "string") evidence.push(e);
    else if (e && typeof e === "object" && typeof e.slug === "string") evidence.push(e.slug);
  }

  return { trust, flags, evidence, choices };
}

// ─── DSL evaluator ───────────────────────────────────────────────────────────

/** Returns { value, atomResults: [{ atom, value, explain }] } */
function evalCondition(cond: string, state: State): { value: boolean; atoms: Array<{ atom: string; value: boolean; explain: string }> } {
  const atoms: Array<{ atom: string; value: boolean; explain: string }> = [];
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
  // trust:<npc><op><N>
  js = sub(js, /trust:(\w+)\s*(>=|<=|==|>|<)\s*([+-]?\d+)/g, (npc, op, n) => {
    const t = state.trust[npc] ?? 0;
    const num = parseInt(n, 10);
    const pass =
      op === ">=" ? t >= num :
      op === "<=" ? t <= num :
      op === "==" ? t === num :
      op === ">"  ? t >  num : t < num;
    return { value: pass, explain: `trust:${npc}(${t})${op}${num}` };
  });
  // flag:<name>
  js = sub(js, /flag:(\w+)/g, (name) => {
    const pass = state.flags.includes(name);
    return { value: pass, explain: `flag:${name}=${pass}` };
  });
  // evidence:<slug>
  js = sub(js, /evidence:(\w+)/g, (slug) => {
    const pass = state.evidence.includes(slug);
    return { value: pass, explain: `evidence:${slug}=${pass}` };
  });
  // choice:<slug>=<bool>
  js = sub(js, /choice:(\w+)\s*=\s*(true|false)/g, (slug, val) => {
    const actual = state.choices[slug];
    const pass = actual !== undefined && String(actual) === val;
    return { value: pass, explain: `choice:${slug}=${actual ?? "unset"}→want ${val}` };
  });
  // clues_found<op><N>
  js = sub(js, /clues_found\s*(>=|<=|==|>|<)\s*(\d+)/g, (op, n) => {
    const c = state.evidence.length;
    const num = parseInt(n, 10);
    const pass =
      op === ">=" ? c >= num :
      op === "<=" ? c <= num :
      op === "==" ? c === num :
      op === ">"  ? c >  num : c < num;
    return { value: pass, explain: `clues_found(${c})${op}${num}` };
  });

  // Operators
  js = js.replace(/\bAND\b/g, "&&")
         .replace(/\bOR\b/g, "||")
         .replace(/\bNOT\b/g, "!");

  // Substitute placeholders with literal booleans
  js = js.replace(/__ATOM_(\d+)__/g, (_, n) => {
    const key = `__ATOM_${n}__`;
    return String(atomTable.get(key) ?? false);
  });

  let value = false;
  try {
    value = !!new Function(`return (${js})`)();
  } catch (e) {
    console.error(`DSL eval failed for: ${cond}\n  → transformed: ${js}\n  → error: ${e}`);
    process.exit(1);
  }

  return { value, atoms };
}

// ─── Read campaign act_gates ─────────────────────────────────────────────────

function readCampaignData(): {
  act: number;
  gates: Record<string, { condition: string; required_beats: string[]; narrative_cue: string }>;
} {
  const data = loadYaml<{
    act?: number;
    act_gates?: Record<string, { condition?: string; required_beats?: string[]; narrative_cue?: string }>;
  }>("files/campaign.yaml");
  if (!data || typeof data.act !== "number") {
    console.error("campaign.yaml missing 'act:' field"); process.exit(1);
  }

  const gates: Record<string, { condition: string; required_beats: string[]; narrative_cue: string }> = {};
  if (data.act_gates) for (const [name, g] of Object.entries(data.act_gates)) {
    gates[name] = {
      condition: g?.condition ?? "",
      required_beats: Array.isArray(g?.required_beats)
        ? g.required_beats.filter((s): s is string => typeof s === "string")
        : [],
      narrative_cue: g?.narrative_cue ?? "",
    };
  }
  return { act: data.act, gates };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const state = readState();
  const { act, gates } = readCampaignData();

  const targetGate = act === 1 ? "to_act2" : act === 2 ? "to_act3" : null;

  if (!targetGate) {
    console.log(JSON.stringify({
      changed: [],
      deltas: { act, gate: null, open: false, final_act: true },
      summary: `최종 막(${act}) — 전환 없음. ending-check 로 엔딩 후보 점검 권장.`,
    }));
    return;
  }

  const gate = gates[targetGate];
  if (!gate) {
    console.error(`Gate ${targetGate} not defined in campaign.yaml`);
    process.exit(1);
  }

  const { value, atoms } = evalCondition(gate.condition, state);
  const failed = atoms.filter(a => !a.value).map(a => a.atom);

  const result = {
    changed: [],
    deltas: {
      act,
      gate: targetGate,
      open: value,
      condition: gate.condition,
      atoms: atoms.map(a => ({ atom: a.atom, value: a.value, explain: a.explain })),
      ...(value ? { narrative_cue: gate.narrative_cue, next_act: act + 1 } : {}),
      ...(gate.required_beats.length > 0 ? { required_beats: gate.required_beats } : {}),
      ...(failed.length > 0 ? { failed } : {}),
    },
    summary: value
      ? `${targetGate} OPEN — 전환 가능. LLM 이 world-state.yaml 의 act 를 ${act + 1} 로 갱신하고 전환 씬 작성.`
      : `${targetGate} CLOSED — 남은 조건: ${failed.join(", ") || "(없음·비트 대기)"}`,
  };

  console.log(JSON.stringify(result));
}

main();
