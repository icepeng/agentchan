import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ThemeProvider } from "./features/settings/useTheme.js";
import { I18nProvider } from "./i18n/index.js";
import { AppProviders } from "./app/providers.js";
import "./main.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AppProviders>
          <App />
        </AppProviders>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
