import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createDecipheriv, pbkdf2Sync, webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { decryptText, encryptText } from '../src/crypto.js'

// The application targets browsers; provide only its Web Crypto dependency.
globalThis.window = { crypto: webcrypto }

const fixture = JSON.parse(await readFile(new URL('./fixtures/legacy-v2.json', import.meta.url), 'utf8'))
const password = 'synthetic test password only'

test('decrypts the fixed legacy v2 payload', async () => {
  assert.equal(await decryptText(Buffer.from(fixture.payload, 'base64'), fixture.password), fixture.text)
})

test('new payloads retain the legacy salt, IV, and authentication-tag layout', async () => {
  const plaintext = 'Legacy format interoperability 🔐'
  const encrypted = Buffer.from(await encryptText(plaintext, password))
  assert.equal(encrypted.length, 16 + 12 + Buffer.byteLength(plaintext) + 16)

  // Decode independently from the application to catch paired format changes.
  const key = pbkdf2Sync(password, encrypted.subarray(0, 16), 100000, 32, 'sha256')
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(16, 28))
  decipher.setAuthTag(encrypted.subarray(-16))
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(28, -16)), decipher.final()])
  assert.equal(decrypted.toString('utf8'), plaintext)
})

for (const [name, plaintext] of [
  ['empty text', ''],
  ['Unicode and line breaks', 'café, Ελληνικά, 日本語, 🔐\nsecond line'],
  ['large text', 'large synthetic text 🔐\n'.repeat(10000)],
]) {
  test(`round trips ${name}`, async () => {
    assert.equal(await decryptText(await encryptText(plaintext, password), password), plaintext)
  })
}

test('generates fresh salts and IVs for repeated encryption', async () => {
  const first = await encryptText('same synthetic text', password)
  const second = await encryptText('same synthetic text', password)
  assert.notDeepEqual(first.subarray(0, 16), second.subarray(0, 16))
  assert.notDeepEqual(first.subarray(16, 28), second.subarray(16, 28))
})

test('rejects the wrong password', async () => {
  await assert.rejects(decryptText(Buffer.from(fixture.payload, 'base64'), 'different synthetic password'))
})

test('rejects modified salt, IV, ciphertext, and authentication tag', async () => {
  for (const offset of [0, 16, 28, Buffer.from(fixture.payload, 'base64').length - 1]) {
    const modified = Buffer.from(fixture.payload, 'base64')
    modified[offset] ^= 1
    await assert.rejects(decryptText(modified, fixture.password))
  }
})

test('rejects truncated payloads', async () => {
  const payload = Buffer.from(fixture.payload, 'base64')
  for (const length of [0, 15, 27, 43, payload.length - 1])
    await assert.rejects(decryptText(payload.subarray(0, length), fixture.password))
})
