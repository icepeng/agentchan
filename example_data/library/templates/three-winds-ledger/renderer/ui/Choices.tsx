import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { ChoiceOption, RendererActions, SalernStats, StatKey } from "../data/types";

interface ChoicesProps {
  choices: ChoiceOption[];
  stats: SalernStats | null;
  actions: RendererActions;
  isStreaming: boolean;
}

export function Choices({ choices, stats, actions, isStreaming }: ChoicesProps) {
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);

  if (choices.length === 0 || isStreaming) return null;

  return (
    <div className="tw-choices">
      <div className="tw-choices-clip" aria-hidden="true">
        <span className="tw-choices-clip-band" />
      </div>
      <AnimatePresence mode="popLayout">
        {choices.map((choice, i) => {
          if (pickedIdx !== null && pickedIdx !== i) return null;
          return (
            <ChoiceTicket
              key={`${choice.label}-${i}`}
              choice={choice}
              stats={stats}
              picked={pickedIdx === i}
              onPick={() => {
                if (pickedIdx !== null) return;
                setPickedIdx(i);
                window.setTimeout(() => {
                  void actions.send(choice.action);
                  window.setTimeout(() => setPickedIdx(null), 600);
                }, 380);
              }}
              indexFromTop={i}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

interface ChoiceTicketProps {
  choice: ChoiceOption;
  stats: SalernStats | null;
  picked: boolean;
  onPick: () => void;
  indexFromTop: number;
}

function ChoiceTicket({ choice, stats, picked, onPick, indexFromTop }: ChoiceTicketProps) {
  const dc = choice.dc;
  const stat = choice.stat as StatKey | undefined;
  const statBonus = stat && stats ? stats[stat] : null;
  const odds = computeOdds(dc, statBonus ?? 0);
  const tilt = ((Math.sin(indexFromTop * 4.7) + 1) / 2 - 0.5) * 1.6;

  return (
    <motion.button
      type="button"
      className="tw-ticket"
      style={{
        transform: `rotate(${tilt}deg)`,
        zIndex: 10 - indexFromTop,
      }}
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={
        picked
          ? {
              opacity: 0,
              x: 220,
              y: -40,
              rotate: tilt + 14,
              scale: 0.9,
              transition: { duration: 0.42, ease: [0.5, 0, 0.75, 0] },
            }
          : { opacity: 1, y: 0, scale: 1, rotate: tilt }
      }
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      whileHover={{ y: -3, rotate: tilt + 0.6, transition: { duration: 0.14 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onPick}
    >
      <span className="tw-ticket-pin" />
      <span className="tw-ticket-label">{choice.label}</span>
      {dc !== undefined && stat && (
        <div className="tw-ticket-roll">
          <span className="tw-ticket-stat">{stat}</span>
          <span className="tw-ticket-bonus">
            {statBonus !== null && statBonus !== undefined ? (statBonus >= 0 ? `+${statBonus}` : `${statBonus}`) : ""}
          </span>
          <span className="tw-ticket-dc">DC {dc}</span>
          {odds !== null && (
            <span className="tw-ticket-odds" title={`${Math.round(odds * 100)}%`}>
              <span className="tw-ticket-odds-fill" style={{ width: `${odds * 100}%` }} />
            </span>
          )}
        </div>
      )}
      <span className="tw-ticket-perforation" aria-hidden="true" />
    </motion.button>
  );
}

function computeOdds(dc: number | undefined, bonus: number): number | null {
  if (dc === undefined) return null;
  // d20 + bonus >= dc → success
  const target = dc - bonus;
  const successCount = Math.max(0, Math.min(20, 21 - target));
  return successCount / 20;
}
