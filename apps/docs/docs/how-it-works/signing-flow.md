---
sidebar_position: 1
---

# Signing Flow

This page describes the complete journey from opening a PDF to producing a signed, blockchain-anchored document.

## Step-by-Step

### 1. Identity Setup

Before signing, the user provides their identity information:

- Name, email
- Signer type (individual or company)
- Optional: company name, position

This information is stored locally and included in the encrypted payload.

### 2. Document Selection

The user opens a PDF file through the file picker or via OS "Open With" file association. The app reads the page count and renders a scrollable preview.

### 3. Signature Placement

The user drags their signature image onto the PDF preview. They can:

- Place multiple signatures across different pages
- Resize and reposition each placement
- Add text fields (name, date, custom text)
- See a live preview of the QR code area that will be embedded

### 4. Signing Confirmation

When the user clicks "Sign & Anchor", a confirmation dialog shows:
- Number of signature placements
- Number of text fields
- Warning that the action cannot be undone

### 5. Document Processing (Rust)

After confirmation, the Rust backend executes these steps:

```
PDF bytes ──> Normalise ──> Embed signatures ──> Embed text fields
    ──> Compute SHA-256 hash ──> Build payload ──> Encrypt payload
    ──> Send to API ──> Receive tx hash ──> Build QR URL
    ──> Embed QR code ──> Write final PDF
```

#### 5a. Signature Embedding

The signature image (PNG) is embedded as a PDF XObject on each target page at the specified coordinates. The app handles:

- Deep-cloning page Resources from the original document
- Resetting inherited CTM (Current Transformation Matrix) transforms
- Proper coordinate mapping (PDF origin is bottom-left)

#### 5b. Hash Computation

A SHA-256 hash is computed over the PDF content after signature embedding but before QR embedding. This ensures the QR code itself is not part of the hashed content (since the QR contains the transaction hash, which is a circular dependency).

#### 5c. Payload Construction

The signer's identity, document hash, timestamp, geolocation (if available), and a random salt are assembled into a JSON payload:

```json
{
  "d": "0xabc...def",
  "s": { "t": "individual", "n": "Jane Doe", "e": "jane@example.com" },
  "ts": 1711094400,
  "g": { "la": 6.9271, "ln": 79.8612 },
  "salt": "a1b2c3..."
}
```

A composite hash (SHA-256 of this JSON) is computed. This composite hash is what gets anchored on-chain.

#### 5d. Encryption

The JSON payload is encrypted with **AES-128-GCM**:

- A random 16-byte key is generated
- A random 12-byte nonce is generated
- Ciphertext format: `nonce(12) || encrypted || tag(16)`

The encrypted payload is sent to the API for storage. The encryption key is embedded in the QR code's URL fragment.

#### 5e. Blockchain Anchoring

The API receives the composite hash, previous transaction hash (for chaining), and encrypted payload. It submits a transaction to the smart contract and returns the transaction hash.

#### 5f. QR Code Embedding

A QR code is generated containing the verification URL and embedded into the PDF next to each signature placement. The text "Signed with SignChain" appears below the QR.

### 6. Save

The user can save the signed PDF to any location. The original file is never modified.

## Signing Subsequent Signatures

When a document that has already been signed is signed again:

1. The app detects existing signatures via incremental PDF revisions
2. The new signature references the previous transaction hash, creating a **signature chain**
3. The verification page shows all signatures in the chain
