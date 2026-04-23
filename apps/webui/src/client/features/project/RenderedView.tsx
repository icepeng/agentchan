import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Idiomorph } from "idiomorph";
import {
  projectBaseUrl,
  useProjectSelectionState,
  useWorkspaceFiles,
} from "@/client/entities/project/index.js";
import {
  EMPTY_AGENT_STATE,
  useAgentState,
} from "@/client/entities/agent-state/index.js";
import {
  useOutput,
  useRendererActionDispatch,
  useRendererModule,
  useRendererViewDispatch,
  useRendererViewState,
  validateTheme,
  resolveRawTheme,
  type RenderContext,
  type RendererActions,
  type RendererProps,
} from "@/client/entities/renderer/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";
import { RendererErrorBoundary } from "./RendererErrorBoundary.js";
import { RendererShadowHost } from "./RendererShadowHost.js";

export function RenderedView() {
  const project = useProjectSelectionState();
  const module = useRendererModule(project.activeProjectSlug);
  const { t } = useI18n();

  if (!project.activeProjectSlug) return <RendererFrame />;

  switch (module.kind) {
    case "idle":
    case "loading":
      return (
        <RendererFrame>
          <RendererStatus message={t("renderer.loading")} />
        </RendererFrame>
      );
    case "missing":
      return (
        <RendererFrame>
          <RendererStatus message={t("renderer.notFound")} />
        </RendererFrame>
      );
    case "error":
      return (
        <RendererFrame>
          <RendererErrorView error={module.error} />
        </RendererFrame>
      );
    case "component":
      // Key on slug + js length so editor saves that produce a new compile
      // reset the boundary — otherwise a fixed renderer would stay stuck
      // on the last error screen.
      return (
        <RendererErrorBoundary
          key={`${module.slug}:${module.js.length}`}
          fallback={(err) => (
            <RendererFrame>
              <RendererErrorView error={err} />
            </RendererFrame>
          )}
        >
          <ComponentRenderedView
            slug={module.slug}
            Component={module.Component}
            rawTheme={module.rawTheme}
          />
        </RendererErrorBoundary>
      );
    case "legacy":
      return <LegacyRenderedView />;
  }
}

// --- Shared UI chrome ---

function RendererFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea className="flex-1">
        <div className="h-full min-h-full">{children}</div>
      </ScrollArea>
    </div>
  );
}

function RendererStatus({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-full items-center justify-center text-[14px] text-[color:var(--color-fg-3)]">
      {message}
    </div>
  );
}

function RendererErrorView({ error }: { error: Error }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[14px] font-semibold text-[color:var(--color-danger,#c33)]">
        {t("renderer.error.title")}
      </p>
      <pre className="max-w-[600px] overflow-x-auto whitespace-pre-wrap text-left text-[12px] text-[color:var(--color-fg-3)]">
        {error.message}
      </pre>
      <p className="text-[12px] text-[color:var(--color-fg-3)]">
        {t("renderer.error.hint")}
      </p>
    </div>
  );
}

// --- Component (new) path ---

interface ComponentRenderedViewProps {
  slug: string;
  Component: ComponentType<RendererProps>;
  rawTheme: unknown;
}

function ComponentRenderedView({ slug, Component, rawTheme }: ComponentRenderedViewProps) {
  const state = useAgentState();
  const { data: workspace } = useWorkspaceFiles(slug);
  const files = workspace?.files ?? [];
  const baseUrl = projectBaseUrl(slug);

  const rendererViewDispatch = useRendererViewDispatch();
  const rendererActionDispatch = useRendererActionDispatch();

  const actions: RendererActions = {
    send(text: string) {
      const trimmed = text.trim();
      if (!trimmed) return;
      rendererActionDispatch({
        type: "SET_ACTION",
        action: { type: "send", text: trimmed },
      });
    },
    fill(text: string) {
      rendererActionDispatch({
        type: "SET_ACTION",
        action: { type: "fill", text: text.trim() },
      });
    },
    // setTheme override stays a stub in this PR — the contract is wired so
    // renderers can call it without blowing up, but host-side plumbing
    // lands with the template migrations that actually need it.
    setTheme() {},
  };

  // Theme is recomputed when slug or rawTheme change, not on every AgentState
  // tick. Static themes pay nothing; function themes get an initial empty
  // state so they can still inspect files. Full file/state reactive themes
  // will come with the templates that need them.
  useEffect(() => {
    const ctx: RenderContext = {
      files,
      baseUrl,
      state: EMPTY_AGENT_STATE,
    };
    const theme = validateTheme(resolveRawTheme(rawTheme, ctx));
    rendererViewDispatch({ type: "SET_THEME", theme });
    // files intentionally omitted — theme reacts to slug/rawTheme, not streams
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, rawTheme, baseUrl, rendererViewDispatch]);

  return (
    <RendererFrame>
      <RendererShadowHost>
        <Component
          state={state}
          files={files}
          slug={slug}
          baseUrl={baseUrl}
          actions={actions}
        />
      </RendererShadowHost>
    </RendererFrame>
  );
}

// --- Legacy (HTML string) path ---
// innerHTML/idiomorph/script-reexec/cross-fade pipeline, unchanged from the
// pre-React-component era. Kept intact until every template migrates.

type TransitionPhase = "idle" | "capture" | "fading";

// Must stay in sync with the Tailwind `duration-300` class on the back layer.
const FADE_DURATION_MS = 300;

function LegacyRenderedView() {
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
