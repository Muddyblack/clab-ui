import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const nodeModules = path.resolve(root, "node_modules");

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: path.resolve(root, "resources"),
  resolve: {
    alias: {
      react: path.resolve(nodeModules, "react"),
      "react-dom": path.resolve(nodeModules, "react-dom"),
      "@webview": path.resolve(root, "packages/ui/src"),
      "@webviews": path.resolve(root, "packages/ui/src/webviews"),
      "@shared": path.resolve(root, "packages/ui/src/core"),
      "@srl-labs/clab-ui": path.resolve(root, "packages/ui/src"),
      "@srl-labs/clab-host-contract": path.resolve(root, "packages/host-contract/src"),
      "@srl-labs/clab-adapter-api": path.resolve(root, "packages/adapter-api/src"),
      "@srl-labs/clab-adapter-memory": path.resolve(root, "packages/adapter-memory/src")
    },
    dedupe: ["react", "react-dom"]
  },
  optimizeDeps: {
    include: ["react", "react-dom"]
  },
  css: {
    postcss: path.resolve(root, "postcss.config.js")
  },
  server: {
    port: 5174,
    open: false,
    proxy: {
      "/auth": "http://localhost:3000",
      "/api": "http://localhost:3000",
      "/files": "http://localhost:3000"
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist/client")
  }
});
