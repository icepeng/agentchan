#!/usr/bin/env bun
/**
 * Dice roller with advantage / disadvantage.
 * Self-contained — no shared helpers.
 *
 * Usage:
 *   scripts/dice-roll.ts <dice>                      — simple roll
 *   scripts/dice-roll.ts <dice> <DC>                 — roll + DC check
 *   scripts/dice-roll.ts <dice> <DC> --advantage     — roll two d20s, keep higher
 *   scripts/dice-roll.ts <dice> <DC> --disadvantage  — roll two d20s, keep lower
 *
 * If both flags are supplied they cancel.
 * Advantage/disadvantage only meaningful for d20-based rolls (e.g. 1d20+3).
 *
 * 동작: 파일 수정 없음 (순수 난수 계산기).
 * stdout 마지막 줄에 JSON 한 줄:
 *   {"changed":[],"deltas":{"rolls":[...],"subtotal":N,"modifier":N,"total":N,"dc"?:N,"passed"?:bool,"margin"?:N,"discarded"?:N},"summary":"...","scene_block":"<roll>...</roll>"}
 * scene_block 은 <roll> 한 줄 — 에이전트가 씬에 그대로 append.
 */

import { randomInt } from "node:crypto";

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
    console.error(`Invalid dice notation: "${expr}"`);
    process.exit(1);
  }
  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const keepHighest = match[3] ? parseInt(match[3], 10) : undefined;
  const modSign = match[4] === "-" ? -1 : 1;
  const modValue = match[5] ? parseInt(match[5], 10) : 0;
  if (count < 1 || count > 100) { console.error("Dice count must be 1-100"); process.exit(1); }
  if (sides < 2 || sides > 1000) { console.error("Dice sides must be 2-1000"); process.exit(1); }
  return { count, sides, modifier: modSign * modValue, keepHighest };
}

function roll(sides: number): number {
  return randomInt(1, sides + 1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: scripts/dice-roll.ts <dice> [DC] [--advantage|--disadvantage]");
    process.exit(1);
  }

  // Parse flags
  const advantage = args.includes("--advantage");
  const disadvantage = args.includes("--disadvantage");
  const positional = args.filter(a => !a.startsWith("--"));

  const diceExpr = positional[0];
  const dc = positional[1] ? parseInt(positional[1], 10) : undefined;
  const parsed = parseDice(diceExpr);

  // Net advantage: cancel if both
  const netAdv = advantage && !disadvantage ? "adv"
               : disadvantage && !advantage ? "dis"
               : null;

  // Roll all dice. If adv/dis and d20-based: roll twice.
  const rollOnce = (): number[] => {
    const rolls: number[] = [];
    for (let i = 0; i < parsed.count; i++) rolls.push(roll(parsed.sides));
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

  // Apply keep-highest (separate feature)
  let keptIndices = new Set(rolls.map((_, i) => i));
  let kept = rolls;
  if (parsed.keepHighest !== undefined) {
    const sortedIndices = rolls.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    keptIndices = new Set(sortedIndices.slice(0, parsed.keepHighest).map(x => x.i));
    kept = [...keptIndices].sort((a, b) => a - b).map(i => rolls[i]);
  }

  const subtotal = kept.reduce((a, b) => a + b, 0);
  const total = subtotal + parsed.modifier;

  // scene_block: 짧은 <roll> 한 줄 요약. 에이전트가 scene.md 에 그대로 append.
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

  console.log(JSON.stringify({
    changed: [],
    deltas,
    summary,
    scene_block: sceneLine,
  }));
}

main();
