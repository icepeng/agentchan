// Shared types for renderer.ts authors. No runtime values — this package is
// consumed via `import type` only. The source of this file is also served
// verbatim to the editor (via /api/system/renderer-types.ts) so that autocomplete
// can be derived from the same declarations that renderers compile against.

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

export interface RenderContext {
  files: ProjectFile[];
  baseUrl: string;
}

// Token names map 1:1 to the app's `--color-*` CSS custom properties.
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
