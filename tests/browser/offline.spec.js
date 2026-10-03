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

  await page.locator('#mode-switch').check()
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
