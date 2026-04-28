import { fileUrl } from "@agentchan/renderer/react";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { NameMapEntry, ProjectFile, RendererSnapshot, SceneGroup } from "../data/types";
import { InkText } from "./InkText";

interface CharacterLineProps {
  group: SceneGroup;
  snapshot: RendererSnapshot;
  nameMap: Map<string, NameMapEntry>;
  isLatest: boolean;
}

export function CharacterLine({ group, snapshot, nameMap, isLatest }: CharacterLineProps) {
  const entry = group.characterName ? nameMap.get(group.characterName) : undefined;
  const color = entry?.color ?? "#d8c9a0";
  const portraitUrl = useMemo(() => resolvePortrait(snapshot, group, entry), [snapshot, group, entry]);

  return (
    <motion.div
      className="tw-line tw-line-character"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
      layout
    >
      <div className="tw-line-portrait" style={{ borderColor: color }}>
        {portraitUrl ? (
          <img src={portraitUrl} alt={group.characterName ?? ""} />
        ) : (
          <div className="tw-line-portrait-fallback" style={{ background: color }}>
            {group.characterName?.[0]}
          </div>
        )}
      </div>
      <div className="tw-line-body">
        <div className="tw-line-name" style={{ color }}>{group.characterName}</div>
        {group.lines.map((line, i) => (
          <InkText
            key={i}
            text={line.text}
            className="tw-line-text"
            delay={isLatest ? i * 0.08 : 0}
          />
        ))}
      </div>
    </motion.div>
  );
}

function resolvePortrait(
  snapshot: RendererSnapshot,
  group: SceneGroup,
  entry: NameMapEntry | undefined,
): string | null {
  const dir = group.charDir ?? entry?.dir;
  const imageKey = group.imageKey ?? entry?.avatarImage;
  if (!dir || !imageKey) return null;
  const path = `${dir}/${imageKey}`;
  const candidates = snapshot.files.filter(
    (f): f is ProjectFile =>
      f.type === "binary" && (f.path === `${path}.png` || f.path === `${path}.jpg` || f.path === `${path}.webp`),
  );
  if (candidates.length === 0) return null;
  return fileUrl(snapshot, candidates[0]);
}
