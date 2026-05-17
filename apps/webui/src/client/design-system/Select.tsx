import { Select as BaseSelect } from "@base-ui/react/select";
import { ChevronDown } from "lucide-react";

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  className?: string;
  size?: "sm" | "md";
}

export function Select({ value, onChange, options, className, size = "sm" }: SelectProps) {
  const sizeClasses = size === "md"
    ? "px-4 py-2.5 rounded-xl"
    : "px-3 py-1.5 rounded-lg";

  return (
    <div className={className}>
      <BaseSelect.Root value={value} onValueChange={(val) => { if (val !== null) onChange(val); }}>
        <BaseSelect.Trigger
          className={`w-full flex items-center justify-between appearance-none ${sizeClasses} text-sm bg-elevated border border-edge/8 focus:outline-none focus:border-accent/30 text-fg-2 transition-colors cursor-pointer`}
        >
          <BaseSelect.Value />
          <BaseSelect.Icon>
            <ChevronDown size={12} strokeWidth={1.5} className="pointer-events-none text-fg-3" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-[100]">
            <BaseSelect.Popup className="min-w-[var(--anchor-width)] bg-elevated border border-edge/8 rounded-lg shadow-lg shadow-void/50 py-1">
              {options.map((opt) => (
                <BaseSelect.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className="px-3 py-1.5 text-sm text-fg-2 cursor-pointer outline-none data-[highlighted]:bg-accent/10 data-[highlighted]:text-accent"
                >
                  <BaseSelect.ItemText>{opt.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
}
