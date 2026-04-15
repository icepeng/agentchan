/**
 * Browser notification utilities.
 *
 * Fires OS-level Notification API calls for background stream completions.
 * Falls back silently when the API is unavailable or permission is denied —
 * UI indicators (tab title badge, project-tab dot) handle that case.
 *
 * Preference persistence lives in `shared/storage.ts` (`localStore.notifications`).
 */

import { localStore } from "./storage.js";

export type NotificationPreference = "on" | "off";

// --- Permission ---

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

// --- Background completion check ---

/**
 * True when the current project+conversation is NOT actively being viewed.
 * Used to decide whether to fire a notification on stream completion.
 *
 * Conditions (any triggers "background"):
 *   - Page is hidden (tab switched / minimized)
 *   - A different project is active
 *   - (Within same project) a different conversation is selected
 */
export function isBackgroundStream(
  completedProjectSlug: string,
  completedConversationId: string,
  activeProjectSlug: string | null,
  activeConversationId: string | null,
): boolean {
  if (typeof document !== "undefined" && document.hidden) return true;
  if (activeProjectSlug !== completedProjectSlug) return true;
  if (activeConversationId !== completedConversationId) return true;
  return false;
}

// --- Tab title badge + unseen tracking ---

let baseTitle: string | null = null;
const unseenCompletions = new Set<string>();

function captureBaseTitle(): string {
  if (baseTitle === null) {
    baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
  }
  return baseTitle;
}

function refreshBadge(): void {
  if (typeof document === "undefined") return;
  const base = captureBaseTitle();
  const count = unseenCompletions.size;
  if (count > 0) {
    document.title = `(${count}) ${base}`;
  } else {
    document.title = base;
    baseTitle = null; // re-capture on next write in case page title changed
  }
}

/**
 * Mark a projectSlug as having an unseen background completion.
 * Called by notifyBackgroundCompletion (and for testing / manual cases).
 */
export function markUnseenCompletion(projectSlug: string): void {
  unseenCompletions.add(projectSlug);
  refreshBadge();
}

/**
 * Clear the unseen flag for a projectSlug — called when the user switches
 * to that project or the tab becomes visible while that project is active.
 */
export function markSeen(projectSlug: string | null): void {
  if (!projectSlug) return;
  if (unseenCompletions.delete(projectSlug)) {
    refreshBadge();
  }
}

/** Direct count setter — test-only helper. */
export function peekUnseenCount(): number {
  return unseenCompletions.size;
}

// --- Fire notifications ---

export interface NotifyOpts {
  projectSlug: string;
  projectName: string;
  conversationId: string;
  kind: "done" | "error";
  /** Error message (only used when kind === "error"). */
  errorMessage?: string;
  /** Localized title, e.g. "Elara finished". */
  title: string;
  /** Localized body. */
  body: string;
  /** Fired when the user clicks the notification. */
  onClick: () => void;
}

/**
 * Fire an OS notification. Silently no-ops if:
 *   - Notification API unsupported (older browsers, iframes)
 *   - Permission is not "granted" (user denied or hasn't decided)
 *   - User preference is off
 *
 * Caller should still call `updateTabBadge` separately for the in-DOM fallback.
 */
export function notifyBackgroundCompletion(opts: NotifyOpts): void {
  // Always update the in-app badge — works regardless of permission / preference.
  markUnseenCompletion(opts.projectSlug);

  if (localStore.notifications.read() === "off") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  try {
    // Using projectSlug as tag coalesces repeated notifications for the same
    // project — e.g. if the user dismisses one and another completes, we
    // replace rather than stack.
    const notif = new Notification(opts.title, {
      body: opts.body,
      tag: `agentchan:${opts.projectSlug}`,
    });
    notif.onclick = () => {
      try {
        window.focus();
      } catch { /* ignore */ }
      opts.onClick();
      notif.close();
    };
  } catch {
    /* swallow — Notification constructor can throw on some platforms */
  }
}
