import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkArtifactHtml } from '../scripts/check-artifact.js'

const document = '<!doctype html><html><head><style>body{color:white}</style></head><body><script>console.log("synthetic")</script></body></html>'

test('accepts embedded application resources and ordinary documentation links', () => {
  checkArtifactHtml(document.replace('</body>', '<a href="https://example.com">Docs</a></body>'))
})

for (const resource of [
  '<script src="/app.js"></script>',
  '<link rel="stylesheet" href="https://example.com/app.css">',
  '<img src="logo.svg">',
  '<img srcset="data:image/gif;base64,R0lGODlhAQABAAAAACw= 1x, separate.png 2x">',
  '<style>@import "theme.css";</style>',
  '<style>@font-face{src:url(font.woff2)}</style>',
]) {
  test(`rejects non-embedded resources: ${resource}`, () => {
    assert.throws(() => checkArtifactHtml(document.replace('</body>', `${resource}</body>`)))
  })
}
