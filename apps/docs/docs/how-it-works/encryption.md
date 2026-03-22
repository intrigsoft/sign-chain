---
sidebar_position: 3
---

# Encryption & Privacy

SignChain uses client-side encryption to protect signer privacy while maintaining blockchain verifiability. The signer's personal data never appears on-chain or in any server-side log.

## Why Encrypt?

The blockchain is public. Storing signer names, emails, or document hashes directly on-chain would expose private information to anyone. SignChain solves this by:

1. Encrypting the signer payload before sending it to the server
2. Storing only a cryptographic hash on-chain
3. Embedding the decryption key in the QR code (never sent to any server)

## How It Works

![Encryption process](/img/diagrams/encryption-process.svg)

A unique encryption key is generated for each signature. The signer's identity, document hash, timestamp, and a random salt are encrypted with this key. The result is split across three locations:

### Where Each Piece Lives

| Data | Location | Who can access |
|---|---|---|
| **Encryption key** | QR code URL fragment | Anyone who scans the QR |
| **Encrypted payload** | API server database | API server (but cannot decrypt) |
| **Composite hash** | Blockchain | Anyone (public, but opaque) |
| **Document hash** | Inside encrypted payload | Anyone who decrypts |

This separation means no single party has access to everything.

## Key Properties

### Forward Secrecy
Every signature uses a fresh random key. Compromising one key reveals only that one signer's data. Past and future signatures are unaffected.

### Server-Side Blindness
The API stores encrypted payloads but never possesses the decryption key. The key exists only in the QR code's URL fragment, which by definition is never transmitted in HTTP requests. The server is cryptographically blind to the data it stores.

### No Key Escrow
There is no master key or recovery mechanism. If the QR code is destroyed, the signer details cannot be recovered. The blockchain proof (hash match) remains valid forever, but the human-readable information is lost.

This is a deliberate design choice: key escrow would introduce a trusted party that could access all signer data, defeating the purpose of client-side encryption.

## Why AES-128?

AES-128 was chosen over AES-256 to reduce the QR code data size:

| Key size | Encoded length | Savings |
|---|---|---|
| 256-bit | 43 characters | -- |
| 128-bit | 22 characters | 21 characters smaller |

The 21-character savings allows a physically smaller QR code that is easier to scan on printed documents. AES-128 has never been broken and is approved for classified data by NIST.

## Decryption

Decryption happens entirely in the verifier's browser. The browser extracts the key from the URL fragment, fetches the encrypted payload from the API, and decrypts it locally. At no point does the decryption key leave the browser or get sent to any server.
