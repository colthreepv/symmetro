import { derivePassword } from '../../src/derive.ts'
import { expect, test } from '@playwright/test'
const url = new URL('../../dist/index.html', import.meta.url).href
test('unified field works offline with exact numeric compatibility and emoji', async ({page, context}) => {
  await context.setOffline(true)
  const requests = []
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()) })
  await page.goto(url + '#derive')
  await page.locator('#derive-secret').fill('Public synthetic label test secret')
  await page.locator('#derive-index').fill('33')
  await expect(page.locator('#derive-version')).toContainText('Original numeric')
  await page.locator('#derive-button').click()
  await expect(page.locator('#derived-password')).toHaveValue(/^[A-Za-z0-9_-]{43}$/)
  const numeric = await page.locator('#derived-password').inputValue()
  expect(numeric).toBe(await derivePassword('Public synthetic label test secret', '33'))
  for (const label of ['wallet', '🚗', '1️⃣', '👨‍👩‍👧‍👦']) {
    await page.locator('#derive-index').fill(label)
    await expect(page.locator('#derived-password')).toHaveValue('')
    await expect(page.locator('#derive-version')).toContainText('v2')
    await page.locator('#derive-button').click()
    await expect(page.locator('#derived-password')).toHaveValue(/^[A-Za-z0-9_-]{43}$/)
    const value = await page.locator('#derived-password').inputValue()
    expect(value).not.toBe(numeric)
    await page.locator('#derive-button').click()
    await expect(page.locator('#derived-password')).toHaveValue(value)
  }
  await page.locator('#derive-index').fill('033')
  await page.locator('#derive-button').click()
  await expect(page.locator('#derive-status')).toContainText('without leading zeros')
  await page.reload()
  await expect(page.locator('#derive-secret')).toHaveValue('')
  expect(requests).toEqual([])
})

test('Copy label preserves exact Unicode without copying the secret or password', async ({ page, context }) => {
  await context.setOffline(true)
  await page.addInitScript(() => {
    window.copiedLabels = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.copiedLabels.push(text) },
    } })
  })
  await page.goto(url + '#derive')
  await expect(page.locator('#copy-label')).toBeDisabled()
  await page.locator('#derive-secret').fill('Public synthetic secret for clipboard isolation')
  const label = 'e\u0301 👨‍👩‍👧‍👦 ❤️'
  await page.locator('#derive-index').fill(label)
  await page.locator('#copy-label').click()
  await expect(page.locator('#derive-status')).toHaveText('Label copied.')
  expect(await page.evaluate(() => window.copiedLabels)).toEqual([label])
  await page.locator('#derive-index').fill('033')
  await expect(page.locator('#copy-label')).toBeDisabled()
})

test('Copy label offers manual selection when clipboard access is unavailable', async ({ page, context }) => {
  await context.setOffline(true)
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }))
  await page.goto(url + '#derive')
  await page.locator('#derive-index').fill('🚗 e\u0301')
  await page.locator('#copy-label').click()
  await expect(page.locator('#derive-status')).toContainText('The label is selected')
  const selected = await page.locator('#derive-index').evaluate(input => input.value.slice(input.selectionStart, input.selectionEnd))
  expect(selected).toBe('🚗 e\u0301')
})
