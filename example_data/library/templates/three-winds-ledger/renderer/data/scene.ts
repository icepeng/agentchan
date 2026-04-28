import type {
  ChoiceOption,
  NameMapEntry,
  ParsedScene,
  ProjectFile,
  SceneGroup,
  SceneLine,
  TextFile,
} from "./types";

const CHARACTER_LINE = /^\*\*([^:*]+):\*\*\s*(.*)$/;
const INLINE_IMAGE_TOKEN = /^\[([a-zA-Z][\w-]*):assets\/([a-zA-Z][\w-]*)\]$/;

export function buildNameMap(
  files: readonly ProjectFile[],
): Map<string, NameMapEntry> {
  const map = new Map<string, NameMapEntry>();
  for (const file of files) {
    if (file.type !== "text") continue;
    const fm = file.frontmatter;
    if (!fm) continue;
    const avatar = typeof fm["avatar-image"] === "string" ? fm["avatar-image"] : null;
    if (!avatar) continue;
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    const entry: NameMapEntry = {
      dir,
      avatarImage: avatar,
      color: typeof fm.color === "string" ? fm.color : undefined,
    };
    const names = typeof fm.names === "string" ? fm.names : "";
    for (const raw of names.split(",")) {
      const name = raw.trim();
      if (name && !map.has(name)) map.set(name, entry);
    }
    if (typeof fm["display-name"] === "string" && !map.has(fm["display-name"])) {
      map.set(fm["display-name"], entry);
    }
    if (typeof fm.name === "string" && !map.has(fm.name)) {
      map.set(fm.name, entry);
    }
  }
  return map;
}

export function findSceneFile(files: readonly ProjectFile[]): TextFile | null {
  const file = files.find(
    (f): f is TextFile => f.type === "text" && f.path === "scenes/scene.md",
  );
  return file ?? null;
}

function classifySystemLine(text: string): {
  kind: NonNullable<SceneLine["systemKind"]>;
  success?: boolean;
} {
  if (/^판정/.test(text)) {
    const success = /->\s*성공|→\s*성공/.test(text);
    const failure = /->\s*실패|→\s*실패/.test(text);
    return success
      ? { kind: "judgment", success: true }
      : failure
        ? { kind: "judgment", success: false }
        : { kind: "judgment" };
  }
  if (/^이벤트/.test(text)) return { kind: "event" };
  if (/^아이템\s*획득/.test(text)) return { kind: "item" };
  if (/^관계/.test(text)) return { kind: "relationship" };
  return { kind: "generic" };
}

function parseChoiceLine(raw: string): ChoiceOption | null {
  const trimmed = raw.replace(/^[-*]\s*/, "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split("|").map((p) => p.trim());
  const map = new Map<string, string>();
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key && value) map.set(key, value);
  }
  const label = map.get("label");
  const action = map.get("action");
  if (!label || !action) return null;
  const stat = map.get("stat");
  const dcRaw = map.get("dc");
  const dc = dcRaw ? Number(dcRaw) : NaN;
  const choice: ChoiceOption = { label, action };
  if (stat) choice.stat = stat;
  if (Number.isFinite(dc)) choice.dc = dc;
  return choice;
}

function emitLine(
  acc: SceneLine[],
  line: SceneLine,
  nameMap: Map<string, NameMapEntry>,
): void {
  if (line.kind === "character" && line.characterName) {
    const entry = nameMap.get(line.characterName);
    if (entry) {
      line = {
        ...line,
        charDir: line.charDir ?? entry.dir,
        imageKey: line.imageKey ?? entry.avatarImage,
      };
    }
  }
  acc.push(line);
}

export function parseScene(
  raw: string,
  nameMap: Map<string, NameMapEntry>,
): ParsedScene {
  const lines: SceneLine[] = [];
  const choices: ChoiceOption[] = [];
  let inChoices = false;
  let pendingImage: { characterName: string; charDir: string; imageKey: string } | null = null;

  const sourceLines = raw.split(/\r?\n/);
  for (const rawLine of sourceLines) {
    const line = rawLine.trim();
    if (!line) {
      pendingImage = null;
      continue;
    }
    if (line === "[CHOICES]") {
      inChoices = true;
      pendingImage = null;
      continue;
    }
    if (line === "[/CHOICES]") {
      inChoices = false;
      pendingImage = null;
      continue;
    }
    if (inChoices) {
      const choice = parseChoiceLine(line);
      if (choice) choices.push(choice);
      continue;
    }

    const inlineMatch = line.match(INLINE_IMAGE_TOKEN);
    if (inlineMatch) {
      const slug = inlineMatch[1];
      const key = inlineMatch[2];
      const entry = nameMap.get(slug) ?? findEntryBySlug(nameMap, slug);
      if (entry) {
        pendingImage = {
          characterName: slug,
          charDir: entry.dir,
          imageKey: `assets/${key}`,
        };
      }
      continue;
    }

    if (line === "---") {
      emitLine(lines, { kind: "divider", text: "" }, nameMap);
      pendingImage = null;
      continue;
    }

    if (line.startsWith("[SYSTEM]")) {
      const text = line.slice("[SYSTEM]".length).trim();
      const { kind, success } = classifySystemLine(text);
      emitLine(
        lines,
        { kind: "system", text, systemKind: kind, judgmentSuccess: success },
        nameMap,
      );
      pendingImage = null;
      continue;
    }

    if (line.startsWith(">")) {
      emitLine(lines, { kind: "user", text: line.replace(/^>+\s*/, "") }, nameMap);
      pendingImage = null;
      continue;
    }

    const charMatch = line.match(CHARACTER_LINE);
    if (charMatch) {
      const sceneLine: SceneLine = {
        kind: "character",
        characterName: charMatch[1].trim(),
        text: charMatch[2].trim(),
      };
      if (pendingImage && pendingImage.characterName === sceneLine.characterName) {
        sceneLine.charDir = pendingImage.charDir;
        sceneLine.imageKey = pendingImage.imageKey;
      }
      emitLine(lines, sceneLine, nameMap);
      pendingImage = null;
      continue;
    }

    emitLine(lines, { kind: "narration", text: line }, nameMap);
    pendingImage = null;
  }

  let trailingDividerCount = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].kind === "divider") trailingDividerCount++;
    else break;
  }

  const groups = groupLines(lines);
  return { groups, choices, trailingDividerCount };
}

function findEntryBySlug(
  nameMap: Map<string, NameMapEntry>,
  slug: string,
): NameMapEntry | undefined {
  for (const [, entry] of nameMap) {
    if (entry.dir.endsWith(`/${slug}`) || entry.dir === slug) return entry;
  }
  return undefined;
}

function groupLines(lines: SceneLine[]): SceneGroup[] {
  const groups: SceneGroup[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    const sameGroup =
      last &&
      last.kind === line.kind &&
      last.characterName === line.characterName &&
      last.kind !== "divider" &&
      last.kind !== "system";
    if (sameGroup) {
      last.lines.push(line);
    } else {
      groups.push({
        kind: line.kind,
        characterName: line.characterName,
        charDir: line.charDir,
        imageKey: line.imageKey,
        lines: [line],
      });
    }
  }
  return groups;
}
