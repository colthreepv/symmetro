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

- `pnpm check` runs lint, strict TypeScript checks, synthetic crypto/derivation tests, the build, and static standalone-artifact validation
- `pnpm typecheck` runs TypeScript independently; `pnpm test` runs the Node unit tests
- `pnpm exec playwright install chromium` installs the browser used by the tests
- `pnpm test:browser` opens the built HTML through `file://` with browser networking disabled and covers encryption/decryption, legacy ciphertext, independent derivation vectors, cancellation, navigation, input errors, clipboard fallback, and responsive layout
- To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path

The browser suite captures populated Encrypt, Decrypt, and Derive screenshots in
dark and light themes at 320, 390, and 1920 pixels, and checks for horizontal
overflow and the 1600-pixel workspace cap. It also covers the nested tool/mode
navigation and theme changes without losing inputs or results. CI uploads images as
`symmetro-ui-screenshots`; inspect them as well as the test results. Use no real
secrets in tests or screenshots.

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

## Numbered password derivation

[DERIVATION_V1.md](DERIVATION_V1.md) specifies the frozen byte-level recipe,
security tradeoffs, API, independent reference vectors, and verification commands.
Recipe versions are separate from application and encrypted-payload versions.

Version 1 uses Argon2id (64 MiB, three iterations, four lanes) and HKDF-SHA-256,
with fixed public salts. Identical inputs produce identical passwords across
users, and a known output permits offline secret guesses. One expensive root-key
guess can be reused across password numbers. The output is 43-character,
unpadded base64url; it does not promise compatibility with every password policy.

The UI accepts single-line secret text and rejects multiline paste/drop. The
underlying API preserves exact UTF-8, including newlines; it never trims or
normalizes secret text. Password numbers are canonical decimal strings from 1
through 18446744073709551615 and are handled with `BigInt`, not JavaScript
floating-point numbers.

All runtime dependencies, including the WASM implementation, are bundled into
the HTML. Derivation runs in a disposable inline worker. Editing, clearing, or
switching tools terminates the worker and invalidates stale results. No secrets
or mappings are persisted in local/session storage. Copying is explicit, with a
selection fallback. Clearing cannot guarantee erasure of browser memory or
clipboard history.

The interface uses local system fonts, keyboard-accessible tool and mode tabs,
and explicit pending/error states. Encrypt/Decrypt share one workspace; Derive
has its own view. Dark mode is the default on every load, with a session-only
light-mode toggle. There are no external runtime resources, telemetry, or
backend. Documentation links navigate externally only when clicked.

Action buttons show pending, success, and error icons. Routine feedback remains
available to screen readers; only actionable errors appear below the controls.
Decrypt also checks the password after a short typing pause without displaying
plaintext. Editing, clearing, or navigation invalidates pending checks so stale
validation cannot change the current indicator or result.
