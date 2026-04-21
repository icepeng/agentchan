import { SWRConfig, type SWRConfiguration } from "swr";
import type { ReactNode } from "react";
import { json } from "@/client/shared/api.js";
import type { QueryKey } from "@/client/shared/queryKeys.js";

const enc = (v: unknown) => encodeURIComponent(String(v));

/**
 * Tuple-key → URL mapping. Centralized so cache keys (`shared/queryKeys.ts`)
 * and HTTP routes never drift. Adding a new query: register the key in
 * `queryKeys.ts`, then add the corresponding case here.
 *
 * Mutations stay in entity `*.api.ts` files — those need explicit
 * method/body/headers and don't fit a generic GET fetcher.
 */
function buildRoute(entity: string, args: unknown[]): string {
  switch (entity) {
    // projects
    case "projects":        return "/projects";
    case "projectReadme":   return `/projects/${enc(args[0])}/readme`;
    case "workspaceFiles":  return `/projects/${enc(args[0])}/workspace/files`;
    // sessions
    case "sessions":        return `/projects/${enc(args[0])}/sessions`;
    case "session":         return `/projects/${enc(args[0])}/sessions/${enc(args[1])}`;
    // skills
    case "skills":          return `/projects/${enc(args[0])}/skills`;
    // config
    case "config":          return "/config";
    case "providers":       return "/config/providers";
    case "apiKeys":         return "/config/api-keys";
    case "oauthStatus":     return `/config/oauth/${enc(args[0])}`;
    case "onboarding":      return "/config/onboarding";
    // editor
    case "projectTree":     return `/projects/${enc(args[0])}/tree`;
    // templates
    case "templates":       return "/templates";
    case "templateReadme":  return `/templates/${enc(args[0])}/readme`;
    // update
    case "version":         return "/update";
    default:
      throw new Error(`Unknown query entity: ${entity}`);
  }
}

async function tupleFetcher(key: QueryKey): Promise<unknown> {
  const [entity, ...args] = key;
  return json(buildRoute(entity, args));
}

/**
 * App-wide defaults:
 * - `revalidateOnFocus: false` — desktop-style app, focus thrash unwanted
 * - `keepPreviousData: true` — flash-free project switches
 * - `shouldRetryOnError: false` — surface failures once; mutations are the
 *   error-critical path, not GETs
 * - `dedupingInterval: 2000` — collapses bursty subscribes from sibling components
 */
const defaults: SWRConfiguration = {
  fetcher: tupleFetcher,
  revalidateOnFocus: false,
  keepPreviousData: true,
  shouldRetryOnError: false,
  dedupingInterval: 2000,
};

export function SwrRoot({ children }: { children: ReactNode }) {
  return <SWRConfig value={defaults}>{children}</SWRConfig>;
}
