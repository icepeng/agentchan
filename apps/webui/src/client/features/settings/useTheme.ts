import {
  createContext,
  use,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createElement } from "react";
import { useI18n } from "@/client/i18n/index.js";
import { localStore } from "@/client/shared/storage.js";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
}

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
  const metaColor = resolved === "light" ? "#f4f4f8" : "#050508";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", metaColor);
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolved: "dark",
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => localStore.theme.read());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(localStore.theme.read()));

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    localStore.theme.write(pref);
    const r = resolveTheme(pref);
    setResolved(r);
    applyTheme(r);
  }, []);

  // Apply theme to DOM whenever resolved theme changes
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // Listen for system theme changes
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia(MEDIA_QUERY);
    const handler = () => {
      setResolved(getSystemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  return createElement(
    ThemeContext.Provider,
    { value: { preference, resolved, setPreference } },
    children,
  );
}

export function useTheme() {
  return use(ThemeContext);
}

const systemIcon = createElement("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
  createElement("rect", { x: 2, y: 3, width: 20, height: 14, rx: 2 }),
  createElement("path", { d: "M8 21h8" }),
  createElement("path", { d: "M12 17v4" }),
);
const lightIcon = createElement("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
  createElement("circle", { cx: 12, cy: 12, r: 5 }),
  createElement("path", { d: "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" }),
);
const darkIcon = createElement("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
  createElement("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" }),
);

export function useThemeOptions() {
  const { t } = useI18n();
  return [
    { value: "system" as ThemePreference, label: t("globalSettings.themeSystem"), desc: t("globalSettings.themeSystemDesc"), icon: systemIcon },
    { value: "light" as ThemePreference, label: t("globalSettings.themeLight"), desc: t("globalSettings.themeLightDesc"), icon: lightIcon },
    { value: "dark" as ThemePreference, label: t("globalSettings.themeDark"), desc: t("globalSettings.themeDarkDesc"), icon: darkIcon },
  ];
}
