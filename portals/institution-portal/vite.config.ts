import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Config-time env: repo-root .env, overridden by this portal's .env / .env.local
const env = {
  ...loadEnv("development", path.resolve(__dirname, "../.."), ""),
  ...loadEnv("development", __dirname, ""),
};
const port = Number(env.INSTITUTION_PORTAL_PORT) || 3016;
const publicHost = env.PUBLIC_HOST || "eswasaone.aiceafrica.com";
// /api + /ws proxy target (e.g. https://eswasaone.aiceafrica.com); default local Core
const coreTarget = env.CORE_PROXY_TARGET || `http://127.0.0.1:${env.CORE_PORT || 8015}`;
const coreWsTarget = coreTarget.replace(/^http/, "ws");

export default defineConfig({
  plugins: [react()],
  resolve: {
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
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    allowedHosts: [publicHost, ".aiceafrica.com"],
    proxy: {
      "/api": {
        target: coreTarget,
        changeOrigin: true,
        secure: true,
      },
      "/ws": {
        target: coreWsTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
