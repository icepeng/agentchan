#!/usr/bin/env bun
/**
 * scripts/combat.ts
 *
 * Resolves a single combat action. Two modes:
 *   1. Active — actor attempts an attack/spell against a DC
 *   2. Passive — apply damage taken by PC or companion (updates party.yaml)
 *
 * YAML 읽기는 Bun.YAML.parse, 쓰기는 line 치환 (주석·포맷 보존).
 *
 * Usage (mode 1 — active):
 *   scripts/combat.ts --actor <pc|riwu> --category <attack|spell> --target-dc <N>
 *                     [--weapon <slug>]       (for PC attack — reads inventory.yaml)
 *                     [--damage <formula>]    (override damage formula, e.g. "1d4+3")
 *                     [--spell <slug>]        (for PC spell — reads spells.yaml)
 *                     [--round <N>]           (active combat round — emitted as attr)
 *
 * Usage (mode 2 — passive):
 *   scripts/combat.ts --actor <pc|riwu> --take-damage <N> [--round <N>]
 *
 * 동작: party.yaml 을 직접 수정한다. stdout 마지막 줄에 JSON 한 줄을 출력:
 *   {"changed":[...],"deltas":{...},"summary":"...","scene_block":"<beat type=\"combat\" round=\"N\">...</beat>"?}
 * scene_block 은 active 모드(attack/spell)에서만 반환 — 그대로 scene.md 에 append.
 * round 는 에이전트가 추적 (전투 시작=1, 매 라운드 +1). 생략 시 `<beat type="combat">` 만 출력.
 */

import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  actor: "pc" | "riwu";
  category?: "attack" | "spell";
  targetDc?: number;
  weapon?: string;
  damage?: string;
  spell?: string;
  takeDamage?: number;
  round?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1];
      i++;
    }
  }
  if (!args.actor) { console.error("--actor required (pc | riwu)"); process.exit(1); }
  if (!["pc", "riwu"].includes(args.actor)) {
    console.error(`--actor must be pc | riwu. got: ${args.actor}`); process.exit(1);
  }
  const out: Args = { actor: args.actor as "pc" | "riwu" };
  if (args.category) {
    if (!["attack", "spell"].includes(args.category)) {
      console.error(`--category must be attack|spell`); process.exit(1);
    }
    out.category = args.category as "attack" | "spell";
  }
  if (args["target-dc"]) out.targetDc = parseInt(args["target-dc"], 10);
  if (args.weapon) out.weapon = args.weapon;
  if (args.damage) out.damage = args.damage;
  if (args.spell) out.spell = args.spell;
  if (args["take-damage"]) out.takeDamage = parseInt(args["take-damage"], 10);
  if (args.round) {
    const r = parseInt(args.round, 10);
    if (isNaN(r) || r < 1) { console.error(`--round must be a positive integer. got: ${args.round}`); process.exit(1); }
    out.round = r;
  }
  return out;
}

// ─── Dice ────────────────────────────────────────────────────────────────────

function roll(sides: number): number { return randomInt(1, sides + 1); }

// ─── Read party.yaml sections ────────────────────────────────────────────────

interface ActorState {
  hp: { current: number; max: number };
  mp: { current: number; max: number };
}

function readActorState(actor: "pc" | "riwu"): ActorState {
  const data = Bun.YAML.parse(readFileSync("files/party.yaml", "utf-8")) as {
    pc?: { hp?: { current?: number; max?: number }; mp?: { current?: number; max?: number } };
    companions?: Record<string, { hp?: { current?: number; max?: number }; mp?: { current?: number; max?: number } }>;
  };
  const block = actor === "pc" ? data?.pc : data?.companions?.[actor];
  if (!block?.hp || typeof block.hp.current !== "number" || typeof block.hp.max !== "number") {
    console.error(`${actor} HP not found in party.yaml`); process.exit(1);
  }
  return {
    hp: { current: block.hp.current, max: block.hp.max },
    mp: block.mp && typeof block.mp.current === "number" && typeof block.mp.max === "number"
      ? { current: block.mp.current, max: block.mp.max }
      : { current: 0, max: 0 },
  };
}

interface PcStats { strength: number; agility: number; insight: number; charisma: number; }

function readPcAttrs(): PcStats {
  const raw = readFileSync("files/pc.md", "utf-8");
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) { console.error("pc.md missing frontmatter"); process.exit(1); }
  const fm = Bun.YAML.parse(fmMatch[1]) as { attributes?: Partial<PcStats> };
  const a = fm?.attributes ?? {};
  return {
    strength: typeof a.strength === "number" ? a.strength : 0,
    agility: typeof a.agility === "number" ? a.agility : 0,
    insight: typeof a.insight === "number" ? a.insight : 0,
    charisma: typeof a.charisma === "number" ? a.charisma : 0,
  };
}

// Riwu: hardcoded stats (rogue-like, +3 agility)
const RIWU_ATTRS: PcStats = { strength: 0, agility: 3, insight: 1, charisma: 0 };
const RIWU_DEFAULT_DAMAGE = "1d4+민첩";

function readWeaponDamage(slug: string): string | null {
  const data = Bun.YAML.parse(readFileSync("files/inventory.yaml", "utf-8")) as {
    equipment?: { weapon?: { slug?: string; damage?: string } };
  };
  const w = data?.equipment?.weapon;
  return w && w.slug === slug && typeof w.damage === "string" ? w.damage : null;
}

interface SpellDef { school: string; mp: number; dc: number; effect: string; }

function readSpell(slug: string): SpellDef | null {
  if (!existsSync("files/spells.yaml")) return null;
  const data = Bun.YAML.parse(readFileSync("files/spells.yaml", "utf-8")) as {
    spells?: Record<string, { school?: string; mp?: number; dc?: number; effect?: string }>;
  };
  const s = data?.spells?.[slug];
  if (!s || typeof s.school !== "string" || typeof s.mp !== "number" ||
      typeof s.dc !== "number" || typeof s.effect !== "string") return null;
  return { school: s.school, mp: s.mp, dc: s.dc, effect: s.effect };
}

// ─── Damage formula ──────────────────────────────────────────────────────────

function rollDamage(formula: string, attrs: PcStats): { description: string; total: number } {
  const attrMap: Record<string, number> = {
    "힘": attrs.strength,
    "민첩": attrs.agility,
    "통찰": attrs.insight,
    "화술": attrs.charisma,
  };
  let expr = formula;
  for (const [name, val] of Object.entries(attrMap)) {
    expr = expr.replaceAll(name, String(val));
  }
  expr = expr.replace(/\+-/g, "-").replace(/--/g, "+").replace(/\+0$/, "").replace(/-0$/, "");

  const m = expr.match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/);
  if (!m) { console.error(`Bad damage formula: ${formula} → ${expr}`); process.exit(1); }
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const sign = m[3] === "-" ? -1 : 1;
  const modN = m[4] ? parseInt(m[4], 10) : 0;
  const mod = sign * modN;

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(roll(sides));
  const subtotal = rolls.reduce((a, b) => a + b, 0);
  const total = Math.max(1, subtotal + mod);

  const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
  const desc = `${formula} → ${rolls.join("+")}${modStr} = ${total}`;
  return { description: desc, total };
}

// ─── Update helpers ──────────────────────────────────────────────────────────

// party.yaml 을 field-level 문자열 치환으로 직접 수정 (주석·포맷 보존).
// actor 블록 범위를 line 기반으로 잡아 해당 범위 안의 `<field>: { current: N, ... }` 만 수정.
function updatePartyField(actor: "pc" | "riwu", field: "hp" | "mp", newCurrent: number): void {
  const raw = readFileSync("files/party.yaml", "utf-8");

  let blockStart: number, blockEnd: number;
  if (actor === "pc") {
    const pcMatch = raw.match(/^pc:\s*$/m);
    const compMatch = raw.match(/^companions:\s*$/m);
    if (pcMatch?.index === undefined) { console.error("pc: block not found"); process.exit(1); }
    blockStart = pcMatch.index;
    blockEnd = compMatch?.index ?? raw.length;
  } else {
    const actorMatch = raw.match(new RegExp(`^  ${actor}:\\s*$`, "m"));
    if (actorMatch?.index === undefined) { console.error(`${actor}: block not found`); process.exit(1); }
    blockStart = actorMatch.index;
    const after = blockStart + actorMatch[0].length;
    const nextKey = raw.slice(after).match(/^  \w+:\s*$/m);
    blockEnd = nextKey?.index !== undefined ? after + nextKey.index : raw.length;
  }

  const block = raw.slice(blockStart, blockEnd);
  const rx = new RegExp(`(${field}:\\s*\\{\\s*current:\\s*)\\d+(,\\s*max:\\s*\\d+\\s*\\})`);
  const newBlock = block.replace(rx, `$1${newCurrent}$2`);
  const newContent = raw.slice(0, blockStart) + newBlock + raw.slice(blockEnd);
  writeFileSync("files/party.yaml", newContent, "utf-8");
}

// ─── Main ────────────────────────────────────────────────────────────────────

// scene.md 에 append 할 <beat type="combat"> 블록. 에이전트가 그대로 복사.
function buildSceneBlock(systemLine: string, round?: number): string {
  const open = round !== undefined ? `<beat type="combat" round="${round}">` : `<beat type="combat">`;
  return [open, `<roll>${systemLine}</roll>`, `</beat>`].join("\n");
}

function emitResult(result: {
  changed: string[];
  deltas: Record<string, unknown>;
  summary: string;
  scene_block?: string;
}): void {
  console.log(JSON.stringify(result));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = readActorState(args.actor);

  // ── Mode 2: take damage ────────────────
  if (args.takeDamage !== undefined) {
    const newHp = Math.max(0, state.hp.current - args.takeDamage);
    updatePartyField(args.actor, "hp", newHp);
    const summary =
      `${args.actor} 피해 ${args.takeDamage}. HP ${state.hp.current} → ${newHp}/${state.hp.max}` +
      (newHp === 0 ? " · 의식불명 (3라운드 유예)" : "");
    emitResult({
      changed: ["files/party.yaml"],
      deltas: {
        [`${args.actor}.hp`]: { from: state.hp.current, to: newHp, max: state.hp.max },
        ...(newHp === 0 ? { [`${args.actor}.condition`]: "unconscious" } : {}),
      },
      summary,
    });
    return;
  }

  // ── Mode 1: active action ──────────────
  if (!args.category || args.targetDc === undefined) {
    console.error("Active mode requires --category and --target-dc");
    process.exit(1);
  }

  const attrs = args.actor === "pc" ? readPcAttrs() : RIWU_ATTRS;

  // — Attack
  if (args.category === "attack") {
    let damageFormula = args.damage;
    if (!damageFormula) {
      if (args.actor === "riwu") {
        damageFormula = RIWU_DEFAULT_DAMAGE;
      } else {
        if (!args.weapon) { console.error("PC attack requires --weapon or --damage"); process.exit(1); }
        const lookup = readWeaponDamage(args.weapon);
        if (!lookup) { console.error(`Weapon ${args.weapon} not found in inventory.yaml`); process.exit(1); }
        damageFormula = lookup;
      }
    }

    const hitAttr = damageFormula.includes("민첩") ? attrs.agility : attrs.strength;
    const hitRoll = roll(20);
    const hitTotal = hitRoll + hitAttr;
    const hit = hitTotal >= args.targetDc;
    const modStr = hitAttr >= 0 ? `+${hitAttr}` : `${hitAttr}`;

    let systemLine: string;
    let damageTotal: number | null = null;
    if (hit) {
      const dmg = rollDamage(damageFormula, attrs);
      damageTotal = dmg.total;
      systemLine = `${args.actor} attacks: d20${modStr}=${hitTotal} vs ${args.targetDc} → HIT. dmg ${dmg.total}.`;
    } else {
      systemLine = `${args.actor} attacks: d20${modStr}=${hitTotal} vs ${args.targetDc} → MISS.`;
    }
    emitResult({
      changed: [],
      deltas: {
        hit: { total: hitTotal, dc: args.targetDc, success: hit },
        ...(damageTotal !== null ? { damage: damageTotal } : {}),
      },
      summary: hit
        ? `${args.actor} 명중 (${hitTotal} vs DC ${args.targetDc}), 피해 ${damageTotal}`
        : `${args.actor} 빗나감 (${hitTotal} vs DC ${args.targetDc})`,
      scene_block: buildSceneBlock(systemLine, args.round),
    });
    return;
  }

  // — Spell
  if (args.category === "spell") {
    if (!args.spell) { console.error("--spell required"); process.exit(1); }
    if (args.actor !== "pc") { console.error("Only PC (scholar) casts spells"); process.exit(1); }
    const spell = readSpell(args.spell);
    if (!spell) { console.error(`Spell ${args.spell} not found in spells.yaml`); process.exit(1); }
    if (state.mp.current < spell.mp) {
      console.error(`Insufficient MP: ${state.mp.current}/${state.mp.max} < ${spell.mp}`);
      process.exit(1);
    }

    const castMod = attrs.insight;
    const castRoll = roll(20);
    const castTotal = castRoll + castMod;
    const castOk = castTotal >= spell.dc;
    const newMp = state.mp.current - spell.mp;
    const modStr = castMod >= 0 ? `+${castMod}` : `${castMod}`;

    let systemLine: string;
    let damageTotal: number | null = null;
    if (castOk) {
      const dmgMatch = spell.effect.match(/(\d+d\d+\+통찰)/);
      if (dmgMatch) {
        const dmg = rollDamage(dmgMatch[1], attrs);
        damageTotal = dmg.total;
        systemLine = `pc casts ${args.spell}: d20${modStr}=${castTotal} vs ${spell.dc} → SUCCESS. dmg ${dmg.total}. MP ${state.mp.current}→${newMp}.`;
      } else {
        systemLine = `pc casts ${args.spell}: d20${modStr}=${castTotal} vs ${spell.dc} → SUCCESS. MP ${state.mp.current}→${newMp}.`;
      }
    } else {
      systemLine = `pc casts ${args.spell}: d20${modStr}=${castTotal} vs ${spell.dc} → FAIL (fizzle). MP ${state.mp.current}→${newMp}.`;
    }

    updatePartyField("pc", "mp", newMp);
    emitResult({
      changed: ["files/party.yaml"],
      deltas: {
        cast: { total: castTotal, dc: spell.dc, success: castOk, school: spell.school },
        "pc.mp": { from: state.mp.current, to: newMp, max: state.mp.max },
        ...(damageTotal !== null ? { damage: damageTotal } : {}),
      },
      summary: castOk
        ? `pc 시전 ${args.spell} 성공 (${castTotal} vs DC ${spell.dc}), MP ${state.mp.current}→${newMp}` +
          (damageTotal !== null ? `, 피해 ${damageTotal}` : "")
        : `pc 시전 ${args.spell} 실패 (fizzle), MP ${state.mp.current}→${newMp}`,
      scene_block: buildSceneBlock(systemLine, args.round),
    });
    return;
  }
}

main();
