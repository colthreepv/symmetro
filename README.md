# symmetro
Encrypt and decrypt text with AES-256-GCM on a easy to deploy webpage
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

## Development checks

- `pnpm check` runs lint, synthetic crypto regression tests, the build, and static
  checks that the result is a self-contained HTML file
- `pnpm exec playwright install chromium` installs the browser used by the tests
- `pnpm test:browser` opens the built HTML using a `file://` URL with the browser
  network disabled, checks encryption/decryption and a legacy fixture, and fails
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

# one gif
![gif showing ui](https://github.com/user-attachments/assets/0ff6774f-5929-4d05-bc26-92e8272e39b4)
