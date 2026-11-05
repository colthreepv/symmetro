# Unified identifiers and label recipe v2

Labels preserve exact Unicode input, without normalization. Routing and recipe rules below are frozen for compatibility. Application versions
are separate from recipe identifiers. v2 is not a higher security level.

## Routing and validation

Reject empty input and leading/trailing ECMAScript whitespace (the fixed set
U+0009–000D, 0020, 00A0, 1680, 2000–200A, 2028, 2029, 202F, 205F, 3000, FEFF).
All-ASCII-digit strings belong exclusively to numeric v1. Require its canonical
integer range 1..18446744073709551615 without leading zeros. Never convert via
JavaScript Number. Invalid numeric input is an error, never a label.

Reject numeric-only strings drawn from ASCII, Arabic-Indic U+0660–0669,
Eastern Arabic-Indic U+06F0–06F9 and fullwidth U+FF10–FF19 digits. Reject signed,
fractional and exponent ASCII numeric spellings matching
`^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$`.
Other strings are labels, subject to validation below. These explicit ranges
are frozen; future Unicode property tables must not change classification.

Labels preserve exact Unicode text: no NFC/NFKC, case folding, trimming or emoji
rewriting. Composed/decomposed accents, variation selectors and ZWJ sequences
remain distinct. Reject lone UTF-16 surrogates before encoding. Reject U+0000–001F,
007F–009F, 061C, 200E–200F, 202A–202E, 2066–2069. Internal ordinary spaces are
allowed. Accept at most 1024 UTF-8 bytes (and the existing 1 MiB input precheck).
The base secret retains all original v1 validation and exact UTF-8 semantics.

## Label recipe v2

1. Encode exact validated secret and label as UTF-8.
2. Argon2id version 0x13, 65536 KiB, 3 iterations, 4 lanes, 32 output bytes,
   no optional secret/associated data, salt UTF-8 `symmetro:derive:v2:argon2id`.
3. Full HKDF-SHA-256 Extract+Expand using that root; salt UTF-8
   `symmetro:derive:v2:hkdf`; info is UTF-8 `symmetro:label:v2`, one zero byte,
   label byte length as unsigned 32-bit big-endian, then exact label bytes.
   Output exactly 32 bytes.
4. RFC4648 base64url, no padding: exactly 43 characters. UI lengths 16/24 are
   prefixes, as in v1. There is no rotation counter or saved metadata.

Numbers continue using DERIVATION_V1.md byte-for-byte. Label v2 does not alter
AES-GCM encryption, old ciphertexts or numbered outputs. New rules must never
reinterpret accepted identifiers; add explicit compatibility selection if future
recipes become necessary. Existing v1 APIs still reject version 2.

## Tradeoffs and review

Labels are public context, not extra secret entropy. Fixed public salts allow
cross-user guessing reuse. A known output permits offline secret guesses; one
Argon2 guess is reusable across labels within the recipe. A guessed base secret
compromises all its outputs, across recipes. Short outputs share prefixes.
Mistyped labels/secrets produce plausible different passwords; there is no
recovery or typo detection. `wallet` is a label, not a seed/private-key generator.

A separate agent reviewed the design (domain separation, framing, exact v1
compatibility and Unicode stability); this is not a formal security audit.
Owned byte buffers are wiped best effort; strings, WASM and clipboard cannot be
guaranteed erased. Retain disposable worker and stale-result cancellation.

Runtime remains hash-wasm@4.12.0, Web Crypto HKDF and inline worker/WASM in one
HTML. No service, persisted secrets, external runtime resources or telemetry.
Use only public synthetic inputs for verification.
