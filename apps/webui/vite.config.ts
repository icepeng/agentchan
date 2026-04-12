import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const serverPort = Number(process.env.SERVER_PORT ?? 3000);
const clientPort = Number(process.env.CLIENT_PORT ?? 4100);

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  root: ".",
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // CodeMirror is only used by the lazy-loaded Library page.
              // Force it into its own chunk so it's not in the main bundle.
              name: "codemirror",
              test: /node_modules[\\/](?:@codemirror|@lezer)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    watch: {
      ignored: ["**/data/**"],
    },
    host: "127.0.0.1",
    port: clientPort,
    proxy: {
      "/api": `http://127.0.0.1:${serverPort}`,
    },
  },
});
