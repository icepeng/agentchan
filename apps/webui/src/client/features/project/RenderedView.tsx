import { useEffect, useRef } from "react";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useActiveStream } from "@/client/entities/stream/index.js";
import { useOutput } from "@/client/entities/renderer/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";

export function RenderedView() {
  const project = useProjectSelectionState();
  const stream = useActiveStream();
  const { attach, teardown, refresh, refreshState } = useOutput();

  const streamRef = useRef(stream);
  useEffect(() => {
    streamRef.current = stream;
  });

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  // Slug change OR stream-end on the same project both warrant a refresh,
  // but the two triggers must funnel through one effect — splitting them
  // double-fires on slug change (both depend on activeProjectSlug) and the
  // second call races useOutput's cross-fade, destroying the outgoing iframe
  // before its fade-out plays.
  const lastSyncedRef = useRef<{ slug: string | null; isStreaming: boolean }>({
    slug: null,
    isStreaming: false,
  });
  useEffect(() => {
    const slug = project.activeProjectSlug;
    const isStreaming = stream.isStreaming;
    const last = lastSyncedRef.current;
    const slugChanged = last.slug !== slug;
    const streamJustEnded = last.isStreaming && !isStreaming;
    lastSyncedRef.current = { slug, isStreaming };
    if (slugChanged || (slug && streamJustEnded)) {
      void refresh();
    }
  }, [project.activeProjectSlug, stream.isStreaming, refresh]);

  useEffect(() => {
    if (!stream.isStreaming) return;
    let raf = 0;
    let lastSlot = streamRef.current;
    refreshState();
    const tick = () => {
      if (streamRef.current !== lastSlot) {
        lastSlot = streamRef.current;
        refreshState();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stream.isStreaming, refreshState]);

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea className="flex-1">
        <div ref={attach} className="relative h-full min-h-full" />
      </ScrollArea>
    </div>
  );
}
