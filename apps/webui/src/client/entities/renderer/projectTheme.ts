// Re-export of the runtime's theme utilities so host code keeps importing
// from `@/client/entities/renderer`. The implementation lives in the
// renderer-runtime package because the iframe document needs the same
// merge rules — divergent token-name maps had silently broken `fg2`/`fg3`
// inside the iframe.
export {
  validateTheme,
  resolveThemeVars,
  type ResolvedThemeVars,
} from "@agentchan/renderer-runtime";
