import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createEditTool } from "../../src/tools/edit.js";

let tempDir: string;
let tool: ReturnType<typeof createEditTool>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "edit-test-"));
  tool = createEditTool(tempDir);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeTemp(name: string, content: string): Promise<string> {
  const filePath = join(tempDir, name);
  await writeFile(filePath, content, "utf-8");
  return name; // return relative path for tool input
}

async function readTemp(name: string): Promise<string> {
  return readFile(join(tempDir, name), "utf-8");
}

async function execute(file_path: string, old_string: string, new_string: string) {
  return tool.execute("test-call", { file_path, old_string, new_string });
}

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

describe("exact match", () => {
  test("replaces unique substring", async () => {
    const f = await writeTemp("a.txt", "hello world");
    await execute(f, "world", "earth");
    expect(await readTemp(f)).toBe("hello earth");
  });

  test("replaces multi-line substring", async () => {
    const content = "line1\nline2\nline3\n";
    const f = await writeTemp("a.txt", content);
    await execute(f, "line2\nline3", "replaced");
    expect(await readTemp(f)).toBe("line1\nreplaced\n");
  });

  test("handles empty new_string (deletion)", async () => {
    const f = await writeTemp("a.txt", "aXb");
    await execute(f, "X", "");
    expect(await readTemp(f)).toBe("ab");
  });

  test("preserves surrounding content", async () => {
    const f = await writeTemp("a.txt", "  indented  \nother line");
    await execute(f, "  indented  ", "no-indent");
    expect(await readTemp(f)).toBe("no-indent\nother line");
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("error: not found", () => {
  test("throws when old_string is absent", async () => {
    const f = await writeTemp("a.txt", "hello world");
    await expect(execute(f, "missing", "x")).rejects.toThrow("old_string not found");
  });

  test("error includes file snippet", async () => {
    const f = await writeTemp("a.txt", "content here");
    await expect(execute(f, "nope", "x")).rejects.toThrow("content here");
  });

  test("file snippet is truncated for long files", async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
    const f = await writeTemp("a.txt", lines.join("\n"));
    try {
      await execute(f, "nonexistent", "x");
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("more lines");
      // first 30 lines should be present
      expect(e.message).toContain("line 1");
      expect(e.message).toContain("line 30");
      // line 31+ should be truncated
      expect(e.message).not.toContain("line 31");
    }
  });
});

describe("error: multiple matches", () => {
  test("throws when old_string matches more than once", async () => {
    const f = await writeTemp("a.txt", "aaa bbb aaa");
    await expect(execute(f, "aaa", "x")).rejects.toThrow("matches 2 locations");
  });

  test("reports correct count for many matches", async () => {
    const f = await writeTemp("a.txt", "x\nx\nx\nx\nx");
    await expect(execute(f, "x", "y")).rejects.toThrow("matches 5 locations");
  });
});

// ---------------------------------------------------------------------------
// Fuzzy matching — unicode normalization
// ---------------------------------------------------------------------------

describe("fuzzy match: smart quotes", () => {
  test("matches smart double quotes as ASCII", async () => {
    // File has smart quotes, search uses ASCII quotes
    const f = await writeTemp("a.txt", 'She said \u201Chello\u201D');
    await execute(f, 'She said "hello"', "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });

  test("matches ASCII quotes against smart quotes in search", async () => {
    // File has ASCII quotes, search uses smart quotes
    const f = await writeTemp("a.txt", 'He said "hi"');
    await execute(f, "He said \u201Chi\u201D", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });

  test("matches smart single quotes", async () => {
    const f = await writeTemp("a.txt", "it\u2019s fine");
    await execute(f, "it's fine", "ok");
    expect(await readTemp(f)).toBe("ok");
  });
});

describe("fuzzy match: unicode dashes", () => {
  test("matches em dash as ASCII hyphen", async () => {
    const f = await writeTemp("a.txt", "a\u2014b");
    await execute(f, "a-b", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });

  test("matches en dash as ASCII hyphen", async () => {
    const f = await writeTemp("a.txt", "1\u20132");
    await execute(f, "1-2", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });

  test("matches minus sign as ASCII hyphen", async () => {
    const f = await writeTemp("a.txt", "x\u2212y");
    await execute(f, "x-y", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });
});

describe("fuzzy match: special spaces", () => {
  test("matches non-breaking space as regular space", async () => {
    const f = await writeTemp("a.txt", "hello\u00A0world");
    await execute(f, "hello world", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });

  test("matches ideographic space as regular space", async () => {
    const f = await writeTemp("a.txt", "hello\u3000world");
    await execute(f, "hello world", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });
});

describe("fuzzy match: trailing whitespace", () => {
  test("matches ignoring trailing spaces on lines", async () => {
    // File has trailing spaces, search does not
    const f = await writeTemp("a.txt", "hello   \nworld");
    await execute(f, "hello\nworld", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });

  test("matches when search has trailing spaces but file does not", async () => {
    const f = await writeTemp("a.txt", "hello\nworld");
    await execute(f, "hello   \nworld", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });
});

// ---------------------------------------------------------------------------
// Fuzzy match: replacement correctness
// ---------------------------------------------------------------------------

describe("fuzzy match replaces original text, not normalized", () => {
  test("smart quotes in file are replaced, not ASCII quotes", async () => {
    const f = await writeTemp("a.txt", 'before \u201Cquoted\u201D after');
    await execute(f, '"quoted"', "REPLACED");
    // The replacement targets the original smart-quoted portion
    expect(await readTemp(f)).toBe("before REPLACED after");
  });

  test("original dashes are replaced correctly", async () => {
    const f = await writeTemp("a.txt", "A\u2014B\u2014C");
    await execute(f, "A-B-C", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });
});

describe("fuzzy match with length-changing normalization", () => {
  test("handles NFKC expansion (ligature)", async () => {
    // ﬁ (U+FB01) NFKC-normalizes to "fi" (2 chars)
    const f = await writeTemp("a.txt", "pre\uFB01x");
    await execute(f, "prefix", "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });

  test("handles mixed normalization changes", async () => {
    // Smart quote + non-breaking space + normal text
    const f = await writeTemp("a.txt", "\u201Chello\u201D\u00A0world");
    await execute(f, '"hello" world', "replaced");
    expect(await readTemp(f)).toBe("replaced");
  });
});

// ---------------------------------------------------------------------------
// Fuzzy match uniqueness
// ---------------------------------------------------------------------------

describe("fuzzy match: uniqueness enforcement", () => {
  test("rejects fuzzy match with multiple occurrences", async () => {
    const f = await writeTemp("a.txt", "\u201Cx\u201D and \u201Cx\u201D");
    await expect(execute(f, '"x"', "y")).rejects.toThrow("matches 2 locations");
  });
});

// ---------------------------------------------------------------------------
// Exact match takes priority
// ---------------------------------------------------------------------------

describe("exact match priority over fuzzy", () => {
  test("uses exact match when both would work", async () => {
    // File contains both ASCII and smart quotes
    const f = await writeTemp("a.txt", '"hello" and \u201Chello\u201D');
    // Searching for ASCII "hello" — exact match hits the first one
    await execute(f, '"hello"', "REPLACED");
    expect(await readTemp(f)).toBe('REPLACED and \u201Chello\u201D');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  test("replaces at start of file", async () => {
    const f = await writeTemp("a.txt", "start middle end");
    await execute(f, "start", "BEGIN");
    expect(await readTemp(f)).toBe("BEGIN middle end");
  });

  test("replaces at end of file", async () => {
    const f = await writeTemp("a.txt", "start middle end");
    await execute(f, "end", "END");
    expect(await readTemp(f)).toBe("start middle END");
  });

  test("handles file with only newlines", async () => {
    const f = await writeTemp("a.txt", "\n\n\n");
    await execute(f, "\n\n", "X");
    expect(await readTemp(f)).toBe("X\n");
  });

  test("throws for nonexistent file", async () => {
    await expect(execute("nonexistent.txt", "a", "b")).rejects.toThrow();
  });

  test("handles unicode content surrounding the match", async () => {
    const f = await writeTemp("a.txt", "한국어 텍스트를 교체합니다");
    await execute(f, "텍스트를", "내용을");
    expect(await readTemp(f)).toBe("한국어 내용을 교체합니다");
  });

  test("handles Windows CRLF line endings", async () => {
    const f = await writeTemp("a.txt", "line1\r\nline2\r\nline3");
    await execute(f, "line2", "replaced");
    expect(await readTemp(f)).toBe("line1\r\nreplaced\r\nline3");
  });
});
