import { defineConfig } from "vite";
import wails from "@wailsio/runtime/plugins/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [wails("./bindings")],
  resolve: {
    alias: {
      mermaid: fileURLToPath(new URL("./node_modules/mermaid/dist/mermaid.esm.mjs", import.meta.url)),
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
  server: {
    port: 9245,
    strictPort: true,
  },
});
