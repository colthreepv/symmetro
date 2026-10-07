import assert from 'node:assert/strict'
import { Buffer, File } from 'node:buffer'
import test from 'node:test'
import {
  MAX_DECRYPT_INPUTS,
  MAX_DISPLAY_FILENAME_CHARACTERS,
  MAX_TEXT_BATCH_BYTES,
  MAX_TEXT_FILE_BYTES,
  decodeTextFile,
  readTextFile,
  safeFileName,
  validateTextFileBatch,
} from '../src/text-file-import.ts'

const utf8 = (text: string) => new TextEncoder().encode(text)
const withBom = (bytes: Uint8Array, bom: number[]) => Uint8Array.from([...bom, ...bytes])
function utf16(text: string, bigEndian = false): Uint8Array {
  const bytes = Buffer.from(text, 'utf16le')
  if (bigEndian)
    bytes.swap16()
  return withBom(bytes, bigEndian ? [0xFE, 0xFF] : [0xFF, 0xFE])
}

test('UTF-8 text retains whitespace, Unicode, normalization, and line endings exactly', () => {
  const text = ' \tcafé e\u0301 日本語 🔐\r\nsecond line\nthird line\r '
  assert.equal(decodeTextFile(utf8(text)), text)
  assert.equal(decodeTextFile(utf8(text).buffer), text)
  assert.equal(decodeTextFile(withBom(utf8(text), [0xEF, 0xBB, 0xBF])), text)
})

test('BOM-marked UTF-16 LE and BE preserve text, including surrogate pairs', () => {
  const text = '\tAA==\r\nUnicode 🔐 e\u0301 '
  assert.equal(decodeTextFile(utf16(text)), text)
  assert.equal(decodeTextFile(utf16(text, true)), text)
})

test('decoding removes exactly one leading BOM and preserves all other BOM characters', () => {
  const text = '\uFEFFa\uFEFFb\uFEFF'
  assert.equal(decodeTextFile(withBom(utf8(text), [0xEF, 0xBB, 0xBF])), text)
  assert.equal(decodeTextFile(utf16(text)), text)
  assert.equal(decodeTextFile(utf16(text, true)), text)
})

test('decoding respects a byte view rather than reading bytes outside its range', () => {
  const bytes = new Uint8Array([0, 0x41, 0x41, 0x3D, 0x3D, 0])
  assert.equal(decodeTextFile(bytes.subarray(1, 5)), 'AA==')
})

test('empty and whitespace-only text files are rejected in every supported encoding', () => {
  for (const bytes of [new Uint8Array(), utf8(' \t\r\n'), new Uint8Array([0xEF, 0xBB, 0xBF]),
    utf16(''), utf16('', true), utf16(' \r\n\t'), utf16(' \r\n\t', true)])
    assert.throws(() => decodeTextFile(bytes), /empty|whitespace/)
})

test('malformed UTF-8 is rejected without replacement or lossy decoding', () => {
  for (const bytes of [[0xFF], [0xC0, 0xAF], [0xC2], [0xE2, 0x82], [0xED, 0xA0, 0x80],
    [0xF4, 0x90, 0x80, 0x80], [0xEF, 0xBB], [0xEF, 0xBB, 0xBF, 0xC2]])
    assert.throws(() => decodeTextFile(Uint8Array.from(bytes)), /UTF-8|UTF-16/)
})

test('malformed UTF-16 and UTF-16 without a BOM are rejected', () => {
  for (const bytes of [[0xFF, 0xFE, 0x41], [0xFE, 0xFF, 0x41], [0xFF, 0xFE, 0x00, 0xD8],
    [0xFF, 0xFE, 0x00, 0xDC], [0xFE, 0xFF, 0xD8, 0x00], [0xFE, 0xFF, 0xDC, 0x00]])
    assert.throws(() => decodeTextFile(Uint8Array.from(bytes)), /UTF-8|UTF-16/)
  assert.throws(() => decodeTextFile(Buffer.from('ciphertext', 'utf16le')), /binary|control/)
})

test('binary signatures and every disallowed C0/C1 control are rejected', () => {
  const binaryFiles = [
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG
    [0x50, 0x4B, 0x03, 0x04, 0x00, 0x00], // ZIP
    [0xFF, 0xD8, 0xFF, 0xE0], // JPEG
    [0xFF, 0xFE, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00], // UTF-32 LE
    [0x00, 0x00, 0xFE, 0xFF, 0x00, 0x00, 0x00, 0x41], // UTF-32 BE
  ]
  for (const bytes of binaryFiles)
    assert.throws(() => decodeTextFile(Uint8Array.from(bytes)))
  for (let point = 0; point <= 0x9F; point += 1) {
    if ((point < 0x20 && ![0x09, 0x0A, 0x0D].includes(point)) || point >= 0x7F)
      assert.throws(() => decodeTextFile(utf8(`a${String.fromCodePoint(point)}b`)), /binary|control/)
  }
})

test('per-file byte bounds include BOM bytes and accept the exact maximum', () => {
  assert.equal(MAX_TEXT_FILE_BYTES, 1_048_576)
  const maximum = new Uint8Array(MAX_TEXT_FILE_BYTES).fill(0x41)
  assert.equal(decodeTextFile(maximum).length, MAX_TEXT_FILE_BYTES)
  assert.throws(() => decodeTextFile(new Uint8Array(MAX_TEXT_FILE_BYTES + 1).fill(0x41)), /1 MiB/)
  const withUtf8Bom = maximum.slice()
  withUtf8Bom.set([0xEF, 0xBB, 0xBF])
  assert.equal(decodeTextFile(withUtf8Bom).length, MAX_TEXT_FILE_BYTES - 3)
})

test('batch count and byte limits include existing inputs and pending reservations', () => {
  assert.equal(MAX_DECRYPT_INPUTS, 20)
  assert.equal(MAX_TEXT_BATCH_BYTES, 5 * MAX_TEXT_FILE_BYTES)
  const fullFile = { size: MAX_TEXT_FILE_BYTES }
  assert.doesNotThrow(() => validateTextFileBatch(Array(5).fill(fullFile)))
  assert.throws(() => validateTextFileBatch([...Array(5).fill(fullFile), { size: 1 }]), /5 MiB/)
  assert.doesNotThrow(() => validateTextFileBatch(Array(20).fill({ size: 1 })))
  assert.throws(() => validateTextFileBatch(Array(21).fill({ size: 1 })), /20 inputs/)
  assert.doesNotThrow(() => validateTextFileBatch([{ size: 1 }], 19, MAX_TEXT_BATCH_BYTES - 1))
  assert.throws(() => validateTextFileBatch([{ size: 1 }], 20), /20 inputs/)
  assert.throws(() => validateTextFileBatch([{ size: 1 }], 1, MAX_TEXT_BATCH_BYTES), /5 MiB/)
  assert.throws(() => validateTextFileBatch([], 0, MAX_TEXT_BATCH_BYTES + 1), /5 MiB/)
})

test('invalid metadata and empty or oversized files fail before reading', async () => {
  for (const size of [-1, 0.5, NaN, Infinity, 0, MAX_TEXT_FILE_BYTES + 1]) {
    let reads = 0
    const file = { name: 'bad.txt', size, arrayBuffer: async () => { reads += 1; return new ArrayBuffer(1) } }
    assert.throws(() => validateTextFileBatch([file]))
    await assert.rejects(readTextFile(file))
    assert.equal(reads, 0)
  }
  for (const value of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => validateTextFileBatch([], value), /limits/)
    assert.throws(() => validateTextFileBatch([], 0, value), /limits/)
  }
})

test('display filenames remove paths, controls, bidi, and invalid Unicode without normalizing text', () => {
  assert.equal(safeFileName('C:\\fakepath\\secret.txt'), 'secret.txt')
  assert.equal(safeFileName('../../private/ciphertext.txt'), 'ciphertext.txt')
  assert.equal(safeFileName('a\u0000\n\t\u007F\u0085\u202E\u202D\u202A\u202B\u202C\u2066\u2067\u2068\u2069\u200E\u200F\u2028\u2029\uD800b.txt'), 'ab.txt')
  assert.equal(safeFileName('e\u0301 🔐.txt'), 'e\u0301 🔐.txt')
  for (const name of ['', '/', '\\', '.', '..', '...', '\u202E\u0000', ' \t '])
    assert.equal(safeFileName(name), 'Text file')
  const shortened = safeFileName('🔐'.repeat(200))
  assert.equal(Array.from(shortened).length, MAX_DISPLAY_FILENAME_CHARACTERS)
  assert.equal(shortened, `${'🔐'.repeat(MAX_DISPLAY_FILENAME_CHARACTERS - 1)}…`)
})

test('reading a local File returns decoded exact text, safe name, and source-byte count', async () => {
  const text = ' \tSGVsbG8=\r\n'
  const bytes = utf16(text, true)
  const file = new File([bytes], 'C:\\fakepath\\cipher\u202Etext.txt', { type: 'application/octet-stream' })
  assert.deepEqual(await readTextFile(file), { name: 'ciphertext.txt', text, byteLength: bytes.byteLength })
})

test('file read failures and changed size are reported without leaking supplied paths', async () => {
  await assert.rejects(readTextFile({ name: '/private/secret.txt', size: 1, arrayBuffer: async () => {
    throw new Error('private filesystem details')
  } }), { message: 'This file could not be read. Try selecting it again.' })
  await assert.rejects(readTextFile({ name: 'changed.txt', size: 1, arrayBuffer: async () => new ArrayBuffer(2) }), /size changed/)
})
