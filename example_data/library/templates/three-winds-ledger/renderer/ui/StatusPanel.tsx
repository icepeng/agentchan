import { motion } from "motion/react";
import type {
  InventoryItem,
  QuestEntry,
  RelationshipState,
  SalernStats,
  SalernStatus,
} from "../data/types";
import { STAT_KEYS } from "../data/types";

interface StatusPanelProps {
  status: SalernStatus | null;
  stats: SalernStats | null;
  relationship: RelationshipState | null;
  inventory: InventoryItem[];
  quests: QuestEntry[];
}

export function StatusPanel({
  status,
  stats,
  relationship,
  inventory,
  quests,
}: StatusPanelProps) {
  return (
    <aside className="tw-status">
      {status && <StatusBlock status={status} />}
      {stats && <StatsBlock stats={stats} />}
      {relationship && <RelationshipBlock state={relationship} />}
      {inventory.length > 0 && <InventoryBlock items={inventory} />}
      {quests.length > 0 && <QuestsBlock entries={quests} />}
    </aside>
  );
}

function StatusBlock({ status }: { status: SalernStatus }) {
  return (
    <section className="tw-status-block">
      <div className="tw-status-row">
        {status.location && (
          <div className="tw-status-loc">
            <span className="tw-status-loc-mark">◇</span>
            <span>{status.location}</span>
          </div>
        )}
        {status.emotion && <div className="tw-status-emotion">{status.emotion}</div>}
      </div>
      <div className="tw-bar-row">
        <Bar
          label="HP"
          current={status.hp.current}
          max={status.hp.max}
          color="#a83328"
          shadow="rgba(168,51,40,0.4)"
        />
        <Bar
          label="MP"
          current={status.mp.current}
          max={status.mp.max}
          color="#3a6a8a"
          shadow="rgba(58,106,138,0.4)"
        />
      </div>
      {status.conditions.length > 0 && (
        <div className="tw-conditions">
          {status.conditions.map((c) => (
            <span key={c} className="tw-condition">{c}</span>
          ))}
        </div>
      )}
    </section>
  );
}

interface BarProps {
  label: string;
  current: number;
  max: number;
  color: string;
  shadow: string;
}

function Bar({ label, current, max, color, shadow }: BarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <div className="tw-bar">
      <div className="tw-bar-label">
        <span>{label}</span>
        <span className="tw-bar-num">
          {current}<span className="tw-bar-slash">/</span>{max}
        </span>
      </div>
      <div className="tw-bar-track">
        <motion.div
          className="tw-bar-fill"
          style={{ background: color, boxShadow: `0 0 12px ${shadow}` }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
        />
      </div>
    </div>
  );
}

function StatsBlock({ stats }: { stats: SalernStats }) {
  return (
    <section className="tw-status-block">
      <div className="tw-block-title">능력</div>
      <div className="tw-stats-grid">
        {STAT_KEYS.map((key) => {
          const value = stats[key];
          const sign = value >= 0 ? "+" : "";
          return (
            <div key={key} className="tw-stat">
              <div className="tw-stat-label">{key}</div>
              <div className={`tw-stat-value ${value < 0 ? "tw-stat-neg" : value === 0 ? "tw-stat-zero" : "tw-stat-pos"}`}>
                {sign}{value}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RelationshipBlock({ state }: { state: RelationshipState }) {
  const trust = state.trust;
  const ticks = Array.from({ length: 7 }, (_, i) => i - 3);
  return (
    <section className="tw-status-block">
      <div className="tw-block-title">리우</div>
      <div className="tw-trust-track">
        {ticks.map((t) => (
          <div
            key={t}
            className={`tw-trust-tick ${t === trust ? "tw-trust-active" : ""} ${t < 0 ? "tw-trust-neg" : t > 0 ? "tw-trust-pos" : "tw-trust-zero"}`}
          />
        ))}
      </div>
      {state.stance && <div className="tw-trust-stance">{state.stance}</div>}
    </section>
  );
}

function InventoryBlock({ items }: { items: InventoryItem[] }) {
  return (
    <section className="tw-status-block">
      <div className="tw-block-title">소지</div>
      <ul className="tw-inv">
        {items.map((it) => (
          <li key={it.slug} className="tw-inv-item">
            <span className="tw-inv-name">{it.name}</span>
            {it.qty != null && it.qty !== 1 && (
              <span className="tw-inv-qty">×{it.qty}</span>
            )}
            {it.note && <span className="tw-inv-note">{it.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuestsBlock({ entries }: { entries: QuestEntry[] }) {
  const active = entries.filter((q) => q.status === "active");
  const done = entries.filter((q) => q.status === "done");
  return (
    <section className="tw-status-block">
      <div className="tw-block-title">사건</div>
      <ul className="tw-quest-list">
        {active.map((q) => (
          <li key={q.id} className="tw-quest tw-quest-active">
            <span className="tw-quest-mark">●</span>
            <div>
              <div className="tw-quest-title">{q.title}</div>
              {q.note && <div className="tw-quest-note">{q.note}</div>}
            </div>
          </li>
        ))}
        {done.map((q) => (
          <li key={q.id} className="tw-quest tw-quest-done">
            <span className="tw-quest-mark">○</span>
            <div className="tw-quest-title">{q.title}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
