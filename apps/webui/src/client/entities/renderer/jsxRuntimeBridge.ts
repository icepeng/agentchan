import * as React from "react";

/**
 * Renderer modules are compiled with a classic JSX factory
 * (`__rendererJsx.h` / `__rendererJsx.Fragment`) and loaded via Blob URLs,
 * where `react/jsx-runtime` has no resolver. We also can't let a renderer
 * `import { useState } from "react"` because Blob URL imports bypass Vite.
 *
 * To support both JSX + hook-using renderers without a bundler in the loop,
 * the host exposes its React module on globalThis, and the server's
 * transpile rewrites `import … from "react"` into a destructure of that
 * global. Import this once from the app entry before any renderer compiles.
 */
declare global {
  var __rendererJsx: {
    h: typeof React.createElement;
    Fragment: typeof React.Fragment;
  };
  var __rendererReact: typeof React;
}

globalThis.__rendererJsx = { h: React.createElement, Fragment: React.Fragment };
globalThis.__rendererReact = React;

export {};
