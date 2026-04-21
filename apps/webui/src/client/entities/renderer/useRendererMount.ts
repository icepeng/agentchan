import { useEffect, useRef, useState, type RefObject } from "react";
import { fetchWorkspaceFiles } from "@/client/entities/project/index.js";
import { useAgentState } from "@/client/entities/agent-state/index.js";
import { useTheme } from "@/client/features/settings/index.js";
import { useRendererActionDispatch } from "./RendererActionContext.js";
import { useRendererThemeDispatch } from "./RendererThemeContext.js";
import { applyThemeVars, sameTheme, validateTheme } from "./projectTheme.js";
import type {
  AgentState,
  MountContext,
  ProjectFile,
  RendererHandle,
  RendererHostApi,
  RendererTheme,
} from "./renderer.types.js";

export interface RendererMountSlot {
  slug: string;
  token: string;
}

type BootWindow = Window & {
  __agentchanBoot?: (ctx: MountContext) => RendererHandle;
};

/**
 * 하나의 iframe slot 수명 관리.
 *
 * shell이 `renderer:ready`를 post하면 host는 미리 시작해 둔 `fetchWorkspaceFiles`
 * 프라미스와 랑데뷰한 뒤 `contentWindow.__agentchanBoot(ctx)`를 직접 호출한다.
 * same-origin이라 structured clone 없이 reference가 그대로 건너간다.
 */
export function useRendererMount(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  slot: RendererMountSlot,
): { error: string | null } {
  const themeDispatch = useRendererThemeDispatch();
  const actionDispatch = useRendererActionDispatch();
  // slot.slug는 activeProjectSlug와 일치하지 않을 수 있다 — fading slot이
  // 잠시 병존하거나, 장래 백그라운드 렌더가 생길 때를 위해 slot 기준으로 구독.
  const agentState = useAgentState(slot.slug);
  const stateRef = useRef(agentState);
  useEffect(() => {
    stateRef.current = agentState;
  });

  const { resolved: userScheme } = useTheme();
  const userSchemeRef = useRef(userScheme);
  useEffect(() => {
    userSchemeRef.current = userScheme;
  });

  const stateSubscribersRef = useRef<Set<(s: AgentState) => void>>(new Set());
  const fileSubscribersRef = useRef<Set<(f: ProjectFile[]) => void>>(new Set());
  const filesRef = useRef<ProjectFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentIframe = iframeRef.current;
    if (!currentIframe) return;
    const iframe: HTMLIFrameElement = currentIframe;
    const stateSubs = stateSubscribersRef.current;
    const fileSubs = fileSubscribersRef.current;
    let cancelled = false;
    let handle: RendererHandle | null = null;
    let lastTheme: RendererTheme | null = null;

    // shell의 module script가 `./index.js`를 import하는 왕복과 병렬로 fetch 시작.
    const filesPromise = fetchWorkspaceFiles(slot.slug);

    const host: RendererHostApi = {
      version: 1,
      sendAction(action) {
        if (cancelled) return;
        actionDispatch({ type: "SET_ACTION", action });
      },
      setTheme(rawTheme) {
        if (cancelled) return;
        const validated = rawTheme === null ? null : validateTheme(rawTheme);
        if (sameTheme(lastTheme, validated)) return;
        lastTheme = validated;
        themeDispatch({ type: "SET_THEME", theme: validated });
        const doc = iframe.contentDocument;
        if (doc?.documentElement) {
          applyThemeVars(doc.documentElement, validated, userSchemeRef.current);
        }
      },
      subscribeState(cb) {
        stateSubs.add(cb);
        try {
          cb(stateRef.current);
        } catch (e) {
          console.error("[renderer] initial subscribeState push threw", e);
        }
        return () => {
          stateSubs.delete(cb);
        };
      },
      subscribeFiles(cb) {
        fileSubs.add(cb);
        try {
          cb(filesRef.current);
        } catch (e) {
          console.error("[renderer] initial subscribeFiles push threw", e);
        }
        return () => {
          fileSubs.delete(cb);
        };
      },
    };

    async function boot() {
      if (cancelled) return;
      const cw = iframe.contentWindow as BootWindow | null;
      if (!cw || typeof cw.__agentchanBoot !== "function") return;
      try {
        const { files } = await filesPromise;
        if (cancelled) return;
        filesRef.current = files;
        const baseUrl = `/api/projects/${encodeURIComponent(slot.slug)}`;
        handle = cw.__agentchanBoot({
          files,
          baseUrl,
          assetsUrl: `${baseUrl}/files`,
          state: stateRef.current,
          host,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    function onMessage(ev: MessageEvent) {
      if (ev.origin !== location.origin) return;
      const data = ev.data as unknown;
      if (!data || typeof data !== "object") return;
      const msg = data as { type?: string; token?: string; message?: string };
      if (msg.token !== slot.token) return;
      if (msg.type === "renderer:ready") {
        void boot();
      } else if (msg.type === "renderer:error") {
        setError(String(msg.message ?? "renderer error"));
      }
    }

    window.addEventListener("message", onMessage);

    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      try {
        handle?.destroy();
      } catch (e) {
        console.error("[renderer] destroy threw", e);
      }
      handle = null;
      stateSubs.clear();
      fileSubs.clear();
      filesRef.current = [];
    };
  }, [slot.slug, slot.token, actionDispatch, themeDispatch, iframeRef]);

  useEffect(() => {
    let raf = 0;
    let last = stateRef.current;
    const tick = () => {
      if (stateRef.current !== last) {
        last = stateRef.current;
        const snapshot = Array.from(stateSubscribersRef.current);
        for (const cb of snapshot) {
          try {
            cb(last);
          } catch (e) {
            console.error("[renderer] subscribeState cb threw", e);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Streaming true→false 전이에만 files를 재fetch. 중에는 스냅샷 유지.
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const prev = prevStreamingRef.current;
    const now = agentState.isStreaming;
    prevStreamingRef.current = now;
    if (!prev || now) return;

    let cancelled = false;
    void (async () => {
      try {
        const { files } = await fetchWorkspaceFiles(slot.slug);
        if (cancelled) return;
        filesRef.current = files;
        const snapshot = Array.from(fileSubscribersRef.current);
        for (const cb of snapshot) {
          try {
            cb(files);
          } catch (e) {
            console.error("[renderer] subscribeFiles cb threw", e);
          }
        }
      } catch (e) {
        console.error("[renderer] post-stream file refresh threw", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentState.isStreaming, slot.slug]);

  return { error };
}
