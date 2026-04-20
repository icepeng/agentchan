import type { RendererActions } from "./types.js";

export function bindActions(
  root: HTMLElement,
  actions: RendererActions,
): () => void {
  const handleClick = (e: MouseEvent) => {
    const origin = e.target as HTMLElement | null;
    if (!origin) return;
    const target = origin.closest<HTMLElement>("[data-action]");
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;
    const text = target.dataset.text ?? target.textContent?.trim() ?? "";
    if (!text) return;
    e.preventDefault();
    if (action === "send") {
      actions.send(text);
    } else if (action === "fill") {
      actions.fill(text);
    }
  };
  root.addEventListener("click", handleClick);
  return () => root.removeEventListener("click", handleClick);
}
