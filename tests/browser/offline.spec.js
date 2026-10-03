import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const artifactUrl = new URL('../../dist/index.html', import.meta.url)
const fixture = JSON.parse(await readFile(new URL('../fixtures/legacy-v2.json', import.meta.url), 'utf8'))
const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))

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

  await page.getByRole('tab', { name: 'Decrypt' }).click()
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
  await page.getByRole('tab', { name: 'Derive' }).click()
  await page.locator('#derive-secret').fill(vectors[0].secret)
  await page.locator('#derive-index').fill('01')
  await page.locator('#derive-button').click()
  await expect(page.locator('#derive-status')).toContainText('without leading zeros')
  await expect(page.locator('#derived-password')).toHaveValue('')
})

test('tabs support keyboard and history; switching and reload clear fields', async ({ page }) => {
  await page.goto(artifactUrl.href)
  await page.locator('#secret').fill('synthetic password')
  await page.getByRole('tab', { name: 'Encrypt' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Decrypt' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Decrypt' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#secret')).toHaveValue('')
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Derive' })).toBeFocused()
  await page.locator('#derive-secret').fill('synthetic secret')
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Derive' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#derive-secret')).toHaveValue('')
  await page.goBack()
  await expect(page.getByRole('tab', { name: 'Decrypt' })).toHaveAttribute('aria-selected', 'true')
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
  await page.locator('#clear-session').click()
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
  await page.getByRole('tab', { name: 'Decrypt' }).click()
  await page.evaluate(() => window.releaseEncryption())
  await expect.poll(() => page.evaluate(() => window.encryptionFinished)).toBe(true)
  await expect(page.locator('#encrypted-text')).toHaveValue('')
  await page.getByRole('tab', { name: 'Encrypt' }).click()
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

for (const viewport of [{ name: 'desktop', width: 1440, height: 1180 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`captures ${viewport.name} layout with no horizontal overflow`, async ({ page, context }) => {
    await context.setOffline(true)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(artifactUrl.href)
    await expect(page.getByRole('heading', { name: 'Make it unreadable.' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/screenshots/symmetro-${viewport.name}-encrypt.png`, fullPage: true })
    await page.getByRole('tab', { name: 'Derive' }).click()
    await expect(page.getByRole('heading', { name: 'One secret. Many passwords.' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/screenshots/symmetro-${viewport.name}-derive.png`, fullPage: true })
  })
}
