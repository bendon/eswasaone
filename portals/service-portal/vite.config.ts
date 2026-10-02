import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

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
    port: 3015,
    strictPort: true,
    allowedHosts: ["eswasaone.aiceafrica.com", ".aiceafrica.com"],
    proxy: {
      "/api": { target: "http://127.0.0.1:8015", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:8015", ws: true },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 3015,
    strictPort: true,
  },
});
