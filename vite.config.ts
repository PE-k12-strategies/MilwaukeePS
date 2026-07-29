import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // Avoid walking parent dirs for PostCSS (empty ~/package.json breaks JSON parse).
  css: {
    postcss: {
      plugins: [],
    },
  },
  build: {
    // Committed output so Live Server can open index.html with no manual build step
    outDir: 'bundle',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'app.html',
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? ''
          if (name.endsWith('.css')) return 'assets/app.css'
          // Keep original names for images/fonts so they don't collide
          return 'assets/[name][extname]'
        },
      },
    },
  },
})
