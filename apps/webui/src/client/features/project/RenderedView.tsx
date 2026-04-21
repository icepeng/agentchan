import { useEffect, useReducer, useRef } from "react";
import { useProjectSelectionState } from "@/client/entities/project/index.js";
import {
  useRendererMount,
  useRendererThemeDispatch,
  type RendererMountSlot,
} from "@/client/entities/renderer/index.js";

const FADE_DURATION_MS = 300;

/**
 * Front + fading 두 slot을 **같은 배열**에 key 기반으로 렌더해 React가
 * reconcile하도록 한다. slug 전환 시 프레임 재생성이 아닌 prop 변경이라
 * iframe DOM과 contentWindow가 유지된다.
 */
interface SlotState {
  front: RendererMountSlot | null;
  fading: RendererMountSlot | null;
}

type SlotAction =
  | { type: "SET_FRONT"; slug: string; token: string }
  | { type: "CLEAR_FRONT" }
  | { type: "CLEAR_FADING" };

const initialSlots: SlotState = { front: null, fading: null };

function slotsReducer(state: SlotState, action: SlotAction): SlotState {
  switch (action.type) {
    case "SET_FRONT":
      if (state.front && state.front.slug === action.slug) return state;
      return {
        front: { slug: action.slug, token: action.token },
        fading: state.front ?? state.fading,
      };
    case "CLEAR_FRONT":
      if (!state.front) return state;
      return { front: null, fading: state.front };
    case "CLEAR_FADING":
      if (!state.fading) return state;
      return { ...state, fading: null };
  }
}

export function RenderedView() {
  const { activeProjectSlug } = useProjectSelectionState();
  const themeDispatch = useRendererThemeDispatch();
  const [slots, dispatchSlots] = useReducer(slotsReducer, initialSlots);

  useEffect(() => {
    if (!activeProjectSlug) {
      dispatchSlots({ type: "CLEAR_FRONT" });
      themeDispatch({ type: "SET_THEME", theme: null });
      return;
    }
    dispatchSlots({
      type: "SET_FRONT",
      slug: activeProjectSlug,
      token: Math.random().toString(36).slice(2, 10),
    });
    themeDispatch({ type: "SET_THEME", theme: null });
  }, [activeProjectSlug, themeDispatch]);

  useEffect(() => {
    if (!slots.fading) return;
    const t = setTimeout(() => dispatchSlots({ type: "CLEAR_FADING" }), FADE_DURATION_MS);
    return () => clearTimeout(t);
  }, [slots.fading]);

  // 배열 순서가 paint 순서 — fading을 먼저 배치해 front가 위로 올라온다.
  const frames: { slot: RendererMountSlot; fading: boolean }[] = [];
  if (slots.fading) frames.push({ slot: slots.fading, fading: true });
  if (slots.front) frames.push({ slot: slots.front, fading: false });

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {frames.map(({ slot, fading }) => (
        <RendererFrame
          key={`${slot.slug}-${slot.token}`}
          slot={slot}
          fading={fading}
        />
      ))}
    </div>
  );
}

function RendererFrame({
  slot,
  fading,
}: {
  slot: RendererMountSlot;
  fading: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { error } = useRendererMount(iframeRef, slot);
  const src = `/api/projects/${encodeURIComponent(slot.slug)}/renderer/?token=${encodeURIComponent(slot.token)}`;

  return (
    <div
      aria-hidden={fading}
      className={`absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:duration-0 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <iframe
        ref={iframeRef}
        src={src}
        title="renderer"
        className="w-full h-full border-0 bg-transparent"
      />
      {error ? <RendererErrorOverlay message={error} /> : null}
    </div>
  );
}

function RendererErrorOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-start justify-center p-6 bg-base/90 overflow-auto">
      <div className="max-w-lg w-full text-sm text-danger font-mono">
        <div className="font-semibold tracking-wide">Renderer error</div>
        <pre className="mt-2 whitespace-pre-wrap text-xs opacity-80">{message}</pre>
      </div>
    </div>
  );
}
