import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { version } from './package.json'

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    cssCodeSplit: false,
  },
  plugins: [viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
