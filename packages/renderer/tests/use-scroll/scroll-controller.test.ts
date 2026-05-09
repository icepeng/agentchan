import { describe, expect, test } from "bun:test";
import {
  ScrollController,
  type ScrollControllerElement,
} from "../../src/use-scroll.ts";

interface RecordedScroll {
  top: number;
  behavior: ScrollBehavior;
}

class FakeElement implements ScrollControllerElement {
  scrollTop = 0;
  scrollHeight: number;
  clientHeight: number;
  scrolls: RecordedScroll[] = [];

  constructor(scrollHeight: number, clientHeight: number) {
    this.scrollHeight = scrollHeight;
    this.clientHeight = clientHeight;
  }

  scrollTo(options: ScrollToOptions): void {
    const top = options.top ?? this.scrollTop;
    const behavior = options.behavior ?? "auto";
    this.scrolls.push({ top, behavior });
    this.scrollTop = top;
  }

  /** Test helper: simulate a content height delta. */
  grow(delta: number): void {
    this.scrollHeight += delta;
  }
}

function makeController(
  scrollHeight = 300,
  clientHeight = 100,
  options: { threshold?: number; behavior?: ScrollBehavior } = {},
): { element: FakeElement; controller: ScrollController<FakeElement>; events: boolean[] } {
  const element = new FakeElement(scrollHeight, clientHeight);
  const events: boolean[] = [];
  const controller = new ScrollController(
    element,
    { threshold: options.threshold ?? 50, behavior: options.behavior ?? "smooth" },
    (atBottom) => events.push(atBottom),
  );
  return { element, controller, events };
}

describe("ScrollController", () => {
  test("초기 mount → bottom으로 점프하고 isAtBottom=true", () => {
    const { element, controller, events } = makeController(500, 100);
    expect(element.scrolls).toEqual([{ top: 500, behavior: "auto" }]);
    expect(element.scrollTop).toBe(500);
    expect(controller.isAtBottom).toBe(true);
    expect(events).toEqual([true]);
  });

  test("content 추가 + at-bottom = 자동으로 새 bottom으로 scroll", () => {
    const { element, controller } = makeController(300, 100);
    element.scrolls.length = 0;

    element.grow(200);
    controller.handleContentChange();

    expect(element.scrolls).toEqual([{ top: 500, behavior: "smooth" }]);
    expect(element.scrollTop).toBe(500);
    expect(controller.isAtBottom).toBe(true);
  });

  test("content 추가 + scrolled-up = scroll 멈춤", () => {
    const { element, controller, events } = makeController(300, 100);
    element.scrolls.length = 0;

    // user scrolls up
    element.scrollTop = 0;
    controller.handleScroll();
    expect(controller.isAtBottom).toBe(false);
    expect(events.at(-1)).toBe(false);

    element.grow(200);
    controller.handleContentChange();

    // No additional scrollTo emitted
    expect(element.scrolls).toEqual([]);
    expect(element.scrollTop).toBe(0);
    expect(controller.isAtBottom).toBe(false);
  });

  test("scrolled-up → bottom 복귀 = 다음 content 증가에서 다시 자동 scroll", () => {
    const { element, controller } = makeController(300, 100);
    element.scrolls.length = 0;

    element.scrollTop = 0;
    controller.handleScroll();
    expect(controller.isAtBottom).toBe(false);

    // user scrolls back near bottom (within threshold 50)
    element.scrollTop = element.scrollHeight - element.clientHeight - 10;
    controller.handleScroll();
    expect(controller.isAtBottom).toBe(true);

    element.scrolls.length = 0;
    element.grow(150);
    controller.handleContentChange();

    expect(element.scrolls).toEqual([{ top: 450, behavior: "smooth" }]);
    expect(element.scrollTop).toBe(450);
    expect(controller.isAtBottom).toBe(true);
  });

  test("scrollToBottom() imperative — scrolled-up에서 bottom으로 점프하고 isAtBottom 복원", () => {
    const { element, controller, events } = makeController(300, 100);
    element.scrolls.length = 0;

    element.scrollTop = 0;
    controller.handleScroll();
    expect(controller.isAtBottom).toBe(false);

    controller.scrollToBottom();

    expect(element.scrolls).toEqual([{ top: 300, behavior: "smooth" }]);
    expect(element.scrollTop).toBe(300);
    expect(controller.isAtBottom).toBe(true);
    expect(events.at(-1)).toBe(true);
  });

  test("scrollToBottom(behavior) override가 적용된다", () => {
    const { element, controller } = makeController(300, 100, { behavior: "smooth" });
    element.scrolls.length = 0;

    element.scrollTop = 0;
    controller.handleScroll();

    controller.scrollToBottom("instant");

    expect(element.scrolls).toEqual([{ top: 300, behavior: "instant" }]);
  });

  test("threshold 경계에서 isAtBottom 판정", () => {
    const { element, controller } = makeController(300, 100, { threshold: 20 });

    element.scrollTop = 100; // distance = 300 - 100 - 100 = 100, > 20
    controller.handleScroll();
    expect(controller.isAtBottom).toBe(false);

    element.scrollTop = 180; // distance = 20, <= threshold
    controller.handleScroll();
    expect(controller.isAtBottom).toBe(true);
  });
});
