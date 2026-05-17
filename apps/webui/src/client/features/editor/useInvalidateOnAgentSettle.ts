import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import {
  selectActiveProjectSlug,
  useViewState,
} from "@/client/entities/view/index.js";
import {
  readProjectFile,
  useEditorDispatch,
  useEditorState,
} from "@/client/entities/editor/index.js";
import { qk, useLatestRef } from "@/client/platform/index.js";
import { useStreamSettleCount } from "@/client/session/index.js";

interface LastSeenSettle {
  slug: string | null;
  count: number;
}

export function useInvalidateOnAgentSettle(): void {
  const viewState = useViewState();
  const editor = useEditorState();
  const editorDispatch = useEditorDispatch();
  const { mutate } = useSWRConfig();

  const slug = selectActiveProjectSlug(viewState);
  const view = viewState.view;
  const isEdit = view.kind === "project" && view.mode === "edit";
  const settleCount = useStreamSettleCount(isEdit ? slug : null);

  const selectedPathRef = useLatestRef(editor.selectedPath);
  const dirtyRef = useLatestRef(editor.dirty);
  const slugRef = useLatestRef(slug);
  const lastSeenRef = useRef<LastSeenSettle>({ slug: null, count: 0 });

  useEffect(() => {
    if (!isEdit || !slug) {
      lastSeenRef.current = { slug: null, count: 0 };
      return;
    }

    const lastSeen = lastSeenRef.current;
    if (lastSeen.slug !== slug) {
      lastSeenRef.current = { slug, count: settleCount };
      return;
    }

    if (settleCount <= lastSeen.count) return;
    lastSeenRef.current = { slug, count: settleCount };

    void mutate(qk.projectTree(slug));

    const path = selectedPathRef.current;
    if (!path || dirtyRef.current) return;

    void (async () => {
      const { content } = await readProjectFile(slug, path);
      if (slugRef.current !== slug) return;
      if (selectedPathRef.current !== path || dirtyRef.current) return;
      editorDispatch({ type: "EXTERNAL_REFRESH", path, content });
    })();
  }, [
    dirtyRef,
    editorDispatch,
    isEdit,
    mutate,
    selectedPathRef,
    settleCount,
    slug,
    slugRef,
  ]);
}
