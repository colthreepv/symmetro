/** This identifier freezes every byte-level rule in the v1 recipe. */
export const DERIVATION_VERSION = 1
export const MAX_PASSWORD_INDEX = '18446744073709551615'
export const MAX_SECRET_BYTES = 1_048_576

const MAX_INDEX = 0xFFFF_FFFF_FFFF_FFFFn

/** Reject ambiguous index spellings rather than silently rewriting them. */
export function parsePasswordIndex(index: string): bigint {
  if (typeof index !== 'string' || !/^[1-9]\d{0,19}$/.test(index)) {
    throw new Error('Password number must be a positive decimal integer without leading zeros.')
  }
  const value = BigInt(index)
  if (value > MAX_INDEX) {
    throw new Error(`Password number must not exceed ${MAX_PASSWORD_INDEX}.`)
  }
  return value
}

export function nextPasswordIndex(index: string): string {
  const value = parsePasswordIndex(index)
  if (value === MAX_INDEX) {
    throw new Error('This is the last supported password number.')
  }
  return String(value + 1n)
}

/** Exact UTF-8: no trimming, case folding, normalization, or newline rewriting. */
export function validateSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('Enter your secret text.')
  }
  // Every well-formed UTF-16 code unit requires at least one UTF-8 byte.
  // Bound validation work before walking an oversized pasted string.
  if (secret.length > MAX_SECRET_BYTES) {
    throw new Error('Secret text must not exceed 1 MiB of UTF-8 data.')
  }
  // TextEncoder replaces unpaired UTF-16 surrogates. Reject them to avoid
  // silently mapping distinct invalid inputs to the same byte sequence.
  for (let i = 0; i < secret.length; i += 1) {
    const unit = secret.charCodeAt(i)
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = secret.charCodeAt(i + 1)
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        throw new Error('Secret text contains an invalid Unicode character.')
      }
      i += 1
    }
    else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      throw new Error('Secret text contains an invalid Unicode character.')
    }
  }
  // Check exact UTF-8 byte length without allocating an extra secret buffer.
  let bytes = 0
  for (const character of secret) {
    const point = character.codePointAt(0)!
    bytes += point <= 0x7F ? 1 : point <= 0x7FF ? 2 : point <= 0xFFFF ? 3 : 4
    if (bytes > MAX_SECRET_BYTES) {
      throw new Error('Secret text must not exceed 1 MiB of UTF-8 data.')
    }
  }
}
