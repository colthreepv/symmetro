# Changelog

## 3.1.0 — 2026-10-07

### Added

- Add up to 20 encrypted text inputs in Decrypt, checked with one shared password;
  only matching messages are revealed when requested.
- Import ciphertext files locally by choosing or dropping them. Support strict UTF-8
  and BOM-marked UTF-16, with per-file and workspace size limits and validation.

## 3.0.0 — 2026-10-03

### Added

- Numbered password derivation with a frozen recipe v1, using Argon2id and
  HKDF-SHA-256. Recreate a password with the exact same secret, recipe, number,
  and selected length.
- Password lengths of 16, 24, or Max (43) characters. Shorter results are prefixes
  of the same full password; choose a different number for each account.
- A responsive dark/light interface with separate Encrypt/Decrypt and Derive
  workspaces, keyboard navigation, contextual help, reveal controls, and explicit
  copy with a manual-selection fallback.
- Offline browser checks, independent cryptographic reference vectors, legacy
  ciphertext compatibility tests, and single-file build validation in CI.

### Changed

- Decrypt checks the password after a short typing pause. Clear text is displayed
  only when **Show Clear Text** is selected.
- Derivation runs in a disposable worker. Editing inputs, clearing, or navigating
  cancels pending work and prevents stale results from returning.
- Simplified development tooling: pinned Node 24 and npm, one npm lockfile,
  correctness-focused linting, strict TypeScript, and ordinary CSS.
- Expanded user guidance and split development and frozen-recipe documentation
  into dedicated files.
- Preserve bundled third-party notices inside the standalone HTML, with an
  artifact check to prevent production minification from removing them.

### Compatibility and privacy

- Existing Symmetro v2 encrypted text remains supported. AES-256-GCM, PBKDF2
  parameters, and the encrypted payload format are unchanged.
- **3.0.0 is the application version.** Password derivation still uses recipe
  **v1**; application, ciphertext, and recipe versions are separate.
- The downloaded HTML includes its JavaScript, styles, and WASM. It operates
  offline without a backend, telemetry, or saved secrets/account mappings.
- Exact secret text matters. The interface accepts one line and rejects multiline
  paste/drop instead of silently changing the secret. A weak or mistyped secret
  is not detected or repaired, and there is no recovery service.
- A known derived password permits offline guesses of the secret. Clearing the
  interface cannot guarantee erasure from browser memory or clipboard history.
- See [DEV.md](DEV.md#dependency-advisories) for the known build-only dependency
  advisory. Tests and build provenance are not a cryptographic security audit.

## Earlier releases

See the [GitHub release history](https://github.com/colthreepv/symmetro/releases).
