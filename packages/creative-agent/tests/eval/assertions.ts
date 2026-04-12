/**
 * Flexible assertion helpers for eval tool call verification.
 *
 * Design: no order checking, at-least-one match = pass,
 * failure messages include full actual tool call list for debugging.
 */

export interface CollectedToolCall {
  toolName: string;
  args: Record<string, any>;
  result?: any;
  isError?: boolean;
}

/**
 * Assert that at least one tool call matches the given name and arg patterns.
 *
 * @param argMatchers - key→pattern map. string = substring match, RegExp = pattern match.
 */
export function expectToolCall(
  toolCalls: CollectedToolCall[],
  toolName: string,
  argMatchers?: Record<string, string | RegExp>,
): void {
  const candidates = toolCalls.filter((tc) => tc.toolName === toolName);

  if (candidates.length === 0) {
    const allTools = [...new Set(toolCalls.map((tc) => tc.toolName))].join(", ");
    throw new Error(
      `Expected tool "${toolName}" to be called, but it was not.\n` +
        `Tools called: [${allTools}]\n` +
        `Total calls: ${toolCalls.length}`,
    );
  }

  if (!argMatchers) return;

  const matched = candidates.some((tc) =>
    Object.entries(argMatchers).every(([key, pattern]) => {
      const value = tc.args?.[key];
      if (value === undefined) return false;
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      if (pattern instanceof RegExp) return pattern.test(strValue);
      return strValue.includes(pattern);
    }),
  );

  if (!matched) {
    const argSummary = candidates
      .map((tc) => {
        const args = { ...tc.args };
        // Truncate long values for readability
        for (const [k, v] of Object.entries(args)) {
          if (typeof v === "string" && v.length > 200) {
            args[k] = v.slice(0, 200) + "…";
          }
        }
        return JSON.stringify(args, null, 2);
      })
      .join("\n---\n");

    const matcherStr = Object.entries(argMatchers)
      .map(([k, v]) => `${k}: ${v instanceof RegExp ? v.toString() : JSON.stringify(v)}`)
      .join(", ");

    throw new Error(
      `Expected tool "${toolName}" called with { ${matcherStr} }, but no call matched.\n\n` +
        `Actual "${toolName}" calls (${candidates.length}):\n${argSummary}`,
    );
  }
}

/**
 * Assert that the given tool was never called.
 */
export function expectNoToolCall(toolCalls: CollectedToolCall[], toolName: string): void {
  const found = toolCalls.filter((tc) => tc.toolName === toolName);
  if (found.length > 0) {
    throw new Error(
      `Expected tool "${toolName}" NOT to be called, but it was called ${found.length} time(s).`,
    );
  }
}

/**
 * Assert that `activate_skill` was never called for any of the given skill names.
 */
export function expectNoSkillActivation(
  toolCalls: CollectedToolCall[],
  skillNames: string | string[],
): void {
  const targets = new Set(Array.isArray(skillNames) ? skillNames : [skillNames]);
  const offending = toolCalls.filter(
    (tc) => tc.toolName === "activate_skill" && typeof tc.args?.name === "string" && targets.has(tc.args.name as string),
  );

  if (offending.length > 0) {
    const names = offending.map((tc) => tc.args?.name as string);
    throw new Error(
      `activate_skill must not be called for already-loaded skill(s) [${[...targets].join(", ")}], ` +
        `but got ${offending.length} redundant call(s): ${JSON.stringify(names)}.`,
    );
  }
}

/**
 * Assert that at least one tool call matches any of the given names and arg patterns.
 */
export function expectToolCallAny(
  toolCalls: CollectedToolCall[],
  toolNames: string[],
  argMatchers?: Record<string, string | RegExp>,
): void {
  for (const name of toolNames) {
    try {
      expectToolCall(toolCalls, name, argMatchers);
      return; // At least one matched
    } catch {
      // Try next name
    }
  }
  const allTools = [...new Set(toolCalls.map((tc) => tc.toolName))].join(", ");
  throw new Error(
    `Expected any of [${toolNames.join(", ")}] to be called${argMatchers ? ` with matching args` : ""}, but none matched.\n` +
      `Tools called: [${allTools}]\nTotal calls: ${toolCalls.length}`,
  );
}

/**
 * Assert that RP content written via write/append tools is NOT duplicated in assistant text.
 *
 * Extracts character dialogue lines (**Name:** pattern) from write/append content,
 * then checks that the assistant text blocks don't contain the same lines.
 */
export function expectNoWriteDuplication(
  toolCalls: CollectedToolCall[],
  assistantTexts: string[],
): void {
  const writtenContent = toolCalls
    .filter((tc) => tc.toolName === "write" || tc.toolName === "append")
    .map((tc) => tc.args?.content as string)
    .filter(Boolean);

  if (writtenContent.length === 0 || assistantTexts.length === 0) return;

  // Extract significant RP lines from written content (character dialogue: **Name:**)
  const dialoguePattern = /^\s*(\[[\w-]+:[^\]]+\])?\*\*[^*]+:\*\*/;
  const writtenLines = writtenContent
    .flatMap((c) => c.split("\n"))
    .filter((line) => dialoguePattern.test(line))
    .map((line) => line.trim());

  if (writtenLines.length === 0) return;

  const fullText = assistantTexts.join("\n");
  const duplicated = writtenLines.filter((line) => fullText.includes(line));

  if (duplicated.length > 0) {
    throw new Error(
      `Assistant text duplicates RP content already written to file.\n` +
        `Duplicated lines (${duplicated.length} of ${writtenLines.length}):\n` +
        duplicated
          .slice(0, 5)
          .map((l) => `  "${l.slice(0, 120)}"`)
          .join("\n") +
        `\n\nAssistant text length: ${fullText.length} chars`,
    );
  }
}

/**
 * Assert that at least one assistant text block matches the given pattern.
 *
 * Useful for verifying that the model followed a skill instruction that
 * produces a recognisable text output (e.g. asking stage-1 questions).
 */
export function expectAssistantText(
  assistantTexts: string[],
  pattern: string | RegExp,
): void {
  const matched = assistantTexts.some((text) =>
    pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern),
  );

  if (!matched) {
    const preview = assistantTexts
      .map((t) => (t.length > 200 ? t.slice(0, 200) + "…" : t))
      .join("\n---\n");

    throw new Error(
      `Expected assistant text matching ${pattern instanceof RegExp ? pattern.toString() : JSON.stringify(pattern)}, but none matched.\n\n` +
        `Assistant texts (${assistantTexts.length}):\n${preview}`,
    );
  }
}

/**
 * Assert that append tool calls begin with \n\n so the new content doesn't
 * merge with the last line of the existing file.
 */
export function expectAppendNewlineSeparation(toolCalls: CollectedToolCall[]): void {
  const appendCalls = toolCalls.filter(
    (tc) => tc.toolName === "append" && typeof tc.args?.content === "string",
  );

  const bad = appendCalls.filter((tc) => !(tc.args.content as string).startsWith("\n\n"));

  if (bad.length > 0) {
    throw new Error(
      `Append content must start with \\n\\n to separate from existing file content.\n` +
        `${bad.length} of ${appendCalls.length} append call(s) missing leading newlines:\n` +
        bad
          .slice(0, 3)
          .map((tc) => {
            const preview = (tc.args.content as string).slice(0, 80).replace(/\n/g, "\\n");
            return `  file: ${tc.args.file_path}, starts: "${preview}"`;
          })
          .join("\n"),
    );
  }
}
