import { describe, test, expect } from "bun:test";
import { parseSlashInput, serializeCommand } from "../../src/slash/parse.js";

// ---------------------------------------------------------------------------
// parseSlashInput
// ---------------------------------------------------------------------------

describe("parseSlashInput", () => {
  // --- Valid slash commands ---

  test("parses simple command without args", () => {
    const result = parseSlashInput("/hello");
    expect(result).toEqual({ name: "hello", args: "" });
  });

  test("parses command with args", () => {
    const result = parseSlashInput("/character describe the warrior");
    expect(result).toEqual({ name: "character", args: "describe the warrior" });
  });

  test("parses hyphenated command name", () => {
    const result = parseSlashInput("/create-character some args");
    expect(result).toEqual({ name: "create-character", args: "some args" });
  });

  test("parses command with numeric name", () => {
    const result = parseSlashInput("/test123");
    expect(result).toEqual({ name: "test123", args: "" });
  });

  test("parses command starting with number", () => {
    const result = parseSlashInput("/1up");
    expect(result).toEqual({ name: "1up", args: "" });
  });

  test("trims leading whitespace before /", () => {
    const result = parseSlashInput("  /hello world");
    expect(result).toEqual({ name: "hello", args: "world" });
  });

  test("trims args whitespace", () => {
    const result = parseSlashInput("/cmd   spaced args  ");
    expect(result).toEqual({ name: "cmd", args: "spaced args" });
  });

  test("handles multiline args", () => {
    const result = parseSlashInput("/cmd line1\nline2\nline3");
    expect(result).toEqual({ name: "cmd", args: "line1\nline2\nline3" });
  });

  // --- Invalid inputs ---

  test("returns null for non-slash input", () => {
    expect(parseSlashInput("hello world")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseSlashInput("")).toBeNull();
  });

  test("returns null for just a slash", () => {
    expect(parseSlashInput("/")).toBeNull();
  });

  test("returns null for uppercase command name", () => {
    expect(parseSlashInput("/Hello")).toBeNull();
  });

  test("returns null for command with underscore", () => {
    expect(parseSlashInput("/my_command")).toBeNull();
  });

  test("returns null for command starting with hyphen", () => {
    expect(parseSlashInput("/-invalid")).toBeNull();
  });

  test("returns null for slash with space before name", () => {
    expect(parseSlashInput("/ hello")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// serializeCommand
// ---------------------------------------------------------------------------

describe("serializeCommand", () => {
  test("serializes command without args", () => {
    const result = serializeCommand("hello", "");
    expect(result).toBe("<command-name>/hello</command-name>");
  });

  test("serializes command with args", () => {
    const result = serializeCommand("character", "make a warrior");
    expect(result).toContain("<command-name>/character</command-name>");
    expect(result).toContain("<command-args>make a warrior</command-args>");
  });

  test("args are trimmed", () => {
    const result = serializeCommand("cmd", "  some args  ");
    expect(result).toContain("<command-args>some args</command-args>");
  });

  test("whitespace-only args treated as no args", () => {
    const result = serializeCommand("cmd", "   ");
    expect(result).toBe("<command-name>/cmd</command-name>");
    expect(result).not.toContain("command-args");
  });
});
