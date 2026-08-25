import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    // @arcgis/core 内部有大量动态 import，预构建会复制出第二套类定义，
    // 导致 instanceof 校验失败（"not a subclass"）。排除预构建，让其以原生 ESM 加载。
    exclude: ["@arcgis/core"],
  },
  server: {
    port: 5173,
    proxy: {
      '/tianditu': {
        target: 'https://t0.tianditu.gov.cn',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/tianditu/, ''),
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
