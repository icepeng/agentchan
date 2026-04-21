export type {
  AgentState,
  ProjectFile,
  MountContext,
  RendererHostApi,
  RendererHandle,
  RendererTheme,
  RendererAction,
  ResolvedThemeVars,
} from "./renderer.types.js";

export {
  validateTheme,
  resolveThemeVars,
  applyThemeVars,
  sameTheme,
} from "./projectTheme.js";

export {
  RendererThemeProvider,
  useRendererThemeState,
  useRendererThemeDispatch,
} from "./RendererThemeContext.js";

export {
  RendererActionProvider,
  useRendererActionState,
  useRendererActionDispatch,
} from "./RendererActionContext.js";
export type { RendererActionState } from "./RendererActionContext.js";

export { useRendererMount } from "./useRendererMount.js";
export type { RendererMountSlot } from "./useRendererMount.js";
