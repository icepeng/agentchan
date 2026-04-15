// GitHub releases API client — thin external-IO boundary.
// Fetches the latest release metadata from icepeng/agentchan.
// Returns null on any network/parse/rate-limit failure so the caller can gracefully degrade.

const RELEASES_URL = "https://api.github.com/repos/icepeng/agentchan/releases/latest";
const REQUEST_TIMEOUT_MS = 5_000;

export interface LatestRelease {
  /** Release tag (e.g. "v0.3.0") as reported by GitHub. */
  tag: string;
  /** HTML URL to the release page on GitHub. */
  htmlUrl: string;
  /** ISO-8601 publish timestamp. */
  publishedAt: string;
  /** Release body / changelog markdown (may be empty). */
  body: string;
}

export function createUpdateRepo() {
  return {
    async fetchLatestRelease(): Promise<LatestRelease | null> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(RELEASES_URL, {
          headers: {
            // GitHub rejects requests without a User-Agent.
            "User-Agent": "agentchan-update-check",
            Accept: "application/vnd.github+json",
          },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          tag_name?: string;
          html_url?: string;
          published_at?: string;
          body?: string;
        };
        if (!data.tag_name || !data.html_url) return null;
        return {
          tag: data.tag_name,
          htmlUrl: data.html_url,
          publishedAt: data.published_at ?? "",
          body: data.body ?? "",
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export type UpdateRepo = ReturnType<typeof createUpdateRepo>;
