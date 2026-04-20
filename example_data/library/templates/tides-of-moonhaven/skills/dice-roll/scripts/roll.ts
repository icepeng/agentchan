#!/usr/bin/env bun

import { randomInt } from "node:crypto";

// ── Dice notation parser ────────────────────
// Supports: 1d20, 2d6+3, 1d20-2, 3d8, d100, 4d6kh3 (keep highest 3)

interface DiceRoll {
  count: number;
  sides: number;
  modifier: number;
  keepHighest?: number;
}

function parseDice(expr: string): DiceRoll {
  const normalized = expr.toLowerCase().trim();

  // Match: [N]d<sides>[kh<keep>][+/-<mod>]
  const match = normalized.match(
    /^(\d*)d(\d+)(?:kh(\d+))?(?:([+-])(\d+))?$/,
  );
  if (!match) {
    console.error(`Invalid dice notation: "${expr}"`);
    console.error("Usage: roll.ts <dice> [DC]");
    console.error("Examples: 1d20, 2d6+3, d100, 4d6kh3");
    process.exit(1);
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const keepHighest = match[3] ? parseInt(match[3], 10) : undefined;
  const modSign = match[4] === "-" ? -1 : 1;
  const modValue = match[5] ? parseInt(match[5], 10) : 0;

  if (count < 1 || count > 100) {
    console.error("Dice count must be 1-100");
    process.exit(1);
  }
  if (sides < 2 || sides > 1000) {
    console.error("Dice sides must be 2-1000");
    process.exit(1);
  }
  if (keepHighest !== undefined && keepHighest > count) {
    console.error(`Cannot keep ${keepHighest} dice when rolling ${count}`);
    process.exit(1);
  }

  return { count, sides, modifier: modSign * modValue, keepHighest };
}

// ── RNG using crypto ────────────────────────

function roll(sides: number): number {
  return randomInt(1, sides + 1);
}

// ── Main ────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: roll.ts <dice> [DC]");
    console.error("  dice: Standard notation (1d20, 2d6+3, 4d6kh3, d100)");
    console.error("  DC:   Difficulty class (optional, for pass/fail check)");
    process.exit(1);
  }

  const diceExpr = args[0];
  const dc = args[1] ? parseInt(args[1], 10) : undefined;
  const parsed = parseDice(diceExpr);

  // Roll all dice
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(roll(parsed.sides));
  }

  // Apply keep-highest if specified
  let keptIndices: Set<number> = new Set(rolls.map((_, i) => i));
  let kept = rolls;
  if (parsed.keepHighest !== undefined) {
    // Sort indices by roll value descending, keep top N
    const sortedIndices = rolls
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v);
    keptIndices = new Set(sortedIndices.slice(0, parsed.keepHighest).map((x) => x.i));
    kept = [...keptIndices].sort((a, b) => a - b).map((i) => rolls[i]);
  }

  const subtotal = kept.reduce((a, b) => a + b, 0);
  const total = subtotal + parsed.modifier;

  // Format output — dice(raw) · modifier · total · DC를 각각 한 줄로 분리.
  // SYSTEM.md [SYSTEM] 판정 기록이 raw와 modifier를 합산 없이 남기도록 유도.
  const parts: string[] = [];

  parts.push(`Notation: ${diceExpr}`);

  // Dice roll (modifier 미포함 raw 값)
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

  // Modifier 와 Total 은 modifier 가 있을 때만 출력 (없으면 Roll 자체가 total)
  if (parsed.modifier !== 0) {
    const sign = parsed.modifier > 0 ? "+" : "";
    parts.push(`Modifier: ${sign}${parsed.modifier}`);
    parts.push(`Total: ${subtotal} ${sign}${parsed.modifier} = ${total}`);
  }

  // DC check
  if (dc !== undefined) {
    const passed = total >= dc;
    const margin = total - dc;
    const marginStr = margin >= 0 ? `+${margin}` : `${margin}`;
    parts.push(`DC ${dc}: ${passed ? "PASS" : "FAIL"} (margin ${marginStr})`);
  }

  console.log(parts.join("\n"));
}

main();
