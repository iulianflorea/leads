import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    // Lets CI inject the Microsoft Client ID from a secret at build time.
    define: {
      __BUILD_MS_CLIENT_ID__: JSON.stringify(process.env.LEADMAILER_MS_CLIENT_ID ?? ''),
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
        // CommonJS output: electron-vite's ESM "CommonJS shims" injection can land inside
        // string literals that contain the word "import" (e.g. UI texts).
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['zod'] })],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: { ...shared, '@renderer': resolve('src/renderer/src') },
    },
    plugins: [react()],
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } },
    },
  },
})
