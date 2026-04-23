import type { StateService } from "./state.service.js";

/**
 * Typed shape for the `setTheme` RPC payload. Mirrors
 * `apps/webui/public/types/renderer.d.ts` — LLM-authored renderer is the
 * sole producer, so we only validate structurally.
 */
export interface ThemePayload {
  base: Record<string, string>;
  dark?: Record<string, string>;
  prefersScheme?: "light" | "dark";
}

const ALLOWED_TOKENS = new Set([
  "void",
  "base",
  "surface",
  "elevated",
  "accent",
  "fg",
  "fg2",
  "fg3",
  "edge",
]);

function validateThemePayload(raw: unknown): ThemePayload | null {
  if (raw === null || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;

  function validateTokens(value: unknown): Record<string, string> | null {
    if (value === undefined) return null;
    if (value === null || typeof value !== "object") return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!ALLOWED_TOKENS.has(k)) continue;
      if (typeof v !== "string") continue;
      out[k] = v;
    }
    return out;
  }

  const base = validateTokens(input.base);
  if (!base) return null;

  const result: ThemePayload = { base };
  const dark = validateTokens(input.dark);
  if (dark) result.dark = dark;
  if (input.prefersScheme === "light" || input.prefersScheme === "dark") {
    result.prefersScheme = input.prefersScheme;
  }
  return result;
}

export interface ActionsContext {
  stateService: StateService;
  triggerSend: (slug: string, text: string) => Promise<void>;
}

/**
 * RPC dispatch for the renderer iframe. Each handler returns 204 or throws
 * with an HTTP status embedded in `.status`.
 */
export function createActionsService(ctx: ActionsContext) {
  return {
    dispatch(
      slug: string,
      name: string,
      body: unknown,
    ): { status: number; error?: string } {
      switch (name) {
        case "send": {
          const text = extractText(body);
          if (!text) return { status: 204 };
          if (ctx.stateService.isStreaming(slug)) return { status: 204 };
          // Fire and forget — agent streaming happens async, events surface
          // through the state SSE channel.
          ctx.triggerSend(slug, text).catch((err) => {
            console.error("[actions.service] send failed", err);
            ctx.stateService.applyError(
              slug,
              err instanceof Error ? err.message : String(err),
            );
          });
          return { status: 204 };
        }
        case "fill": {
          const text = extractText(body);
          ctx.stateService.fillInput(slug, text ?? "");
          return { status: 204 };
        }
        case "setTheme": {
          if (body === null || typeof body !== "object") {
            return { status: 400, error: "Invalid body" };
          }
          const raw = (body as { theme?: unknown }).theme;
          if (raw === null || raw === undefined) {
            ctx.stateService.setTheme(slug, null);
            return { status: 204 };
          }
          const theme = validateThemePayload(raw);
          if (!theme) return { status: 400, error: "Invalid theme" };
          ctx.stateService.setTheme(slug, theme);
          return { status: 204 };
        }
        default:
          return { status: 404, error: `Unknown action: ${name}` };
      }
    },
  };
}

function extractText(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const text = (body as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

export type ActionsService = ReturnType<typeof createActionsService>;
