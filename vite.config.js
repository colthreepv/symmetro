import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { version } from './package.json'
import { thirdPartyNoticesHtml } from './scripts/third-party-notices.js'

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    cssCodeSplit: false,
  },
  plugins: [viteSingleFile(), {
    name: 'offline-third-party-notices',
    transformIndexHtml: {
      order: 'post',
      handler: html => html.replace('</head>', `${thirdPartyNoticesHtml()}\n</head>`),
    },
  }],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
