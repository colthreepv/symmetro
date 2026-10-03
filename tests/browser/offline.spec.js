import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const artifactUrl = new URL('../../dist/index.html', import.meta.url)
const fixture = JSON.parse(await readFile(new URL('../fixtures/legacy-v2.json', import.meta.url), 'utf8'))
const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
const tab = (page, name) => page.getByRole('tab', { name, exact: true })

async function expectMode(page, mode) {
  const textSelected = mode !== 'derive'
  await expect(tab(page, 'Encrypt / Decrypt')).toHaveAttribute('aria-selected', String(textSelected))
  await expect(tab(page, 'Derive')).toHaveAttribute('aria-selected', String(!textSelected))
  await expect(page.locator('#tab-text')).toHaveAttribute('tabindex', textSelected ? '0' : '-1')
  await expect(page.locator('#tab-derive')).toHaveAttribute('tabindex', textSelected ? '-1' : '0')
  await expect(page.locator('#panel-text')).toHaveJSProperty('hidden', !textSelected)
  for (const item of ['encrypt', 'decrypt', 'derive'])
    await expect(page.locator(`#panel-${item}`)).toHaveJSProperty('hidden', item !== mode)
  await expect(page.locator(`#panel-${mode}`)).toBeVisible()
  if (textSelected) {
    await expect(page.locator(`#tab-${mode}`)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator(`#tab-${mode}`)).toHaveAttribute('tabindex', '0')
    const other = mode === 'encrypt' ? 'decrypt' : 'encrypt'
    await expect(page.locator(`#tab-${other}`)).toHaveAttribute('aria-selected', 'false')
    await expect(page.locator(`#tab-${other}`)).toHaveAttribute('tabindex', '-1')
  }
  await expect(page).toHaveURL(`${artifactUrl.href}#${mode}`)
}

test('the downloaded HTML encrypts and decrypts offline without subresource requests', async ({ page, context }) => {
  const requests = []
  const errors = []
  context.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => errors.push(error.message))
  await context.setOffline(true)
  await page.goto(artifactUrl.href)
  await expect(page.locator('#version-text')).toHaveText(`v${version}`)

  const plaintext = 'Offline browser fixture: café 🔐\nSecond line.'
  await page.locator('#encrypt-text').fill(plaintext)
  await page.locator('#secret').fill('synthetic browser password')
  await page.locator('#encrypt-button').click()
  await expect(page.locator('#encrypted-text')).not.toHaveValue('')
  const encrypted = await page.locator('#encrypted-text').inputValue()

  await tab(page, 'Decrypt').click()
  await page.locator('#decrypt-text').fill(encrypted)
  await page.locator('#decrypt-secret').fill('synthetic browser password')
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypted-text')).toHaveValue(plaintext)

  expect(requests.filter(url => url !== artifactUrl.href)).toEqual([])
  expect(errors).toEqual([])
})

test('the downloaded HTML decrypts the legacy fixture offline', async ({ page, context }) => {
  await context.setOffline(true)
  await page.goto(`${artifactUrl.href}#decrypt`)
  await page.locator('#decrypt-text').fill(fixture.payload)
  await page.locator('#decrypt-secret').fill(fixture.password)
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypted-text')).toHaveValue(fixture.text)
})

const vectors = JSON.parse(await readFile(new URL('../derivation-v1-vectors.json', import.meta.url), 'utf8'))

test('numbered passwords match independent vectors entirely offline', async ({ page, context }) => {
  const requests = []
  const errors = []
  context.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => errors.push(error.message))
  await context.setOffline(true)
  await page.goto(`${artifactUrl.href}#derive`)
  await page.locator('#derive-secret').fill(vectors[0].secret)
  await page.locator('#derive-button').click()
  await expect(page.locator('#derived-password')).toHaveValue(vectors[0].expected, { timeout: 20000 })
  await expect(page.locator('#derived-password')).toHaveAttribute('type', 'password')
  await page.locator('#next-password').click()
  await expect(page.locator('#derived-password')).toHaveValue(vectors[1].expected, { timeout: 20000 })
  await expect(page.locator('#derive-index')).toHaveValue('2')
  await page.locator('#derive-index').fill(vectors[4].index)
  await page.locator('#derive-button').click()
  await expect(page.locator('#derived-password')).toHaveValue(vectors[4].expected, { timeout: 20000 })
  await expect(page.locator('#next-password')).toBeDisabled()
  expect(requests.filter(url => url !== artifactUrl.href && !url.startsWith('blob:') && !url.startsWith('data:'))).toEqual([])
  expect(errors).toEqual([])
})

test('invalid input is recoverable and editing clears old results', async ({ page, context }) => {
  await context.setOffline(true)
  await page.goto(`${artifactUrl.href}#decrypt`)
  await page.locator('#decrypt-text').fill('not valid base64!')
  await page.locator('#decrypt-secret').fill('synthetic password')
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypt-status')).toContainText('Could not decrypt')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await page.locator('#decrypt-text').fill(fixture.payload)
  await page.locator('#decrypt-secret').fill(fixture.password)
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypted-text')).toHaveValue(fixture.text)
  await page.locator('#decrypt-secret').fill('changed password')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await expect(page.locator('[data-copy="decrypted-text"]')).toBeDisabled()
  await tab(page, 'Derive').click()
  await page.locator('#derive-secret').fill(vectors[0].secret)
  await page.locator('#derive-index').fill('01')
  await page.locator('#derive-button').click()
  await expect(page.locator('#derive-status')).toContainText('without leading zeros')
  await expect(page.locator('#derived-password')).toHaveValue('')
})

test('nested keyboard navigation stays within its tablist and remembers the text mode', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#encrypt`)
  await expect(page.locator('#tool-tabs')).toHaveAttribute('role', 'tablist')
  await expect(page.locator('#text-tabs')).toHaveAttribute('role', 'tablist')
  await expect(page.locator('#tab-text')).toHaveAttribute('aria-controls', 'panel-text')
  await expect(page.locator('#panel-text')).toHaveAttribute('role', 'tabpanel')
  await expect(page.locator('#panel-text #text-tabs')).toBeVisible()
  await expectMode(page, 'encrypt')
  await page.locator('#secret').fill('synthetic password')
  await tab(page, 'Encrypt').focus()
  for (const [key, mode] of [['ArrowRight', 'decrypt'], ['ArrowRight', 'encrypt'], ['ArrowLeft', 'decrypt'], ['Home', 'encrypt'], ['End', 'decrypt']]) {
    await page.keyboard.press(key)
    await expect(page.locator(`#tab-${mode}`)).toBeFocused()
    await expectMode(page, mode)
    await expect(page.locator('#secret')).toHaveValue('')
  }
  await page.locator('#decrypt-text').fill(fixture.payload)
  await page.locator('#decrypt-secret').fill(fixture.password)
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypted-text')).toHaveValue(fixture.text)
  // Activating the already selected tool preserves its current mode and result.
  await tab(page, 'Encrypt / Decrypt').click()
  await expectMode(page, 'decrypt')
  await expect(page.locator('#decrypted-text')).toHaveValue(fixture.text)
  for (const [key, mode, name] of [['ArrowRight', 'derive', 'Derive'], ['ArrowRight', 'decrypt', 'Encrypt / Decrypt'], ['ArrowLeft', 'derive', 'Derive'], ['Home', 'decrypt', 'Encrypt / Decrypt'], ['End', 'derive', 'Derive']]) {
    await page.keyboard.press(key)
    await expect(tab(page, name)).toBeFocused()
    await expectMode(page, mode)
    await expect(page.locator('#decrypt-secret')).toHaveValue('')
    await expect(page.locator('#decrypted-text')).toHaveValue('')
  }
  await expect(page.locator('#tab-decrypt')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#tab-decrypt')).toHaveAttribute('tabindex', '0')
  await page.locator('#derive-secret').fill('synthetic secret')
  await tab(page, 'Encrypt / Decrypt').click()
  await expectMode(page, 'decrypt')
  await expect(page.locator('#derive-secret')).toHaveValue('')
})

test('hash history, brand navigation and reload preserve selection while clearing fields', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#encrypt`)
  await tab(page, 'Decrypt').click()
  await expectMode(page, 'decrypt')
  await tab(page, 'Derive').click()
  await expectMode(page, 'derive')
  await page.locator('#derive-secret').fill('synthetic secret')
  await page.reload()
  await expectMode(page, 'derive')
  await expect(page.locator('#derive-secret')).toHaveValue('')
  await page.goBack()
  await expectMode(page, 'decrypt')
  await page.locator('#decrypt-secret').fill('synthetic password')
  await page.goForward()
  await expectMode(page, 'derive')
  await expect(page.locator('#decrypt-secret')).toHaveValue('')
  await page.locator('.brand').click()
  await expectMode(page, 'encrypt')
  await expect(page.getByRole('heading', { name: 'Input', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Encrypted text', exact: true })).toBeVisible()
})

test('clearing or editing terminates the disposable derivation worker', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    window.workerCounts = { created: 0, terminated: 0 }
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args)
        window.workerCounts.created += 1
      }

      terminate() {
        window.workerCounts.terminated += 1
        super.terminate()
      }
    }
  })
  await page.goto(`${artifactUrl.href}#derive`)
  await page.locator('#derive-secret').fill(vectors[0].secret)
  await page.locator('#derive-button').click()
  await page.locator('[data-clear="derive"]').click()
  await expect(page.locator('#derived-password')).toHaveValue('')
  await expect(page.locator('#derive-secret')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.workerCounts)).toEqual({ created: 1, terminated: 1 })
  await page.locator('#derive-secret').fill(vectors[0].secret)
  await page.locator('#derive-button').click()
  await expect(page.locator('#derived-password')).toHaveValue(vectors[0].expected, { timeout: 20000 })
  await expect.poll(() => page.evaluate(() => window.workerCounts)).toEqual({ created: 2, terminated: 2 })
})

test('a late encryption result cannot reappear after clearing or navigation', async ({ page }) => {
  await page.addInitScript(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle)
    crypto.subtle.encrypt = async (...args) => {
      await new Promise((resolve) => {
        window.releaseEncryption = resolve
      })
      const result = await encrypt(...args)
      window.encryptionFinished = true
      return result
    }
  })
  await page.goto(artifactUrl.href)
  await page.locator('#encrypt-text').fill('synthetic race fixture')
  await page.locator('#secret').fill('synthetic password')
  await page.locator('#encrypt-button').click()
  await expect.poll(() => page.evaluate(() => typeof window.releaseEncryption)).toBe('function')
  await page.locator('#theme-toggle').click()
  await expect(page.locator('#encrypt-button')).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('#encrypt-button')).toHaveAttribute('data-state', 'pending')
  await expect(page.locator('#encrypt-button .button-label')).toHaveText('Encrypt')
  await expect(page.locator('#encrypt-button .button-icon')).toHaveClass(/spinner/)
  await expect(page.locator('#encrypt-status')).toHaveText('Encrypting…')
  await expect(page.locator('#secret')).toHaveValue('synthetic password')
  await tab(page, 'Decrypt').click()
  await page.evaluate(() => window.releaseEncryption())
  await expect.poll(() => page.evaluate(() => window.encryptionFinished)).toBe(true)
  await expect(page.locator('#encrypted-text')).toHaveValue('')
  await tab(page, 'Encrypt').click()
  await expect(page.locator('#encrypted-text')).toHaveValue('')
  await expect(page.locator('#secret')).toHaveValue('')
})

test('copy fallback selects and reveals a generated password if copying is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {
      throw new Error('Clipboard unavailable in test')
    } } })
    document.execCommand = () => false
  })
  await page.goto(`${artifactUrl.href}#derive`)
  await page.locator('#derive-secret').fill(vectors[0].secret)
  await page.locator('#derive-button').click()
  await expect(page.locator('#derived-password')).toHaveValue(vectors[0].expected, { timeout: 20000 })
  await page.locator('[data-copy="derived-password"]').click()
  await expect(page.locator('#derived-password')).toHaveAttribute('type', 'text')
  await expect(page.locator('[data-reveal="derived-password"]')).toHaveText('Hide')
  await expect(page.locator('[data-reveal="derived-password"]')).toHaveAttribute('aria-label', 'Hide generated password')
  await expect(page.locator('#derived-password')).toBeFocused()
  await expect(page.locator('#derive-status')).toContainText('result is selected')
  const selected = await page.locator('#derived-password').evaluate(input => input.selectionEnd - input.selectionStart)
  expect(selected).toBe(43)
})

test('multiline secret paste and drop are rejected without changing the secret', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#derive`)
  await page.locator('#derive-secret').fill('original synthetic secret')
  await page.locator('#derive-secret').evaluate((input) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', 'synthetic\r\nsecret')
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
  })
  await expect(page.locator('#derive-secret')).toHaveValue('original synthetic secret')
  await expect(page.locator('#derive-status')).toContainText('Line breaks were not pasted')
  await page.locator('#derive-secret').evaluate((input) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', 'synthetic\nsecret')
    input.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  })
  await expect(page.locator('#derive-secret')).toHaveValue('original synthetic secret')
  await expect(page.locator('#derive-status')).toContainText('line breaks was not inserted')
})

for (const mode of ['encrypt', 'decrypt', 'derive']) {
  test(`theme changes preserve ${mode} inputs and results; reload defaults to dark despite OS light`, async ({ page, context }) => {
    await context.setOffline(true)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(`${artifactUrl.href}#${mode}`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('#theme-toggle')).toHaveText('Light mode')
    await expect(page.locator('#theme-toggle')).toHaveAccessibleName('Switch to light mode')
    const ids = mode === 'encrypt' ? ['encrypt-text', 'secret', 'encrypted-text'] : mode === 'decrypt' ? ['decrypt-text', 'decrypt-secret', 'decrypted-text'] : ['derive-index', 'derive-secret', 'derived-password']
    const input = mode === 'encrypt' ? 'Theme regression: café 🔐' : mode === 'decrypt' ? fixture.payload : '1'
    const secret = mode === 'derive' ? vectors[0].secret : fixture.password
    await page.locator(`#${ids[0]}`).fill(input)
    await page.locator(`#${ids[1]}`).fill(secret)
    await expect(page.locator(`#${mode}-button`)).toHaveAccessibleName(mode === 'derive' ? 'Generate' : mode === 'encrypt' ? 'Encrypt' : 'Decrypt')
    await page.locator(`#${mode}-button`).click()
    await expect(page.locator(`#${ids[2]}`)).not.toHaveValue('', { timeout: 20000 })
    const result = await page.locator(`#${ids[2]}`).inputValue()
    if (mode !== 'encrypt')
      expect(result).toBe(mode === 'decrypt' ? fixture.text : vectors[0].expected)
    const status = mode === 'encrypt' ? 'Encrypted.' : mode === 'decrypt' ? 'Decrypted.' : 'Generated.'
    for (const theme of ['light', 'dark', 'light']) {
      await page.locator('#theme-toggle').click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.locator('#theme-toggle')).toHaveText(theme === 'light' ? 'Dark mode' : 'Light mode')
      await expect(page.locator('#theme-toggle')).toHaveAccessibleName(theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode')
      await expectMode(page, mode)
      await expect(page.locator(`#${ids[0]}`)).toHaveValue(input)
      await expect(page.locator(`#${ids[1]}`)).toHaveValue(secret)
      await expect(page.locator(`#${ids[2]}`)).toHaveValue(result)
      await expect(page.locator(`#${mode}-status`)).toHaveText(status)
      await expect(page.locator(`#${mode}-status`)).toHaveAttribute('data-error', 'false')
      await expect(page.locator(`#${mode}-button`)).toHaveAttribute('data-state', 'success')
      await expect(page.locator(`#${mode}-button`)).toHaveAttribute('aria-busy', 'false')
      await expect(page.locator(`#${mode}-button .button-icon`)).toHaveText('✓')
      await expect(page.locator(`[data-copy="${ids[2]}"]`)).toBeEnabled()
    }
    if (mode === 'derive') {
      const reveal = page.locator('[data-reveal="derived-password"]')
      await expect(reveal).toHaveText('Show')
      await expect(reveal).toHaveAccessibleName('Show generated password')
      await reveal.click()
      await expect(reveal).toHaveText('Hide')
      await expect(reveal).toHaveAccessibleName('Hide generated password')
      await page.locator('#theme-toggle').click()
      await expect(page.locator('#derived-password')).toHaveAttribute('type', 'text')
      await expect(page.locator('#derived-password')).toHaveValue(result)
      await reveal.click()
      await expect(page.locator('#derived-password')).toHaveAttribute('type', 'password')
      // Leave the page light before reloading to verify the default resets.
      await page.locator('#theme-toggle').click()
    }
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('#theme-toggle')).toHaveAccessibleName('Switch to light mode')
    await expectMode(page, mode)
    await expect(page.locator(`#${ids[1]}`)).toHaveValue('')
    await expect(page.locator(`#${ids[2]}`)).toHaveValue('')
    await expect(page.locator(`#${ids[0]}`)).toHaveValue(mode === 'derive' ? '1' : '')
  })
}

test('copy and clear use concise feedback and reset copy readiness', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => {
      window.copiedText = text
    } } })
  })
  await page.goto(`${artifactUrl.href}#decrypt`)
  await page.locator('#decrypt-text').fill(fixture.payload)
  await page.locator('#decrypt-secret').fill(fixture.password)
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypted-text')).toHaveValue(fixture.text)
  const copy = page.locator('[data-copy="decrypted-text"]')
  await copy.click()
  await expect(copy).toHaveText('Copied.')
  await expect(page.locator('#decrypt-status')).toHaveText('Copied.')
  expect(await page.evaluate(() => window.copiedText)).toBe(fixture.text)
  await page.locator('[data-clear="decrypt"]').click()
  await expect(page.locator('#decrypt-status')).toHaveText('Cleared.')
  await expect(copy).toHaveText('Copy')
  await expect(copy).toBeDisabled()
  await expect(page.locator('#decrypt-text')).toBeFocused()
  await expect(page.locator('#decrypt-text')).toHaveValue('')
  await expect(page.locator('#decrypt-secret')).toHaveValue('')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await expect(page.locator('#decrypt-button')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('#decrypt-button .button-icon')).toHaveText('→')
  await expect(page.locator('#clear-session')).toHaveCount(0)
})

test('live password validation authenticates edits without revealing plaintext', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#decrypt`)
  const validation = page.locator('#decrypt-validation')
  await page.locator('#decrypt-text').fill(fixture.payload)
  await expect(validation).toHaveAttribute('data-state', 'idle')
  await page.locator('#decrypt-secret').fill('wrong password')
  await expect(validation).toHaveAttribute('data-state', 'invalid')
  await expect(validation).toHaveAttribute('title', 'Password does not match or encrypted text is invalid')
  await expect(page.locator('#decrypt-secret')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await page.locator('#decrypt-secret').fill(fixture.password)
  await expect(validation).toHaveAttribute('data-state', 'valid')
  await expect(validation.locator('.validation-icon')).toHaveText('✓')
  await expect(validation.locator('.sr-only')).toHaveText('Password matches')
  await expect(page.locator('#decrypt-secret')).toHaveAttribute('aria-invalid', 'false')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await expect(page.locator('[data-copy="decrypted-text"]')).toBeDisabled()
  await expect(page.locator('#decrypt-button')).toHaveAttribute('data-state', 'idle')
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypted-text')).toHaveValue(fixture.text)
  await page.locator('#decrypt-text').fill('broken ciphertext')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await expect(page.locator('#decrypt-button')).toHaveAttribute('data-state', 'idle')
  await expect(validation).toHaveAttribute('data-state', 'invalid')
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypt-button')).toHaveAttribute('data-state', 'error')
  await expect(page.locator('#decrypt-button .button-icon')).toHaveText('!')
  await expect(page.locator('#decrypt-status')).toHaveAttribute('data-error', 'true')
  await expect(page.locator('#decrypt-status')).toBeVisible()
  await page.locator('#decrypt-text').fill('')
  await expect(validation).toHaveAttribute('data-state', 'idle')
  await expect(validation.locator('.sr-only')).toHaveText('')
  await expect(page.locator('#decrypt-secret')).not.toHaveAttribute('aria-invalid')
  await page.locator('[data-clear="decrypt"]').click()
  await expect(validation).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('#decrypt-button')).toHaveAttribute('data-state', 'idle')
})

async function gateDecryption(page) {
  await page.addInitScript(() => {
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle)
    window.decryptReleases = []
    window.decryptFinished = 0
    crypto.subtle.decrypt = async (...args) => {
      await new Promise(resolve => window.decryptReleases.push(resolve))
      try {
        return await decrypt(...args)
      }
      finally {
        window.decryptFinished += 1
      }
    }
  })
}

for (const action of ['edit', 'clear', 'navigate', 'submit']) {
  test(`a delayed live check cannot overwrite ${action} state`, async ({ page }) => {
    await gateDecryption(page)
    await page.goto(`${artifactUrl.href}#decrypt`)
    await page.locator('#decrypt-text').fill(fixture.payload)
    await page.locator('#decrypt-secret').fill(fixture.password)
    await expect.poll(() => page.evaluate(() => window.decryptReleases.length)).toBe(1)
    await expect(page.locator('#decrypt-validation')).toHaveAttribute('data-state', 'pending')
    if (action === 'edit') {
      await page.locator('#decrypt-secret').fill('first obsolete password')
      await page.waitForTimeout(350)
      await page.locator('#decrypt-secret').fill('latest wrong password')
      await page.waitForTimeout(350)
      // Deliberately assert serialization while the first check is held open.
      expect(await page.evaluate(() => window.decryptReleases.length)).toBe(1)
    }
    else if (action === 'clear') {
      await page.locator('[data-clear="decrypt"]').click()
    }
    else if (action === 'navigate') {
      await tab(page, 'Derive').click()
    }
    else {
      await page.locator('#decrypt-button').click()
      await expect(page.locator('#decrypt-button')).toHaveAttribute('data-state', 'pending')
    }
    await page.evaluate(() => window.decryptReleases[0]())
    await expect.poll(() => page.evaluate(() => window.decryptFinished)).toBe(1)
    if (action === 'edit' || action === 'submit') {
      await expect.poll(() => page.evaluate(() => window.decryptReleases.length)).toBe(2)
      await expect(page.locator('#decrypted-text')).toHaveValue('')
      await page.evaluate(() => window.decryptReleases[1]())
      await expect.poll(() => page.evaluate(() => window.decryptFinished)).toBe(2)
      await expect(page.locator('#decrypt-validation')).toHaveAttribute('data-state', action === 'edit' ? 'invalid' : 'valid')
      await expect(page.locator('#decrypted-text')).toHaveValue(action === 'edit' ? '' : fixture.text)
      await expect(page.locator('#decrypt-button')).toHaveAttribute('data-state', action === 'edit' ? 'idle' : 'success')
    }
    else {
      if (action === 'navigate')
        await tab(page, 'Encrypt / Decrypt').click()
      await expect(page.locator('#decrypt-validation')).toHaveAttribute('data-state', 'idle')
      await expect(page.locator('#decrypted-text')).toHaveValue('')
      await expect(page.locator('#decrypt-secret')).toHaveValue('')
    }
    await page.waitForTimeout(350)
    expect(await page.evaluate(() => window.decryptReleases.length)).toBe(action === 'edit' || action === 'submit' ? 2 : 1)
  })
}

test('composition defers checks and clearing cancels a scheduled check', async ({ page }) => {
  await gateDecryption(page)
  await page.goto(`${artifactUrl.href}#decrypt`)
  await page.locator('#decrypt-text').fill(fixture.payload)
  await page.locator('#decrypt-secret').evaluate((input, password) => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.value = password
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
  }, fixture.password)
  await page.waitForTimeout(350)
  expect(await page.evaluate(() => window.decryptReleases.length)).toBe(0)
  await expect(page.locator('#decrypt-validation')).toHaveAttribute('data-state', 'idle')
  await page.locator('#decrypt-secret').dispatchEvent('compositionend')
  await expect.poll(() => page.evaluate(() => window.decryptReleases.length)).toBe(1)
  await page.evaluate(() => window.decryptReleases[0]())
  await expect(page.locator('#decrypt-validation')).toHaveAttribute('data-state', 'valid')
  await page.locator('#decrypt-secret').fill('wrong password')
  await page.locator('[data-clear="decrypt"]').click()
  await page.waitForTimeout(350)
  expect(await page.evaluate(() => window.decryptReleases.length)).toBe(1)
  await expect(page.locator('#decrypt-validation')).toHaveAttribute('data-state', 'idle')
})

test('empty plaintext authenticates live and becomes copyable only after explicit Decrypt', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#encrypt`)
  await page.locator('#secret').fill('empty message password')
  await page.locator('#encrypt-button').click()
  await expect(page.locator('#encrypted-text')).not.toHaveValue('')
  const encrypted = await page.locator('#encrypted-text').inputValue()
  await tab(page, 'Decrypt').click()
  await page.locator('#decrypt-text').fill(encrypted)
  await page.locator('#decrypt-secret').fill('empty message password')
  await expect(page.locator('#decrypt-validation')).toHaveAttribute('data-state', 'valid')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await expect(page.locator('[data-copy="decrypted-text"]')).toBeDisabled()
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypt-button')).toHaveAttribute('data-state', 'success')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await expect(page.locator('[data-copy="decrypted-text"]')).toBeEnabled()
})

test('readonly output has no pointer outline and retains a keyboard focus indicator', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#encrypt`)
  const output = page.locator('#encrypted-text')
  await output.click()
  await expect(output).toBeFocused()
  await expect(output).toHaveAttribute('data-pointer-focus', 'true')
  const outline = () => output.evaluate(input => ({ style: getComputedStyle(input).outlineStyle, width: getComputedStyle(input).outlineWidth }))
  const pointer = await outline()
  expect(pointer.style === 'none' || pointer.width === '0px').toBe(true)
  await page.locator('[data-clear="encrypt"]').focus()
  await page.keyboard.press('Tab')
  await expect(output).toBeFocused()
  await expect(output).not.toHaveAttribute('data-pointer-focus')
  const keyboard = await outline()
  expect(keyboard.style).not.toBe('none')
  expect(Number.parseFloat(keyboard.width)).toBeGreaterThan(0)
})

for (const viewport of [{ name: 'wide', width: 1920, height: 1180 }, { name: 'mobile-390', width: 390, height: 844 }, { name: 'mobile-320', width: 320, height: 740 }]) {
  test(`captures ${viewport.name} dark and light layouts with no horizontal overflow`, async ({ page, context }, testInfo) => {
    test.setTimeout(60000)
    await context.setOffline(true)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(`${artifactUrl.href}#encrypt`)
    await page.screenshot({ path: `test-results/screenshots/symmetro-preview-${viewport.name}.png`, fullPage: true, animations: 'disabled' })
    for (const mode of ['encrypt', 'decrypt', 'derive']) {
      if (mode !== 'encrypt')
        await tab(page, mode === 'decrypt' ? 'Decrypt' : 'Derive').click()
      await expectMode(page, mode)
      await expect(page.getByRole('heading', { name: mode === 'derive' ? 'Derive' : 'Input', exact: true, level: 2 })).toBeVisible()
      if (mode === 'encrypt') {
        await page.locator('#encrypt-text').fill('UnbrokenText'.repeat(40))
        await page.locator('#secret').fill('synthetic layout password')
      }
      else if (mode === 'decrypt') {
        await page.locator('#decrypt-text').fill(fixture.payload)
        await page.locator('#decrypt-secret').fill(fixture.password)
        await expect(page.locator('#decrypt-validation')).toHaveAttribute('data-state', 'valid')
        await expect(page.locator('#decrypted-text')).toHaveValue('')
        await expect(page.locator('[data-copy="decrypted-text"]')).toBeDisabled()
        if (await page.locator('html').getAttribute('data-theme') !== 'dark')
          await page.locator('#theme-toggle').click()
        const liveScreenshot = `test-results/screenshots/symmetro-decrypt-live-${viewport.name}.png`
        await page.screenshot({ path: liveScreenshot, fullPage: true, animations: 'disabled' })
        await testInfo.attach('decrypt-live-valid', { path: liveScreenshot, contentType: 'image/png' })
      }
      else {
        await page.locator('#derive-secret').fill(vectors[0].secret)
      }
      await page.locator(`#${mode}-button`).click()
      const output = mode === 'encrypt' ? 'encrypted-text' : mode === 'decrypt' ? 'decrypted-text' : 'derived-password'
      await expect(page.locator(`#${output}`)).not.toHaveValue('', { timeout: 20000 })
      if (mode !== 'derive')
        await expect(page.getByRole('heading', { name: mode === 'encrypt' ? 'Encrypted text' : 'Decrypted text', exact: true, level: 3 })).toBeVisible()
      for (const theme of ['dark', 'light']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme)
          await page.locator('#theme-toggle').click()
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        const bounds = await page.evaluate(() => ({
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth,
          shellWidth: document.querySelector('.shell').getBoundingClientRect().width,
          shellLeft: document.querySelector('.shell').getBoundingClientRect().left,
          shellRight: document.querySelector('.shell').getBoundingClientRect().right,
        }))
        expect(bounds.overflow).toBe(false)
        expect(bounds.shellWidth).toBeLessThanOrEqual(1600)
        expect(bounds.shellLeft).toBeGreaterThanOrEqual(0)
        expect(bounds.shellRight).toBeLessThanOrEqual(viewport.width)
        if (viewport.width === 1920)
          expect(bounds.shellWidth).toBe(1600)
        const screenshot = `test-results/screenshots/symmetro-${viewport.name}-${mode}-${theme}.png`
        await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
        await testInfo.attach(`${mode}-${theme}`, { path: screenshot, contentType: 'image/png' })
      }
    }
  })
}
