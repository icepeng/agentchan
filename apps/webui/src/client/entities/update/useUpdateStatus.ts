import { useEffect, useState } from "react";
import { fetchUpdateStatus } from "./update.api.js";
import type { UpdateStatus } from "./update.types.js";

const DISMISS_KEY = "agentchan.updateDismissed";

// Shared across all hook instances so Sidebar's banner and Settings' About
// section never issue duplicate HTTP calls on the same page load.
let cachedStatus: UpdateStatus | null = null;
let inflight: Promise<UpdateStatus | null> | null = null;

function sharedFetch(): Promise<UpdateStatus | null> {
  if (cachedStatus) return Promise.resolve(cachedStatus);
  if (!inflight) {
    inflight = fetchUpdateStatus()
      .then((s) => {
        cachedStatus = s;
        return s;
      })
      .catch(() => null) // Offline / API down — stay silent.
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(cachedStatus);

  useEffect(() => {
    if (cachedStatus) return;
    let cancelled = false;
    void sharedFetch().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

// Per-version dismissal — storing the version (not a boolean) ensures the
// banner re-appears automatically when a newer release arrives.
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
