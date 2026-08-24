import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/tianditu': {
        target: 'https://t0.tianditu.gov.cn',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/tianditu/, ''),
      }
    }
  },
});
