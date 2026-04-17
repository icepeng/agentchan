import useSWR from "swr";
import { qk } from "@/client/shared/queryKeys.js";
import type { UpdateStatus } from "./update.types.js";

/**
 * Update / version status. Single SWR cache entry shared by Sidebar banner
 * and Settings About section — SWR's dedup replaces the prior module-scope
 * cache. Network errors return undefined data (silent — offline OK).
 */
export function useVersion() {
  return useSWR<UpdateStatus>(qk.version(), {
    onError: () => { /* offline / API down — stay silent */ },
  });
}
