export const MAX_LINES = 2000;
export const MAX_OUTPUT_BYTES = 50 * 1024;

/** Keep the last N lines / max bytes of output (tail truncation). */
export function truncateTail(text: string): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= MAX_LINES) {
    if (Buffer.byteLength(text, "utf-8") <= MAX_OUTPUT_BYTES) {
      return { text, truncated: false };
    }
  }

  // Take last MAX_LINES lines, then trim to MAX_OUTPUT_BYTES
  const tail = lines.slice(-MAX_LINES);
  let result = tail.join("\n");
  const bytes = Buffer.byteLength(result, "utf-8");
  if (bytes > MAX_OUTPUT_BYTES) {
    const buf = Buffer.from(result, "utf-8");
    result = buf.subarray(buf.length - MAX_OUTPUT_BYTES).toString("utf-8");
    // Drop the first (likely partial) line
    const newlineIdx = result.indexOf("\n");
    if (newlineIdx !== -1) result = result.slice(newlineIdx + 1);
  }

  const shownLines = result.split("\n").length;
  const header = `(output truncated — showing last ${shownLines} of ${lines.length} lines)\n`;
  return { text: header + result, truncated: true };
}
