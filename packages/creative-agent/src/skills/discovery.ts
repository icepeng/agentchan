import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { basename, dirname, resolve } from "node:path";
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

  const alwaysActiveRaw = raw["always-active"];
  const disableInvokeRaw = raw["disable-model-invocation"];
  const isTruthy = (v: unknown): boolean => v === true || v === "true";

  return {
    meta: {
      name: skillName,
      description,
      ...(raw.license ? { license: raw.license as string } : {}),
      ...(raw.metadata ? { metadata: raw.metadata as Record<string, string> } : {}),
      ...(isTruthy(alwaysActiveRaw) ? { alwaysActive: true } : {}),
      ...(isTruthy(disableInvokeRaw) ? { disableModelInvocation: true } : {}),
    },
    location: resolve(location),
    baseDir: resolve(location, ".."),
    body: body.trim(),
  };
}

export async function discoverProjectSkills(
  skillsDir: string,
): Promise<Map<string, SkillRecord>> {
  const result = new Map<string, SkillRecord>();

  let entries: Dirent[];
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return result; // Directory doesn't exist — empty result
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = resolve(skillsDir, entry.name, "SKILL.md");
    let content: string;
    try {
      content = await readFile(skillMdPath, "utf-8");
    } catch {
      continue; // No SKILL.md in this subdirectory — skip
    }

    const record = parseSkillMd(content, skillMdPath);
    if (record && !result.has(record.meta.name)) {
      result.set(record.meta.name, record);
    }
  }

  return result;
}
