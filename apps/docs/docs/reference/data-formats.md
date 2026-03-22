---
sidebar_position: 3
---

# Data Formats

This page documents the JSON payloads, ciphertext format, and API request/response schemas used by SignChain.

## Anchor Payload (Signer Data)

The anchor payload contains the signer's identity and document metadata. It is serialized as compact JSON, encrypted, and stored on the API server. The composite hash (SHA-256 of this JSON) is stored on-chain.

```json
{
  "d": "a1b2c3...f0",
  "s": {
    "t": "individual",
    "n": "John Doe",
    "e": "john@example.com",
    "c": "Acme Corp",
    "p": "CTO"
  },
  "ts": 1774288200,
  "g": {
    "la": 6.9271,
    "ln": 79.8612
  },
  "salt": "e4f5a6...b7c8"
}
```

### Field Reference

| Field | Key | Type | Required | Description |
|---|---|---|---|---|
| Document hash | `d` | string | Yes | SHA-256 hex of the PDF content (before QR embedding) |
| Signer info | `s` | object | Yes | Signer identity |
| Signer type | `s.t` | string | Yes | `"individual"` or `"company"` |
| Name | `s.n` | string | Yes | Signer's display name |
| Email | `s.e` | string | Yes | Signer's email address |
| Company | `s.c` | string | No | Company name (omitted if empty) |
| Position | `s.p` | string | No | Job title (omitted if empty) |
| Timestamp | `ts` | integer | Yes | Unix epoch seconds (UTC) |
| Geolocation | `g` | object | No | GPS coordinates at signing time |
| Latitude | `g.la` | number | If `g` present | Decimal degrees |
| Longitude | `g.ln` | number | If `g` present | Decimal degrees |
| Salt | `salt` | string | Yes | 32 random bytes, hex-encoded (64 chars) |

**Short keys** are used to minimize JSON size. The payload must fit within the QR byte budget after base64url encoding.

### Composite Hash

The composite hash is computed by SHA-256 hashing the serialized JSON bytes:

```
composite_hash = "0x" + hex(SHA-256(json_bytes))
```

This hash is the only value stored on the blockchain. It commits to the entire payload -- any change to any field produces a different hash.

### Salt Purpose

The 32-byte random salt ensures that:
- Two identical signings produce different composite hashes
- The composite hash cannot be brute-forced from known signer data
- Each signature is cryptographically unique

## Ciphertext Format

The encrypted payload uses AES-128-GCM with a prepended nonce:

![Ciphertext format](/img/diagrams/ciphertext-format.svg)

| Component | Size | Description |
|---|---|---|
| Nonce | 12 bytes | Random, generated per encryption |
| Encrypted data | Variable | AES-128-GCM ciphertext |
| Auth tag | 16 bytes | GCM authentication tag (appended by AES-GCM) |

The entire ciphertext (nonce + encrypted + tag) is base64url-encoded for storage and transmission.

### Key

- **Size:** 16 bytes (128 bits)
- **Generation:** CSPRNG (`OsRng`)
- **Encoding:** Base64url without padding (22 characters)
- **Location:** QR code URL fragment only

## API Schemas

### `POST /api/relay` -- Submit Anchor

**Request:**
```json
{
  "compositeHash": "0xabc123...def789",
  "previousTxHash": "0x000...000",
  "encryptedPayload": "<base64url-encoded ciphertext>"
}
```

| Field | Type | Validation | Description |
|---|---|---|---|
| `compositeHash` | string | Required, non-empty | `0x`-prefixed SHA-256 hex (66 chars) |
| `previousTxHash` | string | Required, non-empty | `0x`-prefixed tx hash or zero hash for first signature |
| `encryptedPayload` | string | Required, non-empty | Base64url-encoded AES-128-GCM ciphertext |

**Response:**
```json
{
  "txHash": "0x123...789",
  "blockNumber": 42
}
```

### `GET /api/verify/:txHash` -- Verify Signature

**URL parameter:** `txHash` -- `0x`-prefixed transaction hash (66 chars)

**Response:**
```json
{
  "txHash": "0x123...789",
  "compositeHash": "0xabc...def",
  "signer": "0xWalletAddress",
  "timestamp": 1711094400,
  "previousTxHash": "0x000...000",
  "chain": [
    {
      "txHash": "0x123...789",
      "compositeHash": "0xabc...def",
      "signer": "0xWalletAddress",
      "timestamp": 1711094400,
      "previousTxHash": "0x000...000"
    }
  ],
  "encryptedPayload": "<base64url-encoded ciphertext>"
}
```

The `chain` array contains all signatures in the document's chain, ordered from first to latest. Each entry represents one `DocumentAnchored` event from the smart contract.

## QR URL Format

```
https://signchain.app/v/<base64url(txHashBytes)>#<base64url(keyBytes)>
```

| Component | Raw size | Encoded size | Encoding |
|---|---|---|---|
| Base URL + path prefix | -- | 27 chars | Plain text |
| `/v/` separator | -- | 3 chars | Plain text |
| Transaction hash | 32 bytes | 43 chars | Base64url, no padding |
| `#` separator | -- | 1 char | Plain text |
| Encryption key | 16 bytes | 22 chars | Base64url, no padding |
| **Total** | -- | **~96 chars** | -- |

## PDF Metadata (SignChain JSON)

Embedded in each PDF revision as a metadata stream, stored in the document's cross-reference table:

```json
{
  "version": 2,
  "signatures": [
    {
      "signer_name": "John Doe",
      "signer_email": "john@example.com",
      "signer_type": "individual",
      "company": null,
      "position": null,
      "timestamp": "2025-01-15T10:30:00Z",
      "doc_hash": "a1b2c3...f0",
      "composite_hash": "0xabc...def",
      "tx_hash": "0x123...789",
      "qr_url": "https://signchain.app/v/...#...",
      "salt": "e4f5a6...b7c8",
      "geo": [6.9271, 79.8612]
    }
  ]
}
```

This metadata is used by the desktop app's verification feature to:
1. Identify all signatures in the document
2. Extract QR URLs for blockchain verification
3. Walk the signature chain

Fields marked with `#[serde(default)]` in the Rust struct ensure backward compatibility -- PDFs signed with version 1 can still be read by version 2 code.
