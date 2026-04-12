import { useCallback, useRef, useEffect, useLayoutEffect } from "react";

interface ResizeHandleProps {
  onResizeStart?: () => void;
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
}

export function ResizeHandle({ onResizeStart, onResize, onResizeEnd }: ResizeHandleProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const callbacksRef = useRef({ onResizeStart, onResize, onResizeEnd });

  useLayoutEffect(() => {
    callbacksRef.current = { onResizeStart, onResize, onResizeEnd };
  });

  useEffect(() => () => cleanupRef.current?.(), []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;

    callbacksRef.current.onResizeStart?.();

    const onMouseMove = (ev: MouseEvent) => {
      callbacksRef.current.onResize(ev.clientX - startX);
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cleanupRef.current = null;
      callbacksRef.current.onResizeEnd?.();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", cleanup);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    cleanupRef.current = cleanup;
  }, []);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="hidden lg:block flex-shrink-0 w-px bg-edge/6 cursor-col-resize relative z-20"
    >
      <div className="absolute inset-y-0 -left-[3px] -right-[3px] hover:bg-accent/12 active:bg-accent/20 transition-colors duration-150" />
    </div>
  );
}
