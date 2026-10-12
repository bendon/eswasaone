/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Env lives in the repo-root .env (shared with Core), overridden by this portal's .env / .env.local.
const envDir = path.resolve(__dirname, "../..");
const env = {
  ...loadEnv("development", envDir, ""),
  ...loadEnv("development", __dirname, ""),
};
const port = Number(env.INSTITUTION_PORTAL_PORT) || 3016;
const publicHost = env.PUBLIC_HOST || "eswasaone.aiceafrica.com";
// /api + /ws proxy target (e.g. https://eswasaone.aiceafrica.com); default local Core.
// CORE_PROXY_TARGET is canonical; API_PROXY_TARGET is accepted for older .env files.
const apiTarget = (
  env.CORE_PROXY_TARGET ||
  env.API_PROXY_TARGET ||
  `http://127.0.0.1:${env.CORE_PORT || 8015}`
).replace(/\/$/, "");

export default defineConfig({
  envDir,
  plugins: [react()],
  resolve: {
    // shared-ui deps (e.g. react-day-picker) must use this portal's single React copy.
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
    alias: [
      {
        find: /^@eswasaone\/shared-ui\/(.*)$/,
        replacement: path.resolve(__dirname, "../shared-ui/src/$1"),
      },
      {
        find: "@eswasaone/shared-ui",
        replacement: path.resolve(__dirname, "../shared-ui/src"),
      },
      {
        find: "@contracts",
        replacement: path.resolve(__dirname, "../../contracts/types.ts"),
      },
    ],
  },
  base: "/institution/",
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    allowedHosts: [publicHost, ".aiceafrica.com"],
    // Serve shared-ui assets (fonts) and contracts from outside this portal's root.
    fs: { allow: [path.resolve(__dirname, ".."), path.resolve(__dirname, "../../contracts")] },
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true, secure: true, cookieDomainRewrite: "" },
      "/ws": { target: apiTarget.replace(/^http/, "ws"), ws: true, changeOrigin: true },
    },
  },
});
