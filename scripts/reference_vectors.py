#!/usr/bin/env python3
"""Independent reference for public synthetic fixtures, never user secrets.

Requires argon2-cffi==25.1.0. Uses its native reference Argon2 implementation
and Python's hashlib/hmac, not the browser implementation under test.
Run with --write to create fixtures, or without arguments to verify them.
"""

import base64
import hashlib
import hmac
import json
import pathlib
import sys

from argon2.low_level import Type, hash_secret_raw


def hkdf(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    result = b""
    previous = b""
    for block in range(1, (length + 31) // 32 + 1):
        previous = hmac.new(prk, previous + info + bytes([block]), hashlib.sha256).digest()
        result += previous
    return result[:length]


def self_test() -> None:
    # Official Argon2 reference src/test.c, Argon2id v19, t=2, m=65536, p=1.
    raw = hash_secret_raw(b"password", b"somesalt", 2, 65536, 1, 32, Type.ID, 19)
    assert raw.hex() == "09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7"
    # RFC 5869 Appendix A.1.
    output = hkdf(bytes.fromhex("0b" * 22), bytes(range(13)), bytes(range(240, 250)), 42)
    assert output.hex() == (
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf"
        "34007208d5b887185865"
    )


def derive(secret: str, index: str) -> str:
    root = hash_secret_raw(
        secret.encode("utf-8", errors="strict"),
        b"symmetro:derive:v1:argon2id", 3, 65536, 4, 32, Type.ID, 19,
    )
    info = b"symmetro:password:v1\0" + int(index).to_bytes(8, "big")
    output = hkdf(root, b"symmetro:derive:v1:hkdf", info, 32)
    return base64.urlsafe_b64encode(output).decode("ascii").rstrip("=")


CASES = [
    ("ASCII / index 1", "synthetic secret for automated tests only", "1"),
    ("ASCII / index 2", "synthetic secret for automated tests only", "2"),
    ("ASCII / index 3", "synthetic secret for automated tests only", "3"),
    ("Beyond JS safe integer", "synthetic secret for automated tests only", "9007199254740993"),
    ("Maximum u64 index", "synthetic secret for automated tests only", "18446744073709551615"),
    ("Composed Unicode", "caf\u00e9", "1"),
    ("Decomposed Unicode", "cafe\u0301", "1"),
    ("Leading and trailing whitespace", " synthetic secret ", "1"),
    ("Whitespace preserved baseline", "synthetic secret", "1"),
    ("LF newline", "synthetic\nsecret", "1"),
    ("CRLF newline", "synthetic\r\nsecret", "1"),
    ("Unicode supplementary character", "synthetic \U0001f511 secret", "1"),
    ("Embedded NUL", "synthetic\0secret", "1"),
]


def main() -> None:
    self_test()
    path = pathlib.Path(__file__).resolve().parent.parent / "tests" / "derivation-v1-vectors.json"
    vectors = [
        {"label": label, "version": 1, "secret": secret, "index": index, "expected": derive(secret, index)}
        for label, secret, index in CASES
    ]
    if sys.argv[1:] == ["--write"]:
        path.write_text(json.dumps(vectors, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(vectors)} public synthetic vectors after primitive self-tests.")
    elif not sys.argv[1:]:
        assert json.loads(path.read_text(encoding="utf-8")) == vectors
        print(f"Verified {len(vectors)} public synthetic vectors and both primitive self-tests.")
    else:
        raise SystemExit("Usage: reference_vectors.py [--write]")


if __name__ == "__main__":
    main()
