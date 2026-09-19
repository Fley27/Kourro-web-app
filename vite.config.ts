import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Kourro",
        short_name: "Kourro",
        description: "Bati yon biznis ki ap siviv ou",
        theme_color: "#f6f1e4",
        background_color: "#f6f1e4",
        display: "standalone",
        icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    }),
  ],
  server: { port: 5173 },
});
