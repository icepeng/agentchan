/// <reference lib="dom" />

import {
  useCallback,
  useRef,
  useState,
  type RefCallback,
} from "react";

export interface UseAutoScrollOptions {
  /** px distance from bottom that still counts as "at bottom". Default 50. */
  threshold?: number;
  /** Scroll behavior used by automatic scrolls. Default "smooth". */
  behavior?: ScrollBehavior;
}

export interface UseAutoScrollResult<T extends HTMLElement = HTMLDivElement> {
  scrollRef: RefCallback<T>;
  isAtBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

/**
 * Element subset the controller actually touches. Lets tests pass a plain
 * object without standing up a DOM.
 */
export interface ScrollControllerElement {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  scrollTo(options: ScrollToOptions): void;
}

interface ResolvedOptions {
  threshold: number;
  behavior: ScrollBehavior;
}

/**
 * Pure scroll controller — no DOM observers, no React. The hook wires
 * scroll/mutation/resize events into `handleScroll` / `handleContentChange`.
 * Tests drive these methods directly.
 */
export class ScrollController<T extends ScrollControllerElement> {
  private atBottom = true;
  private lastScrollHeight: number;

  constructor(
    private readonly element: T,
    private readonly options: ResolvedOptions,
    private readonly onAtBottomChange: (atBottom: boolean) => void,
  ) {
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
    this.lastScrollHeight = element.scrollHeight;
    this.onAtBottomChange(true);
  }

  get isAtBottom(): boolean {
    return this.atBottom;
  }

  /** Re-evaluate at-bottom from the element's current scroll position. */
  handleScroll(): void {
    const distance =
      this.element.scrollHeight -
      this.element.clientHeight -
      this.element.scrollTop;
    const next = distance <= this.options.threshold;
    if (next !== this.atBottom) {
      this.atBottom = next;
      this.onAtBottomChange(next);
    }
  }

  /**
   * Call when scrollHeight may have changed (children added, text grew,
   * element resized). Re-pins to bottom only if previously at bottom.
   */
  handleContentChange(): void {
    if (this.element.scrollHeight === this.lastScrollHeight) return;
    this.lastScrollHeight = this.element.scrollHeight;
    if (this.atBottom) {
      this.element.scrollTo({
        top: this.element.scrollHeight,
        behavior: this.options.behavior,
      });
    }
  }

  scrollToBottom(behavior?: ScrollBehavior): void {
    this.element.scrollTo({
      top: this.element.scrollHeight,
      behavior: behavior ?? this.options.behavior,
    });
    this.lastScrollHeight = this.element.scrollHeight;
    if (!this.atBottom) {
      this.atBottom = true;
      this.onAtBottomChange(true);
    }
  }
}

/**
 * Stick-to-bottom scroll hook. The element returned by `scrollRef` becomes
 * the scroll container. On mount the hook jumps to the bottom; subsequent
 * content growth re-pins to the bottom only while the user is still near
 * the bottom (within `threshold`). Reading `isAtBottom` lets callers render
 * a "scroll to bottom" affordance.
 */
export function useAutoScroll<T extends HTMLElement = HTMLDivElement>(
  options: UseAutoScrollOptions = {},
): UseAutoScrollResult<T> {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const controllerRef = useRef<ScrollController<T> | null>(null);
  const threshold = options.threshold ?? 50;
  const behavior = options.behavior ?? "smooth";

  const scrollRef = useCallback<RefCallback<T>>((node) => {
    if (!node) {
      controllerRef.current = null;
      return;
    }

    const controller = new ScrollController(
      node,
      { threshold, behavior },
      setIsAtBottom,
    );
    controllerRef.current = controller;

    const onScroll = (): void => controller.handleScroll();
    node.addEventListener("scroll", onScroll, { passive: true });

    const mutationObserver = new MutationObserver(() => {
      controller.handleContentChange();
    });
    mutationObserver.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const resizeObserver = new ResizeObserver(() => {
      controller.handleContentChange();
    });
    resizeObserver.observe(node);

    return () => {
      node.removeEventListener("scroll", onScroll);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [threshold, behavior]);

  const scrollToBottom = useCallback((behavior?: ScrollBehavior) => {
    controllerRef.current?.scrollToBottom(behavior);
  }, []);

  return { scrollRef, isAtBottom, scrollToBottom };
}
