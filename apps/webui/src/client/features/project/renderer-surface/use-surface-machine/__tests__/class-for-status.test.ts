import { describe, expect, test } from "bun:test";
import { classForStatus, type SurfaceStatus } from "../transitions.js";

describe("classForStatus", () => {
  const STATUS_TABLE: Record<SurfaceStatus, { opacity: string; transition: string }> = {
    "stable": { opacity: "opacity-100", transition: "transition-none" },
    "fading-out": { opacity: "opacity-0", transition: "transition-opacity" },
    "waiting-for-import": { opacity: "opacity-0", transition: "transition-none" },
    "applying-theme": { opacity: "opacity-0", transition: "transition-none" },
    "mounting": { opacity: "opacity-0", transition: "transition-none" },
    "fading-in": { opacity: "opacity-100", transition: "transition-opacity" },
    "showing-error": { opacity: "opacity-100", transition: "transition-opacity" },
  };

  for (const [status, expected] of Object.entries(STATUS_TABLE)) {
    test(`${status} -> includes ${expected.opacity} and ${expected.transition}`, () => {
      const cls = classForStatus(status as SurfaceStatus);
      expect(cls).toContain(expected.opacity);
      expect(cls).toContain(expected.transition);
      expect(cls).toContain("relative z-10 h-full min-h-full");
    });
  }

  test("fading-out uses 300ms duration", () => {
    expect(classForStatus("fading-out")).toContain("duration-300");
  });

  test("fading-in/showing-error use 200ms duration", () => {
    expect(classForStatus("fading-in")).toContain("duration-200");
    expect(classForStatus("showing-error")).toContain("duration-200");
  });

  test("non-fade statuses do not declare a transition duration", () => {
    expect(classForStatus("stable")).not.toContain("duration-");
    expect(classForStatus("mounting")).not.toContain("duration-");
  });
});
