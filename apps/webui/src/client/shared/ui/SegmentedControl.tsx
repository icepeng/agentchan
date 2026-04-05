import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, className }: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(val: T[]) => {
        if (val.length > 0) onChange(val[0]);
      }}
      className={`flex rounded-lg border border-edge/8 overflow-hidden ${className ?? ""}`}
    >
      {options.map((opt) => (
        <Toggle
          key={opt.value}
          value={opt.value}
          className="flex-1 px-1 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer bg-elevated text-fg-3 hover:text-fg-2 hover:bg-elevated/80 data-[pressed]:bg-accent data-[pressed]:text-void"
        >
          {opt.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
