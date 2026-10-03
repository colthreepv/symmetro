import assert from 'node:assert/strict'
import test from 'node:test'
import { ESLint } from 'eslint'

const eslint = new ESLint()

async function rulesFor(source, filePath) {
  const [result] = await eslint.lintText(source, { filePath })
  assert.equal(result.fatalErrorCount, 0, 'The probe must parse successfully')
  return result.messages.map(message => message.ruleId)
}

test('correctness lint catches duplicate object keys in JavaScript', async () => {
  const rules = await rulesFor('export const value = { item: 1, item: 2 }', 'tests/lint-probe.js')
  assert.ok(rules.includes('no-dupe-keys'))
})

test('typed lint catches unhandled and misused promises in application code', async () => {
  const floating = await rulesFor('Promise.resolve("synthetic")', 'src/derive-input.ts')
  assert.ok(floating.includes('@typescript-eslint/no-floating-promises'))
  const misused = await rulesFor('if (Promise.resolve(true)) { console.log("synthetic") }', 'src/derive-input.ts')
  assert.ok(misused.includes('@typescript-eslint/no-misused-promises'))
})

test('lint allows harmless formatting differences', async () => {
  const rules = await rulesFor('export const spacing={value:"synthetic"};', 'src/derive-input.ts')
  assert.deepEqual(rules, [])
})
