import { createElement, Fragment } from "react";

/**
 * Renderer modules are compiled with a classic JSX factory
 * (`__rendererJsx.h` / `__rendererJsx.Fragment`) and loaded via Blob URLs,
 * where `react/jsx-runtime` has no resolver. Exposing the factory on
 * `globalThis` lets transpiled modules call through to the host's React,
 * keeping hooks/context/ErrorBoundary wiring intact. Import this once from
 * the app entry before any renderer compiles.
 */
declare global {
  var __rendererJsx: {
    h: typeof createElement;
    Fragment: typeof Fragment;
  };
}

globalThis.__rendererJsx = { h: createElement, Fragment };

export {};
