import { defineConfig } from "vite";
import wails from "@wailsio/runtime/plugins/vite";

export default defineConfig({
  plugins: [wails("./bindings")],
  build: {
    target: "esnext",
    outDir: "dist",
  },
  server: {
    port: 9245,
    strictPort: true,
  },
});
