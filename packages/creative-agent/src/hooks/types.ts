export type HookEventName = "PreToolUse" | "PostToolUse" | "UserPromptSubmit";

/** Single hook entry as defined in `hooks.json`. */
export interface HookConfigEntry {
  /** Tool name regex. Omit or `"*"` to match all tools. Only used by tool events. */
  matcher?: string;
  /** Path to the script file, relative to the project directory. */
  file: string;
  /** Timeout in milliseconds. Defaults to 30_000. */
  timeout?: number;
}

/** Top-level shape of `hooks.json`. */
export type HookConfig = Partial<Record<HookEventName, HookConfigEntry[]>>;

/** Compiled hook ready for execution. Matcher is pre-compiled to a regex. */
export interface CompiledHook {
  matcher?: RegExp;
  file: string;
  timeout: number;
}

export type CompiledHookConfig = Partial<Record<HookEventName, CompiledHook[]>>;

/** Input passed to a hook script via stdin (JSON). */
export interface HookInput {
  hook_event_name: HookEventName;
  session_id: string;
  project_dir: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output?: unknown;
  prompt?: string;
}

/**
 * JSON response a hook script may write to stdout. All fields are optional —
 * the hook can also exit with code 2 + stderr to signal a block.
 */
export interface HookResponse {
  /** `false` blocks the action (tool call or prompt). */
  continue?: boolean;
  /** Reason shown to the user / model when continue is false. */
  reason?: string;
  hookSpecificOutput?: {
    /** PreToolUse: replace the tool input. */
    updatedInput?: unknown;
    /** UserPromptSubmit: text prepended to the user's prompt. */
    additionalContext?: string;
  };
}

/** Result of running all hooks for an event. Aggregated by the runner. */
export interface HookExecResult {
  /** True if any hook returned `continue: false` or exited with code 2. */
  blocked: boolean;
  /** Aggregated reason from blocking hooks. */
  reason?: string;
  /** Tool input replacement from the last PreToolUse hook that set it. */
  updatedInput?: unknown;
  /** Concatenated additionalContext from UserPromptSubmit hooks. */
  additionalContext?: string;
}

export interface HookRunner {
  /** Run all hooks registered for `event` against `input`. */
  run(event: HookEventName, input: Omit<HookInput, "hook_event_name" | "session_id" | "project_dir">): Promise<HookExecResult>;
  /** Whether any hooks are configured for the given event. */
  has(event: HookEventName): boolean;
  /** Whether any hooks are configured at all. Lets callers skip wrapping. */
  isEmpty(): boolean;
}
