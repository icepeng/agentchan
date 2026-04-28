import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface BellShockwaveProps {
  pulse: number;
  variant: "neutral" | "success" | "fail";
}

interface ActiveWave {
  id: number;
  variant: "neutral" | "success" | "fail";
}

export function BellShockwave({ pulse, variant }: BellShockwaveProps) {
  const [waves, setWaves] = useState<ActiveWave[]>([]);
  const lastPulse = useRef(pulse);
  const counter = useRef(0);

  useEffect(() => {
    if (pulse === lastPulse.current) return;
    lastPulse.current = pulse;
    counter.current += 1;
    const id = counter.current;
    setWaves((prev) => [...prev, { id, variant }]);
    const t = window.setTimeout(() => {
      setWaves((prev) => prev.filter((w) => w.id !== id));
    }, 1400);
    return () => window.clearTimeout(t);
  }, [pulse, variant]);

  return (
    <div className="tw-shock" aria-hidden="true">
      <AnimatePresence>
        {waves.map((wave) => (
          <Wave key={wave.id} variant={wave.variant} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Wave({ variant }: { variant: "neutral" | "success" | "fail" }) {
  const color =
    variant === "success" ? "#d8a565" : variant === "fail" ? "#a83328" : "#b6822a";

  return (
    <>
      <motion.span
        className="tw-shock-ring"
        style={{ borderColor: color }}
        initial={{ scale: 0.2, opacity: 0.85 }}
        animate={{ scale: 5, opacity: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className="tw-shock-ring"
        style={{ borderColor: color }}
        initial={{ scale: 0.2, opacity: 0.5 }}
        animate={{ scale: 7, opacity: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
      />
      <motion.span
        className="tw-shock-flash"
        style={{ background: color }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.32, 0] }}
        transition={{ duration: 0.5, times: [0, 0.4, 1] }}
      />
    </>
  );
}
