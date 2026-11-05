"""Independent public synthetic v2 vectors; requires reference-requirements.txt."""
import base64, hashlib, hmac, json
from pathlib import Path
from argon2.low_level import hash_secret_raw, Type
secret = 'Public synthetic label test secret'
root = hash_secret_raw(secret.encode(), b'symmetro:derive:v2:argon2id', 3, 65536, 4, 32, Type.ID, version=19)
prk = hmac.new(b'symmetro:derive:v2:hkdf', root, hashlib.sha256).digest()
vectors = []
for label in ['car', 'wallet', '🚗', '1️⃣', '👨‍👩‍👧‍👦', 'é', 'e\u0301', '❤', '❤️']:
    data = label.encode()
    info = b'symmetro:label:v2\0' + len(data).to_bytes(4, 'big') + data
    output = hmac.new(prk, info + b'\x01', hashlib.sha256).digest()
    vectors.append(dict(secret=secret, label=label, expected=base64.urlsafe_b64encode(output).decode().rstrip('=')))
print(json.dumps(vectors, ensure_ascii=False, indent=2))
