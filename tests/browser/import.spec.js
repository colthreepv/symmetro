import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { encryptText } from '../../src/crypto.js'

const artifactUrl = new URL('../../dist/index.html', import.meta.url)
const password = 'synthetic file import password'
const plaintext = 'Local-file round trip: café, e\u0301, 日本語, 🔐\nSecond line.'
const mib = 1_048_576

globalThis.window = { crypto: webcrypto }
const payload = Buffer.from(await encryptText(plaintext, password)).toString('base64')
const file = (name, contents = payload, mimeType = 'text/plain') => ({
  name,
  mimeType,
  buffer: Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
})
const inputs = page => page.locator('#decrypt-inputs > details')
const status = page => page.locator('#decrypt-import-status')

async function dropFiles(page, files) {
  const transfer = await page.evaluateHandle((items) => {
    const transfer = new DataTransfer()
    for (const item of items)
      transfer.items.add(new File([Uint8Array.from(item.bytes)], item.name, { type: item.mimeType }))
    return transfer
  }, files.map(item => ({ name: item.name, mimeType: item.mimeType, bytes: [...item.buffer] })))
  await page.locator('#decrypt-file-drop').dispatchEvent('drop', { dataTransfer: transfer })
  await transfer.dispose()
}

async function gateReads(page) {
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer
    window.pendingReads = []
    window.finishedReads = 0
    File.prototype.arrayBuffer = async function () {
      await new Promise(resolve => window.pendingReads.push({ name: this.name, release: resolve }))
      try {
        return await read.call(this)
      }
      finally {
        window.finishedReads += 1
      }
    }
  })
}

test('the keyboard file picker imports multiple local files offline and reveals exact Unicode text only on request', async ({ page, context }) => {
  const requests = []
  const errors = []
  context.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => errors.push(error.message))
  await context.setOffline(true)
  await page.goto(`${artifactUrl.href}#decrypt`)
  await expect(page.locator('#decrypt-file-picker')).toHaveAttribute('type', 'file')
  await expect(page.locator('#decrypt-file-picker')).toHaveAttribute('multiple', '')
  await expect(page.locator('#decrypt-file-picker')).toHaveAttribute('accept', /text\/plain.*\.txt|\.txt.*text\/plain/)
  await expect(status(page)).toHaveAttribute('role', 'status')
  await page.locator('#choose-decrypt-files').focus()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  const chooser = await chooserPromise
  expect(chooser.isMultiple()).toBe(true)
  const names = ['café e\u0301 🔐.txt', 'second-message.txt']
  await chooser.setFiles(names.map(name => file(name)))
  await expect(inputs(page)).toHaveCount(3)
  await expect(page.locator('.entry-filename')).toHaveText(names)
  await expect(inputs(page).first().locator('textarea')).toHaveValue('')
  await expect(inputs(page).nth(1).locator('textarea')).toHaveValue(payload)
  await expect(inputs(page).nth(2).locator('textarea')).toHaveValue(payload)
  await expect(inputs(page).nth(1)).not.toHaveAttribute('open')
  await expect(inputs(page).last()).toHaveAttribute('open', '')
  await expect(page.locator('#decrypt-outputs > details')).toHaveCount(0)
  await page.locator('#decrypt-secret').fill(password)
  await expect(inputs(page).first().locator('.password-validation')).toHaveAttribute('data-state', 'idle')
  await expect(inputs(page).nth(1).locator('.password-validation')).toHaveAttribute('data-state', 'valid')
  await expect(inputs(page).nth(2).locator('.password-validation')).toHaveAttribute('data-state', 'valid')
  await expect(page.locator('#decrypted-text')).toHaveValue('')
  await page.locator('#decrypt-button').click()
  const outputs = page.locator('#decrypt-outputs > details')
  await expect(outputs).toHaveCount(2)
  await expect(outputs.nth(0).locator('textarea')).toHaveValue(plaintext)
  await expect(outputs.nth(1).locator('textarea')).toHaveValue(plaintext)
  expect(requests.filter(url => url !== artifactUrl.href)).toEqual([])
  expect(errors).toEqual([])
})

test('UTF-8 BOM and both BOM-marked UTF-16 encodings import without changing decrypted text', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#decrypt`)
  const utf16le = Buffer.from(payload, 'utf16le')
  const utf16be = Buffer.from(utf16le).swap16()
  await page.locator('#decrypt-file-picker').setInputFiles([
    file('utf8-bom.txt', Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(payload)])),
    file('utf16-le.txt', Buffer.concat([Buffer.from([0xFF, 0xFE]), utf16le])),
    file('utf16-be.txt', Buffer.concat([Buffer.from([0xFE, 0xFF]), utf16be])),
  ])
  await expect(inputs(page)).toHaveCount(4)
  for (let index = 1; index <= 3; index += 1)
    await expect(inputs(page).nth(index).locator('textarea')).toHaveValue(payload)
  await page.locator('#decrypt-secret').fill(password)
  await page.locator('#decrypt-button').click()
  await expect(page.locator('#decrypt-outputs > details')).toHaveCount(3)
  expect(await page.locator('#decrypt-outputs textarea').evaluateAll(items => items.map(item => item.value))).toEqual([plaintext, plaintext, plaintext])
})

test('mixed batches retain valid files, report rejected siblings, and allow selecting the same file again', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#decrypt`)
  await page.locator('#decrypt-file-picker').setInputFiles([
    file('good-first.txt'),
    file('empty.txt', ''),
    file('bad-utf8.txt', Buffer.from([0xC0, 0xAF])),
    file('good-last.txt'),
  ])
  await expect(inputs(page)).toHaveCount(3)
  await expect(page.locator('.entry-filename')).toHaveText(['good-first.txt', 'good-last.txt'])
  await expect(status(page)).toContainText(/empty|UTF-8/i)
  await page.locator('#decrypt-file-picker').setInputFiles(file('good-last.txt'))
  await expect(inputs(page)).toHaveCount(4)
  await expect(page.locator('.entry-filename')).toHaveText(['good-first.txt', 'good-last.txt', 'good-last.txt'])
  await expect(page.locator('#decrypt-file-picker')).toHaveValue('')
  await page.locator('#decrypt-file-picker').setInputFiles(file('good-last.txt'))
  await expect(inputs(page)).toHaveCount(5)
  await expect(page.locator('.entry-filename')).toHaveText(['good-first.txt', 'good-last.txt', 'good-last.txt', 'good-last.txt'])
})

for (const [name, bytes, error] of [
  ['empty.txt', Buffer.alloc(0), /empty/i],
  ['whitespace.txt', Buffer.from(' \t\r\n'), /empty|whitespace/i],
  ['malformed-utf8.txt', Buffer.from([0xC0, 0xAF]), /UTF-8|UTF-16/i],
  ['binary.txt', Buffer.from([0x50, 0x4B, 0x03, 0x04]), /binary|control/i],
  ['not-base64.txt', Buffer.from('this is not valid base64!'), /encrypted|ciphertext|base64/i],
  ['too-short.txt', Buffer.from('QUJDRA=='), /encrypted|ciphertext|short/i],
]) {
  test(`rejects ${name} without adding an input or clearing existing ciphertext`, async ({ page }) => {
    await page.goto(`${artifactUrl.href}#decrypt`)
    await page.locator('#decrypt-text').fill(payload)
    await page.locator('#decrypt-file-picker').setInputFiles(file(name, bytes))
    await expect(status(page)).toContainText(error)
    await expect(inputs(page)).toHaveCount(1)
    await expect(page.locator('#decrypt-text')).toHaveValue(payload)
    await expect(page.locator('.entry-filename')).toHaveCount(0)
    await expect(page.locator('#decrypted-text')).toHaveValue('')
  })
}

test('drop hover resets after leaving or rejected files, and filenames render as safe text', async ({ page }) => {
  await page.goto(`${artifactUrl.href}#decrypt`)
  const zone = page.locator('#decrypt-file-drop')
  await expect(zone).toBeVisible()
  const transfer = await page.evaluateHandle((ciphertext) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([ciphertext], 'hover.txt', { type: 'text/plain' }))
    return transfer
  }, payload)
  await zone.dispatchEvent('dragenter', { dataTransfer: transfer })
  await expect(zone).toHaveAttribute('data-dragging', 'true')
  await zone.dispatchEvent('dragover', { dataTransfer: transfer })
  await expect(zone).toHaveAttribute('data-dragging', 'true')
  await zone.dispatchEvent('dragleave', { dataTransfer: transfer })
  await expect(zone).toHaveAttribute('data-dragging', 'false')
  await zone.dispatchEvent('dragenter', { dataTransfer: transfer })
  await dropFiles(page, [file('broken.txt', 'not encrypted!')])
  await expect(zone).toHaveAttribute('data-dragging', 'false')
  await expect(status(page)).toContainText(/encrypted|ciphertext|base64/i)
  await expect(inputs(page)).toHaveCount(1)
  await transfer.dispose()
  const literalName = '<img src=x onerror=window.filenameInjected=true>🔐.txt'
  await dropFiles(page, [file(`C:\\fakepath\\${literalName.replace('🔐', '\u202E🔐')}`, payload, 'application/octet-stream')])
  await expect(inputs(page)).toHaveCount(2)
  await expect(page.locator('.entry-filename')).toHaveText(literalName)
  await expect(page.locator('.entry-filename img, .entry-filename script')).toHaveCount(0)
  expect(await page.evaluate(() => window.filenameInjected)).toBeUndefined()
})

test('unreadable files report a recoverable error and do not prevent later valid files', async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'unreadable.txt')
        throw new Error('Synthetic read failure')
      return read.call(this)
    }
  })
  await page.goto(`${artifactUrl.href}#decrypt`)
  await page.locator('#decrypt-file-picker').setInputFiles([file('unreadable.txt'), file('readable.txt')])
  await expect(inputs(page)).toHaveCount(2)
  await expect(page.locator('.entry-filename')).toHaveText('readable.txt')
  await expect(status(page)).toContainText(/could not be read|couldn.t be read/i)
  await page.locator('#decrypt-file-picker').setInputFiles(file('readable-again.txt'))
  await expect(inputs(page)).toHaveCount(3)
})

test('imports enforce the 20-input and 1 MiB per-file bounds before reading oversized files', async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer
    window.readNames = []
    File.prototype.arrayBuffer = function () {
      window.readNames.push(this.name)
      return read.call(this)
    }
  })
  await page.goto(`${artifactUrl.href}#decrypt`)
  await page.locator('#decrypt-file-picker').setInputFiles(file('oversized.txt', Buffer.alloc(mib + 1, 0x41)))
  await expect(status(page)).toContainText('1 MiB')
  await expect(inputs(page)).toHaveCount(1)
  expect(await page.evaluate(() => window.readNames)).toEqual([])
  await page.locator('#decrypt-file-picker').setInputFiles(Array.from({ length: 19 }, (_, index) => file(`input-${index + 1}.txt`)))
  await expect(inputs(page)).toHaveCount(20)
  await expect(page.locator('#add-decrypt-input')).toBeDisabled()
  await dropFiles(page, [file('over-limit.txt')])
  await expect(status(page)).toContainText('20')
  await expect(inputs(page)).toHaveCount(20)
  expect(await page.evaluate(() => window.readNames)).not.toContain('over-limit.txt')
})

test('the 5 MiB retained import limit is released when an imported input is removed', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto(`${artifactUrl.href}#decrypt`)
  const maximumFile = Buffer.from(payload.padEnd(mib, ' '))
  await page.locator('#decrypt-file-picker').setInputFiles(Array.from({ length: 5 }, (_, index) => file(`maximum-${index + 1}.txt`, maximumFile)))
  await expect(inputs(page)).toHaveCount(6)
  await page.locator('#decrypt-file-picker').setInputFiles(file('over-budget.txt'))
  await expect(status(page)).toContainText('5 MiB')
  await expect(inputs(page)).toHaveCount(6)
  await inputs(page).nth(1).locator('summary').click()
  await inputs(page).nth(1).getByRole('button', { name: 'Remove input' }).click()
  await expect(inputs(page)).toHaveCount(5)
  await page.locator('#decrypt-file-picker').setInputFiles(file('fits-after-removal.txt'))
  await expect(inputs(page)).toHaveCount(6)
  await expect(page.locator('.entry-filename').last()).toHaveText('fits-after-removal.txt')
})

for (const action of ['edit', 'remove', 'navigate', 'new selection']) {
  test(`a late file read cannot restore ciphertext after ${action}`, async ({ page }) => {
    await gateReads(page)
    await page.goto(`${artifactUrl.href}#decrypt`)
    if (action === 'remove')
      await page.locator('#add-decrypt-input').click()
    await page.locator('#decrypt-file-picker').setInputFiles(file('obsolete.txt'))
    await expect.poll(() => page.evaluate(() => window.pendingReads.length)).toBe(1)
    if (action === 'edit') {
      await page.locator('#decrypt-text').fill('newer input content')
    }
    else if (action === 'remove') {
      await inputs(page).last().getByRole('button', { name: 'Remove input' }).click()
    }
    else if (action === 'navigate') {
      await page.getByRole('tab', { name: 'Derive', exact: true }).click()
    }
    else {
      await page.locator('#decrypt-file-picker').setInputFiles(file('current.txt'))
    }
    await page.evaluate(() => window.pendingReads[0].release())
    await expect.poll(() => page.evaluate(() => window.finishedReads)).toBe(1)
    if (action === 'new selection') {
      await expect.poll(() => page.evaluate(() => window.pendingReads.length)).toBe(2)
      expect(await page.evaluate(() => window.pendingReads[1].name)).toBe('current.txt')
      await page.evaluate(() => window.pendingReads[1].release())
      await expect(inputs(page)).toHaveCount(2)
      await expect(page.locator('.entry-filename')).toHaveText('current.txt')
    }
    else {
      if (action === 'navigate')
        await page.getByRole('tab', { name: 'Encrypt / Decrypt', exact: true }).click()
      await expect(inputs(page)).toHaveCount(1)
      await expect(page.locator('.entry-filename')).toHaveCount(0)
      await expect(inputs(page).first().locator('textarea')).toHaveValue(action === 'edit' ? 'newer input content' : '')
    }
    await expect(page.locator('#decrypt-outputs > details')).toHaveCount(0)
  })
}

test('files are read serially and canceling a later read preserves an already imported sibling', async ({ page }) => {
  await gateReads(page)
  await page.goto(`${artifactUrl.href}#decrypt`)
  await page.locator('#decrypt-file-picker').setInputFiles([file('first.txt'), file('second.txt')])
  await expect.poll(() => page.evaluate(() => window.pendingReads.length)).toBe(1)
  await expect(inputs(page)).toHaveCount(1)
  await page.evaluate(() => window.pendingReads[0].release())
  await expect(inputs(page)).toHaveCount(2)
  await expect.poll(() => page.evaluate(() => window.pendingReads.length)).toBe(2)
  await expect(page.locator('.entry-filename')).toHaveText('first.txt')
  await inputs(page).last().locator('textarea').fill(`${payload}\n`)
  await page.evaluate(() => window.pendingReads[1].release())
  await expect.poll(() => page.evaluate(() => window.finishedReads)).toBe(2)
  await expect(inputs(page)).toHaveCount(2)
  await expect(page.locator('.entry-filename')).toHaveText('first.txt')
  await expect(inputs(page).last().locator('textarea')).toHaveValue(`${payload}\n`)
})

for (const width of [390, 320]) {
  test(`file importing and Unicode filenames fit ${width}px mobile layouts`, async ({ page, context }, testInfo) => {
    await context.setOffline(true)
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`${artifactUrl.href}#decrypt`)
    await page.locator('#decrypt-file-picker').setInputFiles([
      file(`${'🔐Unicode-e\u0301-'.repeat(20)}.txt`),
      file('invalid-file.txt', 'not encrypted'),
      file('日本語-café.txt'),
    ])
    await expect(inputs(page)).toHaveCount(3)
    await page.locator('#decrypt-secret').fill(password)
    await page.locator('#decrypt-button').click()
    await expect(page.locator('#decrypt-outputs > details')).toHaveCount(2)
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme)
        await page.locator('#theme-toggle').click()
      expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth)).toBe(true)
      const screenshot = `test-results/screenshots/symmetro-file-import-${width}-${theme}.png`
      await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
      await testInfo.attach(`file-import-${width}-${theme}`, { path: screenshot, contentType: 'image/png' })
    }
  })
}
