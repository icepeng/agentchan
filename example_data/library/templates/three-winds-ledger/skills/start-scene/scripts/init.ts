#!/usr/bin/env bun
/**
 * start-scene/init.ts
 *
 * Generates initial state files for a chosen PC preset.
 * Self-contained — no YAML parser, pure template literals.
 *
 * Usage:
 *   init.ts --preset <warrior|rogue|scholar>
 *
 * 동작: pc.md / party.yaml / inventory.yaml / world-state.yaml / next-choices.yaml 을
 * 직접 생성한다. stdout 마지막 줄에 JSON 한 줄을 출력.
 *   {"changed":[...],"deltas":{...},"summary":"..."}
 */

import { writeFileSync } from "node:fs";

// ─── Preset specs ────────────────────────────────────────────────────────────

interface Preset {
  slug: "warrior" | "rogue" | "scholar";
  display_name: string;
  attributes: { strength: number; agility: number; insight: number; charisma: number };
  hp_max: number;
  mp_max: number;
  spells: string[];  // for scholar only
  weapon: { slug: string; name: string; damage: string } | null;
  armor: { slug: string; name: string; soak: number } | null;
  accessory: { slug: string; name: string; schools?: string[] } | null;
  extra_items: { slug: string; name: string; qty: number; tags: string[]; description?: string }[];
  background: string;
  personality: string;
  appearance: string;
}

const PRESETS: Record<string, Preset> = {
  warrior: {
    slug: "warrior",
    display_name: "전사",
    attributes: { strength: 2, agility: 1, insight: -1, charisma: 0 },
    hp_max: 24,
    mp_max: 0,
    spells: [],
    weapon: { slug: "short_sword", name: "단검", damage: "1d6+힘" },
    armor: { slug: "leather_armor", name: "가죽 갑옷", soak: 2 },
    accessory: null,
    extra_items: [
      { slug: "whetstone", name: "숫돌", qty: 1, tags: ["tool"], description: "칼날을 세우는 돌." },
    ],
    background: "전쟁에서 살아남은 용병. 이름은 잊었거나 일부러 버렸다. 살레른까지 흘러온 이유는 본인도 정확히 모른다 — 북쪽에서 남쪽으로 내려오다 이 항구에서 멈췄을 뿐.",
    personality: "말 수 적음. 맞서야 할 것과 피해야 할 것을 즉각 구분하는 눈. 폭력은 기술이지 쾌락이 아님.",
    appearance: "중간 키, 마른 근육. 왼손 바깥쪽에 얇은 흉터 3줄. 검은 등에, 가죽은 몸에.",
  },
  rogue: {
    slug: "rogue",
    display_name: "도적",
    attributes: { strength: 0, agility: 3, insight: 1, charisma: 0 },
    hp_max: 20,
    mp_max: 0,
    spells: [],
    weapon: { slug: "twin_daggers", name: "쌍 단검", damage: "1d4+민첩" },
    armor: null,
    accessory: null,
    extra_items: [
      { slug: "toolkit", name: "도구상자", qty: 1, tags: ["tool"], description: "자물쇠·틈·실이 필요한 모든 작업을 위한 작은 주머니." },
      { slug: "smoke_pellet", name: "연기탄", qty: 2, tags: ["consumable"], description: "바닥에 던지면 3라운드 연기 커튼." },
    ],
    background: "뒷골목에서 자랐다. 어느 도시에서 시작했는지는 중요하지 않다. 살레른은 지나가는 길이었는데, 부둣가에서 뭔가를 봤다.",
    personality: "빠르고 조용함. 장난기 있지만 선을 지킴. 아이와 노인을 보면 자동으로 걸음이 느려짐.",
    appearance: "작은 체구, 발걸음 소리 없음. 모자를 깊이 눌러 쓰고 장갑은 벗지 않음.",
  },
  scholar: {
    slug: "scholar",
    display_name: "학자",
    attributes: { strength: -1, agility: 0, insight: 2, charisma: 2 },
    hp_max: 16,
    mp_max: 4,
    spells: ["fireball", "heal_light", "veil", "bless"],  // balanced preset
    weapon: null,
    armor: null,
    accessory: { slug: "scholars_tome", name: "마력서", schools: ["elemental", "restoration", "illusion"] },
    extra_items: [
      { slug: "quill_ink", name: "깃펜과 잉크", qty: 1, tags: ["tool"], description: "필기구 일습." },
      { slug: "crystal_lens", name: "수정 렌즈", qty: 1, tags: ["tool"], description: "작은 글씨나 멀리 있는 것을 볼 때." },
    ],
    background: "어느 왕립 아카데미에서 학파 2개를 이수했다. 왜 학자의 자리를 버리고 이런 변두리 항구에 왔는지는 본인만 안다. 책보다 사람 관찰이 더 재밌어졌다.",
    personality: "예의 바르고 질문이 많음. 위기에는 두 번 계산한 뒤 한 번 움직임. 낯선 단어를 들으면 잊기 전에 메모.",
    appearance: "키는 보통, 어깨가 좁음. 짙은 로브 아래 실크 셔츠. 손가락에 잉크 자국.",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { preset: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  if (!args.preset) {
    console.error("Usage: init.ts --preset <warrior|rogue|scholar>");
    process.exit(1);
  }
  if (!PRESETS[args.preset]) {
    console.error(`Unknown preset: ${args.preset}. Valid: warrior | rogue | scholar`);
    process.exit(1);
  }
  return { preset: args.preset };
}

function formatAttr(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function renderPcMd(p: Preset): string {
  const spellsLine = p.spells.length > 0 ? `[${p.spells.join(", ")}]` : "[]";
  return `---
slug: pc
role: pc
name: "이름 없는 여행자"
display_name: "여행자"
preset: ${p.slug}
attributes:
  strength: ${p.attributes.strength}
  agility: ${p.attributes.agility}
  insight: ${p.attributes.insight}
  charisma: ${p.attributes.charisma}
hp: { current: ${p.hp_max}, max: ${p.hp_max} }
mp: { current: ${p.mp_max}, max: ${p.mp_max} }
spells: ${spellsLine}
advantages: []
---

# 이름 없는 여행자

**프리셋**: ${p.display_name} — 힘 ${formatAttr(p.attributes.strength)} / 민첩 ${formatAttr(p.attributes.agility)} / 통찰 ${formatAttr(p.attributes.insight)} / 화술 ${formatAttr(p.attributes.charisma)}

## 배경
${p.background}

## 성격 / 동기
${p.personality}

## 외형
${p.appearance}
`;
}

function renderPartyYaml(p: Preset): string {
  return `# === Party — 파티 구성 ===
# PC + 고정 동료. HP/MP/상태이상/관계축(trust+approval) 관리.
# combat / relationship 스크립트가 갱신.

pc:
  name: "이름 없는 여행자"
  hp: { current: ${p.hp_max}, max: ${p.hp_max} }
  mp: { current: ${p.mp_max}, max: ${p.mp_max} }
  conditions: []

companions:
  riwu:
    hp: { current: 18, max: 18 }
    mp: { current: 0, max: 0 }
    trust: 0
    approval: steady
    conditions: []
    in_party: true
    quest_stage: pending
`;
}

function renderInventoryYaml(p: Preset): string {
  const items = [
    { slug: "travel_pouch", name: "여행 보따리", qty: 1, tags: ["container"], description: "낡은 가죽 보따리. 여러 주머니." },
    { slug: "dried_bread", name: "말린 빵", qty: 3, tags: ["food"] },
    { slug: "water_skin", name: "물가죽", qty: 1, tags: ["drink"] },
    { slug: "coin_pouch", name: "은화 지갑", qty: 1, tags: ["money"] },
    ...p.extra_items,
  ];

  const itemsYaml = items.map(item => {
    const lines = [`  - slug: ${item.slug}`];
    lines.push(`    name: "${item.name}"`);
    lines.push(`    qty: ${item.qty}`);
    lines.push(`    tags: [${item.tags.join(", ")}]`);
    if (item.description) lines.push(`    description: "${item.description}"`);
    return lines.join("\n");
  }).join("\n");

  const weaponLine = p.weapon
    ? `{ slug: ${p.weapon.slug}, name: "${p.weapon.name}", damage: "${p.weapon.damage}" }`
    : "null";
  const armorLine = p.armor
    ? `{ slug: ${p.armor.slug}, name: "${p.armor.name}", soak: ${p.armor.soak} }`
    : "null";
  const accessoryLine = p.accessory
    ? (p.accessory.schools
        ? `{ slug: ${p.accessory.slug}, name: "${p.accessory.name}", schools: [${p.accessory.schools.join(", ")}] }`
        : `{ slug: ${p.accessory.slug}, name: "${p.accessory.name}" }`)
    : "null";

  return `# === Inventory — 공용 인벤토리 ===
# 플레이어 소지품 + 단서(증거).

gold: 8

items:
${itemsYaml}

equipment:
  weapon: ${weaponLine}
  armor: ${armorLine}
  accessory: ${accessoryLine}

evidence: []
`;
}

function renderWorldStateYaml(p: Preset): string {
  return `# === World State — 공개 상태 ===
# 현재 시각·장소·막·날씨·모드. 렌더러가 HUD에 표시.
# travel.ts가 time/location, combat.ts가 mode, act-transition이 act 갱신.

act: 1
current_scene: act1_arrival
scene_count: 0

time: "10:24"
day: 1
weather: "잿빛 구름. 옅은 안개."
mode: peace

location: pier
party_status: ready

last_summary: |
  ${p.display_name} 프리셋의 이름 없는 여행자가 살레른 항구에 도착했다.
  아직 아무것도 일어나지 않았다.
`;
}

function renderNextChoicesYaml(): string {
  // Act 1 오프닝 직후 제시할 3개 선택지. 이후 턴부터는 GM 이 직접 overwrite.
  return `# === Next Choices — 이 턴 플레이어 선택지 ===
# 매 턴 overwrite. 렌더러가 씬 아래 버튼으로 표시.
# - label: 버튼에 보이는 짧은 문구
# - action: 클릭 시 입력창에 채워지는 플레이어 메시지
# - stat (optional): 힘|민첩|통찰|화술 (4속성 배지)
# - dc (optional): 난이도 숫자 (DC 배지)

options:
  - label: "여관으로 향한다"
    action: "리우에게 여관으로 안내해 달라고 한다."
  - label: "부두를 조사한다"
    stat: insight
    dc: 13
    action: "부두 주변을 살펴본다. 이상한 흔적이 있는지."
  - label: "리우에게 질문한다"
    action: "리우에게 이 도시에 대해 물어본다 — 뭐가 이상해?"
`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const { preset } = parseArgs(process.argv.slice(2));
  const p = PRESETS[preset];

  const files: { file: string; content: string }[] = [
    { file: "files/pc.md", content: renderPcMd(p) },
    { file: "files/party.yaml", content: renderPartyYaml(p) },
    { file: "files/inventory.yaml", content: renderInventoryYaml(p) },
    { file: "files/world-state.yaml", content: renderWorldStateYaml(p) },
    { file: "files/next-choices.yaml", content: renderNextChoicesYaml() },
  ];

  for (const { file, content } of files) {
    writeFileSync(file, content, "utf-8");
  }

  const result = {
    changed: files.map(f => f.file),
    deltas: {
      preset: p.slug,
      display_name: p.display_name,
      attributes: p.attributes,
      hp_max: p.hp_max,
      mp_max: p.mp_max,
      spell_count: p.spells.length,
    },
    summary:
      `프리셋 ${p.display_name}: HP ${p.hp_max}/${p.hp_max} · MP ${p.mp_max}/${p.mp_max}` +
      (p.spells.length ? ` · 주문 ${p.spells.length}개` : ""),
  };

  console.log(JSON.stringify(result));
}

main();
