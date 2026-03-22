---
sidebar_position: 2
---

# Threat Model

This page outlines the threats SignChain is designed to resist and the assumptions under which those protections hold.

## Assets Under Protection

1. **Document integrity** -- The signed PDF must not be modifiable after signing without detection
2. **Signer identity** -- The signer's personal data must remain private except to QR holders
3. **Signing timestamp** -- The time of signing must be provably anchored
4. **Signature binding** -- It must be infeasible to transfer a signature from one document to another

## Threat Categories

### Document Tampering

**Threat:** An attacker modifies the PDF content after signing.

**Protection:** The SHA-256 hash of the signed document is anchored on-chain. Any modification -- even a single byte -- produces a completely different hash. Desktop verification re-computes the hash and compares it to the on-chain record.

**Limitation:** The QR-only (mobile) verification confirms the blockchain anchor exists but does not re-hash the document. Full tamper detection requires the desktop app.

### Signature Forgery

**Threat:** An attacker creates a fake SignChain signature on a document they did not sign.

**Protection:** Creating a valid signature requires submitting a transaction through the smart contract, which records the signer's blockchain address. The attacker would need to either:
- Compromise the API relay credentials, or
- Deploy their own contract (which would have a different address, detectable by verifiers)

### Signer Data Exposure

**Threat:** The API server operator reads signer personal data.

**Protection:** Signer data is encrypted with AES-128-GCM before leaving the desktop app. The API stores only the ciphertext. The decryption key exists only in the QR code's URL fragment, which is never transmitted to the server.

**Assumption:** The API server code does not log or exfiltrate QR URLs. This is verifiable through code audit.

### Replay Attack

**Threat:** An attacker takes a valid signature from document A and attaches it to document B.

**Protection:** The composite hash includes the document hash. If the document changes, the composite hash no longer matches. Additionally, the salt ensures that even identical documents produce different anchors.

### Man-in-the-Middle (API)

**Threat:** An attacker intercepts the relay request and substitutes a different composite hash.

**Protection:** The desktop app could verify the on-chain record after anchoring (not yet implemented). The composite hash is deterministic -- the app can recompute it independently.

**Mitigation (future):** Post-anchor verification where the app reads back the on-chain record.

### QR Code Substitution

**Threat:** An attacker replaces the QR code in a signed PDF with one pointing to a different transaction.

**Protection:** The desktop verification flow re-extracts the QR data and cross-references it with the document hash. If the QR points to a transaction for a different document, the mismatch is detected.

**Limitation:** QR-only (mobile) verification cannot detect this because it does not have access to the PDF content for re-hashing.

## Assumptions

1. **SHA-256 is collision-resistant** -- No known practical attacks exist
2. **AES-128-GCM is secure** -- No known practical attacks exist
3. **The blockchain is immutable** -- Standard assumption for established chains
4. **The signer's machine is not compromised** -- A compromised machine could sign arbitrary documents
5. **The API server relays transactions honestly** -- Verifiable by post-anchor read-back (future)
6. **HTTPS is used in production** -- Prevents eavesdropping on the encrypted payload in transit
