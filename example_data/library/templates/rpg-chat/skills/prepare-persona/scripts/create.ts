#!/usr/bin/env bun
/**
 * prepare-persona/create.ts
 *
 * 사용자 페르소나(traveler.md) 1개를 생성한다. 첫 세션 부트스트랩 전용.
 * Self-contained — 외부 라이브러리 없음.
 *
 * Usage:
 *   create.ts --preset <warrior|rogue|scholar>
 *   create.ts --name <slug> --display-name <name> --description <text> [--color <hex>]
 *
 * Output: files/personas/traveler/traveler.md
 *         stdout 마지막 줄에 JSON 한 줄: {"changed":[...],"summary":"..."}
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface Stats {
  strength: number;
  agility: number;
  insight: number;
  charisma: number;
}

interface Preset {
  slug: string;
  display_name: string;
  color: string;
  names: string;
  background: string;
  stats: Stats;
}

const BALANCED_STATS: Stats = { strength: 1, agility: 1, insight: 1, charisma: 1 };

const PRESETS: Record<string, Preset> = {
  warrior: {
    slug: "traveler",
    display_name: "검사",
    color: "#a83225",
    names: "검사, Warrior, 여행자, Traveler",
    background:
      "전쟁에서 살아남은 용병. 이름은 잊었거나 일부러 버렸다. 말 수가 적고, 맞서야 할 것과 피해야 할 것을 즉각 구분한다. 폭력은 기술이지 쾌락이 아니다.",
    stats: { strength: 3, agility: 2, insight: 0, charisma: 1 },
  },
  rogue: {
    slug: "traveler",
    display_name: "도적",
    color: "#3d7a6d",
    names: "도적, Rogue, 여행자, Traveler",
    background:
      "뒷골목에서 자랐다. 발걸음이 조용하고, 손은 빠르며, 눈은 더 빠르다. 장난기 있지만 선을 지킨다 — 아이와 노인을 보면 자동으로 걸음이 느려진다.",
    stats: { strength: 1, agility: 3, insight: 2, charisma: 1 },
  },
  scholar: {
    slug: "traveler",
    display_name: "학자",
    color: "#6a4a8a",
    names: "학자, Scholar, 여행자, Traveler",
    background:
      "어느 왕립 아카데미에서 학파 두 개를 이수했다. 책보다 사람 관찰이 더 재밌어졌다고 한다. 예의 바르고 질문이 많고, 위기에는 두 번 계산한 뒤 한 번 움직인다.",
    stats: { strength: 0, agility: 1, insight: 3, charisma: 2 },
  },
};

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a !== undefined && a.startsWith("--")) {
      args[a.slice(2)] = argv[i + 1] ?? "";
      i++;
    }
  }
  return args;
}

function escapeYamlString(s: string): string {
  return s.replace(/"/g, '\\"');
}

function renderPersonaMd(p: {
  slug: string;
  display_name: string;
  color: string;
  names: string;
  background: string;
}): string {
  return `---
role: persona
name: ${p.slug}
display-name: ${p.display_name}
color: "${p.color}"
names: "${escapeYamlString(p.names)}"
---

# ${p.display_name}

${p.background}
`;
}

function renderStatsYaml(s: Stats): string {
  return `strength: ${s.strength}
agility: ${s.agility}
insight: ${s.insight}
charisma: ${s.charisma}
`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  let persona: Preset;

  if (args.preset) {
    const p = PRESETS[args.preset];
    if (!p) {
      console.error(`Unknown preset: ${args.preset}. Valid: warrior | rogue | scholar`);
      process.exit(1);
    }
    persona = p;
  } else if (args.name && args["display-name"] && args.description) {
    persona = {
      slug: args.name,
      display_name: args["display-name"],
      color: args.color || "#3d7a6d",
      names: args["display-name"],
      background: args.description,
      stats: BALANCED_STATS,
    };
  } else {
    console.error(
      "Usage:\n  create.ts --preset <warrior|rogue|scholar>\n  create.ts --name <slug> --display-name <name> --description <text> [--color <hex>]",
    );
    process.exit(1);
  }

  const personaPath = `files/personas/${persona.slug}/${persona.slug}.md`;
  mkdirSync(dirname(personaPath), { recursive: true });
  writeFileSync(personaPath, renderPersonaMd(persona), "utf-8");

  const statsPath = `files/stats.yaml`;
  writeFileSync(statsPath, renderStatsYaml(persona.stats), "utf-8");

  const result = {
    changed: [personaPath, statsPath],
    summary: `페르소나 생성: ${persona.display_name} (${persona.slug}) — STR ${persona.stats.strength} / AGI ${persona.stats.agility} / INS ${persona.stats.insight} / CHA ${persona.stats.charisma}`,
  };
  console.log(JSON.stringify(result));
}

main();
