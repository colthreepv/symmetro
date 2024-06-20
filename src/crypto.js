// pure functions, no side effects
export async function generateKey(secret) {
  const encoder = new TextEncoder()
  const salt = window.crypto.getRandomValues(new Uint8Array(16)) // random salt
  const keyMaterial = encoder.encode(secret)

  const importedKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000, // "sensible" default
      hash: 'SHA-256',
    },
    importedKey,
    { name: 'AES-GCM', length: 256 },
    true, // derived key is not extractable
    ['encrypt', 'decrypt'],
  )

  return { key: derivedKey, salt }
}

export async function encryptText(text, password) {
  const { key, salt } = await generateKey(password)
  const iv = crypto.getRandomValues(new Uint8Array(12)) // Initialization vector
  const encoder = new TextEncoder()
  const encoded = encoder.encode(text)

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encoded,
  )

  // Combine salt, IV, and ciphertext for transmission or storage
  const encryptedData = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  encryptedData.set(salt)
  encryptedData.set(iv, salt.length)
  encryptedData.set(new Uint8Array(ciphertext), salt.length + iv.length)

  return encryptedData
}

export async function decryptText(encryptedData, password) {
  // Extract the salt, iv, and ciphertext from the input data
  const salt = encryptedData.slice(0, 16) // The first 16 bytes are the salt
  const iv = encryptedData.slice(16, 28) // The next 12 bytes are the IV
  const ciphertext = encryptedData.slice(28) // The rest is the ciphertext

  // Derive the key using PBKDF2 with the extracted salt
  const keyMaterial = await getKeyMaterial(password, salt)
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // The derived key is not extractable
    ['decrypt'],
  )

  // Decrypt the ciphertext
  const decryptedData = await window.crypto.subtle
    .decrypt({ name: 'AES-GCM', iv }, key, ciphertext)

  const decoder = new TextDecoder()
  return decoder.decode(decryptedData)
}

// Helper function to import password into key material
async function getKeyMaterial(password) {
  const encoder = new TextEncoder()
  const keyMaterial = encoder.encode(password)
  return window.crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
}
