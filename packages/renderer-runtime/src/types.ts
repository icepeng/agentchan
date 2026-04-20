// Renderer contract types — kept self-contained so this package has no
// upstream workspace deps. apps/webui's renderer.types.ts mirrors these.

// --- Project files (mirrors @agentchan/creative-agent ProjectFile) ---

export interface TextFile {
  type: "text";
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  modifiedAt: number;
}

export interface DataFile {
  type: "data";
  path: string;
  content: string;
  data: unknown;
  format: "yaml" | "json";
  modifiedAt: number;
}

export interface BinaryFile {
  type: "binary";
  path: string;
  modifiedAt: number;
}

export type ProjectFile = TextFile | DataFile | BinaryFile;

// --- Agent state subset ---
//
// Minimal shape — pi-ai's concrete message types vary by version and live in
// the host. Renderers duck-type by `role`. We deliberately omit an index
// signature so strict pi-ai types remain assignable to AgentMessage.

export interface AgentMessage {
  readonly role: "user" | "assistant" | "toolResult";
  readonly content?: unknown;
}

export interface AssistantMessage extends AgentMessage {
  readonly role: "assistant";
}

export interface AgentState {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly isStreaming: boolean;
  readonly streamingMessage?: AssistantMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}

// --- Renderer theme ---

export interface RendererThemeTokens {
  void?: string;
  base?: string;
  surface?: string;
  elevated?: string;
  accent?: string;
  fg?: string;
  fg2?: string;
  fg3?: string;
  edge?: string;
}

export interface RendererTheme {
  base: RendererThemeTokens;
  dark?: Partial<RendererThemeTokens>;
  prefersScheme?: "light" | "dark";
}

// --- Mount contract ---

export interface RendererActions {
  send(text: string): void;
  fill(text: string): void;
}

export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
  state: AgentState;
  actions: RendererActions;
}

export interface RendererInstance {
  update(ctx: RenderContext): void;
  destroy(): void;
}

export type MountFn = (
  target: HTMLElement,
  ctx: RenderContext,
) => RendererInstance;
export type ThemeFn = (ctx: RenderContext) => RendererTheme;
export type RenderFn = (ctx: RenderContext) => string;
