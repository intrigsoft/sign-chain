---
sidebar_position: 2
---

# Verification Flow

Verification confirms that a signed document is authentic and unmodified. Anyone with access to the signed PDF can verify it -- no account or software installation required.

## QR Code Verification (Mobile)

This is the primary method, designed for zero friction.

### How It Works

1. **Scan** -- The verifier scans the QR code on the signed PDF with their phone camera
2. **Open** -- The phone opens the verification URL in a browser
3. **Lookup** -- The blockchain is queried for the transaction referenced in the URL
4. **Decrypt** -- The encryption key in the URL fragment decrypts the signer data entirely in the browser
5. **Display** -- The verification page shows the signer's identity, timestamp, and blockchain confirmation

### The Key Never Leaves the Browser

The verification URL has two parts:

```
https://signchain.app/v/<transactionHash>#<encryptionKey>
```

The `#fragment` portion of a URL is never sent to any server -- this is a fundamental property of HTTP defined in RFC 3986. The encryption key stays entirely within the browser. The server sees the transaction hash (which is already public on the blockchain) but never the key.

### Verification States

| State | Meaning |
|---|---|
| **Verified** | Transaction found on-chain, payload decrypted, signer details displayed |
| **Partial Verification** | Transaction found but no decryption key (URL fragment missing or stripped) |
| **Failed** | Transaction not found or query error |

### What Is Displayed

When fully verified:

**Signer Information:**
- Name, email, type (individual/company)
- Company and position (if applicable)

**Document Information:**
- Document hash
- Signing timestamp
- Geolocation (if captured at signing time)

**Blockchain Proof:**
- Transaction hash
- Composite hash
- Signature chain length

## Desktop Verification

The desktop app provides deeper verification:

1. Open the signed PDF in the verification tab
2. The app re-computes the document hash from the actual PDF content
3. It compares the recomputed hash against the on-chain record
4. It can extract and preview individual signature revisions

This method detects post-signing tampering that QR-only verification cannot, because it has access to the full PDF content for re-hashing.
