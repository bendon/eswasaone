import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  base: "/field/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "icons/apple-touch-icon.png",
        "icons/favicon.ico",
        "icons/favicon-32.png",
      ],
      manifest: {
        name: "EswasaOne Field",
        short_name: "Field",
        description: "Eswatini Standards Authority — employee field app",
        theme_color: "#24286F",
        background_color: "#24286F",
        display: "standalone",
        start_url: "/field/",
        scope: "/field/",
        icons: [
          {
            src: "/field/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/field/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/field/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/field/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/ws/, /^\/institution/],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              url.pathname.startsWith("/api/") &&
              (url.pathname.startsWith("/api/hr/") ||
                url.pathname.startsWith("/api/certification/audits") ||
                url.pathname === "/api/auth/me"),
            handler: "NetworkFirst",
            options: {
              cacheName: "eswasaone-field-api",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) =>
              request.destination === "font" ||
              request.destination === "style" ||
              request.destination === "script" ||
              request.destination === "worker",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "eswasaone-field-assets" },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "eswasaone-field-images",
              expiration: { maxEntries: 48, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: {
        // Keep off by default — enable with VITE_PWA_DEV=true for SW testing.
        enabled: process.env.VITE_PWA_DEV === "true",
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
    port: 3017,
    strictPort: true,
    allowedHosts: ["eswasaone.aiceafrica.com", ".aiceafrica.com"],
    proxy: {
      "/api": { target: "http://127.0.0.1:8015", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:8015", ws: true },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 3017,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
