import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Config-time env: repo-root .env, overridden by this portal's .env / .env.local
const env = {
  ...loadEnv("development", path.resolve(__dirname, "../.."), ""),
  ...loadEnv("development", __dirname, ""),
};
const port = Number(env.SERVICE_PORTAL_PORT) || 3015;
const publicHost = env.PUBLIC_HOST || "eswasaone.aiceafrica.com";
// /api + /ws proxy target (e.g. https://eswasaone.aiceafrica.com); default local Core
const coreTarget = env.CORE_PROXY_TARGET || `http://127.0.0.1:${env.CORE_PORT || 8015}`;
const coreWsTarget = coreTarget.replace(/^http/, "ws");

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "EswasaOne",
        short_name: "EswasaOne",
        description: "Eswatini Standards Authority — citizen service portal",
        theme_color: "#0E7C7B",
        background_color: "#0A464F",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/ws/, /^\/institution/],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              url.pathname.startsWith("/api/") &&
              (url.pathname.startsWith("/api/standards") ||
                url.pathname.startsWith("/api/guide") ||
                url.pathname.startsWith("/api/verify") ||
                url.pathname.startsWith("/api/home/")),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "eswasaone-api-get",
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "font" || request.destination === "style",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "eswasaone-assets" },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
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
  appType: "spa",
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
  preview: {
    host: "127.0.0.1",
    port,
    strictPort: true,
  },
});
