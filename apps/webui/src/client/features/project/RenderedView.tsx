import { useProjectSelectionState } from "@/client/entities/project/index.js";

/**
 * Renderer host — loads the project's sandboxed renderer as an iframe.
 * Everything else about the rendering lifecycle (morph, state updates,
 * actions) is now the iframe's responsibility; it talks to the server
 * directly over `/api/projects/{slug}/state/stream` and
 * `/api/projects/{slug}/actions/*`.
 *
 * `key={slug}` forces a full iframe teardown on project switch so there's
 * never a stale SSE connection from the previous project.
 */
export function RenderedView() {
  const { activeProjectSlug: slug } = useProjectSelectionState();

  if (!slug) {
    return <div className="flex-1" />;
  }

  return (
    <iframe
      key={slug}
      title="Project renderer"
      src={`/api/projects/${encodeURIComponent(slug)}/renderer/`}
      sandbox="allow-scripts"
      className="flex-1 min-h-0 w-full border-0 bg-[var(--color-void)]"
    />
  );
}
