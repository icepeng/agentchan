import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { grep } from "../src/index.js";

let testDir: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "grep-test-"));

  // Create test files
  await writeFile(
    join(testDir, "hello.ts"),
    'const greeting = "Hello World";\nconsole.log(greeting);\nfunction sayHello() {\n  return "hello";\n}\n',
  );
  await writeFile(
    join(testDir, "data.json"),
    '{"name": "test", "value": 42}\n',
  );
  await writeFile(
    join(testDir, "readme.md"),
    "# Title\n\nSome content here.\nHello from markdown.\n",
  );

  // Create subdirectory with files
  await mkdir(join(testDir, "src"), { recursive: true });
  await writeFile(
    join(testDir, "src", "main.ts"),
    'import { hello } from "./lib";\nhello();\n',
  );
  await writeFile(
    join(testDir, "src", "lib.ts"),
    'export function hello() {\n  console.log("Hello!");\n}\n',
  );

  // Create a binary file (contains null bytes)
  const binaryBuf = Buffer.alloc(1024);
  binaryBuf.write("some text");
  binaryBuf[100] = 0x00; // null byte
  await writeFile(join(testDir, "binary.dat"), binaryBuf);

  // Create a large file (over default 1MB limit)
  const largeContent = "Hello World\n".repeat(100_000);
  await writeFile(join(testDir, "large.ts"), largeContent);

  // Create file with CRLF line endings
  await writeFile(
    join(testDir, "crlf.txt"),
    "line one\r\nHello CRLF\r\nline three\r\n",
  );

  // Create file with many matches for truncation testing
  const manyLines = Array.from(
    { length: 200 },
    (_, i) => `match line ${i + 1}`,
  ).join("\n");
  await writeFile(join(testDir, "many.txt"), manyLines);
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("grep", () => {
  test("basic pattern matching", async () => {
    const result = await grep({
      pattern: "Hello",
      path: testDir,
    });

    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matches.length).toBeGreaterThan(0);
    // All non-context matches should contain "Hello"
    for (const m of result.matches.filter((m) => !m.isContext)) {
      expect(m.text).toContain("Hello");
    }
  });

  test("case-insensitive search", async () => {
    const caseSensitive = await grep({
      pattern: "hello",
      path: testDir,
    });
    const caseInsensitive = await grep({
      pattern: "hello",
      path: testDir,
      ignoreCase: true,
    });

    // Case-insensitive should find more matches (or at least as many)
    expect(caseInsensitive.matchCount).toBeGreaterThanOrEqual(
      caseSensitive.matchCount,
    );
  });

  test("literal string search (regex special chars)", async () => {
    // Create a file with regex special characters
    await writeFile(
      join(testDir, "special.txt"),
      'price is $10.00\nregex: [a-z]+\nparent (dir)\n',
    );

    const result = await grep({
      pattern: "$10.00",
      path: testDir,
      literal: true,
      glob: "special.txt",
    });

    expect(result.matchCount).toBe(1);
    expect(result.matches[0]!.text).toContain("$10.00");

    // Without literal, $10.00 would be interpreted as regex and might not match correctly
    const regexResult = await grep({
      pattern: "[a-z]+",
      path: testDir,
      literal: true,
      glob: "special.txt",
    });
    expect(regexResult.matchCount).toBe(1);
    expect(regexResult.matches[0]!.text).toContain("[a-z]+");
  });

  test("glob filtering (*.ts only)", async () => {
    const result = await grep({
      pattern: "hello",
      path: testDir,
      ignoreCase: true,
      glob: "**/*.ts",
    });

    // Every match should be from a .ts file
    for (const m of result.matches) {
      expect(m.path).toEndWith(".ts");
    }
    expect(result.matchCount).toBeGreaterThan(0);
  });

  test("context lines", async () => {
    const result = await grep({
      pattern: "sayHello",
      path: testDir,
      glob: "hello.ts",
      context: 1,
    });

    expect(result.matchCount).toBe(1);
    // Should have context lines around the match
    expect(result.matches.length).toBeGreaterThan(1);

    // Verify there's at least one context line
    const contextLines = result.matches.filter((m) => m.isContext);
    expect(contextLines.length).toBeGreaterThan(0);

    // The match itself should not be marked as context
    const matchLines = result.matches.filter((m) => !m.isContext);
    expect(matchLines.length).toBe(1);
    expect(matchLines[0]!.text).toContain("sayHello");
  });

  test("max matches limit", async () => {
    const result = await grep({
      pattern: "match line",
      path: testDir,
      glob: "many.txt",
      maxMatches: 10,
    });

    expect(result.matchCount).toBe(10);
    expect(result.truncated).toBe(true);
  });

  test("binary file skipping", async () => {
    const result = await grep({
      pattern: "some text",
      path: testDir,
      glob: "binary.dat",
    });

    // Binary file should be skipped
    expect(result.matchCount).toBe(0);
  });

  test("empty directory / no matches", async () => {
    const emptyDir = join(testDir, "empty");
    await mkdir(emptyDir, { recursive: true });

    const result = await grep({
      pattern: "anything",
      path: emptyDir,
    });

    expect(result.matchCount).toBe(0);
    expect(result.matches).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  test("no matches in existing files", async () => {
    const result = await grep({
      pattern: "xyznonexistent123",
      path: testDir,
    });

    expect(result.matchCount).toBe(0);
    expect(result.matches).toEqual([]);
  });

  test("file size limit", async () => {
    // With a very small file size limit, the large file should be skipped
    const result = await grep({
      pattern: "Hello",
      path: testDir,
      glob: "large.ts",
      maxFileSize: 1024, // 1KB limit
    });

    expect(result.matchCount).toBe(0);
  });

  test("CRLF line ending handling", async () => {
    const result = await grep({
      pattern: "Hello CRLF",
      path: testDir,
      glob: "crlf.txt",
    });

    expect(result.matchCount).toBe(1);
    // The matched text should not contain \r
    expect(result.matches[0]!.text).toBe("Hello CRLF");
    expect(result.matches[0]!.text).not.toContain("\r");
  });

  test("search single file directly", async () => {
    const result = await grep({
      pattern: "greeting",
      path: join(testDir, "hello.ts"),
    });

    expect(result.matchCount).toBeGreaterThan(0);
    for (const m of result.matches.filter((m) => !m.isContext)) {
      expect(m.text).toContain("greeting");
    }
  });

  test("non-existent path returns empty", async () => {
    const result = await grep({
      pattern: "test",
      path: join(testDir, "nonexistent"),
    });

    expect(result.matchCount).toBe(0);
    expect(result.matches).toEqual([]);
  });

  test("context lines do not duplicate on overlap", async () => {
    // Create a file with adjacent matches
    await writeFile(
      join(testDir, "adjacent.txt"),
      "line1\nmatch-a\nmatch-b\nline4\n",
    );

    const result = await grep({
      pattern: "match",
      path: testDir,
      glob: "adjacent.txt",
      context: 1,
    });

    // Should have both matches + context, no duplicated lines
    const lineNumbers = result.matches.map((m) => m.lineNumber);
    const uniqueLineNumbers = [...new Set(lineNumbers)];
    expect(lineNumbers.length).toBe(uniqueLineNumbers.length);
  });

  test("relative paths in results", async () => {
    const result = await grep({
      pattern: "hello",
      path: testDir,
      ignoreCase: true,
      glob: "**/*.ts",
    });

    for (const m of result.matches) {
      // Paths should be relative (no absolute path prefix)
      expect(m.path).not.toMatch(/^[A-Z]:\\/);
      expect(m.path).not.toMatch(/^\//);
    }
  });
});
