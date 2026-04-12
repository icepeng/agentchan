import { useCallback, useRef, useEffect } from "react";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
}

export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        onResize(ev.clientX - startX);
      };

      const cleanup = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", cleanup);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        cleanupRef.current = null;
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", cleanup);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      cleanupRef.current = cleanup;
    },
    [onResize],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="hidden lg:block flex-shrink-0 w-px bg-edge/6 cursor-col-resize relative z-20"
    >
      <div className="absolute inset-y-0 -left-[3px] -right-[3px] hover:bg-accent/12 active:bg-accent/20 transition-colors duration-150" />
    </div>
  );
}
