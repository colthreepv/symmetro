import './index.css'
import { testStrength } from './strength.js'

async function encryptText() {
  const text = document.getElementById('encrypt-text').value
  const secret = document.getElementById('secret').value
  const encrypted = document.getElementById('encrypted-text')

  const encoder = new TextEncoder()
  const secretKey = await generateKey(secret)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = encoder.encode(text)

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    secretKey,
    encoded,
  )

  const encryptedData = new Uint8Array(ciphertext)
  const combinedData = new Uint8Array(iv.length + encryptedData.length)
  combinedData.set(iv)
  combinedData.set(encryptedData, iv.length)

  const base64Encrypted = btoa(String.fromCharCode.apply(null, combinedData))
  encrypted.value = base64Encrypted
}

async function generateKey(secret) {
  const encoder = new TextEncoder()
  const secretBytes = encoder.encode(secret)
  const hash = await crypto.subtle.digest('SHA-256', secretBytes)
  return await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function decryptText(dryRun = false) {
  const text = document.getElementById('decrypt-text').value
  const secret = document.getElementById('decrypt-secret').value
  const decrypted = document.getElementById('decrypted-text')

  const secretKey = await generateKey(secret)

  const encryptedData = atob(text)
  const encryptedBytes = new Uint8Array(encryptedData.length)
  for (let i = 0; i < encryptedData.length; i++)
    encryptedBytes[i] = encryptedData.charCodeAt(i)

  const iv = encryptedBytes.slice(0, 12)
  const ciphertext = encryptedBytes.slice(12)

  const decryptedData = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    secretKey,
    ciphertext,
  )

  const decoder = new TextDecoder()
  const decryptedText = decoder.decode(decryptedData)
  if (!dryRun)
    decrypted.value = decryptedText
}

function colorizePassword() {
  const secret = document.getElementById('decrypt-secret')
  const text = document.getElementById('decrypt-text')
  const validIcon = document.getElementById('decrypt-secret-valid')
  const invalidIcon = document.getElementById('decrypt-secret-invalid')
  const hiddenCls = 'hidden'

  secret.addEventListener('input', async () => {
    if (secret.value.length === 0 || text.value.length === 0) { // neutral outcome
      validIcon.classList.add(hiddenCls)
      invalidIcon.classList.add(hiddenCls)
      return
    }

    let valid = true
    try {
      await decryptText(true)
    }
    catch (error) {
      valid = false
      // throw error
    }

    if (valid) {
      validIcon.classList.remove(hiddenCls)
      invalidIcon.classList.add(hiddenCls)
    }
    else {
      validIcon.classList.add(hiddenCls)
      invalidIcon.classList.remove(hiddenCls)
    }
  })
}

function switchMode() {
  const modeSwitch = document.getElementById('mode-switch')
  const encrypt = document.getElementById('encrypt-box')
  const decrypt = document.getElementById('decrypt-box')

  // cleanup input fields
  const secret = document.getElementById('secret')
  const decryptSecret = document.getElementById('decrypt-secret')
  const text = document.getElementById('encrypt-text')
  const text2 = document.getElementById('decrypt-text')
  const encrypted = document.getElementById('encrypted-text')
  const decrypted = document.getElementById('decrypted-text')
  secret.value = ''
  decryptSecret.value = ''
  encrypted.value = ''
  decrypted.value = ''
  text.value = ''
  text2.value = ''

  encrypt.classList.toggle('hidden')
  decrypt.classList.toggle('hidden')

  if (modeSwitch.checked)
    window.location.hash = 'decrypt'
  else
    window.location.hash = ''
}

function readPageHash() {
  const hash = window.location.hash
  const modeSwitch = document.getElementById('mode-switch')
  if (hash === '#decrypt') {
    modeSwitch.checked = true
    switchMode()
  }
}

function disableButtons() {
  const encryptButton = document.getElementById('encrypt-button')
  const secret = document.getElementById('secret')
  encryptButton.disabled = true
  encryptButton.classList.add('disabled')
  secret.addEventListener('input', () => {
    encryptButton.disabled = secret.value.length === 0
  })

  const decryptButton = document.getElementById('decrypt-button')
  const decryptSecret = document.getElementById('decrypt-secret')
  decryptButton.disabled = true
  decryptSecret.addEventListener('input', () => {
    decryptButton.disabled = decryptSecret.value.length === 0
  })
}

function main() {
  disableButtons()
  const secret = document.getElementById('secret')
  const secretStrength = document.getElementById('secret-strength')
  secret.addEventListener('input', () => {
    const score = testStrength(secret.value)
    secretStrength.textContent = `${score.toFixed(1)}`
  })

  const modeSwitch = document.getElementById('mode-switch')
  modeSwitch.addEventListener('change', switchMode)

  colorizePassword()
  readPageHash()

  window.encryptText = encryptText
  window.decryptText = decryptText
}

void main()