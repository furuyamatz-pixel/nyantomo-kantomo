import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = repositoryName ? `/${repositoryName}/` : "/";

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icon.svg"],
      manifest: {
        name: "にゃんともかんとも",
        short_name: "にゃんとも",
        description: "猫の頭と体をそろえてお掃除するマッチパズル",
        lang: "ja",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#f7efe5",
        theme_color: "#87cbb9",
        icons: [
          {
            src: `${base}pwa-icon.svg`,
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
