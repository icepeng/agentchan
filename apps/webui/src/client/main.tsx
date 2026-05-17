import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ThemeProvider } from "@/client/features/settings/index.js";
import { ErrorBoundary, I18nProvider } from "@/client/platform/index.js";
import { AppProviders, RootErrorFallback } from "@/client/app/index.js";
import "./main.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary
        FallbackComponent={RootErrorFallback}
        onError={(error, info) => {
          console.error("[ErrorBoundary] Root", error, info.componentStack);
        }}
      >
        <ThemeProvider>
          <AppProviders>
            <App />
          </AppProviders>
        </ThemeProvider>
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
