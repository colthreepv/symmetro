# Development

End-user instructions and download verification are in [README.md](README.md).

## Setup and build

- Use the Node.js version in `.node-version` (currently 24.19.0)
- Use the npm bundled with that Node release (11.17.0); no additional package manager is needed
- Install dependencies with `npm ci --ignore-scripts`
- Run `npm start` for the development server
- Run `npm run build` for the production artifact

The production build cleans `dist` and produces exactly one file,
`dist/index.html`, with its JavaScript and CSS embedded. Open that built file
directly from the filesystem to test the downloadable app. Do not deliver the
source HTML or rely only on the development server.

## Toolchain choices

This is one small package, so it uses the npm bundled with the pinned Node
release. `devEngines` accepts compatible Node 24 and npm 11 updates from this baseline;
CI still uses `.node-version` exactly. `packageManager` records the baseline
package-manager version for editors; it does not install or enforce that version.
`package-lock.json` is the only dependency lockfile. Use `npm ci --ignore-scripts`
for repeatable installs; dependency lifecycle scripts are not needed for this
build. When changing dependencies, use `npm install --ignore-scripts` and review
the lockfile diff.

ESLint checks JavaScript/TypeScript mistakes and unhandled or misused promises
in application TypeScript. There are no formatting, quote, semicolon, import
sorting, CSS, or Markdown lint gates. Format locally however is useful without
reformatting unrelated code. TypeScript checks types; the independent vectors,
compatibility tests, and offline browser tests check behavior it cannot prove.

Vite 7.3 receives upstream important fixes and security patches and keeps the
existing Rollup build. It is pinned with a compatible `vite-plugin-singlefile`;
the Vite 8/Rolldown migration is intentionally a separate decision. The interface
uses ordinary CSS with a small explicit reset, without Tailwind, DaisyUI, or a
separate PostCSS configuration. `hash-wasm` and derivation-v1 vectors stay pinned.

## Checks

- `npm run check` runs lint, strict TypeScript checks, synthetic crypto/derivation tests, the build, and static standalone-artifact validation
- `npm run typecheck` runs TypeScript independently; `npm test` runs the Node unit tests
- `npm exec -- playwright install chromium` installs the browser used by the tests
- `npm run test:browser` opens the built HTML through `file://` with browser networking disabled and covers encryption/decryption, legacy ciphertext, independent derivation vectors, cancellation, navigation, input errors, clipboard fallback, and responsive layout
- To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path

The browser suite captures empty-state desktop and mobile screenshots for Encrypt
and Derive and checks for horizontal overflow. CI uploads the images as
`symmetro-ui-screenshots`; inspect them as well as the test results. Use no real
secrets in tests or screenshots.

## Dependency advisories

As of 2026-10-03, `npm audit` reports the unpatched
[braces advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
through the build-only `vite-plugin-singlefile` → `micromatch` dependency chain.
This dependency was already present before the toolchain update. The plugin only
calls micromatch when `inlinePattern` is nonempty; this project leaves it at its
empty default. It is not bundled into the downloaded application. Reassess this
when changing build configuration or when upstream publishes a patch. Do not use
`npm audit fix --force` to downgrade the single-file plugin to an obsolete release.

`npm audit --omit=dev` checks the runtime dependency advisories separately. A clean
advisory report does not audit the application or prove its cryptography safe.

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

The interface uses local system fonts, keyboard-accessible tabs, and explicit
pending/error states. There are no external runtime resources, telemetry, or
backend. Documentation links navigate externally only when clicked.
