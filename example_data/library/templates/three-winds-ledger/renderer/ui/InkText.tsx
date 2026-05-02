import { motion } from "motion/react";
import { useMemo, type ReactNode } from "react";

interface InkTextProps {
  text: string;
  delay?: number;
  className?: string;
  as?: "p" | "span" | "div";
}

const SEGMENT_RE = /(\*[^*]+\*|"[^"]+"|“[^”]+”|「[^」]+」|『[^』]+』|[^\s]+|\s+)/g;

export function InkText({ text, delay = 0, className, as = "p" }: InkTextProps) {
  const segments = useMemo(() => {
    const parts = text.match(SEGMENT_RE) ?? [text];
    let runningDelay = delay;
    return parts.map((raw, i) => {
      const isWhitespace = /^\s+$/.test(raw);
      const node = renderSegment(raw, i);
      const segmentDelay = runningDelay;
      if (!isWhitespace) {
        runningDelay += 0.018 + Math.min(0.04, raw.length * 0.004);
      }
      return { key: i, node, delay: segmentDelay, isWhitespace };
    });
  }, [text, delay]);

  const Tag = as === "span" ? motion.span : as === "div" ? motion.div : motion.p;

  return (
    <Tag className={className}>
      {segments.map(({ key, node, delay: d, isWhitespace }) => {
        if (isWhitespace) {
          return <span key={key}>{node}</span>;
        }
        return (
          <motion.span
            key={key}
            initial={{ opacity: 0, filter: "blur(8px)", y: 4 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{ delay: d, duration: 0.42, ease: [0.2, 0.7, 0.2, 1] }}
            style={{ display: "inline-block", whiteSpace: "pre" }}
          >
            {node}
          </motion.span>
        );
      })}
    </Tag>
  );
}

function renderSegment(raw: string, i: number): ReactNode {
  if (raw.startsWith("*") && raw.endsWith("*") && raw.length > 2) {
    return (
      <em key={i} className="tw-em">
        {raw.slice(1, -1)}
      </em>
    );
  }
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("“") && raw.endsWith("”")) ||
    (raw.startsWith("「") && raw.endsWith("」")) ||
    (raw.startsWith("『") && raw.endsWith("』"))
  ) {
    return (
      <span key={i} className="tw-quote">
        {raw}
      </span>
    );
  }
  return raw;
}
