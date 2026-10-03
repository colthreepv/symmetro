# symmetro
Encrypt and decrypt text, or derive reproducible numbered passwords, in one offline HTML file.
Available on [github pages](https://colthreepv.github.io/symmetro/) and [statically build releases](https://github.com/colthreepv/symmetro/releases)

## Security & Verification

This is critical security software. To ensure the integrity of the built files, we use **GitHub Attestations** which provide cryptographic proof of provenance.

### Verifying Build Integrity

To verify that a downloaded `index.html` file was built from the official source code:

```bash
# Install GitHub CLI if you haven't already
# Then verify the file:
gh attestation verify index.html -R colthreepv/symmetro
```

This will show you:
- ✅ **Exact commit SHA** used to build the file
- ✅ **When it was built** and by which workflow
- ✅ **Cryptographic proof** it hasn't been tampered with

**Always verify files before using them for sensitive operations!**

## Usage
- Use the Node.js version in `.node-version` (currently 24.19.0)
- Install the exact pnpm version in `package.json`: `corepack enable && corepack prepare pnpm@9.1.0 --activate`
- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm start` (for dev mode)
- `pnpm build` (for production build)

The production build produces exactly one file, `dist/index.html`. Download or
copy this file and open it directly from the filesystem. Its JavaScript and CSS
are embedded, so encryption and decryption do not require a server or an internet
connection. Documentation links open external websites only when followed.

## Three local tools

- **Encrypt** protects any text with the existing AES-256-GCM envelope. Keep the password separately; there is no reset or recovery.
- **Decrypt** opens existing Symmetro ciphertext, including the unchanged v2 format. Password checks run only on submission.
- **Derive** turns secret text plus a positive password number and a recipe version into a deterministic 43-character base64url password. Remember your own mapping of numbers to uses. No service names, account names, saved profiles, or password lists are required.

The Derive interface accepts **single-line secret text**, preserving its exact spaces, case, and Unicode characters. Multiline paste and text drop are explicitly rejected rather than silently changing the secret. The underlying versioned API supports exact UTF-8 text including newlines; see [the frozen v1 recipe and test vectors](DERIVATION_V1.md). Number inputs use decimal strings throughout, including beyond JavaScript's safe integer range. Recipe v1 supports 1 through 18446744073709551615.

Recipe v1 uses Argon2id (64 MiB, 3 passes, parallelism 4) and HKDF-SHA256. Its salt is fixed and public for reproducibility. Identical inputs produce identical passwords for everyone. A known generated password lets an attacker test secret guesses offline; guessing the source secret reveals every number derived from it. Use a long, unpredictable, unique secret. Generating a long output does not make weak input safe. The 43-character format may not fit every site's password rules.

All cryptographic dependencies, including the WASM implementation, are bundled. Derivation runs in one disposable inline worker; changing input, clearing, or switching tools terminates it and invalidates stale results. Nothing is persisted in local/session storage. Switching tools and reloading clear fields. Copying is explicit, with a selection fallback if browser clipboard access is unavailable. Clearing cannot erase clipboard history or guarantee erasure of JavaScript/browser memory.

The interface uses English, local system fonts, responsive layouts, keyboard-accessible tabs, explicit pending/error states, and no external resources, telemetry, or backend. Documentation links navigate externally only when clicked.

## Development checks

- `pnpm check` runs lint, strict TypeScript checks, synthetic crypto regression tests, the build, and static
  checks that the result is a self-contained HTML file
- `pnpm exec playwright install chromium` installs the browser used by the tests
- `pnpm test:browser` opens the built HTML using a `file://` URL with the browser
  network disabled, checks encryption/decryption, a legacy fixture, derivation vectors, cancellation, keyboard navigation, input errors, and clipboard fallback, and fails
  if the round trip tries to load a separate resource
- To test an existing Chromium installation, set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path

Pull requests and pushes to `main` run these checks and upload the verified HTML
as the `symmetro-standalone-html` Actions artifact. Tagged releases run the same
checks before the existing attestation, draft-release, and Pages deployment steps.
Only release/deployment jobs receive write permissions.

The fixed test fixture contains a synthetic password and preserves the existing
v2 payload format: 16-byte salt, 12-byte IV, and AES-256-GCM ciphertext plus its
16-byte authentication tag, encoded as base64. Key derivation remains
PBKDF2-SHA256 with 100,000 iterations. Tests use no real credentials. These checks
are regression safeguards, not a security audit or a guarantee of password
strength.

## Visual checks

The browser suite captures empty-state desktop and mobile screenshots for Encrypt and Derive, and checks both layouts for horizontal overflow. CI uploads these as `symmetro-ui-screenshots`; screenshots use no real secrets.
