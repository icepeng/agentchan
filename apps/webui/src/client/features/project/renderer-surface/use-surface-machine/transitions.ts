export type SurfaceStatus =
  | "stable"
  | "fading-out"
  | "waiting-for-import"
  | "applying-theme"
  | "mounting"
  | "fading-in"
  | "showing-error";

export const FADE_OUT_MS = 300;
export const THEME_TRANSITION_MS = 300;
export const FADE_IN_MS = 200;

export function classForStatus(status: SurfaceStatus): string {
  const base = "relative z-10 h-full min-h-full";
  switch (status) {
    case "fading-out":
      return `${base} opacity-0 transition-opacity duration-300 ease-out motion-reduce:duration-0`;
    case "waiting-for-import":
    case "applying-theme":
    case "mounting":
      return `${base} opacity-0 transition-none`;
    case "fading-in":
    case "showing-error":
      return `${base} opacity-100 transition-opacity duration-200 ease-out motion-reduce:duration-0`;
    case "stable":
      return `${base} opacity-100 transition-none`;
  }
}
