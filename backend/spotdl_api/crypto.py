import os
from cryptography.fernet import Fernet

_key = os.getenv("FILE_ENCRYPTION_KEY")
if not _key:
    raise RuntimeError("Missing FILE_ENCRYPTION_KEY")
fernet = Fernet(_key.encode())


def encrypt_bytes(data: bytes) -> bytes:
    """Return the encrypted ciphertext for a bytestring."""
    return fernet.encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    """Return the original plaintext for a Fernet token."""
    return fernet.decrypt(token)
