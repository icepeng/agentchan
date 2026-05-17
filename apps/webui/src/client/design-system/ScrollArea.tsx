import type { ReactNode, Ref } from "react";
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";

interface ScrollAreaProps {
  children: ReactNode;
  /** Which axes to scroll. @default "vertical" */
  orientation?: "vertical" | "horizontal" | "both";
  /** Hide scrollbar entirely (invisible scroll like tab strips). @default false */
  hideScrollbar?: boolean;
  /** Classes on the Root (sizing/layout: flex-1, max-h-40, etc.) */
  className?: string;
  /** Classes on the Viewport (padding, text, interior styles) */
  viewportClassName?: string;
  ref?: Ref<HTMLDivElement>;
}

const scrollbarClass = [
  "flex touch-none select-none",
  "data-[orientation=vertical]:w-1.5 data-[orientation=vertical]:py-1",
  "data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:px-1",
  "opacity-0 transition-opacity duration-200",
  "data-[hovering]:opacity-100 data-[scrolling]:opacity-100",
].join(" ");

const thumbClass = [
  "flex-1 rounded-full",
  "bg-fg-4 hover:bg-fg-3 transition-colors duration-150",
].join(" ");

export function ScrollArea({
  children,
  orientation = "vertical",
  hideScrollbar = false,
  className,
  viewportClassName,
  ref,
}: ScrollAreaProps) {
  const showVertical = !hideScrollbar && (orientation === "vertical" || orientation === "both");
  const showHorizontal = !hideScrollbar && (orientation === "horizontal" || orientation === "both");

  return (
    <BaseScrollArea.Root className={`overflow-hidden ${className ?? ""}`}>
      <BaseScrollArea.Viewport
        ref={ref}
        className={`h-full max-h-[inherit] ${viewportClassName ?? ""}`}
        style={hideScrollbar ? { scrollbarWidth: "none" } : undefined}
      >
        {orientation === "both"
          ? <BaseScrollArea.Content>{children}</BaseScrollArea.Content>
          : children}
      </BaseScrollArea.Viewport>

      {showVertical && (
        <BaseScrollArea.Scrollbar orientation="vertical" className={scrollbarClass}>
          <BaseScrollArea.Thumb className={thumbClass} />
        </BaseScrollArea.Scrollbar>
      )}
      {showHorizontal && (
        <BaseScrollArea.Scrollbar orientation="horizontal" className={scrollbarClass}>
          <BaseScrollArea.Thumb className={thumbClass} />
        </BaseScrollArea.Scrollbar>
      )}
      {showVertical && showHorizontal && <BaseScrollArea.Corner />}
    </BaseScrollArea.Root>
  );
}
