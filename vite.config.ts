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
    // The shell is served with its JS/CSS inlined (see `renderInlineShell` in
    // mcp-message-handlers.ts), so the iframe has no origin to resolve `./assets/…`
    // against: every referenced asset MUST become a base64 data URI, never a file.
    // This is the exact inverse of the split-asset build it replaced.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      output: {
        // One self-contained chunk. Inlining several chunks into one document would
        // strand their relative import specifiers (`import … from "./vendor-<hash>.js"`),
        // which resolve against an origin the sandboxed iframe does not have.
        inlineDynamicImports: true,
      },
    },
  },
});
