import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/ui',
  base: './',
  server: {
    cors: true,
  },
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    // Every referenced asset becomes a real hashed `assets/` file, never an inlined base64
    // data URI — split-asset serving needs a filename to address over `ui://…/assets/<file>`.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', '@privos_ai/app-react'],
          docx: ['docx'],
          xlsx: ['xlsx'],
          'antd-icons': ['@ant-design/icons'],
        },
      },
    },
  },
});
