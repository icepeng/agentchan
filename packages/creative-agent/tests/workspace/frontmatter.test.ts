import { describe, test, expect } from "bun:test";
import { parseFrontmatter } from "../../src/workspace/frontmatter.js";

describe("parseFrontmatter", () => {
  // --- Valid frontmatter ---

  test("parses standard frontmatter with body", () => {
    const input = `---
name: elara
description: A brave warrior
---
# Character Sheet

Some body content.`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({
      name: "elara",
      description: "A brave warrior",
    });
    expect(result.body).toBe("# Character Sheet\n\nSome body content.");
  });

  test("parses frontmatter-only (no body after closing ---)", () => {
    const input = `---
name: test
value: 42
---`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({ name: "test", value: 42 });
    expect(result.body).toBe("");
  });

  test("parses nested YAML structures", () => {
    const input = `---
name: world
regions:
  - north
  - south
metadata:
  author: user
---
Body here.`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter!.regions).toEqual(["north", "south"]);
    expect((result.frontmatter!.metadata as any).author).toBe("user");
    expect(result.body).toBe("Body here.");
  });

  test("handles multiline body correctly", () => {
    const input = `---
title: test
---
line 1
line 2
line 3`;
    const result = parseFrontmatter(input);
    expect(result.body).toBe("line 1\nline 2\nline 3");
  });

  // --- No frontmatter ---

  test("returns null frontmatter when no --- delimiters", () => {
    const input = "# Just a markdown file\n\nWith content.";
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(input);
  });

  test("returns null frontmatter for empty string", () => {
    const result = parseFrontmatter("");
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe("");
  });

  test("returns null when only opening --- exists", () => {
    const input = "---\nname: test\nNo closing delimiter";
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toBeNull();
  });

  // --- CRLF handling ---

  test("normalizes CRLF to LF", () => {
    const input = "---\r\nname: test\r\n---\r\nBody content.";
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({ name: "test" });
    expect(result.body).toBe("Body content.");
  });

  // --- Malformed YAML ---

  test("returns null frontmatter for invalid YAML", () => {
    const input = "---\n: : : invalid\n---\nBody.";
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toBeNull();
    // falls back to body = original (CRLF normalized)
  });

  test("returns null frontmatter when YAML parses to non-object (scalar)", () => {
    const input = "---\njust a string\n---\nBody.";
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toBeNull();
  });

  test("returns null frontmatter when YAML parses to array", () => {
    const input = "---\n- item1\n- item2\n---\nBody.";
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toBeNull();
  });

  // --- Edge cases ---

  test("handles empty frontmatter block", () => {
    // Empty YAML between delimiters — parseYaml returns null for empty string
    const input = "---\n\n---\nBody after empty frontmatter.";
    const result = parseFrontmatter(input);
    // Empty YAML → null parsed → null frontmatter
    expect(result.frontmatter).toBeNull();
  });

  test("handles frontmatter with trailing spaces on delimiters", () => {
    const input = "---  \nname: test\n---  \nBody.";
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({ name: "test" });
    expect(result.body).toBe("Body.");
  });

  test("boolean and numeric values are parsed correctly", () => {
    const input = "---\nenabled: true\ncount: 5\nratio: 0.5\n---\nBody.";
    const result = parseFrontmatter(input);
    expect(result.frontmatter!.enabled).toBe(true);
    expect(result.frontmatter!.count).toBe(5);
    expect(result.frontmatter!.ratio).toBe(0.5);
  });

  test("Korean content in frontmatter", () => {
    const input = "---\ndisplay-name: 엘라라 브라이트웰\nrole: 전사\n---\n캐릭터 설명";
    const result = parseFrontmatter(input);
    expect(result.frontmatter!["display-name"]).toBe("엘라라 브라이트웰");
    expect(result.frontmatter!.role).toBe("전사");
    expect(result.body).toBe("캐릭터 설명");
  });
});
