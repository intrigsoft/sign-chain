---
sidebar_position: 3
---

# Encryption & Privacy

SignChain uses client-side encryption to protect signer privacy while maintaining blockchain verifiability. The signer's personal data never appears on-chain or in any server-side log.

## Why Encrypt?

The blockchain is public. Storing signer names, emails, or document hashes directly on-chain would expose private information to anyone. SignChain solves this by:

1. Encrypting the signer payload before sending it to the server
2. Storing only a cryptographic hash on-chain
3. Embedding the decryption key in the QR code's URL fragment (never sent to any server)

## Encryption Scheme

**Algorithm:** AES-128-GCM (Galois/Counter Mode)

| Parameter | Value |
|---|---|
| Key size | 128 bits (16 bytes) |
| Nonce size | 96 bits (12 bytes) |
| Tag size | 128 bits (16 bytes) |
| Key derivation | Random (CSPRNG) |

### Encryption Process

```
plaintext (JSON payload)
    │
    ├── Generate random 16-byte key
    ├── Generate random 12-byte nonce
    │
    ▼
AES-128-GCM encrypt
    │
    ▼
ciphertext = nonce(12) ║ encrypted_data ║ tag(16)
```

### Where Each Piece Lives

| Data | Location | Who can access |
|---|---|---|
| **Encryption key** | QR code URL fragment | Anyone who scans the QR |
| **Encrypted payload** | API database | API server (but cannot decrypt without key) |
| **Composite hash** | Blockchain | Anyone (public) |
| **Document hash** | Inside encrypted payload | Anyone who decrypts |

## Key Properties

### Forward Secrecy
Each signature uses a fresh random key. Compromising one key reveals only one signer's data.

### Server-Side Blindness
The API stores encrypted payloads but never possesses the decryption key. The key exists only in the QR code's URL fragment, which:
- Is never sent in HTTP requests (fragments are client-only)
- Lives only on the printed/displayed PDF
- Is decoded by the verification web app in the browser

### No Key Escrow
There is no master key or recovery mechanism. If the QR code is destroyed, the signer data cannot be recovered. The blockchain proof (hash match) remains valid forever, but the human-readable signer details are lost.

## Why AES-128 (Not AES-256)?

AES-128 was chosen over AES-256 to reduce the QR code data size:

| Key size | Base64url length | QR URL total |
|---|---|---|
| 256-bit | 43 characters | ~111 bytes |
| 128-bit | 22 characters | ~89 bytes |

The 22-byte savings allows a smaller QR version (fewer modules), which produces a more compact and scannable code. AES-128 remains secure -- it has never been broken and is approved for classified data by NIST.

## Decryption (Verification)

Decryption happens entirely in the browser using the Web Crypto API:

```javascript
// Key from URL fragment
const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);

// Ciphertext from API response
const nonce = ciphertext.slice(0, 12);
const encrypted = ciphertext.slice(12);

// Decrypt
const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, encrypted);
```

The decrypted JSON payload contains the signer's identity, document hash, timestamp, and salt.
