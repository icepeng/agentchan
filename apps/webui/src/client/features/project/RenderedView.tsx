import { useEffect, useLayoutEffect, useRef } from "react";
import { Idiomorph } from "idiomorph";
import { useOutput } from "./useOutput.js";
import { useProjectState } from "@/client/entities/project/index.js";
import { useActiveStream } from "@/client/entities/session/index.js";
import { useRendererActionDispatch } from "@/client/entities/renderer-action/index.js";
import { ScrollArea } from "@/client/shared/ui/index.js";

export function RenderedView() {
  const project = useProjectState();
  const stream = useActiveStream();
  const { refresh } = useOutput();
  const actionDispatch = useRendererActionDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);

  // 스트리밍이 방금 끝난 순간에만 renderer 재실행 — 초기 로드와 프로젝트 전환은
  // 각각 App.tsx, selectProject가 담당한다.
  const prevStreamingRef = useRef(stream.isStreaming);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = stream.isStreaming;
    if (wasStreaming && !stream.isStreaming && project.activeProjectSlug) {
      void refresh();
    }
  }, [stream.isStreaming, project.activeProjectSlug, refresh]);

  // useLayoutEffect로 paint 전에 morph를 끝내야 View Transition의 "after"
  // 스냅샷이 새 HTML을 포함하게 된다. useEffect면 flushSync 이후 async로 돌아
  // VT 캡처보다 뒤에 실행될 수 있다.
  useLayoutEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    if (!project.renderedHtml) return;
    Idiomorph.morph(el, project.renderedHtml, {
      morphStyle: "innerHTML",
      ignoreActiveValue: true,
    });
  }, [project.renderedHtml]);

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

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <ScrollArea ref={containerRef} className="flex-1">
        <div ref={frontRef} className="h-full min-h-full" />
      </ScrollArea>
    </div>
  );
}
