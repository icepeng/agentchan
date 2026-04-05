import type { ReactNode } from "react";
import { Collapsible } from "@base-ui/react/collapsible";

interface CollapsiblePanelProps {
  trigger: ReactNode;
  children: ReactNode;
  expanded: boolean;
}

export function CollapsiblePanel({ trigger, children, expanded }: CollapsiblePanelProps) {
  return (
    <Collapsible.Root open={expanded}>
      {trigger}
      <Collapsible.Panel className="overflow-hidden h-[var(--collapsible-panel-height)] transition-[height] duration-200 ease-out data-[starting-style]:h-0 data-[ending-style]:h-0">
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
