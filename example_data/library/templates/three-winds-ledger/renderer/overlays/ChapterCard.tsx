import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

interface ChapterCardProps {
  act: number;
  worldMode: "peace" | "combat";
}

const ACT_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: { title: "ACT  ONE", subtitle: "젖은 장부" },
  2: { title: "ACT  TWO", subtitle: "세 바람의 거래" },
  3: { title: "ACT  THREE", subtitle: "장부를 누구에게 넘길 것인가" },
};

export function ChapterCard({ act, worldMode }: ChapterCardProps) {
  const [shown, setShown] = useState<{ act: number; mode: "peace" | "combat" } | null>(null);
  const [first, setFirst] = useState(true);

  useEffect(() => {
    if (first) {
      setFirst(false);
      return;
    }
    setShown({ act, mode: worldMode });
    const id = window.setTimeout(() => setShown(null), 2400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, worldMode]);

  return (
    <AnimatePresence>
      {shown && <ChapterCardOverlay act={shown.act} mode={shown.mode} />}
    </AnimatePresence>
  );
}

function ChapterCardOverlay({ act, mode }: { act: number; mode: "peace" | "combat" }) {
  const meta = ACT_TITLES[act] ?? ACT_TITLES[1];
  return (
    <motion.div
      className={`tw-chapter ${mode === "combat" ? "tw-chapter-combat" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="tw-chapter-bands">
        <motion.span
          className="tw-chapter-band"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          exit={{ scaleX: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.span
          className="tw-chapter-band"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          exit={{ scaleX: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
        />
      </div>
      <div className="tw-chapter-text">
        <motion.div
          className="tw-chapter-title"
          initial={{ opacity: 0, y: 24, letterSpacing: "0.6em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0.36em" }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
        >
          {meta.title}
        </motion.div>
        <motion.div
          className="tw-chapter-subtitle"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.32 }}
        >
          {meta.subtitle}
        </motion.div>
        {mode === "combat" && (
          <motion.div
            className="tw-chapter-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.5 }}
          >
            COMBAT
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
