import { argon2id } from 'hash-wasm'
import { DERIVATION_VERSION, parsePasswordIndex, validateSecret } from './derive-input.ts'

export { DERIVATION_VERSION, MAX_PASSWORD_INDEX, MAX_SECRET_BYTES, nextPasswordIndex, parsePasswordIndex, validateSecret } from './derive-input.ts'

const encoder = new TextEncoder()
const ARGON2_SALT = encoder.encode('symmetro:derive:v1:argon2id')
const HKDF_SALT = encoder.encode('symmetro:derive:v1:hkdf')
const INFO_PREFIX = encoder.encode('symmetro:password:v1\0')

function encodeIndex(index: bigint): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, index, false)
  return bytes
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Derive one numbered credential. No intermediate/root key is returned,
 * persisted, logged, cached, or attached to the result. Run in a disposable
 * worker so a long Argon2 calculation cannot block the interface.
 *
 * Wiping owned buffers is best effort: JavaScript strings, WebCrypto internal
 * copies, WASM memory, clipboard history, and browser memory are not erasable
 * with a guarantee. Terminate the worker when a result, error, or cancel occurs.
 */
export async function derivePassword(
  secret: string,
  index: string,
  version: number = DERIVATION_VERSION,
): Promise<string> {
  if (version !== DERIVATION_VERSION) {
    throw new Error('Unsupported password derivation version.')
  }
  const number = parsePasswordIndex(index)
  validateSecret(secret)
  const subtle = globalThis.crypto?.subtle
  if (!subtle || typeof WebAssembly === 'undefined') {
    throw new Error('This browser needs Web Crypto and WebAssembly support.')
  }

  const secretBytes = encoder.encode(secret)
  let root: Uint8Array | undefined
  let output: Uint8Array | undefined
  try {
    root = await argon2id({
      password: secretBytes,
      salt: ARGON2_SALT,
      parallelism: 4,
      iterations: 3,
      memorySize: 65_536,
      hashLength: 32,
      outputType: 'binary',
    })
    const key = await subtle.importKey(
      'raw',
      root as Uint8Array<ArrayBuffer>,
      'HKDF',
      false,
      ['deriveBits'],
    )
    root.fill(0)
    secretBytes.fill(0)

    const info = new Uint8Array(INFO_PREFIX.length + 8)
    info.set(INFO_PREFIX)
    info.set(encodeIndex(number), INFO_PREFIX.length)
    const bits = await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info },
      key,
      256,
    )
    output = new Uint8Array(bits)
    return base64url(output)
  }
  finally {
    secretBytes.fill(0)
    root?.fill(0)
    output?.fill(0)
  }
}
