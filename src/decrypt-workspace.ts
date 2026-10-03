import { decryptText } from './crypto.js'
import { MAX_DECRYPT_INPUTS, readTextFile, safeFileName, validateTextFileBatch } from './text-file-import.ts'

type State = 'idle' | 'pending' | 'valid' | 'invalid'
type Entry = { text: string, fileBytes: number, id: number, input: HTMLTextAreaElement, details: HTMLDetailsElement, validation: HTMLElement, count: HTMLElement }
type Hooks = {
  supported: boolean
  changed: () => void
  status: (message: string, error?: boolean) => void
  button: (state: 'idle' | 'pending' | 'success' | 'error') => void
  copy: (button: HTMLButtonElement) => void
}
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const countText = (text: string) => {
  const count = Array.from(text).length
  return `${count.toLocaleString('en')} character${count === 1 ? '' : 's'}`
}

export class DecryptWorkspace {
  private entries: Entry[] = []
  private nextId = 0
  private revision = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private flight: Promise<void> | undefined
  private queued: number | undefined
  private busy = false
  private dragDepth = 0
  private composing = new Set<EventTarget>()
  private secret = get<HTMLInputElement>('decrypt-secret')
  constructor(private hooks: Hooks) {
    get('add-decrypt-input').addEventListener('click', () => this.add())
    this.secret.addEventListener('input', () => {
      hooks.changed()
      this.schedule(true)
    })
    this.bindComposition(this.secret, true)
    this.bindFileImport()
    this.reset()
  }
  invalidate(): void {
    this.revision++
    clearTimeout(this.timer)
    this.timer = undefined
    this.queued = undefined
    this.busy = false
    const importStatus = get('decrypt-import-status')
    if (importStatus) importStatus.textContent = ''
    for (const entry of this.entries) this.setState(entry, 'idle')
    this.secret.removeAttribute('aria-invalid')
  }
  reset(): void {
    this.invalidate()
    this.composing.clear()
    this.dragDepth = 0
    this.entries = []
    this.nextId = 0
    get('decrypt-inputs').replaceChildren()
    get('decrypt-import-status').textContent = ''
    get<HTMLInputElement>('decrypt-file-picker').value = ''
    get('decrypt-file-drop').dataset.dragging = 'false'
    this.add('', false)
    this.clearOutput()
  }
  add(text = '', notify = true, filename = '', fileBytes = 0): void {
    if (this.entries.length >= MAX_DECRYPT_INPUTS) return
    if (notify) this.hooks.changed()
    this.collapseInputs()
    const id = this.nextId++
    const inputId = id === 0 ? 'decrypt-text' : `decrypt-text-${id}`
    const details = document.createElement('details')
    details.className = 'cipher-input'
    details.open = true
    const summary = document.createElement('summary')
    const title = document.createElement('span')
    title.className = 'entry-title'
    title.textContent = `Input ${this.entries.length + 1}`
    if (filename) {
      const label = document.createElement('span')
      label.className = 'entry-filename'
      label.textContent = filename
      label.title = filename
      title.append(label)
    }
    const count = document.createElement('span')
    count.className = 'field-meta entry-count'
    count.textContent = countText(text)
    const validation = document.createElement('span')
    validation.className = 'password-validation'
    validation.id = id === 0 ? 'decrypt-validation' : `decrypt-validation-${id}`
    validation.setAttribute('role', 'status')
    validation.setAttribute('aria-live', 'polite')
    const icon = document.createElement('span')
    icon.className = 'validation-icon'
    icon.setAttribute('aria-hidden', 'true')
    const description = document.createElement('span')
    description.className = 'sr-only'
    validation.append(icon, description)
    summary.append(title, count, validation)
    const body = document.createElement('div')
    body.className = 'accordion-body'
    const label = document.createElement('label')
    label.htmlFor = inputId
    label.textContent = 'Encrypted text'
    const input = document.createElement('textarea')
    input.id = inputId
    input.className = 'mono'
    input.rows = 7
    input.spellcheck = false
    input.autocomplete = 'off'
    input.setAttribute('aria-describedby', validation.id)
    input.value = text
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'text-button remove-input'
    remove.textContent = 'Remove input'
    body.append(label, input, remove)
    details.append(summary, body)
    const entry = { text, fileBytes, id, input, details, validation, count }
    this.entries.push(entry)
    this.setState(entry, 'idle')
    get('decrypt-inputs').append(details)
    summary.addEventListener('click', () => {
      if (!details.open) for (const other of this.entries) if (other !== entry) other.details.open = false
    })
    input.addEventListener('input', () => {
      this.hooks.changed()
      entry.text = input.value
      count.textContent = countText(input.value)
      this.schedule(false)
    })
    this.bindComposition(input, false)
    remove.addEventListener('click', () => this.remove(entry))
    if (notify) {
      this.updateButton()
      input.focus()
      this.schedule(false)
    }
  }
  private remove(entry: Entry): void {
    const index = this.entries.indexOf(entry)
    this.hooks.changed()
    this.composing.delete(entry.input)
    this.entries.splice(index, 1)
    entry.input.value = ''
    entry.details.remove()
    if (!this.entries.length) this.add('', false)
    this.entries.forEach((item, i) => { item.details.querySelector('.entry-title')!.firstChild!.textContent = `Input ${i + 1}` })
    const next = this.entries[Math.min(index, this.entries.length - 1)]
    this.collapseInputs()
    next.details.open = true
    next.input.focus()
    this.updateButton()
    this.schedule(false)
  }
  private bindComposition(input: HTMLElement, collapse: boolean): void {
    input.addEventListener('compositionstart', () => {
      this.composing.add(input)
      this.hooks.changed()
    })
    input.addEventListener('compositionend', () => {
      this.composing.delete(input)
      this.hooks.changed()
      this.schedule(collapse)
    })
  }
  private collapseInputs(): void { for (const entry of this.entries) entry.details.open = false }
  private setState(entry: Entry, state: State): void {
    const message = state === 'valid' ? 'Password matches' : state === 'invalid' ? 'Password does not match or encrypted text is invalid' : state === 'pending' ? 'Checking password…' : ''
    entry.validation.dataset.state = state
    entry.validation.title = message
    const icon = entry.validation.querySelector<HTMLElement>('.validation-icon')!
    icon.textContent = state === 'valid' ? '✓' : state === 'invalid' ? '×' : ''
    icon.classList.toggle('spinner', state === 'pending')
    entry.validation.querySelector('.sr-only')!.textContent = message ? `Input ${this.entries.indexOf(entry) + 1}: ${message}` : ''
  }
  updateButton(): void {
    get<HTMLButtonElement>('decrypt-button').disabled = !this.hooks.supported || !this.secret.value || !this.entries.some(entry => entry.input.value) || this.busy
    get('decrypt-button').setAttribute('aria-busy', String(this.busy))
    get<HTMLButtonElement>('add-decrypt-input').disabled = this.entries.length >= MAX_DECRYPT_INPUTS
  }
  clearOutput(): void {
    const root = get('decrypt-outputs')
    root.querySelectorAll('textarea').forEach(output => { output.value = '' })
    root.replaceChildren()
    // Keep an empty, non-ready result available before the first explicit reveal.
    const output = document.createElement('textarea')
    output.id = 'decrypted-text'
    output.className = 'result-text'
    output.rows = 10
    output.readOnly = true
    output.setAttribute('aria-label', 'Decrypted text')
    output.placeholder = 'No result yet'
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'copy-button'
    copy.dataset.copy = output.id
    copy.textContent = 'Copy'
    copy.disabled = true
    root.append(copy, output)
  }
  private schedule(collapse: boolean): void {
    if (!this.hooks.supported || this.composing.size || !this.secret.value || !this.entries.some(entry => entry.input.value)) return
    const token = this.revision
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (token !== this.revision) return
      if (collapse && !get('decrypt-inputs').contains(document.activeElement)) this.collapseInputs()
      void this.check(token)
    }, 275)
  }
  private decodePayload(text: string): Uint8Array {
    const compact = text.replace(/\s/g, '')
    if (!compact || !/^[A-Z0-9+/]*={0,2}$/i.test(compact)) throw new Error('This file does not contain complete base64 encrypted text.')
    let binary: string
    try { binary = atob(compact) }
    catch { throw new Error('This file does not contain complete base64 encrypted text.') }
    if (binary.length < 44) throw new Error('This file does not contain complete base64 encrypted text.')
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  }
  private bindFileImport(): void {
    const picker = get<HTMLInputElement>('decrypt-file-picker')
    const zone = get('decrypt-file-drop')
    get('choose-decrypt-files').addEventListener('click', () => picker.click())
    picker.addEventListener('change', () => {
      const files = Array.from(picker.files ?? [])
      picker.value = '' // Selecting the same file again must still dispatch change.
      if (files.length) void this.importFiles(files)
    })
    const isFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files')
    zone.addEventListener('dragenter', event => {
      if (!isFiles(event)) return
      event.preventDefault()
      this.dragDepth++
      zone.dataset.dragging = 'true'
    })
    zone.addEventListener('dragover', event => {
      if (!isFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      zone.dataset.dragging = 'true'
    })
    zone.addEventListener('dragleave', event => {
      if (!isFiles(event)) return
      this.dragDepth = Math.max(0, this.dragDepth - 1)
      if (!this.dragDepth) zone.dataset.dragging = 'false'
    })
    zone.addEventListener('drop', event => {
      if (!isFiles(event)) return
      event.preventDefault()
      this.dragDepth = 0
      zone.dataset.dragging = 'false'
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length) void this.importFiles(files)
    })
    // Files dropped outside the target must never navigate away from the offline app.
    for (const type of ['dragover', 'drop'] as const) {
      document.addEventListener(type, event => {
        if (isFiles(event)) event.preventDefault()
      })
    }
  }
  private async importFiles(files: File[]): Promise<void> {
    this.hooks.changed()
    const token = this.revision
    const status = get('decrypt-import-status')
    status.textContent = 'Reading local files…'
    let accepted = 0
    const rejected: string[] = []
    const selection = files.slice(0, MAX_DECRYPT_INPUTS)
    if (files.length > selection.length)
      rejected.push(`${files.length - selection.length} file(s) skipped: choose no more than 20 files at once.`)
    for (const [index, file] of selection.entries()) {
      if (token !== this.revision) return
      if (this.entries.length >= MAX_DECRYPT_INPUTS) {
        rejected.push(`${selection.length - index} file(s) skipped: use no more than 20 inputs.`)
        break
      }
      try {
        validateTextFileBatch([file], this.entries.length, this.entries.reduce((total, entry) => total + entry.fileBytes, 0))
        const imported = await readTextFile(file)
        if (token !== this.revision) return
        this.decodePayload(imported.text)
        this.add(imported.text, false, imported.name, imported.byteLength)
        accepted++
      } catch (error) {
        if (token !== this.revision) return
        rejected.push(`${safeFileName(file.name)}: ${error instanceof Error ? error.message : 'Could not read this file.'}`)
      }
    }
    if (token !== this.revision) return
    status.textContent = `${accepted ? `Imported ${accepted} file${accepted === 1 ? '' : 's'}.` : 'No files imported.'}${rejected.length ? ` Rejected: ${rejected.join(' ')}` : ''}`
    this.updateButton()
    if (accepted) this.entries.at(-1)!.input.focus()
    this.schedule(false)
  }
  private async decrypt(entry: Entry, secret: string): Promise<string> {
    return decryptText(this.decodePayload(entry.text), secret)
  }
  private async check(token: number): Promise<void> {
    if (token !== this.revision || this.busy || this.composing.size) return
    if (this.flight) { this.queued = token; return }
    const secret = this.secret.value
    const flight = this.process(token, secret, false)
    this.flight = flight
    await flight
    this.flight = undefined
    const queued = this.queued
    this.queued = undefined
    if (queued !== undefined) void this.check(queued)
  }
  private async process(token: number, secret: string, reveal: boolean): Promise<void> {
    let successes = 0
    let attempted = 0
    for (const entry of [...this.entries]) {
      if (token !== this.revision) return
      if (!entry.input.value) continue
      attempted++
      this.setState(entry, 'pending')
      try {
        const text = await this.decrypt(entry, secret)
        if (token !== this.revision) return
        this.setState(entry, 'valid')
        if (reveal) this.appendOutput(entry, text, successes === 0)
        successes++
      } catch {
        if (token !== this.revision) return
        this.setState(entry, 'invalid')
      }
    }
    if (token !== this.revision) return
    if (attempted) this.secret.setAttribute('aria-invalid', String(successes === 0))
    if (reveal) {
      this.hooks.button(successes ? 'success' : 'error')
      this.hooks.status(successes === 1 && attempted === 1 ? 'Decrypted.' : successes ? `Decrypted ${successes} of ${attempted} inputs. Unmatched inputs stay hidden.` : 'Could not decrypt. Check the password and the complete encrypted text.', !successes)
    }
  }
  private appendOutput(entry: Entry, text: string, first: boolean): void {
    const root = get('decrypt-outputs')
    if (first) root.replaceChildren()
    const details = document.createElement('details')
    details.className = 'plaintext-output'
    details.open = first
    const summary = document.createElement('summary')
    const title = document.createElement('span')
    title.textContent = `Input ${this.entries.indexOf(entry) + 1}`
    const count = document.createElement('span')
    count.className = 'field-meta'
    count.textContent = countText(text)
    summary.append(title, count)
    const body = document.createElement('div')
    body.className = 'accordion-body'
    const output = document.createElement('textarea')
    output.id = first ? 'decrypted-text' : `decrypted-text-${entry.id}`
    output.className = 'result-text'
    output.rows = 7
    output.readOnly = true
    output.spellcheck = false
    output.setAttribute('aria-label', `Decrypted text for input ${this.entries.indexOf(entry) + 1}`)
    output.value = text
    output.dataset.ready = 'true'
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'copy-button'
    copy.dataset.copy = output.id
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => this.hooks.copy(copy))
    body.append(copy, output)
    details.append(summary, body)
    summary.addEventListener('click', () => {
      if (!details.open) root.querySelectorAll('details').forEach(other => { other.open = false })
    })
    root.append(details)
  }
  async show(): Promise<void> {
    if (this.busy || this.composing.size || !this.secret.value || !this.hooks.supported) return
    this.hooks.changed()
    const token = this.revision
    const secret = this.secret.value
    this.collapseInputs()
    this.busy = true
    this.hooks.button('pending')
    this.hooks.status('Decrypting…')
    this.updateButton()
    if (this.flight) await this.flight
    if (token !== this.revision) return
    const flight = this.process(token, secret, true)
    this.flight = flight
    await flight
    if (this.flight === flight) this.flight = undefined
    if (token === this.revision) { this.busy = false; this.updateButton() }
    const queued = this.queued
    this.queued = undefined
    if (queued !== undefined) void this.check(queued)
  }
}
