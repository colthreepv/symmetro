import './index.css'
import { testStrength } from './strength.js'
import { decryptText, encryptText } from './crypto.js'

async function encryptTextToDom() {
  const text = document.getElementById('encrypt-text').value
  const secret = document.getElementById('secret').value
  const encrypted = document.getElementById('encrypted-text')

  const encryptedData = await encryptText(text, secret)

  const base64Encoded = btoa(String.fromCharCode.apply(null, encryptedData))
  encrypted.value = base64Encoded
}

async function decryptTextToDom(dryRun = false) {
  const text = document.getElementById('decrypt-text').value
  const secret = document.getElementById('decrypt-secret').value
  const decrypted = document.getElementById('decrypted-text')

  const base64Decoded = atob(text)
  const cyphertext = new Uint8Array([...base64Decoded].map(char => char.charCodeAt(0)))

  const decryptedText = await decryptText(cyphertext, secret)
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
      await decryptTextToDom(true)
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

function enterToSubmit() {
  const secret = document.getElementById('secret')
  const decryptSecret = document.getElementById('decrypt-secret')
  const encryptButton = document.getElementById('encrypt-button')
  const decryptButton = document.getElementById('decrypt-button')

  secret.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      encryptButton.click()
    }
  })
  decryptSecret.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      decryptButton.click()
    }
  })
}

function main() {
  disableButtons()
  enterToSubmit()
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

  window.encryptTextToDom = encryptTextToDom
  window.decryptTextToDom = decryptTextToDom
}

void main()
