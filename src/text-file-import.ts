/** Limits apply before reading files or starting any password work. */
export const MAX_TEXT_FILE_BYTES = 1_048_576
export const MAX_DECRYPT_INPUTS = 20
export const MAX_TEXT_BATCH_BYTES = 5 * MAX_TEXT_FILE_BYTES
export const MAX_DISPLAY_FILENAME_CHARACTERS = 120

type FileSize = Pick<File, 'size'>
type ReadableTextFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>

export interface ImportedTextFile {
  name: string
  text: string
  byteLength: number
}

/** A display label only: callers must still insert it using textContent. */
export function safeFileName(name: string): string {
  // A supplied File name is normally a basename, but never display a path even
  // for synthetic Files. Remove control/format characters, including bidi
  // overrides, isolates, zero-width characters, and line/paragraph separators.
  const basename = name.split(/[\\/]/).at(-1) ?? ''
  const cleaned = basename.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, '').trim()
  if (!cleaned || /^\.+$/.test(cleaned))
    return 'Text file'
  const characters = Array.from(cleaned)
  return characters.length > MAX_DISPLAY_FILENAME_CHARACTERS
    ? `${characters.slice(0, MAX_DISPLAY_FILENAME_CHARACTERS - 1).join('')}…`
    : cleaned
}

function validateFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error('This file has an invalid size.')
  if (size > MAX_TEXT_FILE_BYTES)
    throw new Error('Each text file must be no larger than 1 MiB.')
  if (size === 0)
    throw new Error('This text file is empty.')
}

/** Validate the whole selection before reading; existing totals include reservations. */
export function validateTextFileBatch(
  files: readonly FileSize[],
  existingCount = 0,
  existingBytes = 0,
): void {
  if (!Number.isSafeInteger(existingCount) || existingCount < 0
    || !Number.isSafeInteger(existingBytes) || existingBytes < 0)
    throw new Error('The current input limits could not be checked.')
  if (existingCount + files.length > MAX_DECRYPT_INPUTS)
    throw new Error('Use no more than 20 inputs at a time.')
  let total = existingBytes
  if (total > MAX_TEXT_BATCH_BYTES)
    throw new Error('The combined text files must be no larger than 5 MiB.')
  for (const file of files) {
    validateFileSize(file.size)
    total += file.size
    if (total > MAX_TEXT_BATCH_BYTES)
      throw new Error('The combined text files must be no larger than 5 MiB.')
  }
}

/**
 * Decode local bytes with no replacement characters, trimming, normalization,
 * or newline rewriting. UTF-16 requires its BOM; otherwise bytes must be UTF-8.
 * This validates text, not the encrypted payload. Check the decoded ciphertext
 * with the same payload validator used for pasted inputs before accepting it.
 */
export function decodeTextFile(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  validateFileSize(bytes.byteLength)
  let encoding = 'utf-8'
  let offset = 0
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    offset = 3
  }
  else if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    encoding = 'utf-16le'
    offset = 2
  }
  else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    encoding = 'utf-16be'
    offset = 2
  }
  let text: string
  try {
    // We removed exactly one BOM ourselves. ignoreBOM preserves any subsequent
    // U+FEFF in the actual text rather than silently removing a second one.
    text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(offset))
  }
  catch {
    throw new Error('Use a UTF-8 text file, or a UTF-16 text file with a byte-order mark.')
  }
  // Keep ordinary tab/CR/LF exactly; all other C0/C1 controls identify content
  // unsuitable for this text-only import. Never try to repair binary content.
  for (const character of text) {
    const point = character.codePointAt(0)!
    if ((point < 0x20 && point !== 0x09 && point !== 0x0A && point !== 0x0D)
      || (point >= 0x7F && point <= 0x9F))
      throw new Error('This file contains binary data or unsupported control characters. Choose a text file.')
  }
  if (!text.trim())
    throw new Error('This text file is empty or contains only whitespace.')
  return text
}

/** Read only the selected local File; do not use MIME type or suffix as proof of text. */
export async function readTextFile(file: ReadableTextFile): Promise<ImportedTextFile> {
  validateFileSize(file.size)
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  }
  catch {
    throw new Error('This file could not be read. Try selecting it again.')
  }
  // A real File is immutable. This check also keeps mocked/custom sources from
  // bypassing the size reserved by the UI before an asynchronous read.
  if (bytes.byteLength !== file.size)
    throw new Error('The file size changed while reading. Try selecting it again.')
  return { name: safeFileName(file.name), text: decodeTextFile(bytes), byteLength: bytes.byteLength }
}
