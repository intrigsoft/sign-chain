---
sidebar_position: 2
---

# Verification Flow

Verification is the process of confirming that a signed document is authentic and unmodified. Anyone with access to the signed PDF can verify it -- no account or software installation required.

## QR Code Verification (Mobile)

This is the primary verification method, designed for zero-friction use.

### How It Works

1. **Scan** -- The verifier scans the QR code on the signed PDF with their phone camera
2. **Open** -- The phone opens the verification URL in a browser
3. **Lookup** -- The web app extracts the transaction hash and queries the blockchain via the API
4. **Decrypt** -- The encryption key in the URL fragment decrypts the signer data client-side
5. **Display** -- The verification page shows the signer's identity, timestamp, and blockchain confirmation

### URL Structure

```
https://signchain.app/v/<base64url(txHash)>#<base64url(encryptionKey)>
```

- **Path segment**: Base64url-encoded transaction hash (43 characters)
- **Fragment** (`#`): Base64url-encoded AES-128 encryption key (22 characters)

The fragment is never sent to the server -- decryption happens entirely in the browser.

### Verification States

| State | Meaning |
|---|---|
| **Verified** | Transaction found on-chain, payload decrypted successfully |
| **Partial Verification** | Transaction found but no decryption key (signer details hidden) |
| **Failed** | Transaction not found or blockchain query error |

### What Is Displayed

When fully verified, the page shows:

**Signer Information:**
- Name, email, type (individual/company)
- Company and position (if applicable)

**Document Information:**
- Document hash (SHA-256)
- Signing timestamp
- Geolocation (if captured)

**Blockchain Proof:**
- Transaction hash
- Composite hash
- Signature chain length

## Desktop Verification

The desktop app also includes a verification feature for more thorough checking:

1. Open the signed PDF in the app's verify tab
2. The app extracts the blockchain reference from the PDF
3. It queries the API and displays the verification result
4. It can extract and preview individual signature revisions

This method additionally verifies that the document content matches the hash stored on-chain, detecting any post-signing tampering.
