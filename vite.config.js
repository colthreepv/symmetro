import { defineConfig } from 'vite'
import cssOnly from 'rollup-plugin-css-only'

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        main: './src/index.html',
      },
      output: {
        format: 'iife',
        file: 'index.html',
        assetFileNames: '[name].[ext]',
      },
      plugins: [cssOnly({ output: 'inline' })],
    },
  },
})
