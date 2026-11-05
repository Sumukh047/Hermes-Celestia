"""
Hermes Agent Studio - Secret Store
Cryptographically secure local credentials manager using Fernet symmetric encryption.
Ensures that all API keys, OAuth tokens, and passwords stored in the local SQLite database
remain encrypted at rest on the user's filesystem.
"""

from pathlib import Path
import logging
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from .config import settings

logger = logging.getLogger("hermes_agent_studio.security")


class SecretStore:
    """
    Local secret encryption vault using Fernet (AES-128-CBC + HMAC-SHA256).
    The key is generated automatically on the host and stored securely in the app data directory.
    """

    def __init__(self, key_file_path: Optional[str] = None):
        key_path = Path(key_file_path or settings.key_file)
        key_path.parent.mkdir(parents=True, exist_ok=True)

        if not key_path.exists():
            new_key = Fernet.generate_key()
            key_path.write_bytes(new_key)
            logger.info(f"Initialized new local encryption master key at: {key_path}")

        try:
            self.key = key_path.read_bytes().strip()
            self._fernet = Fernet(self.key)
        except Exception as e:
            logger.error(f"Failed to load encryption key: {e}. Re-generating key.")
            new_key = Fernet.generate_key()
            key_path.write_bytes(new_key)
            self.key = new_key
            self._fernet = Fernet(self.key)

    def encrypt(self, plain_text: str) -> str:
        """Encrypts plaintext string to base64-encoded ciphertext."""
        if not plain_text:
            return ""
        return self._fernet.encrypt(plain_text.encode("utf-8")).decode("utf-8")

    def decrypt(self, cipher_text: str) -> str:
        """Decrypts ciphertext string to plaintext. Raises error on failure."""
        if not cipher_text:
            return ""
        return self._fernet.decrypt(cipher_text.encode("utf-8")).decode("utf-8")

    def safe_decrypt(self, cipher_text: Optional[str], default: str = "") -> str:
        """
        Safely attempts to decrypt ciphertext.
        If it is empty, not encrypted (plaintext fallback), or invalid,
        returns the text or default value instead of crashing.
        """
        if not cipher_text:
            return default
        try:
            return self._fernet.decrypt(cipher_text.encode("utf-8")).decode("utf-8")
        except (InvalidToken, Exception):
            # If text was stored before encryption or is already plaintext
            return cipher_text


# Global singleton instance
secrets = SecretStore()


import hashlib
import hmac
import secrets as pysecrets
from datetime import datetime, timezone, timedelta

AUTH_SECRET = secrets.safe_decrypt(secrets.key.decode("utf-8", errors="ignore")) if hasattr(secrets, "key") else "studio-auth-secret-key-default"

def hash_password(password: str) -> str:
    """Hash password using PBKDF2 HMAC SHA-256 with random 16-byte salt."""
    salt = pysecrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${key.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    """Verify password against salt$hash representation."""
    if not hashed or "$" not in hashed:
        return False
    try:
        salt, key_hex = hashed.split("$", 1)
        expected = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
        return pysecrets.compare_digest(key_hex, expected)
    except Exception:
        return False

def create_access_token(user_id: str, expires_in_days: int = 30) -> str:
    """Generate signed bearer access token with expiration."""
    expiry = int((datetime.now(timezone.utc) + timedelta(days=expires_in_days)).timestamp())
    payload = f"{user_id}:{expiry}"
    sig = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"

def verify_access_token(token: str) -> Optional[str]:
    """Verify signed access token and return user_id if valid."""
    if not token:
        return None
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return None
        user_id, expiry_str, sig = parts
        payload = f"{user_id}:{expiry_str}"
        expected_sig = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not pysecrets.compare_digest(sig, expected_sig):
            return None
        if int(expiry_str) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return user_id
    except Exception:
        return None
