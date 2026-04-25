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

const TOKEN_KEYS: (keyof RendererThemeTokens)[] = [
  "void",
  "base",
  "surface",
  "elevated",
  "accent",
  "fg",
  "fg2",
  "fg3",
  "edge",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickTokens(src: Record<string, unknown>): RendererThemeTokens {
  const out: RendererThemeTokens = {};
  for (const key of TOKEN_KEYS) {
    const value = src[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Renderer theme semantics are runtime-tolerant: invalid theme shapes return
 * null, while invalid optional fields are ignored. Renderers should keep
 * colors here and put fonts/layout inside renderer CSS.
 */
export function validateRendererTheme(raw: unknown): RendererTheme | null {
  if (raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) return null;
  if (!isPlainObject(raw.base)) return null;

  const base = pickTokens(raw.base);
  if (Object.keys(base).length === 0) return null;

  const theme: RendererTheme = { base };

  if (raw.dark !== undefined && isPlainObject(raw.dark)) {
    const dark = pickTokens(raw.dark);
    if (Object.keys(dark).length > 0) {
      theme.dark = dark;
    }
  }

  if (raw.prefersScheme === "light" || raw.prefersScheme === "dark") {
    theme.prefersScheme = raw.prefersScheme;
  }

  return theme;
}
