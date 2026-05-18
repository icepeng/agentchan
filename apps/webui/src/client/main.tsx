import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/client/theme/index.js";
import {
  ErrorBoundary,
  I18nProvider,
  RootErrorFallback,
  SwrRoot,
} from "@/client/platform/index.js";
import { AppShell } from "@/client/shell/index.js";
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
          <SwrRoot>
            <AppShell />
          </SwrRoot>
        </ThemeProvider>
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
