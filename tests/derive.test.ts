import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { argon2id } from 'hash-wasm'
import {
  DERIVATION_VERSION,
  MAX_PASSWORD_INDEX,
  MAX_SECRET_BYTES,
  derivePassword,
  nextPasswordIndex,
  parsePasswordIndex,
  validateSecret,
} from '../src/derive.ts'

interface Vector {
  label: string
  version: number
  secret: string
  index: string
  expected: string
}

const vectors: Vector[] = JSON.parse(
  readFileSync(new URL('./derivation-v1-vectors.json', import.meta.url), 'utf8'),
)

test('Argon2id matches the official reference implementation known-answer test', async () => {
  // https://github.com/P-H-C/phc-winner-argon2/blob/master/src/test.c
  const actual = await argon2id({
    password: 'password',
    salt: 'somesalt',
    parallelism: 1,
    iterations: 2,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'hex',
  })
  assert.equal(actual, '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7')
})

test('Web Crypto HKDF-SHA-256 matches RFC 5869 Appendix A.1', async () => {
  const key = await crypto.subtle.importKey('raw', new Uint8Array(22).fill(0x0B), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: Uint8Array.from({ length: 13 }, (_, i) => i),
    info: Uint8Array.from({ length: 10 }, (_, i) => i + 240),
  }, key, 42 * 8)
  assert.equal(Buffer.from(bits).toString('hex'), '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865')
})

for (const vector of vectors) {
  test(`independently verified derivation-v1 vector: ${vector.label}`, async () => {
    const actual = await derivePassword(vector.secret, vector.index, vector.version)
    assert.equal(actual, vector.expected)
    assert.match(actual, /^[\w-]{43}$/)
    assert.equal(Buffer.from(actual, 'base64url').length, 32)
  })
}

test('repeated and concurrent derivations are deterministic and isolated', async () => {
  const first = vectors[0]!
  const second = vectors[1]!
  const results = await Promise.all([
    derivePassword(first.secret, first.index),
    derivePassword(second.secret, second.index),
  ])
  assert.deepEqual(results, [first.expected, second.expected])
  assert.notEqual(results[0], results[1])
})

test('index parsing preserves all 64 bits and next number does not round', () => {
  assert.equal(DERIVATION_VERSION, 1)
  assert.equal(parsePasswordIndex('1'), 1n)
  assert.equal(parsePasswordIndex(MAX_PASSWORD_INDEX), 18446744073709551615n)
  assert.equal(nextPasswordIndex('9007199254740992'), '9007199254740993')
  assert.equal(nextPasswordIndex('1'), '2')
  assert.throws(() => nextPasswordIndex(MAX_PASSWORD_INDEX), /last supported/)
})

test('ambiguous and out-of-range indices are rejected', () => {
  for (const index of ['', '0', '00', '01', '-1', '+1', '1.0', '1e2', ' 1', '1 ', '1\n', '\u0661', '18446744073709551616', '1'.repeat(1000)]) {
    assert.throws(() => parsePasswordIndex(index), /Password number/)
  }
  assert.throws(() => parsePasswordIndex(1 as unknown as string), /Password number/)
})

test('invalid secret text and unsupported versions fail before derivation', async () => {
  for (const secret of ['', '\uD800', '\uDC00', 'a\uD800b', '\uD800\uD800']) {
    assert.throws(() => validateSecret(secret), /secret|Secret/)
  }
  assert.throws(() => validateSecret(undefined as unknown as string), /secret/)
  assert.throws(() => validateSecret('a'.repeat(MAX_SECRET_BYTES + 1)), /1 MiB/)
  assert.throws(() => validateSecret('\u00E9'.repeat(MAX_SECRET_BYTES / 2 + 1)), /1 MiB/)
  assert.doesNotThrow(() => validateSecret('\uD83D\uDD11'))
  assert.doesNotThrow(() => validateSecret(' '))
  assert.doesNotThrow(() => validateSecret('a'.repeat(MAX_SECRET_BYTES)))
  await assert.rejects(derivePassword('synthetic secret', '1', 2), /Unsupported/)
  await assert.rejects(derivePassword('synthetic secret', '0'), /Password number/)
})

test('oversized strings are rejected before the full Unicode scan', () => {
  const oversized = `\uD800${'a'.repeat(MAX_SECRET_BYTES)}`
  assert.throws(() => validateSecret(oversized), /1 MiB/)
})

test('UTF-8 size limit handles supplementary and mixed-width boundary cases exactly', () => {
  const supplementary = '\u{1F511}'.repeat(MAX_SECRET_BYTES / 4)
  // Each repeated group is ten UTF-8 bytes but only five UTF-16 code units.
  const mixed = `${'a\u00E9\u20AC\u{1F511}'.repeat(Math.floor(MAX_SECRET_BYTES / 10))}\u00E9\u{1F511}`
  for (const exact of [supplementary, mixed]) {
    assert.equal(Buffer.byteLength(exact, 'utf8'), MAX_SECRET_BYTES)
    assert.ok(exact.length < MAX_SECRET_BYTES)
    assert.doesNotThrow(() => validateSecret(exact))
    const over = `${exact}a`
    assert.equal(Buffer.byteLength(over, 'utf8'), MAX_SECRET_BYTES + 1)
    assert.ok(over.length < MAX_SECRET_BYTES)
    assert.throws(() => validateSecret(over), /1 MiB/)
  }
})

test('module exposes only the intended public credential and validation API', async () => {
  const exports = await import('../src/derive.ts')
  assert.deepEqual(Object.keys(exports).sort(), [
    'DERIVATION_VERSION',
    'MAX_PASSWORD_INDEX',
    'MAX_SECRET_BYTES',
    'derivePassword',
    'nextPasswordIndex',
    'parsePasswordIndex',
    'validateSecret',
  ].sort())
})
