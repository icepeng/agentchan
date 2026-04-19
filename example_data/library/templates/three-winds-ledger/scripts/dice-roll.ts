/**
 * Dice roller with advantage / disadvantage. Self-contained.
 *
 * Usage:
 *   <dice>                      — simple roll
 *   <dice> <DC>                 — roll + DC check
 *   <dice> <DC> --advantage     — roll two d20s, keep higher
 *   <dice> <DC> --disadvantage  — roll two d20s, keep lower
 *
 * If both flags are supplied they cancel.
 * Advantage/disadvantage only meaningful for d20-based rolls (e.g. 1d20+3).
 *
 * Returns JSON: {changed:[], deltas:{...}, summary:"...", scene_block:"<roll>...</roll>"}
 * scene_block 은 <roll> 한 줄 — 에이전트가 씬에 그대로 append.
 */

import type { ScriptContext } from "@agentchan/creative-agent";

interface DiceRoll {
  count: number;
  sides: number;
  modifier: number;
  keepHighest?: number;
}

function parseDice(expr: string): DiceRoll {
  const normalized = expr.toLowerCase().trim();
  const match = normalized.match(/^(\d*)d(\d+)(?:kh(\d+))?(?:([+-])(\d+))?$/);
  if (!match) throw new Error(`Invalid dice notation: "${expr}"`);
  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const keepHighest = match[3] ? parseInt(match[3], 10) : undefined;
  const modSign = match[4] === "-" ? -1 : 1;
  const modValue = match[5] ? parseInt(match[5], 10) : 0;
  if (count < 1 || count > 100) throw new Error("Dice count must be 1-100");
  if (sides < 2 || sides > 1000) throw new Error("Dice sides must be 2-1000");
  return { count, sides, modifier: modSign * modValue, keepHighest };
}

export default function (args: readonly string[], ctx: ScriptContext) {
  const { values, positionals } = ctx.util.parseArgs({
    args: [...args],
    options: {
      advantage: { type: "boolean" },
      disadvantage: { type: "boolean" },
    },
    strict: true,
    allowPositionals: true,
  });
  if (positionals.length === 0) {
    throw new Error("Usage: <dice> [DC] [--advantage|--disadvantage]");
  }
  const advantage = values.advantage === true;
  const disadvantage = values.disadvantage === true;
  const diceExpr = positionals[0]!;
  const dc = positionals[1] ? parseInt(positionals[1], 10) : undefined;
  const parsed = parseDice(diceExpr);

  const netAdv = advantage && !disadvantage ? "adv"
               : disadvantage && !advantage ? "dis"
               : null;

  const rollOnce = (): number[] => {
    const rolls: number[] = [];
    for (let i = 0; i < parsed.count; i++) rolls.push(ctx.random.int(1, parsed.sides + 1));
    return rolls;
  };

  let rolls = rollOnce();
  let shadowSubtotal: number | null = null;

  if (netAdv && parsed.sides === 20 && parsed.count === 1) {
    const second = rollOnce();
    const firstSum = rolls.reduce((a, b) => a + b, 0);
    const secondSum = second.reduce((a, b) => a + b, 0);
    if (netAdv === "adv") {
      if (secondSum > firstSum) { shadowSubtotal = firstSum; rolls = second; }
      else { shadowSubtotal = secondSum; }
    } else {
      if (secondSum < firstSum) { shadowSubtotal = firstSum; rolls = second; }
      else { shadowSubtotal = secondSum; }
    }
  }

  let keptIndices = new Set(rolls.map((_, i) => i));
  let kept = rolls;
  if (parsed.keepHighest !== undefined) {
    const sortedIndices = rolls.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    keptIndices = new Set(sortedIndices.slice(0, parsed.keepHighest).map((x) => x.i));
    kept = [...keptIndices].sort((a, b) => a - b).map((i) => rolls[i]);
  }

  const subtotal = kept.reduce((a, b) => a + b, 0);
  const total = subtotal + parsed.modifier;

  const modStr = parsed.modifier > 0 ? `+${parsed.modifier}` : parsed.modifier < 0 ? `${parsed.modifier}` : "";
  const advStr = netAdv === "adv" ? " (adv)" : netAdv === "dis" ? " (dis)" : "";
  const rollsStr = parsed.count > 1 ? `[${kept.join(",")}]` : `${kept[0]}`;
  let rollBody = `${diceExpr}${advStr}: ${rollsStr}${modStr} = ${total}`;
  let passed: boolean | undefined;
  let margin: number | undefined;
  if (dc !== undefined) {
    passed = total >= dc;
    margin = total - dc;
    const marginStr = margin >= 0 ? `+${margin}` : `${margin}`;
    rollBody += ` vs DC ${dc} → ${passed ? "PASS" : "FAIL"} (${marginStr})`;
  }
  const sceneLine = `<roll>${rollBody}</roll>`;

  const summary =
    `${diceExpr}${advStr} = ${total}` +
    (dc !== undefined ? ` vs DC ${dc} → ${passed ? "PASS" : "FAIL"}` : "");

  const deltas: Record<string, unknown> = {
    rolls: kept,
    subtotal,
    modifier: parsed.modifier,
    total,
  };
  if (netAdv && shadowSubtotal !== null) {
    deltas.discarded = shadowSubtotal + parsed.modifier;
    deltas.advantage = netAdv;
  }
  if (dc !== undefined) {
    deltas.dc = dc;
    deltas.passed = passed;
    deltas.margin = margin;
  }

  return {
    changed: [],
    deltas,
    summary,
    scene_block: sceneLine,
  };
}
