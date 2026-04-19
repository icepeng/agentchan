/**
 * Dice roller for tides-of-moonhaven. Returns human-readable text (multi-line).
 *
 * Usage: <dice> [DC]
 *   dice: Standard notation (1d20, 2d6+3, 4d6kh3, d100)
 *   DC:   Difficulty class (optional, for pass/fail check)
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
  if (!match) {
    throw new Error(
      `Invalid dice notation: "${expr}". Examples: 1d20, 2d6+3, d100, 4d6kh3`,
    );
  }
  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const keepHighest = match[3] ? parseInt(match[3], 10) : undefined;
  const modSign = match[4] === "-" ? -1 : 1;
  const modValue = match[5] ? parseInt(match[5], 10) : 0;

  if (count < 1 || count > 100) throw new Error("Dice count must be 1-100");
  if (sides < 2 || sides > 1000) throw new Error("Dice sides must be 2-1000");
  if (keepHighest !== undefined && keepHighest > count) {
    throw new Error(`Cannot keep ${keepHighest} dice when rolling ${count}`);
  }
  return { count, sides, modifier: modSign * modValue, keepHighest };
}

export default function (args: readonly string[], ctx: ScriptContext) {
  const { positionals } = ctx.util.parseArgs({
    args: [...args],
    options: {},
    strict: true,
    allowPositionals: true,
  });
  if (positionals.length === 0) throw new Error("Usage: <dice> [DC]");

  const diceExpr = positionals[0]!;
  const dc = positionals[1] ? parseInt(positionals[1], 10) : undefined;
  const parsed = parseDice(diceExpr);

  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(ctx.random.int(1, parsed.sides + 1));
  }

  let keptIndices: Set<number> = new Set(rolls.map((_, i) => i));
  let kept = rolls;
  if (parsed.keepHighest !== undefined) {
    const sortedIndices = rolls
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v);
    keptIndices = new Set(sortedIndices.slice(0, parsed.keepHighest).map((x) => x.i));
    kept = [...keptIndices].sort((a, b) => a - b).map((i) => rolls[i]);
  }

  const subtotal = kept.reduce((a, b) => a + b, 0);
  const total = subtotal + parsed.modifier;

  const parts: string[] = [];

  parts.push(`Notation: ${diceExpr}`);

  if (parsed.keepHighest !== undefined) {
    const rollStr = rolls
      .map((r, i) => (keptIndices.has(i) ? `${r}` : `~${r}~`))
      .join(", ");
    parts.push(`Rolls: [${rollStr}]`);
    parts.push(`Kept: [${kept.join(", ")}] = ${subtotal}`);
  } else if (parsed.count > 1) {
    parts.push(`Rolls: [${rolls.join(", ")}] = ${subtotal}`);
  } else {
    parts.push(`Roll: ${subtotal}`);
  }

  if (parsed.modifier !== 0) {
    const sign = parsed.modifier > 0 ? "+" : "";
    parts.push(`Modifier: ${sign}${parsed.modifier}`);
    parts.push(`Total: ${subtotal} ${sign}${parsed.modifier} = ${total}`);
  }

  if (dc !== undefined) {
    const passed = total >= dc;
    const margin = total - dc;
    const marginStr = margin >= 0 ? `+${margin}` : `${margin}`;
    parts.push(`DC ${dc}: ${passed ? "PASS" : "FAIL"} (margin ${marginStr})`);
  }

  return parts.join("\n");
}
