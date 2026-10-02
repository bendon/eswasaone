import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

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
    port: 3016,
    strictPort: true,
    allowedHosts: ["eswasaone.aiceafrica.com", ".aiceafrica.com"],
    proxy: {
      "/api": { target: "http://127.0.0.1:8015", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:8015", ws: true },
    },
  },
});
