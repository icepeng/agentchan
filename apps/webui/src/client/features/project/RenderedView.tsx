import { useEffect, useRef, useState } from "react";
import { Idiomorph } from "idiomorph";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import {
  useOutput,
  useRendererViewState,
  useRendererActionDispatch,
} from "@/client/entities/renderer/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";

type TransitionPhase = "idle" | "capture" | "fading";

// Must stay in sync with the Tailwind `duration-300` class on the back layer.
const FADE_DURATION_MS = 300;

export function RenderedView() {
  const project = useProjectSelectionState();
  const rendererView = useRendererViewState();
  const state = useAgentState();
  const { refresh, refreshState } = useOutput();
  const actionDispatch = useRendererActionDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const prevSlugRef = useRef<string | null>(project.activeProjectSlug);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<TransitionPhase>("idle");

  // Mirror the latest AgentState into a ref so the rAF tick reads it without
  // re-running the effect on every delta. Identity changes whenever the
  // reducer produces a new slot object — that's the cue to refreshState.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
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
    if (!state.isStreaming && project.activeProjectSlug) {
      void refresh();
    }
  }, [state.isStreaming, project.activeProjectSlug, refresh]);

  // rAF-coalesced stream re-render. `useOutput` reads the latest AgentState
  // via ref each call, so the tick just compares state identity to skip
  // refreshState when nothing has changed — avoiding 60fps CPU burn.
  useEffect(() => {
    if (!state.isStreaming) return;
    let raf = 0;
    let lastState = stateRef.current;
    refreshState();
    const tick = () => {
      if (stateRef.current !== lastState) {
        lastState = stateRef.current;
        refreshState();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.isStreaming, refreshState]);

  useEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    if (!rendererView.html) return;
    Idiomorph.morph(el, rendererView.html, {
      morphStyle: "innerHTML",
      ignoreActiveValue: true,
    });
    // innerHTML로 들어간 <script>는 브라우저가 실행하지 않으므로 새 노드로 교체해
    // 강제 실행. 인라인 script는 dataset 가드로 중복 등록을 막아야 한다.
    if (rendererView.html.indexOf("<script") === -1) return;
    el.querySelectorAll("script").forEach((oldScript) => {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
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

  // 스트리밍 중 pending UI가 매 rAF마다 anchor를 다시 잡으면서 스크롤을 끌어내리므로,
  // 스트리밍이 끝난 직후 한 번만 바닥으로 이동시킨다. isStreaming이 true→false로 바뀌는
  // 전이에서 effect가 재실행되며 최종 결과로 스크롤된다.
  useEffect(() => {
    if (state.isStreaming) return;
    const el = containerRef.current;
    if (!el) return;
    const anchor = el.querySelector("[data-chat-anchor]");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth" });
    }
  }, [rendererView.html, state.isStreaming]);

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
