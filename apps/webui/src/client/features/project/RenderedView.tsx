import { useEffect, useRef } from "react";
import { Idiomorph } from "idiomorph";
import { useOutput } from "./useOutput.js";
import { useProjectState } from "@/client/entities/project/index.js";
import { useSessionState } from "@/client/entities/session/index.js";

export function RenderedView() {
  const project = useProjectState();
  const session = useSessionState();
  const { refresh } = useOutput();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Refresh when project changes
  useEffect(() => {
    void refresh();
  }, [project.activeProjectSlug, refresh]);

  // Refresh when streaming completes (agent may have written files)
  useEffect(() => {
    if (!session.isStreaming && project.activeProjectSlug) {
      void refresh();
    }
  }, [session.isStreaming, project.activeProjectSlug, refresh]);

  // Morph DOM when rendered HTML changes
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    Idiomorph.morph(el, project.renderedHtml, {
      morphStyle: "innerHTML",
      ignoreActiveValue: true,
    });
  }, [project.renderedHtml]);

  // Auto-scroll to bottom when rendered content has a chat anchor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const anchor = el.querySelector("[data-chat-anchor]");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth" });
    }
  }, [project.renderedHtml]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-6">
      <div ref={contentRef} className="min-h-full" />
    </div>
  );
}
