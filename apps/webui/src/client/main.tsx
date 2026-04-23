import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ThemeProvider } from "@/client/features/settings/index.js";
import { I18nProvider } from "@/client/i18n/index.js";
import { AppProviders } from "@/client/app/index.js";
// Must run before any renderer module compiles — binds the classic-mode
// jsxFactory (`__rendererJsx.h`) to the host's React instance.
import "@/client/entities/renderer/jsxRuntimeBridge.js";
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
