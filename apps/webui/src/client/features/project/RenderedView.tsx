import { useEffect, useRef } from "react";
import { Idiomorph } from "idiomorph";
import { useOutput } from "./useOutput.js";
import { useProjectState } from "@/client/entities/project/index.js";
import { useSessionState } from "@/client/entities/session/index.js";
import { useRendererActionDispatch } from "@/client/entities/renderer-action/index.js";

export function RenderedView() {
  const project = useProjectState();
  const session = useSessionState();
  const { refresh } = useOutput();
  const actionDispatch = useRendererActionDispatch();
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

  // Event delegation for renderer actions (data-action="send" | "fill")
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (!target) return;
      const action = target.dataset.action;
      const text = target.dataset.text ?? target.textContent?.trim() ?? "";
      if (!text) return;
      e.preventDefault();
      if (action === "send" || action === "fill") {
        actionDispatch({
          type: "SET_ACTION",
          action: { type: action, text },
        });
      }
    };
    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  }, [actionDispatch]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-6">
      <div ref={contentRef} className="min-h-full" />
    </div>
  );
}
