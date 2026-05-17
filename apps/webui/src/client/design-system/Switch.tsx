import { Switch as BaseSwitch } from "@base-ui/react/switch";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function Switch({ checked, onChange, className }: SwitchProps) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors data-[checked]:bg-accent/60 data-[unchecked]:bg-fg-3/20 ${className ?? ""}`}
    >
      <BaseSwitch.Thumb className="inline-block h-4 w-4 rounded-full bg-white transition-transform data-[checked]:translate-x-6 data-[unchecked]:translate-x-1" />
    </BaseSwitch.Root>
  );
}
