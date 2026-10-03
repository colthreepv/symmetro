# Symmetro numbered password derivation, version 1

This module has only three derivation inputs: secret text, recipe version, and
password number. It has no identity, service, login, profile, personal salt,
saved mapping, or account. Re-entering the same inputs reproduces the output.

## Frozen byte-level recipe

1. Accept a nonempty, well-formed Unicode secret string. Encode its exact
   contents as UTF-8. Do not trim, change case, normalize Unicode, or rewrite
   newlines. Reject lone UTF-16 surrogates rather than let `TextEncoder` replace
   them. The application limit is 1,048,576 UTF-8 bytes.
2. Accept the password number as a canonical decimal string from `1` through
   `18446744073709551615` inclusive. No sign, leading zeros, whitespace, decimal
   point, exponent notation, or non-ASCII digit is accepted. Parse with `BigInt`,
   never `Number`; serialize as exactly eight unsigned big-endian bytes.
3. Compute a 32-byte root using Argon2id version 19 (`0x13`), memory 65,536 KiB,
   three iterations, four lanes, no optional secret or associated data, and the
   literal UTF-8 salt `symmetro:derive:v1:argon2id`.
4. Apply full HKDF-SHA-256 (Extract and Expand) to that root. Salt is literal
   UTF-8 `symmetro:derive:v1:hkdf`. Info is literal UTF-8
   `symmetro:password:v1`, followed by one zero byte, followed by the eight-byte
   password number. Output length is exactly 32 bytes.
5. Encode the result using the RFC 4648 base64url alphabet without padding.
   The credential is exactly 43 characters. It has no version prefix or suffix.

These parameters, domain strings, text encoding, index encoding, output length,
and alphabet are immutable parts of recipe 1. Do not auto-tune, weaken, or
silently migrate them. Future recipes need a new identifier and must retain the
old recipe so earlier outputs can still be reproduced. Application release
versions, ciphertext format versions, and password recipe versions are separate.

## Security statements the interface should preserve

- The output's security depends on the input secret. A longer derived string
  does not add entropy to a weak secret.
- The fixed public salt is a deliberate consequence of stateless recovery. It
  does not provide per-user random salting: identical secret/version/number
  inputs produce identical outputs for everyone, and precomputation can be
  reused across users. The common Argon2 root also lets an attacker reuse one
  expensive guess across multiple password numbers.
- A disclosed derived credential allows offline guesses of the secret. Knowing
  one output does not directly expose the other outputs, but a successful secret
  guess exposes all of them. A shared or reused secret links security across
  its uses.
- The application cannot recognize a mistyped secret. A changed secret produces
  a different, valid-looking credential. Exact spaces, case, and line breaks
  matter, as do visually identical composed/decomposed Unicode strings.
- An output is deterministic, not an independently random password. Use a long,
  unpredictable secret. The UI must not promise absolute irreversibility or
  256-bit security for an arbitrary human-chosen secret.
- The 43-character alphabet is generic; the tool does not guarantee compatibility
  with every external password policy.

## API and integration

- `derivePassword(secret, index, version = 1): Promise<string>` returns only the
  credential. It does not export a root key or retain a credential cache.
- `derive-input.ts` contains only constants and pure input-validation/index
  helpers. Import it directly from the UI to avoid bundling the Argon2 code into
  both the main page and a worker.
- `parsePasswordIndex(index): bigint` and `nextPasswordIndex(index): string`
  avoid floating-point rounding, including above 2^53.
- `validateSecret(secret): void` rejects empty, invalid-Unicode, or oversized
  text. It does not assess or assert secret strength.
- Use a text field with numeric input mode for the index, not a numeric value
  stored in JavaScript `Number`.
- Run derivation in a single-use worker, bundled inline, and terminate the worker
  on success, error, cancel, clear, or abandoned navigation. Discard stale results
  after any input or recipe change. Do not silently fall back to a different KDF.
- UI controls can be limited to secret text, password number, Generate,
  Next password, reveal/copy, Clear, and a visible recipe identifier. Copy only
  the 43-character output, not its display label or recipe identifier.
- There is no persistence, URL state, logging, telemetry, or network operation in
  the module. Do not add these around it. Disable browser form conveniences for
  secrets where supported; browsers and extensions may ignore such hints.
- Wipe owned mutable buffers on both success and error. JavaScript strings,
  WebCrypto copies, WASM allocations, swap, screenshots, and clipboard history
  cannot be reliably erased by the page. Do not claim otherwise. Explicit copy
  should be the only clipboard write; do not silently read or later overwrite it.
- Do not implement “Download app” by serializing the active DOM: it may contain
  credentials. Deliver the pristine built HTML.

The original AES-GCM encryption/decryption code is outside this module. Preserve
legacy decoding byte-for-byte. If new encryption is introduced, keep AES-256-GCM
with a fresh 12-byte nonce and a fresh per-message KDF salt embedded in an
explicitly versioned ciphertext envelope. That salt is internal ciphertext
metadata and does not create a separate recovery profile. Authenticate the header
and reject an unsupported or invalid modern envelope instead of falling back to
legacy decoding. A stronger password KDF improves guessing cost; changing an
already-correct AES-GCM cipher is not inherently a security upgrade.

## Dependencies and offline packaging

Runtime dependency: exact `hash-wasm@4.12.0` (MIT), locked in `pnpm-lock.yaml`.
The official package exposes `argon2id`, supports binary input/output, and embeds
WASM in its JavaScript distribution. The inspected ESM package has no `fetch`
call. Import only `argon2id`; let the existing production bundler tree-shake the
other hash algorithms. Do not use a runtime CDN script or external WASM URL.

Development uses TypeScript 5.9.3 and `@types/node` 24.10.1. Tests run
with Node 24's native TypeScript stripping and `node:test`; type checking is a
separate `tsc --noEmit` step. Vite can transpile the `.ts` modules itself, but CI
must still type-check them. The production build bundles the derivation worker
and WASM into the HTML; browser tests exercise the final offline artifact.

Production acceptance still requires inspecting the final built artifact, opening
it directly through `file://` with network disabled, and checking derivation,
worker cancellation/stale-result handling, legacy decryption, clipboard errors,
and reload-cleared state. Node unit tests do not establish browser/offline UX.

## Independent vectors and tests

`tests/derivation-v1-vectors.json` contains 13 public synthetic vectors. They
cover indices 1, 2, 3, an integer beyond 2^53, maximum u64, non-ASCII Unicode,
supplementary Unicode, composed/decomposed text, whitespace, LF/CRLF, and NUL.
They were generated and reverified by `scripts/reference_vectors.py` using
native `argon2-cffi` and Python `hashlib`/`hmac`, independently of hash-wasm and
Web Crypto. The reference first checks an official Argon2id known-answer vector
and HKDF's RFC 5869 Appendix A.1 vector. The same primitive known-answer checks
also run against hash-wasm and Web Crypto in the TypeScript tests.

Run:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
# Optional independent re-verification; never supply personal secrets.
python -m pip install -r scripts/reference-requirements.txt
python scripts/reference_vectors.py
```

The module suite contains 22 passing tests, including exact and over-limit
supplementary/mixed-width UTF-8 boundaries. No personal credential was used.
Keep the expected vectors fixed across implementation refactors; a change is a
compatibility failure, not a fixture refresh.

## Primary references

- [RFC 9106, Argon2 parameter choices and recommendations](https://www.rfc-editor.org/rfc/rfc9106.html#section-4)
- [RFC 5869, HKDF and context separation](https://www.rfc-editor.org/rfc/rfc5869.html#section-3.2)
- [Official Argon2 reference known-answer tests](https://github.com/P-H-C/phc-winner-argon2/blob/master/src/test.c)
- [Official hash-wasm documentation](https://github.com/Daninet/hash-wasm)
- [RFC 4648, base64url](https://www.rfc-editor.org/rfc/rfc4648.html#section-5)
