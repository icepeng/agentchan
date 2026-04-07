import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import * as log from "../logger.js";
import type { SkillRecord } from "./types.js";

function validateSkillName(
  name: string | undefined,
  dirName: string,
  location: string,
): string {
  if (!name) {
    log.warn("skills", `${location}: missing name field, using directory name "${dirName}"`);
    return dirName;
  }

  if (name.length > 64) {
    log.warn("skills", `${location}: name "${name}" exceeds 64 characters`);
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
    log.warn(
      "skills",
      `${location}: name "${name}" violates naming rules (expected lowercase alphanumeric and hyphens, no leading/trailing hyphens)`,
    );
  } else if (/--/.test(name)) {
    log.warn("skills", `${location}: name "${name}" contains consecutive hyphens`);
  }

  if (name !== dirName) {
    log.warn(
      "skills",
      `${location}: name "${name}" does not match parent directory "${dirName}"`,
    );
  }

  return name;
}

function fixMalformedYaml(yamlStr: string): string {
  return yamlStr.replace(
    /^([\w][\w-]*?):\s+(.+:.+)$/gm,
    (match, key: string, value: string) => {
      if (!value.startsWith('"') && !value.startsWith("'")) {
        return `${key}: "${value.replace(/"/g, '\\"')}"`;
      }
      return match;
    },
  );
}

function parseSkillMd(content: string, location: string): SkillRecord | null {
  const normalized = content.replace(/\r/g, "");
  const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    const fmOnly = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*$/);
    if (!fmOnly) return null;
    return parseWithFrontmatter(fmOnly[1], "", location);
  }
  return parseWithFrontmatter(frontmatterMatch[1], frontmatterMatch[2], location);
}

function parseWithFrontmatter(
  yamlStr: string,
  body: string,
  location: string,
): SkillRecord | null {
  let raw: Record<string, unknown>;
  try {
    raw = parseYaml(yamlStr) as Record<string, unknown>;
  } catch {
    try {
      raw = parseYaml(fixMalformedYaml(yamlStr)) as Record<string, unknown>;
      log.warn("skills", `${location}: applied malformed YAML fallback`);
    } catch (retryError) {
      log.warn("skills", `${location}: failed to parse YAML: ${String(retryError)}`);
      return null;
    }
  }

  if (!raw || typeof raw !== "object") return null;

  const description = raw.description as string;
  if (!description) {
    log.warn("skills", `${location}: missing description, skipping`);
    return null;
  }

  const dirName = basename(dirname(location));
  const skillName = validateSkillName(raw.name as string | undefined, dirName, location);

  return {
    meta: {
      name: skillName,
      description,
      ...(raw.license ? { license: raw.license as string } : {}),
      ...(raw.metadata ? { metadata: raw.metadata as Record<string, string> } : {}),
    },
    location: resolve(location),
    baseDir: resolve(location, ".."),
    body: body.trim(),
  };
}

async function scanSkillDir(dir: string): Promise<SkillRecord[]> {
  const skills: SkillRecord[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillMdPath = join(dir, entry.name, "SKILL.md");
      try {
        const content = await readFile(skillMdPath, "utf-8");
        const record = parseSkillMd(content, skillMdPath);
        if (record) {
          skills.push(record);
        }
      } catch {
        // No SKILL.md in this subdirectory — skip
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }

  return skills;
}

export async function discoverSkills(
  cwd: string = process.cwd(),
): Promise<Map<string, SkillRecord>> {
  const home = homedir();

  const searchPaths = [
    join(cwd, ".agents", "skills"),
    join(cwd, ".agentchan", "skills"),
    join(home, ".agents", "skills"),
    join(home, ".agentchan", "skills"),
  ];

  const result = new Map<string, SkillRecord>();

  for (const dir of searchPaths) {
    const skills = await scanSkillDir(dir);
    for (const skill of skills) {
      if (!result.has(skill.meta.name)) {
        result.set(skill.meta.name, skill);
      } else {
        const existing = result.get(skill.meta.name)!;
        log.warn(
          "skills",
          `name collision: "${skill.meta.name}" at ${skill.location} shadowed by ${existing.location}`,
        );
      }
    }
  }

  return result;
}

export async function discoverProjectSkills(
  skillsDir: string,
): Promise<Map<string, SkillRecord>> {
  const result = new Map<string, SkillRecord>();
  const skills = await scanSkillDir(skillsDir);
  for (const skill of skills) {
    if (!result.has(skill.meta.name)) {
      result.set(skill.meta.name, skill);
    }
  }
  return result;
}
