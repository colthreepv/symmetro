import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { deriveCredential } from '../src/derive.ts'
import { parseIdentifier } from '../src/derive-input.ts'
const original = JSON.parse(readFileSync(new URL('./derivation-v1-vectors.json', import.meta.url), 'utf8')) as {secret: string, index: string, expected: string}[]
test('automatic routing reproduces every independent v1 vector', async () => {
  for (const v of original) assert.equal(await deriveCredential(v.secret, v.index), v.expected)
})
test('numeric ambiguity and invalid labels fail explicitly', () => {
  for (const value of ['', '033', '0', '+33', '-33', '3.3', '3e1', '３３', '٣٣', '18446744073709551616', ' car', 'car ', 'a\nb', 'a\u202eb', '\ud800', 'a'.repeat(1025)])
    assert.throws(() => parseIdentifier(value), undefined, JSON.stringify(value))
  assert.equal(parseIdentifier('18446744073709551615').version, 1)
  for (const value of ['car', 'wallet', '🚗', '1️⃣', '👨‍👩‍👧‍👦', 'a'.repeat(1024), '🔑'.repeat(256)]) assert.equal(parseIdentifier(value).version, 2)
  assert.throws(() => parseIdentifier('🔑'.repeat(257)))
})
test('labels reproduce exactly; Unicode and secret bytes remain significant', async () => {
  const secret = 'Public synthetic label test secret'
  const first = await deriveCredential(secret, 'wallet')
  assert.equal(await deriveCredential(secret, 'wallet'), first)
  const labels = ['car', 'wallet', '🚗', '1️⃣', '👨‍👩‍👧‍👦', 'é', 'e\u0301', '❤', '❤️', 'Car']
  const values = await Promise.all(labels.map(label => deriveCredential(secret, label)))
  assert.equal(new Set(values).size, labels.length)
  for (const value of values) assert.match(value, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(await deriveCredential('é', 'wallet'), await deriveCredential('e\u0301', 'wallet'))
})

const labelVectors = JSON.parse(readFileSync(new URL('./label-v2-vectors.json', import.meta.url), 'utf8')) as {secret: string, label: string, expected: string}[]
test('v2 matches independent argon2-cffi and Python HKDF vectors', async () => {
  for (const v of labelVectors) assert.equal(await deriveCredential(v.secret, v.label), v.expected)
})
