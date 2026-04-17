import { useEffect, useRef, useState } from "react";
import { Idiomorph } from "idiomorph";
import { useOutput } from "./useOutput.js";
import { useProjectState } from "@/client/entities/project/index.js";
import { useActiveStream } from "@/client/entities/session/index.js";
import { useRendererActionDispatch } from "@/client/entities/renderer-action/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";

type TransitionPhase = "idle" | "capture" | "fading";

// Must stay in sync with the Tailwind `duration-300` class on the back layer.
const FADE_DURATION_MS = 300;

export function RenderedView() {
  const project = useProjectState();
  const stream = useActiveStream();
  const { refresh, refreshPending } = useOutput();
  const actionDispatch = useRendererActionDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const prevSlugRef = useRef<string | null>(project.activeProjectSlug);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<TransitionPhase>("idle");

  // rAF tick이 effect re-run 없이 최신 slot을 읽을 수 있도록 ref로 미러링.
  const streamRef = useRef(stream);
  useEffect(() => {
    streamRef.current = stream;
  });

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
    }
    prevSlugRef.current = newSlug;
    void refresh();
  }, [project.activeProjectSlug, refresh]);

  useEffect(() => {
    if (!stream.isStreaming && project.activeProjectSlug) {
      void refresh();
    }
  }, [stream.isStreaming, project.activeProjectSlug, refresh]);

  // 스트리밍 중 requestAnimationFrame 주기로 pending 렌더를 트리거한다.
  // refreshPending이 캐시된 렌더러를 동기 호출하므로 프레임 안에 끝나고,
  // 동일 HTML이면 dispatch를 건너뛰어 Context 소비자 재렌더를 막는다.
  useEffect(() => {
    if (!stream.isStreaming) return;
    let raf = 0;
    const tick = () => {
      const s = streamRef.current;
      refreshPending({
        isStreaming: s.isStreaming,
        streamingText: s.streamingText,
        toolCalls: s.streamingToolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          done: tc.done,
          executing: tc.executing,
        })),
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stream.isStreaming, refreshPending]);

  useEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    if (!project.renderedHtml) return;
    Idiomorph.morph(el, project.renderedHtml, {
      morphStyle: "innerHTML",
      ignoreActiveValue: true,
    });
  }, [project.renderedHtml]);

  // Two rAFs: the first lets the `capture` className paint, the second lets
  // the browser register the fading transition class before opacity flips —
  // otherwise capture→fading is coalesced and the transition is skipped.
  useEffect(() => {
    if (phase !== "capture") return;
    if (!project.renderedHtml) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("fading"));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase, project.renderedHtml]);

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
  }, [project.renderedHtml]);

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
