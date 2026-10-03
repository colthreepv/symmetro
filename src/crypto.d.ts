export function generateKey(secret: string): Promise<{ key: CryptoKey, salt: Uint8Array }>
export function encryptText(text: string, password: string): Promise<Uint8Array>
export function decryptText(encryptedData: Uint8Array, password: string): Promise<string>
