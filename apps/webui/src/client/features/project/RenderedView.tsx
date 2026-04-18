import { useEffect, useRef, useState } from "react";
import { Idiomorph } from "idiomorph";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useActiveStream } from "@/client/entities/stream/index.js";
import {
  useOutput,
  useRendererViewState,
  useRendererViewDispatch,
  useRendererActionDispatch,
} from "@/client/entities/renderer/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";

type TransitionPhase = "idle" | "capture" | "fading";

// Must stay in sync with the Tailwind `duration-300` class on the back layer.
const FADE_DURATION_MS = 300;

export function RenderedView() {
  const project = useProjectSelectionState();
  const rendererView = useRendererViewState();
  const rendererViewDispatch = useRendererViewDispatch();
  const stream = useActiveStream();
  const { refresh } = useOutput();
  const actionDispatch = useRendererActionDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const prevSlugRef = useRef<string | null>(project.activeProjectSlug);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<TransitionPhase>("idle");

  // Snapshot the current renderer DOM into the back layer so it can cross-fade
  // out while the new project's renderer loads. Must stay declared above the
  // morph effect below so snapshot runs before morph overwrites `frontEl`.
  // Clearing any in-flight cleanup timer here prevents a rapid A→B→C switch
  // from letting B's fading cleanup clobber C's fresh snapshot.
  useEffect(() => {
    const newSlug = project.activeProjectSlug;
    if (prevSlugRef.current !== null && prevSlugRef.current !== newSlug) {
      const frontEl = frontRef.current;
      const backEl = backRef.current;
      const viewport = containerRef.current;
      if (frontEl && backEl && frontEl.innerHTML) {
        if (cleanupTimerRef.current !== null) {
          clearTimeout(cleanupTimerRef.current);
          cleanupTimerRef.current = null;
        }
        backEl.innerHTML = frontEl.innerHTML;
        const scrollTop = viewport?.scrollTop ?? 0;
        backEl.style.transform =
          scrollTop > 0 ? `translateY(-${scrollTop}px)` : "";
        // eslint-disable-next-line react-hooks/set-state-in-effect -- snapshot DOM과 phase가 같은 커밋에 묶여야 overlay가 먼저 paint됨
        setPhase("capture");
      }
      // Reset html immediately on project switch — theme stays until new
      // renderer output replaces it, avoiding a two-step palette flicker.
      rendererViewDispatch({ type: "CLEAR_HTML" });
    }
    prevSlugRef.current = newSlug;
    void refresh();
  }, [project.activeProjectSlug, refresh, rendererViewDispatch]);

  useEffect(() => {
    if (!stream.isStreaming && project.activeProjectSlug) {
      void refresh();
    }
  }, [stream.isStreaming, project.activeProjectSlug, refresh]);

  useEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    if (!rendererView.html) return;
    Idiomorph.morph(el, rendererView.html, {
      morphStyle: "innerHTML",
      ignoreActiveValue: true,
    });
  }, [rendererView.html]);

  // Two rAFs: the first lets the `capture` className paint, the second lets
  // the browser register the fading transition class before opacity flips —
  // otherwise capture→fading is coalesced and the transition is skipped.
  useEffect(() => {
    if (phase !== "capture") return;
    if (!rendererView.html) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("fading"));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase, rendererView.html]);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => {
      const backEl = backRef.current;
      if (backEl) {
        backEl.innerHTML = "";
        backEl.style.transform = "";
      }
      cleanupTimerRef.current = null;
      setPhase("idle");
    }, FADE_DURATION_MS);
    cleanupTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const anchor = el.querySelector("[data-chat-anchor]");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth" });
    }
  }, [rendererView.html]);

  useEffect(() => {
    const el = frontRef.current;
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

  const backOpacityClass =
    phase === "capture"
      ? "opacity-100 transition-none"
      : phase === "fading"
        ? "opacity-0 transition-opacity duration-300 ease-out motion-reduce:duration-0"
        : "opacity-0 transition-none";

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea ref={containerRef} className="flex-1">
        <div ref={frontRef} className="h-full min-h-full" />
      </ScrollArea>
      <div
        ref={backRef}
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden ${backOpacityClass}`}
      />
    </div>
  );
}
