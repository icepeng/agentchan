import { describe, test, expect } from "bun:test";
import { slugify } from "../src/slug.js";

describe("slugify", () => {
  // --- Basic transformations ---

  test("lowercases ASCII characters", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("replaces spaces with hyphens", () => {
    expect(slugify("my project name")).toBe("my-project-name");
  });

  test("collapses multiple spaces to single hyphen", () => {
    expect(slugify("too   many    spaces")).toBe("too-many-spaces");
  });

  test("collapses multiple hyphens", () => {
    expect(slugify("a--b---c")).toBe("a-b-c");
  });

  test("trims leading and trailing hyphens", () => {
    expect(slugify("-hello-")).toBe("hello");
    expect(slugify("  hello  ")).toBe("hello");
  });

  // --- Reserved characters ---

  test("strips filesystem-reserved characters", () => {
    expect(slugify('file/path\\to:name*with?"<>|chars')).toBe(
      "filepathtonamewithchars",
    );
  });

  test("strips reserved chars but preserves other content", () => {
    expect(slugify("my:project")).toBe("myproject");
    expect(slugify("test<file>")).toBe("testfile");
  });

  // --- Korean preservation ---

  test("preserves Korean characters", () => {
    expect(slugify("나의 프로젝트")).toBe("나의-프로젝트");
  });

  test("mixed Korean and ASCII", () => {
    expect(slugify("Hello 세계")).toBe("hello-세계");
  });

  // --- Edge cases ---

  test("returns 'project' for empty string", () => {
    expect(slugify("")).toBe("project");
  });

  test("returns 'project' when all chars are reserved", () => {
    expect(slugify('*?"<>|')).toBe("project");
  });

  test("handles tabs and mixed whitespace", () => {
    expect(slugify("hello\tworld")).toBe("hello-world");
  });

  test("already-valid slug passes through", () => {
    expect(slugify("my-project")).toBe("my-project");
  });

  test("numbers are preserved", () => {
    expect(slugify("Project 42")).toBe("project-42");
  });

  test("leading spaces produce no leading hyphen", () => {
    expect(slugify("  hello")).toBe("hello");
  });
});
