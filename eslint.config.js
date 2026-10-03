import antfu from '@antfu/eslint-config'

export default antfu({}, {
  files: ['tests/*.test.js'],
  rules: {
    // Unit tests intentionally use Node's built-in runner instead of Vitest.
    'test/no-import-node-test': 'off',
  },
})
