import './index.css'
import { DecryptWorkspace } from './decrypt-workspace.ts'
import { encryptText } from './crypto.js'
import { DERIVATION_VERSION, MAX_PASSWORD_INDEX, nextPasswordIndex, parsePasswordIndex, validateSecret } from './derive-input.ts'
import DeriveWorker from './derive.worker?worker&inline'

type Mode = 'encrypt' | 'decrypt' | 'derive'
type TextMode = Exclude<Mode, 'derive'>
type ValueElement = HTMLInputElement | HTMLTextAreaElement
const modes: Mode[] = ['encrypt', 'decrypt', 'derive']
const fields: Record<Mode, { input: string, secret: string, output: string, button: string, label: string }> = {
  encrypt: { input: 'encrypt-text', secret: 'secret', output: 'encrypted-text', button: 'encrypt-button', label: 'Encrypt' },
  decrypt: { input: 'decrypt-text', secret: 'decrypt-secret', output: 'decrypted-text', button: 'decrypt-button', label: 'Show Clear Text' },
  derive: { input: 'derive-index', secret: 'derive-secret', output: 'derived-password', button: 'derive-button', label: 'Generate' },
}
function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value)
    throw new Error(`Missing interface element: ${id}`)
  return value as T
}
const valueElement = (id: string) => element<ValueElement>(id)
let activeMode: Mode = 'encrypt'
let lastTextMode: TextMode = 'encrypt'
let revision = 0
let busy = false
let derivedPassword = ''
let currentWorker: { worker: Worker, reject: (reason: Error) => void } | undefined
const supported = Boolean(globalThis.crypto?.subtle)

const decryptWorkspace = new DecryptWorkspace({
  supported,
  changed: () => { invalidate(); clearOutput('decrypt'); setStatus('decrypt'); updateButtons() },
  status: (message, error = false) => setStatus('decrypt', message, error),
  button: state => setButtonState('decrypt', state),
  copy: button => { void copyResult(button) },
})

function setStatus(mode: Mode, message = '', error = false): void {
  const target = element(`${mode}-status`)
  target.textContent = message
  target.dataset.error = String(error)
  if (error)
    setButtonState(mode, 'error')
}
function setButtonState(mode: Mode, state: 'idle' | 'pending' | 'success' | 'error'): void {
  const button = element<HTMLButtonElement>(fields[mode].button)
  button.dataset.state = state
  button.querySelector('.button-label')!.textContent = fields[mode].label
  const icon = button.querySelector<HTMLElement>('.button-icon')!
  icon.textContent = state === 'pending' ? '' : state === 'success' ? '✓' : state === 'error' ? '!' : '→'
  icon.classList.toggle('spinner', state === 'pending')
  button.title = state === 'pending' ? 'Working…' : state === 'success' ? 'Completed' : state === 'error' ? 'Check the error below' : fields[mode].label
}
function setBusy(mode: Mode, pending: boolean): void {
  busy = pending
  const button = element<HTMLButtonElement>(fields[mode].button)
  button.setAttribute('aria-busy', String(pending))
  if (pending)
    setButtonState(mode, 'pending')
  updateButtons()
}
function updateButtons(): void {
  for (const mode of modes) {
    if (mode === 'decrypt') {
      decryptWorkspace.updateButton()
      continue
    }
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
  toggle.textContent = 'Show'
  toggle.setAttribute('aria-pressed', 'false')
  toggle.setAttribute('aria-label', id === 'derive-secret' ? 'Show secret text' : id === 'derived-password' ? 'Show generated password' : 'Show password')
}
function clearOutput(mode: Mode): void {
  if (mode === 'decrypt') { decryptWorkspace.clearOutput(); return }
  const output = valueElement(fields[mode].output)
  output.value = ''
  delete output.dataset.ready
  const copy = document.querySelector<HTMLButtonElement>(`[data-copy="${fields[mode].output}"]`)!
  copy.textContent = 'Copy'
  if (mode === 'derive') {
    derivedPassword = ''
    hideSecret('derived-password')
  }
}
function updateDerivedDisplay(): void {
  const selected = document.querySelector<HTMLInputElement>('input[name="derive-length"]:checked')!
  const length = Number(selected.value)
  element('derived-length').textContent = `${length} characters · base64url`
  valueElement('derived-password').value = derivedPassword.slice(0, length)
  document.querySelector<HTMLButtonElement>('[data-copy="derived-password"]')!.textContent = 'Copy'
}
function invalidate(): void {
  revision += 1
  decryptWorkspace.invalidate()
  if (currentWorker) {
    const job = currentWorker
    currentWorker = undefined
    job.worker.terminate()
    job.reject(new DOMException('Operation cancelled', 'AbortError'))
  }
  for (const mode of modes) {
    setBusy(mode, false)
    setButtonState(mode, 'idle')
  }
}
function resetMode(mode: Mode): void {
  if (mode === 'decrypt') {
    decryptWorkspace.reset()
    valueElement('decrypt-secret').value = ''
    hideSecret('decrypt-secret')
    setStatus(mode)
    return
  }
  const config = fields[mode]
  valueElement(config.input).value = mode === 'derive' ? '1' : ''
  valueElement(config.secret).value = ''
  hideSecret(config.secret)
  clearOutput(mode)
  setStatus(mode)
  if (mode === 'derive') {
    element('derived-label').textContent = 'Password #1'
    document.querySelector<HTMLInputElement>('input[name="derive-length"][value="43"]')!.checked = true
    updateDerivedDisplay()
  }
}
function clearAll(): void {
  invalidate()
  modes.forEach(resetMode)
  element('encrypt-count').textContent = '0 characters'
  updateButtons()
}
function selectMode(mode: Mode, updateHash = true): void {
  if (activeMode !== mode)
    clearAll()
  activeMode = mode
  if (mode !== 'derive')
    lastTextMode = mode
  const textSelected = mode !== 'derive'
  element('panel-text').hidden = !textSelected
  const textTab = element<HTMLButtonElement>('tab-text')
  textTab.setAttribute('aria-selected', String(textSelected))
  textTab.tabIndex = textSelected ? 0 : -1
  for (const item of modes) {
    element(`panel-${item}`).hidden = item !== mode
    const selected = item === 'derive' ? mode === 'derive' : item === lastTextMode
    const tab = element<HTMLButtonElement>(`tab-${item}`)
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
  }
  if (updateHash && window.location.hash !== `#${mode}`)
    window.location.hash = mode
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
  if (activeMode !== mode) return
  if (mode === 'decrypt') { await decryptWorkspace.show(); return }
  if (busy) return
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
    setStatus(mode, mode === 'derive' ? 'Deriving…' : 'Encrypting…')
    let result: string
    if (mode === 'encrypt')
      result = encodePayload(await encryptText(input, secret))
    else
      result = await deriveInWorker(secret, input, DERIVATION_VERSION)
    if (token !== revision || activeMode !== mode)
      return
    const output = valueElement(config.output)
    output.value = result
    output.dataset.ready = 'true'
    if (mode === 'derive') {
      derivedPassword = result
      updateDerivedDisplay()
      element('derived-label').textContent = `Password #${input}`
    }
    setButtonState(mode, 'success')
    setStatus(mode, mode === 'encrypt' ? 'Encrypted.' : 'Generated.')
  }
  catch (error) {
    if (token !== revision || activeMode !== mode)
      return
    const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
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
  if (token !== revision || mode !== activeMode || text !== output.value)
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
    button.textContent = 'Copied.'
    setStatus(mode, 'Copied.')
  }
  else {
    if (output instanceof HTMLInputElement && output.type === 'password') {
      output.type = 'text'
      const reveal = document.querySelector<HTMLButtonElement>(`[data-reveal="${output.id}"]`)!
      reveal.textContent = 'Hide'
      reveal.setAttribute('aria-pressed', 'true')
      reveal.setAttribute('aria-label', 'Hide generated password')
    }
    output.focus()
    output.select()
    setStatus(mode, 'Automatic copy is unavailable. The result is selected; use your device’s Copy command.', true)
  }
}

for (const mode of modes) {
  element<HTMLFormElement>(`${mode}-form`).addEventListener('submit', (event) => {
    event.preventDefault()
    void run(mode)
  })
  if (mode === 'decrypt') continue
  element(`panel-${mode}`).querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([readonly]):not([name="derive-length"]), textarea:not([readonly]), select').forEach((input) => {
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
}
document.querySelectorAll<HTMLInputElement>('input[name="derive-length"]').forEach((input) => {
  input.addEventListener('change', () => {
    updateDerivedDisplay()
    if (derivedPassword)
      setStatus('derive')
  })
})
// Each list has its own roving tab stop and automatic activation.
for (const ids of [['tab-text', 'tab-derive'], ['tab-encrypt', 'tab-decrypt']]) {
  const activate = (id: string, focus = false) => {
    const mode = id === 'tab-text' ? lastTextMode : id.slice(4) as Mode
    selectMode(mode)
    if (focus)
      element(id).focus()
  }
  ids.forEach((id, index) => {
    const tab = element<HTMLButtonElement>(id)
    tab.addEventListener('click', () => activate(id))
    tab.addEventListener('keydown', (event) => {
      const target = event.key === 'ArrowRight' ? ids[(index + 1) % ids.length] : event.key === 'ArrowLeft' ? ids[(index + ids.length - 1) % ids.length] : event.key === 'Home' ? ids[0] : event.key === 'End' ? ids[ids.length - 1] : undefined
      if (target) {
        event.preventDefault()
        activate(target, true)
      }
    })
  })
}

function setTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme
  const toggle = element<HTMLButtonElement>('theme-toggle')
  toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode'
  toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
}
setTheme('dark')
element('theme-toggle').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
})
// Delegate focus styling so dynamically revealed decrypt results behave identically.
document.addEventListener('pointerdown', event => {
  const output = event.target
  if ((output instanceof HTMLInputElement || output instanceof HTMLTextAreaElement) && output.readOnly)
    output.dataset.pointerFocus = 'true'
})
document.addEventListener('focusout', event => {
  const output = event.target
  if (output instanceof HTMLInputElement || output instanceof HTMLTextAreaElement)
    delete output.dataset.pointerFocus
})
document.addEventListener('keydown', () => {
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[readonly], textarea[readonly]').forEach(output => delete output.dataset.pointerFocus)
}, true)
document.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = element<HTMLInputElement>(button.dataset.reveal!)
    const show = input.type === 'password'
    input.type = show ? 'text' : 'password'
    button.textContent = show ? 'Hide' : 'Show'
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
  setStatus(mode, 'Cleared.')
}))
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
window.addEventListener('hashchange', () => selectMode(readHash(), false))
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
selectMode(readHash(), false)
