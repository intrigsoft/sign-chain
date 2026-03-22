---
sidebar_position: 2
---

# Threat Model

This page outlines the threats SignChain is designed to resist and the assumptions under which those protections hold.

## Assets Under Protection

1. **Document integrity** -- The signed document must not be modifiable after signing without detection
2. **Signer identity** -- The signer's personal data must remain private except to QR holders
3. **Signing timestamp** -- The time of signing must be provably anchored
4. **Signature binding** -- It must be infeasible to transfer a signature from one document to another

## Threats & Protections

### Document Tampering

**Threat:** An attacker modifies the document content after signing.

**Protection:** The cryptographic hash of the signed document is anchored on-chain. Any modification -- even a single byte -- produces a completely different hash. Desktop verification re-computes the hash and compares it to the on-chain record.

**Limitation:** QR-only (mobile) verification confirms the blockchain anchor exists but does not re-hash the document. Full tamper detection requires the desktop app.

### Signature Forgery

**Threat:** An attacker creates a fake signature on a document they did not sign.

**Protection:** Creating a valid signature requires submitting a transaction through the smart contract. The attacker would need to either compromise the API relay credentials, or deploy their own contract (which would have a different address, detectable by verifiers).

### Signer Data Exposure

**Threat:** The server operator reads signer personal data.

**Protection:** Signer data is encrypted before leaving the desktop app. The API stores only the ciphertext. The decryption key exists only in the QR code's URL fragment, which is never transmitted to the server.

**Assumption:** The API server code does not log or exfiltrate QR URLs. This is verifiable through code audit (the codebase is open source).

### Replay Attack

**Threat:** An attacker takes a valid signature from document A and attaches it to document B.

**Protection:** The composite hash includes the document hash. If the document changes, the composite hash no longer matches. Additionally, a random salt ensures that even identical documents produce different anchors.

### Man-in-the-Middle (API)

**Threat:** An attacker intercepts the relay request and substitutes a different hash.

**Protection:** The composite hash is deterministic -- the app can recompute it independently and verify the on-chain record matches.

### QR Code Substitution

**Threat:** An attacker replaces the QR code in a signed PDF with one pointing to a different transaction.

**Protection:** Desktop verification cross-references the QR data with the document hash. A mismatched QR is detected.

**Limitation:** QR-only (mobile) verification cannot detect this because it does not have access to the document content for re-hashing.

## Assumptions

1. **The cryptographic primitives are sound** -- SHA-256 collision resistance and AES-128 confidentiality hold
2. **The blockchain is immutable** -- Standard assumption for established chains
3. **The signer's machine is not compromised** -- A compromised machine could sign arbitrary documents
4. **The API server relays transactions honestly** -- Verifiable through code audit and post-anchor verification
5. **HTTPS is used in production** -- Prevents eavesdropping on encrypted payloads in transit
