import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import daisyui from 'daisyui'

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    cssCodeSplit: false,
  },
  plugins: [daisyui, viteSingleFile()],
})
