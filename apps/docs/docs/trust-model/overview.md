---
sidebar_position: 1
---

# Trust Model Overview

SignChain's trust model is designed so that no single party -- including IntrigSoft -- needs to be fully trusted for the system to provide its guarantees.

## Trust Distribution

![Trust distribution](/img/diagrams/trust-distribution.svg)

### What Each Component Is Trusted For

| Component | Trusted to... | NOT trusted with... |
|---|---|---|
| **Desktop App** | Correctly hash the document and embed signatures | Nothing leaves the machine except hashes and encrypted data |
| **API Server** | Relay transactions to the blockchain honestly | Signer data (it only sees encrypted blobs) |
| **Blockchain** | Maintain an immutable, timestamped record | Nothing sensitive is stored on-chain |
| **Verification App** | Display results honestly | The decryption key never leaves the browser |

## What Makes This Different

### vs. Traditional Digital Signatures (PKI)

Traditional signatures depend on a certificate authority (CA) hierarchy. If your CA is compromised, all certificates it issued become suspect. If the CA goes out of business, verification may stop working.

SignChain anchors on a public blockchain. The proof exists independently of any company, CA, or server. Even if IntrigSoft disappears, the on-chain record remains verifiable by anyone.

### vs. Centralized Signing Services (DocuSign, etc.)

Centralized services are the sole authority on whether a signature is valid. You trust them completely -- with the document content, signer identity, and the validity determination.

SignChain separates these concerns:
- Document content never leaves the signer's machine
- Signer identity is encrypted with a key the server never sees
- Validity is determined by public blockchain state, not a company's database

### vs. Pure Blockchain Signatures

Putting everything on-chain is transparent but destroys privacy. Anyone can read signer names, emails, and document details. SignChain achieves blockchain immutability while keeping signer data private through client-side encryption.

## The "Hit by a Bus" Test

What happens if IntrigSoft ceases to exist?

| Scenario | Impact | Mitigation |
|---|---|---|
| API goes offline | New signatures cannot be anchored | Smart contract is public; anyone can build a relay |
| Website goes offline | QR verification stops working | Self-hostable; contract interface is public |
| Company dissolves | No impact on existing signatures | Blockchain record is permanent |

The only permanent dependency is the blockchain itself. As long as the chain exists and the smart contract is deployed, every past signature remains verifiable.
