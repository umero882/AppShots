import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { apiProxyPlugin } from "./server/devProxy.js";

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix) and expose the server-only ones (no VITE_
  // prefix) to process.env so the proxy handlers can read them. These are NOT
  // bundled into the client — only the proxy, running in Node, sees them.
  const env = loadEnv(mode, process.cwd(), "");
  for (const k of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "STABILITY_API_KEY",
    "GITHUB_TOKEN",
    "PEXELS_API_KEY",
    // Stripe (server-only — never bundled into the client)
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_AUTOMATIC_TAX",
    "APP_URL",
    "SUB_DIR",
  ]) {
    if (env[k] && !process.env[k]) process.env[k] = env[k];
  }

  return {
    plugins: [react(), apiProxyPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
