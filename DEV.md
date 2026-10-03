# Development

End-user instructions and download verification are in [README.md](README.md).

## Setup and build

- Use the Node.js version in `.node-version` (currently 24.19.0)
- Install the exact pnpm version in `package.json`: `corepack enable && corepack prepare pnpm@9.1.0 --activate`
- Install dependencies with `pnpm install --frozen-lockfile --ignore-scripts`
- Run `pnpm start` for the development server
- Run `pnpm build` for the production artifact

The production build cleans `dist` and produces exactly one file,
`dist/index.html`, with its JavaScript and CSS embedded. Open that built file
directly from the filesystem to test the downloadable app. Do not deliver the
source HTML or rely only on the development server.

## Checks

- `pnpm check` runs lint, synthetic crypto regression tests, the build, and static checks that the result is self-contained
- `pnpm exec playwright install chromium` installs the browser used by the tests
- `pnpm test:browser` opens the built HTML through `file://` with browser networking disabled, exercises encryption/decryption and a legacy fixture, and checks for separate-resource requests
- To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path

## Continuous integration

Pull requests and pushes to `main` run the checks above and upload the verified
HTML as the `symmetro-standalone-html` Actions artifact. Tagged releases run the
same checks before attestation, draft-release creation, and Pages deployment.
Only release/deployment jobs receive write permissions.

## Legacy encryption compatibility

The synthetic fixture preserves the existing v2 payload format: 16-byte salt,
12-byte IV, and AES-256-GCM ciphertext plus its 16-byte authentication tag, encoded
as base64. Key derivation remains PBKDF2-SHA256 with 100,000 iterations. Tests
independently decode the envelope and cover Unicode, empty and large plaintext,
fresh salt/IV generation, wrong passwords, and tampered or truncated payloads.

Use synthetic inputs only. These checks are regression safeguards, not a security
audit or a guarantee of password strength.
