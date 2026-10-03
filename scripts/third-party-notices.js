import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dependencyRoot = new URL('../node_modules/hash-wasm/', import.meta.url)
const read = path => readFileSync(new URL(path, dependencyRoot), 'utf8').replaceAll('\r\n', '\n').trim()

function sourceNotice(path) {
  const match = read(path).match(/^\/\*[\s\S]*?\*\//)
  assert.ok(match, `Missing upstream notice in hash-wasm/${path}`)
  return match[0]
}

export function thirdPartyNoticesHtml() {
  const { version } = JSON.parse(read('package.json'))
  const helpers = read('dist/index.esm.js').match(/\/\*\*+\nCopyright \(c\) Microsoft Corporation\.[\s\S]*?\*\//)
  assert.ok(helpers, 'Missing bundled Microsoft helper notice in hash-wasm')
  const notices = [
    'Third-party software notices',
    `hash-wasm ${version} — https://github.com/Daninet/hash-wasm`,
    'The application bundles hash-wasm JavaScript and Argon2/BLAKE2b WebAssembly.',
    'hash-wasm/LICENSE:',
    read('LICENSE'),
    'Microsoft helper notice from hash-wasm/dist/index.esm.js:',
    helpers[0],
    'Argon2 attribution from hash-wasm/src/argon2.c:',
    sourceNotice('src/argon2.c'),
    readFileSync(new URL('./licenses/go-crypto-LICENSE.txt', import.meta.url), 'utf8').trim(),
    'BLAKE2b notice from hash-wasm/src/blake2b.c:',
    sourceNotice('src/blake2b.c'),
    'The embedded BLAKE2b reference implementation is used under its offered CC0 option.',
  ].join('\n\n')
  assert.ok(!notices.includes('--'), 'Notices must be safe to embed in an HTML comment')
  return `<!--\n${notices}\n-->`
}

export function checkArtifactNotices(html) {
  assert.ok(html.includes(thirdPartyNoticesHtml()), 'The artifact must retain the complete bundled third-party notices')
}
