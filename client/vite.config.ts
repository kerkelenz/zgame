import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.ZGAME_SERVER || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': target,
      '/ws': { target: target.replace('http', 'ws'), ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
