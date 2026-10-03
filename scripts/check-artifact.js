import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export function checkArtifactHtml(html) {
  assert.match(html, /<!doctype html>/i, 'The artifact must be an HTML document')
  assert.match(html, /<script\b[^>]*>[\s\S]+?<\/script>/i, 'The application script must be embedded')
  assert.match(html, /<style\b[^>]*>[\s\S]+?<\/style>/i, 'The application styles must be embedded')

  // Ordinary documentation links are allowed; automatically loaded resources are not.
  const resourceTags = html.match(/<(?:script|link|img|iframe|source|video|audio|object|embed)\b[^>]*>/gi) ?? []
  for (const tag of resourceTags) {
    const references = tag.matchAll(/\b(src|href|data|poster|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)
    for (const match of references) {
      const value = match[2] ?? match[3] ?? match[4]
      assert.ok(match[1].toLowerCase() !== 'srcset' || !value, 'Responsive image candidates must not add separate resources')
      assert.ok(!value || /^(?:data:|#)/i.test(value), `External or separate-file resource: ${tag}`)
    }
  }
  // Inspect CSS only. JavaScript createObjectURL(...) is needed for an inline
  // disposable worker and is not a CSS resource request.
  const css = [
    ...Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), match => match[1]),
    ...Array.from(html.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi), match => match[1] ?? match[2]),
  ].join('\n')
  assert.doesNotMatch(css, /@import\s/i, 'CSS imports must be bundled')
  for (const match of css.matchAll(/url\(\s*["']?([^)'"\s]+)/gi))
    assert.match(match[1], /^(?:data:|#)/i, `CSS resource must be embedded: ${match[1]}`)
}

export async function checkArtifact(directory = 'dist') {
  assert.deepEqual((await readdir(directory)).sort(), ['index.html'], 'Build must produce exactly dist/index.html')
  const html = await readFile(resolve(directory, 'index.html'), 'utf8')
  checkArtifactHtml(html)
  return Buffer.byteLength(html)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const bytes = await checkArtifact()
  console.log(`Standalone artifact verified: dist/index.html (${bytes} bytes)`)
}
