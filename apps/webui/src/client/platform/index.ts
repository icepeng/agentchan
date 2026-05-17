export { BASE, json, parseSSEStream } from "./api.js";
export {
  isBackgroundStream,
  markSeen,
  markUnseenCompletion,
  notifyBackgroundCompletion,
  notificationPermission,
  peekUnseenCount,
  requestNotificationPermission,
} from "./notifications.js";
export type { NotificationPreference, NotifyOpts } from "./notifications.js";
export { qk, matchesSlug } from "./queryKeys.js";
export type { QueryKey } from "./queryKeys.js";
export { localStore } from "./storage.js";
export { useLatestRef } from "@/client/shared/useLatestRef.js";
export { SwrRoot } from "./swr.js";
export { ErrorBoundary } from "./ErrorBoundary.js";
export type { FallbackProps } from "./ErrorBoundary.js";
export { UIProvider, useUIState, useUIDispatch } from "./UIContext.js";
export type { UIState, UIAction } from "./UIContext.js";
export { I18nProvider, useI18n } from "./i18n/index.js";
export type {
  LanguagePreference,
  ResolvedLanguage,
  TFunction,
  TranslationKey,
} from "./i18n/index.js";
