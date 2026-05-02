import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LedgerEntry, WindKey } from "../data/types";
import { WIND_COLOR, classifyLink } from "../data/wind";

interface LedgerBoardProps {
  entries: LedgerEntry[];
}

interface CardPos {
  id: string;
  x: number;
  y: number;
  rot: number;
  windKey?: WindKey;
}

interface LinkPin {
  cx: number;
  cy: number;
  label: string;
  windKey: WindKey;
}

const WIND_ORIGIN: Record<WindKey, { x: number; y: number }> = {
  north: { x: 50, y: -8 },
  east: { x: 96, y: 50 },
  south: { x: 50, y: 96 },
};

export function LedgerBoard({ entries }: LedgerBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  const layout = useMemo(() => layoutCards(entries), [entries]);
  const linkPins = useMemo(() => buildLinkPins(entries), [entries]);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => {
      setBoardSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const strings = useMemo(
    () => buildStrings(entries, layout, linkPins, boardSize),
    [entries, layout, linkPins, boardSize],
  );

  if (entries.length === 0) {
    return (
      <div className="tw-board tw-board-empty">
        <div className="tw-board-emptymark">아직 장부가 비어 있다</div>
      </div>
    );
  }

  return (
    <div className="tw-board" ref={boardRef}>
      <svg className="tw-board-strings" viewBox={`0 0 ${boardSize.width || 100} ${boardSize.height || 100}`} preserveAspectRatio="none">
        {strings.map((s, i) => (
          <motion.path
            key={i}
            d={s.d}
            stroke={s.color}
            strokeWidth={1.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.7}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.7 }}
            transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: 0.2 + i * 0.04 }}
          />
        ))}
      </svg>

      <div className="tw-board-pins">
        {linkPins.map((p, i) => (
          <motion.div
            key={i}
            className="tw-board-pin"
            style={{ left: `${p.cx}%`, top: `${p.cy}%`, color: WIND_COLOR[p.windKey] }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 + i * 0.05, duration: 0.3 }}
          >
            <span className="tw-board-pin-dot" style={{ background: WIND_COLOR[p.windKey] }} />
            <span className="tw-board-pin-label">{p.label}</span>
          </motion.div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {layout.map((c) => {
          const entry = entries.find((e) => e.id === c.id)!;
          const wind = c.windKey;
          const origin = wind ? WIND_ORIGIN[wind] : { x: 50, y: -10 };
          const dx = (origin.x - c.x) * 0.6;
          const dy = (origin.y - c.y) * 0.6;
          return (
            <motion.div
              key={c.id}
              className={`tw-board-card tw-board-card-${entry.status}`}
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                transform: `translate(-50%, -50%) rotate(${c.rot}deg)`,
                borderColor: wind ? WIND_COLOR[wind] : "#3a2a18",
              }}
              initial={{ opacity: 0, x: dx, y: dy, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, rotate: c.rot + 6 }}
              transition={{
                type: "spring",
                stiffness: wind === "east" ? 220 : wind === "north" ? 150 : 180,
                damping: wind === "east" ? 12 : wind === "north" ? 22 : 16,
              }}
              layout
            >
              <div className="tw-board-card-pin" style={{ background: wind ? WIND_COLOR[wind] : "#b6822a" }} />
              <div className="tw-board-card-title">{entry.title}</div>
              {entry.clue && <div className="tw-board-card-clue">{entry.clue}</div>}
              {entry.note && <div className="tw-board-card-note">{entry.note}</div>}
              {entry.links.length > 0 && (
                <div className="tw-board-card-links">
                  {entry.links.map((l, i) => (
                    <span key={i} className="tw-board-card-link">{l}</span>
                  ))}
                </div>
              )}
              {entry.status === "resolved" && (
                <div className="tw-board-card-stamp">RESOLVED</div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function layoutCards(entries: LedgerEntry[]): CardPos[] {
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(entries.length))));
  const rows = Math.ceil(entries.length / cols);
  const positions: CardPos[] = [];
  const padX = 18;
  const padY = 16;
  const stepX = (100 - padX * 2) / Math.max(1, cols - 1 || 1);
  const stepY = (100 - padY * 2) / Math.max(1, rows - 1 || 1);

  entries.forEach((entry, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const jitterX = ((Math.sin(i * 9.7) + 1) / 2 - 0.5) * 6;
    const jitterY = ((Math.cos(i * 5.3) + 1) / 2 - 0.5) * 6;
    const x = cols === 1 ? 50 : padX + col * stepX + jitterX;
    const y = rows === 1 ? 50 : padY + row * stepY + jitterY;
    const rot = ((Math.sin(i * 3.1) + 1) / 2 - 0.5) * 6;
    const wind = entry.wind ?? guessWind(entry.links);
    positions.push({ id: entry.id, x, y, rot, windKey: wind ?? undefined });
  });
  return positions;
}

function guessWind(links: string[]): WindKey | null {
  for (const link of links) {
    const k = classifyLink(link);
    if (k) return k;
  }
  return null;
}

function buildLinkPins(entries: LedgerEntry[]): LinkPin[] {
  const seen = new Map<string, LinkPin>();
  for (const entry of entries) {
    for (const link of entry.links) {
      if (seen.has(link)) continue;
      const wind = classifyLink(link) ?? "east";
      const angle = Math.random() * Math.PI * 2;
      const radius = 38 + Math.random() * 8;
      const cx = 50 + Math.cos(angle) * radius;
      const cy = 50 + Math.sin(angle) * radius;
      seen.set(link, { cx: clamp(cx, 4, 96), cy: clamp(cy, 4, 96), label: link, windKey: wind });
    }
  }
  return [...seen.values()];
}

function buildStrings(
  entries: LedgerEntry[],
  cards: CardPos[],
  pins: LinkPin[],
  size: { width: number; height: number },
): { d: string; color: string }[] {
  if (size.width === 0 || size.height === 0) return [];
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const pinByLabel = new Map(pins.map((p) => [p.label, p]));
  const strings: { d: string; color: string }[] = [];

  for (const entry of entries) {
    const card = cardById.get(entry.id);
    if (!card) continue;
    const wind = card.windKey;
    const color = wind ? WIND_COLOR[wind] : "#9a3a4a";
    const cardX = (card.x / 100) * size.width;
    const cardY = (card.y / 100) * size.height;
    for (const link of entry.links) {
      const pin = pinByLabel.get(link);
      if (!pin) continue;
      const pinX = (pin.cx / 100) * size.width;
      const pinY = (pin.cy / 100) * size.height;
      const midX = (cardX + pinX) / 2;
      const midY = (cardY + pinY) / 2 + 12;
      strings.push({
        d: `M ${cardX.toFixed(1)} ${cardY.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${pinX.toFixed(1)} ${pinY.toFixed(1)}`,
        color,
      });
    }
  }
  return strings;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
