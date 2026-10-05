import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Env lives in the repo-root .env (shared with Core); API_PROXY_TARGET points /api and /ws at a Core.
const envDir = path.resolve(__dirname, "../..");
const apiTarget =
  loadEnv(process.env.NODE_ENV ?? "development", envDir, "").API_PROXY_TARGET?.replace(/\/$/, "") ||
  "http://127.0.0.1:8015";

export default defineConfig({
  envDir,
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
    port: 3016,
    strictPort: true,
    allowedHosts: ["eswasaone.aiceafrica.com", ".aiceafrica.com"],
    // Serve shared-ui assets (fonts) and contracts from outside this portal's root.
    fs: { allow: [path.resolve(__dirname, ".."), path.resolve(__dirname, "../../contracts")] },
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true, secure: true, cookieDomainRewrite: "" },
      "/ws": { target: apiTarget.replace(/^http/, "ws"), ws: true, changeOrigin: true },
    },
  },
});
