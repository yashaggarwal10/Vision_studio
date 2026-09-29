import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:5000", changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/echarts/") || id.includes("/zrender/"))
            return "charts";
          if (
            id.includes("/react-grid-layout/") ||
            id.includes("/react-draggable/") ||
            id.includes("/react-resizable/")
          )
            return "layout";
          if (id.includes("/react/") || id.includes("/react-dom/"))
            return "react";
        },
      },
    },
  },
});
