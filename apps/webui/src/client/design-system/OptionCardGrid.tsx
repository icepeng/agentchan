import type { ReactNode } from "react";

interface OptionCardItem<T extends string> {
  value: T;
  label: string;
  desc?: string;
  icon: ReactNode;
}

interface OptionCardGridProps<T extends string> {
  options: OptionCardItem<T>[];
  active: T;
  onChange: (value: T) => void;
}

export function OptionCardGrid<T extends string>({ options, active, onChange }: OptionCardGridProps<T>) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all cursor-pointer ${
            active === opt.value
              ? "bg-accent/8 border-accent/25 text-accent"
              : "bg-elevated/40 border-edge/8 text-fg-2 hover:border-edge/15 hover:bg-elevated/60"
          }`}
        >
          <div className={active === opt.value ? "text-accent" : "text-fg-3"}>{opt.icon}</div>
          <span className="text-sm font-medium">{opt.label}</span>
          {opt.desc && <span className="text-[11px] text-fg-3 text-center leading-tight text-balance break-keep">{opt.desc}</span>}
        </button>
      ))}
    </div>
  );
}
