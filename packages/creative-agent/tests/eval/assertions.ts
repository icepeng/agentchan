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
  /**
   * The assistant-message turn number this tool call belongs to. Two calls
   * with the same value were emitted in the same LLM response (the LLM
   * thought of both at once). Used by `expectSameAssistantTurn` for
   * eager-capture verification.
   */
  assistantTurn?: number;
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
 * Assert that at least one bash tool call has a command matching the pattern.
 */
export function expectBashCall(toolCalls: CollectedToolCall[], commandPattern: string | RegExp): void {
  expectToolCall(toolCalls, "bash", { command: commandPattern });
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
 * Spec for matching a single tool call by name + optional arg patterns.
 * Used by `expectSameAssistantTurn` and similar pairing assertions.
 */
export interface ToolCallSpec {
  toolName: string;
  argMatchers?: Record<string, string | RegExp>;
}

function matchesToolCall(tc: CollectedToolCall, spec: ToolCallSpec): boolean {
  if (tc.toolName !== spec.toolName) return false;
  if (!spec.argMatchers) return true;
  return Object.entries(spec.argMatchers).every(([key, pattern]) => {
    const value = tc.args?.[key];
    if (value === undefined) return false;
    const strValue = typeof value === "string" ? value : JSON.stringify(value);
    if (pattern instanceof RegExp) return pattern.test(strValue);
    return strValue.includes(pattern);
  });
}

function describeSpec(spec: ToolCallSpec): string {
  if (!spec.argMatchers) return spec.toolName;
  const args = Object.entries(spec.argMatchers)
    .map(([k, v]) => `${k}=${v instanceof RegExp ? v.toString() : JSON.stringify(v)}`)
    .join(", ");
  return `${spec.toolName}(${args})`;
}

/**
 * Assert that there exists at least one pair of tool calls — one matching
 * `specA`, one matching `specB` — that share the same `assistantTurn`,
 * meaning the LLM emitted both tool_use blocks in a single response.
 *
 * Used to verify the long-term-memory skill's eager-capture rule: when an
 * event happens, journal append and MEMORY.md edit must be in the same turn.
 */
export function expectSameAssistantTurn(
  toolCalls: CollectedToolCall[],
  specA: ToolCallSpec,
  specB: ToolCallSpec,
): void {
  const callsA = toolCalls.filter((tc) => matchesToolCall(tc, specA));
  const callsB = toolCalls.filter((tc) => matchesToolCall(tc, specB));

  if (callsA.length === 0 || callsB.length === 0) {
    const missing = [
      callsA.length === 0 ? describeSpec(specA) : null,
      callsB.length === 0 ? describeSpec(specB) : null,
    ].filter(Boolean).join(" and ");
    throw new Error(
      `expectSameAssistantTurn: no calls matched ${missing}.\n` +
      `Tools called: [${[...new Set(toolCalls.map((tc) => tc.toolName))].join(", ")}]`,
    );
  }

  for (const a of callsA) {
    for (const b of callsB) {
      if (a.assistantTurn !== undefined && a.assistantTurn === b.assistantTurn) {
        return;
      }
    }
  }

  const turnsA = [...new Set(callsA.map((tc) => tc.assistantTurn))].join(", ");
  const turnsB = [...new Set(callsB.map((tc) => tc.assistantTurn))].join(", ");
  throw new Error(
    `expectSameAssistantTurn: ${describeSpec(specA)} and ${describeSpec(specB)} were never emitted in the same LLM response.\n` +
    `  ${describeSpec(specA)} appeared in turns: [${turnsA}]\n` +
    `  ${describeSpec(specB)} appeared in turns: [${turnsB}]\n` +
    `This likely means the eager-capture rule was violated — the model split journal append and MEMORY.md edit across separate turns.`,
  );
}

/**
 * Assert that append tool calls begin with \n\n so the new content doesn't
 * merge with the last line of the existing file. Without the leading blank
 * line, blockquote echoes (> ...) and dialogue (**Name:**) are not
 * recognised as separate markdown blocks by the chat renderer.
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
