import { Tabs } from "@base-ui/react/tabs";

interface TabBarProps<T extends string> {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (tab: T) => void;
  className?: string;
}

export function TabBar<T extends string>({ tabs, active, onChange, className }: TabBarProps<T>) {
  return (
    <Tabs.Root
      value={active}
      onValueChange={(value) => onChange(value as T)}
    >
      <Tabs.List className={`flex gap-1 ${className ?? ""}`}>
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.key}
            value={tab.key}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-transparent text-fg-2 hover:text-fg hover:bg-elevated/50 data-[active]:bg-accent/10 data-[active]:text-accent data-[active]:border-accent/20"
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
