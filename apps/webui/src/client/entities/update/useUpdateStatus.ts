import { useEffect, useState } from "react";
import { fetchUpdateStatus } from "./update.api.js";
import type { UpdateStatus } from "./update.types.js";

const DISMISS_KEY = "agentchan.updateDismissed";

/**
 * Returns the update status once available. We only fetch on mount — the
 * server caches for an hour, so hitting the endpoint on every app load is
 * essentially free and avoids stale state across long-running tabs.
 */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchUpdateStatus().then((next) => {
      if (!cancelled) setStatus(next);
    }).catch(() => {
      // Offline / API down — stay silent rather than spamming the UI.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

/**
 * Persist the dismissed version in localStorage so the banner does not
 * re-appear after a user has acknowledged it. A newer release will have a
 * different `latest` value and will therefore surface again.
 */
export function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function writeDismissedVersion(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, version);
  } catch {
    // Private mode / quota — best-effort only.
  }
}
