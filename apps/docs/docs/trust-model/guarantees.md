---
sidebar_position: 3
---

# Guarantees & Limitations

## What SignChain Guarantees

### 1. Tamper Evidence
If a signed PDF is modified after signing, the hash mismatch is detectable. The blockchain record cannot be altered to match the tampered document.

### 2. Temporal Proof
The blockchain transaction includes a block timestamp. This proves the signature existed at or before that time. The timestamp cannot be backdated.

### 3. Signer Privacy
Signer personal data is encrypted with a unique per-signature key. The API server cannot read it. Only someone with physical or digital access to the QR code can decrypt the signer details.

### 4. Signature Chaining
Multiple signatures on the same document form a verifiable chain. Each signature references the previous transaction hash, creating an ordered, immutable sequence.

### 5. Offline Document Handling
The PDF bytes never leave the signer's machine. The API receives only hashes and encrypted metadata. This is particularly important for confidential documents.

## What SignChain Does NOT Guarantee

### 1. Identity Verification
SignChain records what the signer *claims* their identity is. It does not verify that "Jane Doe" is actually Jane Doe. Identity verification (KYC) is out of scope and would require integration with an identity provider.

### 2. Document Content Validation
SignChain proves a document was signed, not that the document's content is accurate, legal, or binding. The legal weight of a SignChain signature depends on jurisdiction.

### 3. Revocation
Once a signature is anchored on-chain, it cannot be revoked. If a signer wants to repudiate a signature, they must do so through external means (legal process, counter-signature, etc.).

### 4. QR Code Integrity (Mobile-Only Verification)
Mobile verification via QR scan confirms the blockchain anchor but does not verify that the PDF content matches the anchored hash. A sophisticated attacker could modify the PDF and replace the QR code. Full integrity checking requires the desktop app.

### 5. Key Recovery
If the QR code is destroyed or the printed document is lost, the encryption key is gone. The blockchain proof remains (hash match is still verifiable), but the human-readable signer details cannot be recovered.

## Comparison Matrix

| Property | SignChain | PKI / X.509 | Centralized Services | Notary |
|---|---|---|---|---|
| Tamper evidence | Yes | Yes | Yes | No |
| No trusted third party | Yes | No (CA) | No | No |
| Survives vendor shutdown | Yes | Partial | No | Yes |
| Privacy from platform | Yes | Yes | No | No |
| Identity verification | No | Yes (CA) | Yes | Yes |
| Revocation | No | Yes (CRL) | Yes | N/A |
| Offline signing | Yes | Yes | No | No |
| Legal recognition | Varies | Broad | Broad | Broad |
