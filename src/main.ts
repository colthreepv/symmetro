import './index.css'
import { decryptText, encryptText } from './crypto.js'
import { DERIVATION_VERSION, MAX_PASSWORD_INDEX, nextPasswordIndex, parsePasswordIndex, validateSecret } from './derive-input.ts'
import DeriveWorker from './derive.worker?worker&inline'

type Mode = 'encrypt' | 'decrypt' | 'derive'
type ValueElement = HTMLInputElement | HTMLTextAreaElement
const modes: Mode[] = ['encrypt', 'decrypt', 'derive']
const fields: Record<Mode, { input: string, secret: string, output: string, button: string, label: string }> = {
  encrypt: { input: 'encrypt-text', secret: 'secret', output: 'encrypted-text', button: 'encrypt-button', label: 'Encrypt message' },
  decrypt: { input: 'decrypt-text', secret: 'decrypt-secret', output: 'decrypted-text', button: 'decrypt-button', label: 'Decrypt message' },
  derive: { input: 'derive-index', secret: 'derive-secret', output: 'derived-password', button: 'derive-button', label: 'Generate password' },
}
function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value)
    throw new Error(`Missing interface element: ${id}`)
  return value as T
}
const valueElement = (id: string) => element<ValueElement>(id)
let activeMode: Mode = 'encrypt'
let revision = 0
let busy = false
let currentWorker: { worker: Worker, reject: (reason: Error) => void } | undefined
const supported = Boolean(globalThis.crypto?.subtle)

function setStatus(mode: Mode, message = '', error = false): void {
  const target = element(`${mode}-status`)
  target.textContent = message
  target.dataset.error = String(error)
}
function setBusy(mode: Mode, pending: boolean): void {
  busy = pending
  const button = element<HTMLButtonElement>(fields[mode].button)
  button.setAttribute('aria-busy', String(pending))
  button.firstChild!.textContent = pending ? 'Working… ' : `${fields[mode].label} `
  updateButtons()
}
function updateButtons(): void {
  for (const mode of modes) {
    const config = fields[mode]
    const missing = !valueElement(config.secret).value || (mode !== 'encrypt' && !valueElement(config.input).value)
    element<HTMLButtonElement>(config.button).disabled = !supported || missing || (busy && mode === activeMode)
    const copy = document.querySelector<HTMLButtonElement>(`[data-copy="${config.output}"]`)!
    // An empty decrypted message is still a valid result; use data-ready.
    copy.disabled = valueElement(config.output).dataset.ready !== 'true'
  }
  const hasDerived = valueElement('derived-password').dataset.ready === 'true'
  element<HTMLButtonElement>('next-password').disabled = busy || !hasDerived || valueElement('derive-index').value === MAX_PASSWORD_INDEX
  document.querySelector<HTMLButtonElement>('[data-reveal="derived-password"]')!.disabled = !hasDerived
}
function hideSecret(id: string): void {
  const input = element<HTMLInputElement>(id)
  input.type = 'password'
  const toggle = document.querySelector<HTMLButtonElement>(`[data-reveal="${id}"]`)!
  toggle.textContent = id === 'derived-password' ? 'Show password' : 'Show'
  toggle.setAttribute('aria-pressed', 'false')
  toggle.setAttribute('aria-label', id === 'derive-secret' ? 'Show secret text' : id === 'derived-password' ? 'Show generated password' : 'Show password')
}
function clearOutput(mode: Mode): void {
  const output = valueElement(fields[mode].output)
  output.value = ''
  delete output.dataset.ready
  const copy = document.querySelector<HTMLButtonElement>(`[data-copy="${fields[mode].output}"]`)!
  copy.textContent = 'Copy ⧉'
  if (mode === 'derive')
    hideSecret('derived-password')
}
function invalidate(): void {
  revision += 1
  if (currentWorker) {
    const job = currentWorker
    currentWorker = undefined
    job.worker.terminate()
    job.reject(new DOMException('Operation cancelled', 'AbortError'))
  }
  for (const mode of modes)
    setBusy(mode, false)
}
function resetMode(mode: Mode): void {
  const config = fields[mode]
  valueElement(config.input).value = mode === 'derive' ? '1' : ''
  valueElement(config.secret).value = ''
  hideSecret(config.secret)
  clearOutput(mode)
  setStatus(mode)
  if (mode === 'derive')
    element('derived-label').textContent = 'Password #1'
}
function clearAll(): void {
  invalidate()
  modes.forEach(resetMode)
  element('encrypt-count').textContent = '0 characters'
  updateButtons()
}
function selectMode(mode: Mode, focus = false, updateHash = true): void {
  if (activeMode !== mode)
    clearAll()
  activeMode = mode
  for (const item of modes) {
    const selected = item === mode
    element(`panel-${item}`).hidden = !selected
    const tab = element<HTMLButtonElement>(`tab-${item}`)
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
  }
  if (updateHash && window.location.hash !== `#${mode}`)
    window.location.hash = mode
  if (focus)
    element(`tab-${mode}`).focus()
  updateButtons()
}
function readHash(): Mode {
  const hash = window.location.hash.slice(1)
  return modes.includes(hash as Mode) ? hash as Mode : 'encrypt'
}
function encodePayload(bytes: Uint8Array): string {
  let binary = ''
  // Chunking avoids call-stack limits for larger messages.
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}
function decodePayload(text: string): Uint8Array {
  const compact = text.replace(/\s/g, '')
  if (!compact || !/^[A-Z0-9+/]*={0,2}$/i.test(compact))
    throw new Error('invalid payload')
  const binary = atob(compact)
  if (binary.length < 44)
    throw new Error('invalid payload')
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
function deriveInWorker(secret: string, index: string, version: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new DeriveWorker()
    currentWorker = { worker, reject }
    const settle = () => {
      worker.terminate()
      if (currentWorker?.worker === worker)
        currentWorker = undefined
    }
    worker.onmessage = (event: MessageEvent<{ password?: string, error?: string }>) => {
      settle()
      if (event.data.error)
        reject(new Error(event.data.error))
      else if (typeof event.data.password === 'string')
        resolve(event.data.password)
      else
        reject(new Error('This browser could not generate a password.'))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      settle()
      reject(new Error('Password generation could not start. Try a current browser with Web Crypto and WebAssembly support.'))
    }
    worker.onmessageerror = () => {
      settle()
      reject(new Error('The browser could not read the generated password. Please try again.'))
    }
    try {
      worker.postMessage({ secret, index, version })
    }
    catch {
      settle()
      reject(new Error('Password generation could not start in this browser.'))
    }
  })
}
async function run(mode: Mode): Promise<void> {
  if (busy || activeMode !== mode)
    return
  invalidate()
  clearOutput(mode)
  setStatus(mode)
  const token = revision
  const config = fields[mode]
  const secret = valueElement(config.secret).value
  const input = valueElement(config.input).value
  if (!secret) {
    setStatus(mode, mode === 'derive' ? 'Enter your secret text.' : 'Enter a password.', true)
    updateButtons()
    return
  }
  try {
    if (!supported)
      throw new Error('This browser does not provide Web Crypto. Use a current browser.')
    if (mode === 'derive') {
      validateSecret(secret)
      parsePasswordIndex(input)
      if (Number(element<HTMLSelectElement>('derive-version').value) !== DERIVATION_VERSION)
        throw new Error('Unsupported recipe version.')
    }
    setBusy(mode, true)
    setStatus(mode, mode === 'derive' ? 'Deriving locally. This may take a moment…' : 'Working locally…')
    let result: string
    if (mode === 'encrypt')
      result = encodePayload(await encryptText(input, secret))
    else if (mode === 'decrypt')
      result = await decryptText(decodePayload(input), secret)
    else
      result = await deriveInWorker(secret, input, DERIVATION_VERSION)
    if (token !== revision || activeMode !== mode)
      return
    const output = valueElement(config.output)
    output.value = result
    output.dataset.ready = 'true'
    if (mode === 'derive')
      element('derived-label').textContent = `Password #${input}`
    setStatus(mode, mode === 'encrypt' ? 'Message encrypted. Keep the password separate.' : mode === 'decrypt' ? 'Message decrypted.' : `Password #${input} generated with recipe v1.`)
  }
  catch (error) {
    if (token !== revision || activeMode !== mode)
      return
    const message = mode === 'decrypt' ? 'Could not decrypt. Check the password and the complete encrypted text.' : error instanceof Error ? error.message : 'Something went wrong. Please try again.'
    setStatus(mode, message, true)
  }
  finally {
    if (token === revision && activeMode === mode)
      setBusy(mode, false)
  }
}
async function copyResult(button: HTMLButtonElement): Promise<void> {
  const output = valueElement(button.dataset.copy!)
  if (output.dataset.ready !== 'true')
    return
  const token = revision
  const mode = activeMode
  const text = output.value
  let copied = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      copied = true
    }
  }
  catch { /* file:// or clipboard permission may need the selection fallback below */ }
  if (token !== revision || mode !== activeMode)
    return
  if (!copied) {
    // Use a temporary textarea so password-type fields can also be copied.
    const fallback = document.createElement('textarea')
    fallback.value = text
    fallback.setAttribute('aria-label', 'Copy result')
    fallback.style.cssText = 'position:fixed;left:-10000px;top:0'
    document.body.append(fallback)
    fallback.select()
    try {
      copied = document.execCommand('copy')
    }
    catch { copied = false }
    fallback.value = ''
    fallback.remove()
    button.focus()
  }
  if (copied) {
    button.textContent = 'Copied ✓'
    setStatus(mode, 'Copied. Your clipboard or clipboard history may keep a copy.')
  }
  else {
    if (output instanceof HTMLInputElement && output.type === 'password') {
      output.type = 'text'
      const reveal = document.querySelector<HTMLButtonElement>(`[data-reveal="${output.id}"]`)!
      reveal.textContent = 'Hide password'
      reveal.setAttribute('aria-pressed', 'true')
      reveal.setAttribute('aria-label', 'Hide generated password')
    }
    output.focus()
    output.select()
    setStatus(mode, 'Automatic copy is unavailable. The result is selected; use your device’s Copy command.')
  }
}

for (const mode of modes) {
  element<HTMLFormElement>(`${mode}-form`).addEventListener('submit', (event) => {
    event.preventDefault()
    void run(mode)
  })
  element(`panel-${mode}`).querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([readonly]), textarea:not([readonly]), select').forEach((input) => {
    input.addEventListener('input', () => {
      invalidate()
      clearOutput(mode)
      setStatus(mode)
      if (mode === 'encrypt') {
        const count = valueElement('encrypt-text').value.length
        element('encrypt-count').textContent = `${count.toLocaleString('en')} character${count === 1 ? '' : 's'}`
      }
      if (mode === 'derive')
        element('derived-label').textContent = `Password #${valueElement('derive-index').value || '—'}`
      updateButtons()
    })
  })
  element(`tab-${mode}`).addEventListener('click', () => selectMode(mode))
  element(`tab-${mode}`).addEventListener('keydown', (event) => {
    const index = modes.indexOf(mode)
    const target = event.key === 'ArrowRight' ? modes[(index + 1) % modes.length] : event.key === 'ArrowLeft' ? modes[(index + modes.length - 1) % modes.length] : event.key === 'Home' ? modes[0] : event.key === 'End' ? modes[modes.length - 1] : undefined
    if (target) {
      event.preventDefault()
      selectMode(target, true)
    }
  })
}
document.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = element<HTMLInputElement>(button.dataset.reveal!)
    const show = input.type === 'password'
    input.type = show ? 'text' : 'password'
    button.textContent = input.id === 'derived-password' ? `${show ? 'Hide' : 'Show'} password` : show ? 'Hide' : 'Show'
    button.setAttribute('aria-pressed', String(show))
    button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${input.id === 'derive-secret' ? 'secret text' : input.id === 'derived-password' ? 'generated password' : 'password'}`)
  })
})
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => button.addEventListener('click', () => {
  void copyResult(button)
}))
document.querySelectorAll<HTMLButtonElement>('[data-clear]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.clear as Mode
  invalidate()
  resetMode(mode)
  element('encrypt-count').textContent = '0 characters'
  updateButtons()
  valueElement(mode === 'derive' ? 'derive-secret' : fields[mode].input).focus()
  setStatus(mode, 'Fields cleared.')
}))
element('clear-session').addEventListener('click', () => {
  clearAll()
  valueElement(activeMode === 'derive' ? 'derive-secret' : fields[activeMode].input).focus()
  setStatus(activeMode, 'All fields cleared. Clipboard contents are unchanged.')
})
element('next-password').addEventListener('click', () => {
  if (busy)
    return
  try {
    valueElement('derive-index').value = nextPasswordIndex(valueElement('derive-index').value)
    void run('derive')
  }
  catch (error) {
    setStatus('derive', error instanceof Error ? error.message : 'Invalid password number.', true)
  }
})
element('derive-secret').addEventListener('paste', (event) => {
  if (event instanceof ClipboardEvent && /[\r\n]/.test(event.clipboardData?.getData('text') ?? '')) {
    event.preventDefault()
    invalidate()
    clearOutput('derive')
    updateButtons()
    setStatus('derive', 'Use single-line secret text. Line breaks were not pasted, so your secret was not silently changed.', true)
  }
})
element('derive-secret').addEventListener('drop', (event) => {
  if (event instanceof DragEvent && /[\r\n]/.test(event.dataTransfer?.getData('text') ?? '')) {
    event.preventDefault()
    invalidate()
    clearOutput('derive')
    updateButtons()
    setStatus('derive', 'Use single-line secret text. Text containing line breaks was not inserted.', true)
  }
})
window.addEventListener('hashchange', () => selectMode(readHash(), false, false))
window.addEventListener('pagehide', clearAll)
window.addEventListener('pageshow', (event) => {
  if (event.persisted)
    clearAll()
})
element('version-text').textContent = `v${__APP_VERSION__}`
if (!supported) {
  const warning = element('capability-warning')
  warning.hidden = false
  warning.textContent = 'This browser does not provide Web Crypto. Open the downloaded file in a current browser to use these tools.'
}
clearAll()
selectMode(readHash(), false, false)
