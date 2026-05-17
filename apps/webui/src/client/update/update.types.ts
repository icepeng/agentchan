// Mirrors `UpdateStatus` in src/server/services/update.service.ts.
// Kept locally (not imported from server) so the client bundle stays independent.
export interface UpdateStatus {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
  releaseNotes: string;
  checkedAt: number;
}
