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

The build embeds third-party runtime notices as a comment in the standalone
HTML. `scripts/third-party-notices.js` reads the installed `hash-wasm` license,
bundled helper notice, and Argon2/BLAKE2b source attributions, plus the Go BSD
notice retained in `scripts/licenses/` for the Argon2 implementation credited by
hash-wasm. The BLAKE2b reference code offers CC0 as one license option; that is
the option used here. Artifact validation requires the complete notices after
minification and worker inlining. Review this list when adding or updating
runtime dependencies. Build-tool licenses are not included because those tools
are not shipped in the app.

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

The browser suite captures populated Encrypt, Decrypt, and Derive screenshots in
dark and light themes at 320, 390, and 1920 pixels, and checks for horizontal
overflow and the 1600-pixel workspace cap. It also covers the nested tool/mode
navigation and theme changes without losing inputs or results. CI uploads images as
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

## Preparing and publishing a release

1. Merge the intended changes and confirm the checks pass for the exact final
   `main` commit. Run `npm ci --ignore-scripts`, `npm run check`, and
   `npm run test:browser` when verifying locally; inspect the built HTML and
   screenshots. Automated browser coverage currently uses Chromium.
2. Keep `package.json` and both root version fields in `package-lock.json` in
   sync. The app displays the package version. Update the matching changelog
   entry with the release date when publication is approved. Application version
   changes must not change the frozen recipe or legacy ciphertext format.
3. Review the final commit, changelog, and expected `v<package-version>` tag
   together before creating or pushing a tag. The workflow accepts any `v*` tag;
   the maintainer must verify that it matches the package version.
4. **Pushing the tag publishes the built app to GitHub Pages automatically, even
   though the GitHub release is created as a draft.** Preparing a release branch
   or draft text does not require pushing the tag. Obtain publication approval
   before triggering this workflow.
5. On the tagged commit, verify the full Deploy workflow, the versioned HTML
   asset (`symmetro-v<package-version>.html`), and its GitHub build attestation.
   Download that exact asset and check it offline. Confirm the live Pages version
   separately; local checks cannot verify the hosted release or attestation.
6. Add the reviewed changelog text to the draft release, then publish the release
   when approved. Keep the release asset and source tag aligned; do not rebuild or
   replace a published asset from a different commit.

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
clear text. The explicit Show Clear Text action displays it. Editing, clearing,
or navigation invalidates pending checks so stale validation cannot change the
current indicator or result.

Each tool includes a collapsed explanation of its use cases, fixed parameters,
and tradeoffs. Opening help does not change tools, clear fields, or affect a
pending operation. External references load only when followed.
The explanations define technical terms for readers without cryptography
knowledge. The single-option recipe selector is disabled; v1 remains the fixed
calculation. Tool headers have matching heights at desktop and mobile widths,
and the release version sits at the bottom of the brand row.

Derive's Length control offers 16, 24, and Max (43), with Max selected initially.
The worker still produces the exact full v1 result. The UI keeps it in memory
and displays/copies its first N characters; changing length does not rerun or
cancel derivation. Pending results use the latest length choice. Editing inputs,
clearing, and navigation discard the full result; clearing and navigation reset
length to Max. Copy feedback from a previous length cannot label a newer result
as copied. The account mapping must retain both the number and chosen length.

## Multiple decryption inputs

Decrypt supports up to 20 numbered ciphertext inputs with one shared password.
Add input opens the new accordion and collapses the others. Header counts use
Unicode code points. Password typing pauses trigger serial, debounced checks
without revealing plaintext; each nonempty input gets its own result. Inputs
using other passwords are expected and do not prevent successful ones from
opening with Show Clear Text. Empty inputs remain neutral. Only successful
results are rendered after this explicit action, with one result open at a time.

Trying a password collapses the input accordions. Editing ciphertext leaves its
accordion open. Editing, removing, clearing, and navigation invalidate running
work and discard revealed results. The most recent validation request replaces
obsolete queued work, and stale completions cannot reveal or relabel results.
Neither ciphertext nor plaintext is persisted or transmitted. Encryption and
the frozen derivation recipe are unchanged.

### Local ciphertext-file import

Decrypt accepts multiple files through its drop target or native picker. Every
accepted file creates a new input; the existing blank/manual inputs remain.
Files are decoded locally, never uploaded, and filenames are display-only text
with paths, controls, and bidirectional-formatting characters removed.

Accepted encodings are strict UTF-8 (optional BOM), or UTF-16 LE/BE with a BOM.
Malformed encodings, empty text, binary/control content, and text without a
complete base64 encrypted-envelope structure are rejected. A structurally valid
file still needs the correct password and authentication tag to decrypt.
Decoded ciphertext is retained without trimming or Unicode normalization;
textarea display follows the browser's newline handling. Limits are 1 MiB per
file, 20 files examined per selection, 20 total inputs, and 5 MiB of imported
source bytes retained across the current inputs. Editing an imported input does
not release its reserved byte budget; removing or clearing it does.

Mixed batches report rejected files and retain accepted siblings. Reads happen
serially. A new import, editing, removal, clearing, or navigation invalidates
unfinished reads, so late file completions cannot repopulate newer UI state.
Rejected files do not reserve input or retained-byte budget. The same file can
be selected repeatedly as separate inputs. No MIME type or extension is trusted
as proof that its contents are text.
