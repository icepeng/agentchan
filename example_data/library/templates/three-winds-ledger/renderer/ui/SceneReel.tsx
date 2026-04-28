import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import type {
  NameMapEntry,
  ParsedScene,
  RendererSnapshot,
  SceneGroup,
} from "../data/types";
import { CharacterLine } from "./CharacterLine";
import { InkText } from "./InkText";

interface SceneReelProps {
  parsed: ParsedScene;
  snapshot: RendererSnapshot;
  nameMap: Map<string, NameMapEntry>;
  isStreaming: boolean;
}

export function SceneReel({ parsed, snapshot, nameMap, isStreaming }: SceneReelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastGroupCount = useRef(parsed.groups.length);

  useEffect(() => {
    if (parsed.groups.length !== lastGroupCount.current) {
      lastGroupCount.current = parsed.groups.length;
      const el = scrollRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
  }, [parsed.groups.length]);

  if (parsed.groups.length === 0) {
    return (
      <div className="tw-reel tw-reel-empty">
        <div className="tw-empty-card">
          <div className="tw-empty-mark">三</div>
          <p className="tw-empty-prompt">
            세 바람이 만나는 항구. 첫 줄을 적어주세요.
          </p>
          {isStreaming && <div className="tw-empty-streaming">…장부를 펼치는 중</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="tw-reel" ref={scrollRef}>
      <div className="tw-reel-inner">
        <AnimatePresence initial={false}>
          {parsed.groups.map((group, i) => {
            const isLatest = i === parsed.groups.length - 1;
            return (
              <SceneGroupView
                key={`${i}-${group.kind}-${group.characterName ?? ""}-${groupHash(group)}`}
                group={group}
                snapshot={snapshot}
                nameMap={nameMap}
                isLatest={isLatest}
              />
            );
          })}
        </AnimatePresence>
        {isStreaming && (
          <motion.div
            className="tw-streaming-mark"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <span className="tw-streaming-ink" />
            <span className="tw-streaming-ink" />
            <span className="tw-streaming-ink" />
          </motion.div>
        )}
      </div>
    </div>
  );
}

interface SceneGroupViewProps {
  group: SceneGroup;
  snapshot: RendererSnapshot;
  nameMap: Map<string, NameMapEntry>;
  isLatest: boolean;
}

function SceneGroupView({ group, snapshot, nameMap, isLatest }: SceneGroupViewProps) {
  switch (group.kind) {
    case "user":
      return (
        <motion.div
          className="tw-line tw-line-user"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          layout
        >
          <span className="tw-user-stub">▸</span>
          <div className="tw-user-text">
            {group.lines.map((l, i) => (
              <span key={i}>{l.text}</span>
            ))}
          </div>
        </motion.div>
      );
    case "narration":
      return (
        <motion.div
          className="tw-line tw-line-narration"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
          layout
        >
          {group.lines.map((line, i) => (
            <InkText
              key={i}
              text={line.text}
              className="tw-narration"
              delay={isLatest ? i * 0.06 : 0}
            />
          ))}
        </motion.div>
      );
    case "character":
      return <CharacterLine group={group} snapshot={snapshot} nameMap={nameMap} isLatest={isLatest} />;
    case "system":
      return <SystemLineView group={group} isLatest={isLatest} />;
    case "divider":
      return (
        <motion.div
          className="tw-divider"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
          layout
        >
          <span className="tw-divider-mark" />
          <span className="tw-divider-line" />
          <span className="tw-divider-mark" />
        </motion.div>
      );
  }
}

function SystemLineView({ group, isLatest }: { group: SceneGroup; isLatest: boolean }) {
  const line = group.lines[0];
  const kind = line?.systemKind ?? "generic";
  const success = line?.judgmentSuccess;

  const kindClass =
    kind === "judgment"
      ? success === true
        ? "tw-system-judgment tw-system-success"
        : success === false
          ? "tw-system-judgment tw-system-fail"
          : "tw-system-judgment"
      : kind === "event"
        ? "tw-system-event"
        : kind === "item"
          ? "tw-system-item"
          : kind === "relationship"
            ? "tw-system-relationship"
            : "tw-system-generic";

  const label =
    kind === "judgment"
      ? "판정"
      : kind === "event"
        ? "이벤트"
        : kind === "item"
          ? "획득"
          : kind === "relationship"
            ? "관계"
            : "기록";

  return (
    <motion.div
      className={`tw-system ${kindClass}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1], delay: isLatest ? 0.12 : 0 }}
      layout
    >
      <span className="tw-system-label">{label}</span>
      <span className="tw-system-text">{line?.text ?? ""}</span>
    </motion.div>
  );
}

function groupHash(group: SceneGroup): string {
  return group.lines
    .slice(0, 2)
    .map((l) => l.text.slice(0, 24))
    .join("|");
}
