import {
  createContext,
  use,
  useState,
  useEffect,
  useMemo,
  useCallback,
  createElement,
  type ReactNode,
} from "react";
import { translations as en, type TranslationKey } from "./en.js";
import { translations as ko } from "./ko.js";
import { localStore } from "@/client/shared/storage.js";

export type LanguagePreference = "system" | "en" | "ko";
export type ResolvedLanguage = "en" | "ko";
export type { TranslationKey };

type TFunction = (key: TranslationKey, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  preference: LanguagePreference;
  resolved: ResolvedLanguage;
  t: TFunction;
  setPreference: (pref: LanguagePreference) => void;
}

const SUPPORTED: ResolvedLanguage[] = ["en", "ko"];

const dictionaries: Record<ResolvedLanguage, Record<string, string>> = { en, ko };

function getSystemLanguage(): ResolvedLanguage {
  const lang = navigator.language;
  if (lang.startsWith("ko")) return "ko";
  return "en";
}

function resolveLanguage(pref: LanguagePreference): ResolvedLanguage {
  if (pref === "system") return getSystemLanguage();
  return SUPPORTED.includes(pref as ResolvedLanguage) ? (pref as ResolvedLanguage) : "en";
}

function applyLang(resolved: ResolvedLanguage) {
  document.documentElement.lang = resolved;
}

const I18nContext = createContext<I18nContextValue>({
  preference: "system",
  resolved: "en",
  t: (key) => en[key],
  setPreference: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(() => localStore.language.read());
  const [resolved, setResolved] = useState<ResolvedLanguage>(() => resolveLanguage(localStore.language.read()));

  const setPreference = useCallback((pref: LanguagePreference) => {
    setPreferenceState(pref);
    localStore.language.write(pref);
    const r = resolveLanguage(pref);
    setResolved(r);
    applyLang(r);
  }, []);

  // Apply on mount & listen for system language changes
  useEffect(() => {
    applyLang(resolved);

    const handler = () => {
      if (preference === "system") {
        const r = getSystemLanguage();
        setResolved(r);
        applyLang(r);
      }
    };
    window.addEventListener("languagechange", handler);
    return () => window.removeEventListener("languagechange", handler);
  }, [preference, resolved]);

  const t: TFunction = useMemo(() => {
    const dict = dictionaries[resolved];
    return (key: TranslationKey, params?: Record<string, string | number>): string => {
      let result: string = dict[key] ?? en[key];
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replaceAll(`{{${k}}}`, String(v));
        }
      }
      return result;
    };
  }, [resolved]);

  return createElement(
    I18nContext.Provider,
    { value: { preference, resolved, t, setPreference } },
    children,
  );
}

export function useI18n() {
  return use(I18nContext);
}
