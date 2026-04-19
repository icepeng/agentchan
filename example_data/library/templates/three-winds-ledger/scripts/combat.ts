/**
 * scripts/combat.ts
 *
 * Resolves a single combat action. Two modes:
 *   1. Active — actor attempts an attack/spell against a DC
 *   2. Passive — apply damage taken by PC or companion (updates party.yaml)
 *
 * Usage (mode 1 — active):
 *   --actor <pc|riwu> --category <attack|spell> --target-dc <N>
 *   [--weapon <slug>] [--damage <formula>] [--spell <slug>] [--round <N>]
 *
 * Usage (mode 2 — passive):
 *   --actor <pc|riwu> --take-damage <N> [--round <N>]
 *
 * 반환 JSON: {changed, deltas, summary, scene_block?}.
 * scene_block 은 active 모드(attack/spell)에서만 반환 — 그대로 scene.md 에 append.
 */

import type { ScriptContext } from "@agentchan/creative-agent";

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

function parseCombatArgs(argv: readonly string[], ctx: ScriptContext): Args {
  const { values } = ctx.util.parseArgs({
    args: [...argv],
    options: {
      actor: { type: "string" },
      category: { type: "string" },
      "target-dc": { type: "string" },
      weapon: { type: "string" },
      damage: { type: "string" },
      spell: { type: "string" },
      "take-damage": { type: "string" },
      round: { type: "string" },
    },
    strict: true,
  });
  const { actor, category } = values;
  if (!actor) throw new Error("--actor required (pc | riwu)");
  if (!["pc", "riwu"].includes(actor)) throw new Error(`--actor must be pc | riwu. got: ${actor}`);
  const out: Args = { actor: actor as "pc" | "riwu" };
  if (category) {
    if (!["attack", "spell"].includes(category)) throw new Error("--category must be attack|spell");
    out.category = category as "attack" | "spell";
  }
  if (values["target-dc"]) out.targetDc = parseInt(values["target-dc"], 10);
  if (values.weapon) out.weapon = values.weapon;
  if (values.damage) out.damage = values.damage;
  if (values.spell) out.spell = values.spell;
  if (values["take-damage"]) out.takeDamage = parseInt(values["take-damage"], 10);
  if (values.round) {
    const r = parseInt(values.round, 10);
    if (isNaN(r) || r < 1) throw new Error(`--round must be a positive integer. got: ${values.round}`);
    out.round = r;
  }
  return out;
}

// ─── Read party.yaml sections ────────────────────────────────────────────────

interface ActorState {
  hp: { current: number; max: number };
  mp: { current: number; max: number };
}

function readActorState(ctx: ScriptContext, actor: "pc" | "riwu"): ActorState {
  const data = ctx.yaml.parse(ctx.project.readFile("files/party.yaml")) as {
    pc?: { hp?: { current?: number; max?: number }; mp?: { current?: number; max?: number } };
    companions?: Record<string, { hp?: { current?: number; max?: number }; mp?: { current?: number; max?: number } }>;
  };
  const block = actor === "pc" ? data?.pc : data?.companions?.[actor];
  if (!block?.hp || typeof block.hp.current !== "number" || typeof block.hp.max !== "number") {
    throw new Error(`${actor} HP not found in party.yaml`);
  }
  return {
    hp: { current: block.hp.current, max: block.hp.max },
    mp: block.mp && typeof block.mp.current === "number" && typeof block.mp.max === "number"
      ? { current: block.mp.current, max: block.mp.max }
      : { current: 0, max: 0 },
  };
}

interface PcStats { strength: number; agility: number; insight: number; charisma: number; }

function readPcAttrs(ctx: ScriptContext): PcStats {
  const raw = ctx.project.readFile("files/pc.md");
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) throw new Error("pc.md missing frontmatter");
  const fm = ctx.yaml.parse(fmMatch[1] ?? "") as { attributes?: Partial<PcStats> };
  const a = fm?.attributes ?? {};
  return {
    strength: typeof a.strength === "number" ? a.strength : 0,
    agility: typeof a.agility === "number" ? a.agility : 0,
    insight: typeof a.insight === "number" ? a.insight : 0,
    charisma: typeof a.charisma === "number" ? a.charisma : 0,
  };
}

const RIWU_ATTRS: PcStats = { strength: 0, agility: 3, insight: 1, charisma: 0 };
const RIWU_DEFAULT_DAMAGE = "1d4+민첩";

function readWeaponDamage(ctx: ScriptContext, slug: string): string | null {
  const data = ctx.yaml.parse(ctx.project.readFile("files/inventory.yaml")) as {
    equipment?: { weapon?: { slug?: string; damage?: string } };
  };
  const w = data?.equipment?.weapon;
  return w && w.slug === slug && typeof w.damage === "string" ? w.damage : null;
}

interface SpellDef { school: string; mp: number; dc: number; effect: string; }

function readSpell(ctx: ScriptContext, slug: string): SpellDef | null {
  if (!ctx.project.exists("files/spells.yaml")) return null;
  const data = ctx.yaml.parse(ctx.project.readFile("files/spells.yaml")) as {
    spells?: Record<string, { school?: string; mp?: number; dc?: number; effect?: string }>;
  };
  const s = data?.spells?.[slug];
  if (!s || typeof s.school !== "string" || typeof s.mp !== "number" ||
      typeof s.dc !== "number" || typeof s.effect !== "string") return null;
  return { school: s.school, mp: s.mp, dc: s.dc, effect: s.effect };
}

// ─── Damage formula ──────────────────────────────────────────────────────────

function rollDamage(ctx: ScriptContext, formula: string, attrs: PcStats): { description: string; total: number } {
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
  if (!m) throw new Error(`Bad damage formula: ${formula} → ${expr}`);
  const count = parseInt(m[1] ?? "0", 10);
  const sides = parseInt(m[2] ?? "0", 10);
  const sign = m[3] === "-" ? -1 : 1;
  const modN = m[4] ? parseInt(m[4], 10) : 0;
  const mod = sign * modN;

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(ctx.random.int(1, sides + 1));
  const subtotal = rolls.reduce((a, b) => a + b, 0);
  const total = Math.max(1, subtotal + mod);

  const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
  const desc = `${formula} → ${rolls.join("+")}${modStr} = ${total}`;
  return { description: desc, total };
}

// ─── Update helpers ──────────────────────────────────────────────────────────

function updatePartyField(ctx: ScriptContext, actor: "pc" | "riwu", field: "hp" | "mp", newCurrent: number): void {
  const raw = ctx.project.readFile("files/party.yaml");

  let blockStart: number, blockEnd: number;
  if (actor === "pc") {
    const pcMatch = raw.match(/^pc:\s*$/m);
    const compMatch = raw.match(/^companions:\s*$/m);
    if (pcMatch?.index === undefined) throw new Error("pc: block not found");
    blockStart = pcMatch.index;
    blockEnd = compMatch?.index ?? raw.length;
  } else {
    const actorMatch = raw.match(new RegExp(`^  ${actor}:\\s*$`, "m"));
    if (actorMatch?.index === undefined) throw new Error(`${actor}: block not found`);
    blockStart = actorMatch.index;
    const after = blockStart + actorMatch[0].length;
    const nextKey = raw.slice(after).match(/^  \w+:\s*$/m);
    blockEnd = nextKey?.index !== undefined ? after + nextKey.index : raw.length;
  }

  const block = raw.slice(blockStart, blockEnd);
  const rx = new RegExp(`(${field}:\\s*\\{\\s*current:\\s*)\\d+(,\\s*max:\\s*\\d+\\s*\\})`);
  const newBlock = block.replace(rx, `$1${newCurrent}$2`);
  const newContent = raw.slice(0, blockStart) + newBlock + raw.slice(blockEnd);
  ctx.project.writeFile("files/party.yaml", newContent);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function buildSceneBlock(systemLine: string, round?: number): string {
  const open = round !== undefined ? `<beat type="combat" round="${round}">` : `<beat type="combat">`;
  return [open, `<roll>${systemLine}</roll>`, `</beat>`].join("\n");
}

export default function (rawArgs: readonly string[], ctx: ScriptContext) {
  const args = parseCombatArgs(rawArgs, ctx);
  const state = readActorState(ctx, args.actor);

  // ── Mode 2: take damage ────────────────
  if (args.takeDamage !== undefined) {
    const newHp = Math.max(0, state.hp.current - args.takeDamage);
    updatePartyField(ctx, args.actor, "hp", newHp);
    const summary =
      `${args.actor} 피해 ${args.takeDamage}. HP ${state.hp.current} → ${newHp}/${state.hp.max}` +
      (newHp === 0 ? " · 의식불명 (3라운드 유예)" : "");
    return {
      changed: ["files/party.yaml"],
      deltas: {
        [`${args.actor}.hp`]: { from: state.hp.current, to: newHp, max: state.hp.max },
        ...(newHp === 0 ? { [`${args.actor}.condition`]: "unconscious" } : {}),
      },
      summary,
    };
  }

  // ── Mode 1: active action ──────────────
  if (!args.category || args.targetDc === undefined) {
    throw new Error("Active mode requires --category and --target-dc");
  }

  const attrs = args.actor === "pc" ? readPcAttrs(ctx) : RIWU_ATTRS;

  // — Attack
  if (args.category === "attack") {
    let damageFormula = args.damage;
    if (!damageFormula) {
      if (args.actor === "riwu") {
        damageFormula = RIWU_DEFAULT_DAMAGE;
      } else {
        if (!args.weapon) throw new Error("PC attack requires --weapon or --damage");
        const lookup = readWeaponDamage(ctx, args.weapon);
        if (!lookup) throw new Error(`Weapon ${args.weapon} not found in inventory.yaml`);
        damageFormula = lookup;
      }
    }

    const hitAttr = damageFormula.includes("민첩") ? attrs.agility : attrs.strength;
    const hitRoll = ctx.random.int(1, 21);
    const hitTotal = hitRoll + hitAttr;
    const hit = hitTotal >= args.targetDc;
    const modStr = hitAttr >= 0 ? `+${hitAttr}` : `${hitAttr}`;

    let systemLine: string;
    let damageTotal: number | null = null;
    if (hit) {
      const dmg = rollDamage(ctx, damageFormula, attrs);
      damageTotal = dmg.total;
      systemLine = `${args.actor} attacks: d20${modStr}=${hitTotal} vs ${args.targetDc} → HIT. dmg ${dmg.total}.`;
    } else {
      systemLine = `${args.actor} attacks: d20${modStr}=${hitTotal} vs ${args.targetDc} → MISS.`;
    }
    return {
      changed: [],
      deltas: {
        hit: { total: hitTotal, dc: args.targetDc, success: hit },
        ...(damageTotal !== null ? { damage: damageTotal } : {}),
      },
      summary: hit
        ? `${args.actor} 명중 (${hitTotal} vs DC ${args.targetDc}), 피해 ${damageTotal}`
        : `${args.actor} 빗나감 (${hitTotal} vs DC ${args.targetDc})`,
      scene_block: buildSceneBlock(systemLine, args.round),
    };
  }

  // — Spell
  if (args.category === "spell") {
    if (!args.spell) throw new Error("--spell required");
    if (args.actor !== "pc") throw new Error("Only PC (scholar) casts spells");
    const spell = readSpell(ctx, args.spell);
    if (!spell) throw new Error(`Spell ${args.spell} not found in spells.yaml`);
    if (state.mp.current < spell.mp) {
      throw new Error(`Insufficient MP: ${state.mp.current}/${state.mp.max} < ${spell.mp}`);
    }

    const castMod = attrs.insight;
    const castRoll = ctx.random.int(1, 21);
    const castTotal = castRoll + castMod;
    const castOk = castTotal >= spell.dc;
    const newMp = state.mp.current - spell.mp;
    const modStr = castMod >= 0 ? `+${castMod}` : `${castMod}`;

    let systemLine: string;
    let damageTotal: number | null = null;
    if (castOk) {
      const dmgMatch = spell.effect.match(/(\d+d\d+\+통찰)/);
      if (dmgMatch) {
        const dmg = rollDamage(ctx, dmgMatch[1] ?? "", attrs);
        damageTotal = dmg.total;
        systemLine = `pc casts ${args.spell}: d20${modStr}=${castTotal} vs ${spell.dc} → SUCCESS. dmg ${dmg.total}. MP ${state.mp.current}→${newMp}.`;
      } else {
        systemLine = `pc casts ${args.spell}: d20${modStr}=${castTotal} vs ${spell.dc} → SUCCESS. MP ${state.mp.current}→${newMp}.`;
      }
    } else {
      systemLine = `pc casts ${args.spell}: d20${modStr}=${castTotal} vs ${spell.dc} → FAIL (fizzle). MP ${state.mp.current}→${newMp}.`;
    }

    updatePartyField(ctx, "pc", "mp", newMp);
    return {
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
    };
  }

  throw new Error(`unhandled category: ${args.category}`);
}
