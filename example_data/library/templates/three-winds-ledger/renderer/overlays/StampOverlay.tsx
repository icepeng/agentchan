import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface StampOverlayProps {
  ledgerCount: number;
  inventoryCount: number;
}

interface Stamp {
  id: number;
  label: string;
  color: string;
  rotate: number;
  x: number;
  y: number;
}

export function StampOverlay({ ledgerCount, inventoryCount }: StampOverlayProps) {
  const lastLedger = useRef(ledgerCount);
  const lastInv = useRef(inventoryCount);
  const counter = useRef(0);
  const [stamps, setStamps] = useState<Stamp[]>([]);

  useEffect(() => {
    const newStamps: Stamp[] = [];
    if (ledgerCount > lastLedger.current) {
      counter.current += 1;
      newStamps.push(makeStamp(counter.current, "장부 +", "#9a3a4a"));
    }
    if (inventoryCount > lastInv.current) {
      counter.current += 1;
      newStamps.push(makeStamp(counter.current, "획득", "#b6822a"));
    }
    lastLedger.current = ledgerCount;
    lastInv.current = inventoryCount;
    if (newStamps.length === 0) return;
    setStamps((prev) => [...prev, ...newStamps]);
    const ids = newStamps.map((s) => s.id);
    const t = window.setTimeout(() => {
      setStamps((prev) => prev.filter((s) => !ids.includes(s.id)));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [ledgerCount, inventoryCount]);

  return (
    <div className="tw-stamps" aria-hidden="true">
      <AnimatePresence>
        {stamps.map((s) => (
          <motion.div
            key={s.id}
            className="tw-stamp"
            style={{
              color: s.color,
              borderColor: s.color,
              left: `${s.x}%`,
              top: `${s.y}%`,
            }}
            initial={{ opacity: 0, scale: 1.8, rotate: s.rotate - 8 }}
            animate={{ opacity: 1, scale: 1, rotate: s.rotate }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {s.label}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function makeStamp(id: number, label: string, color: string): Stamp {
  return {
    id,
    label,
    color,
    rotate: -8 + Math.random() * 16,
    x: 30 + Math.random() * 40,
    y: 28 + Math.random() * 30,
  };
}
