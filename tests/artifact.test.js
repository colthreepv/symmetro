import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkArtifactHtml } from '../scripts/check-artifact.js'
import { checkArtifactNotices, thirdPartyNoticesHtml } from '../scripts/third-party-notices.js'

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
  '<div style="background:url(remote.png)"></div>',
]) {
  test(`rejects non-embedded resources: ${resource}`, () => {
    assert.throws(() => checkArtifactHtml(document.replace('</body>', `${resource}</body>`)))
  })
}

test('allows embedded Blob worker JavaScript without treating createObjectURL as CSS', () => {
  checkArtifactHtml(document.replace('console.log("synthetic")', 'const embedded = URL.createObjectURL(blob)'))
})

test('retains the installed runtime dependency and embedded implementation notices', () => {
  const notices = thirdPartyNoticesHtml()
  assert.match(notices, /hash-wasm 4\.12\.0/)
  assert.match(notices, /Copyright \(c\) 2020 Dani Biró/)
  assert.match(notices, /The above copyright notice and this permission notice shall be included/)
  assert.match(notices, /Copyright \(c\) Microsoft Corporation/)
  assert.match(notices, /Based on Golang's Argon2 implementation/)
  assert.match(notices, /Copyright 2017 The Go Authors/)
  assert.match(notices, /Redistributions in binary form must reproduce/)
  assert.match(notices, /Copyright 2012, Samuel Neves/)
  const html = document.replace('</head>', `${notices}\n</head>`)
  checkArtifactHtml(html)
  checkArtifactNotices(html)
})

test('rejects an artifact with missing or modified third-party notices', () => {
  assert.throws(() => checkArtifactNotices(document), /third-party notices/)
  const html = document.replace('</head>', `${thirdPartyNoticesHtml()}\n</head>`)
  assert.throws(() => checkArtifactNotices(html.replace('Copyright (c) 2020 Dani Biró', '')), /third-party notices/)
})
