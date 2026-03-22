---
sidebar_position: 1
---

# Trust Model Overview

SignChain's trust model is designed so that no single party -- including IntrigSoft -- needs to be fully trusted for the system to provide its guarantees.

## Trust Distribution

```
                    ┌─────────────────┐
                    │   Blockchain    │
                    │  (immutable     │
                    │   anchor)       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
      ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
      │ Desktop App  │ │ API      │ │ Verification│
      │ (signs       │ │ (relays  │ │ Web App     │
      │  locally)    │ │  to      │ │ (decrypts   │
      │              │ │  chain)  │ │  in browser)│
      └──────────────┘ └──────────┘ └─────────────┘
```

### What Each Component Is Trusted For

| Component | Trusted to... | NOT trusted with... |
|---|---|---|
| **Desktop App** | Correctly hash the PDF and embed signatures | Nothing leaves the machine except hashes |
| **API Server** | Relay transactions to the blockchain honestly | Signer data (it only sees encrypted blobs) |
| **Blockchain** | Maintain an immutable, timestamped record | Nothing sensitive is stored on-chain |
| **Verification Web App** | Display results honestly | The key never leaves the browser |

## What Makes This Different

### vs. Traditional Digital Signatures (PKI)

Traditional signatures depend on a certificate authority (CA) hierarchy. If your CA is compromised, all certificates it issued become suspect. If the CA goes out of business, verification stops working.

SignChain anchors on a public blockchain. The proof exists independently of any company, CA, or server. Even if IntrigSoft disappears, the on-chain record remains verifiable by anyone who can read the smart contract.

### vs. Centralized Signing Services (DocuSign, etc.)

Centralized services are the sole authority on whether a signature is valid. You trust them completely -- with the document content, signer identity, and the validity determination.

SignChain separates these concerns:
- Document content never leaves the signer's machine
- Signer identity is encrypted with a key the server never sees
- Validity is determined by public blockchain state, not a company's database

### vs. Pure Blockchain Signatures

Putting everything on-chain is transparent but destroys privacy. SignChain achieves blockchain immutability while keeping signer data private through client-side encryption.

## The "Hit by a Bus" Test

What happens if IntrigSoft ceases to exist?

| Scenario | Impact | Mitigation |
|---|---|---|
| API goes offline | New signatures cannot be anchored | Smart contract address is public; anyone can build a relay |
| Website goes offline | QR verification stops working | Self-hostable; contract ABI is public |
| Company dissolves | No impact on existing signatures | Blockchain record is permanent |

The only permanent dependency is the blockchain itself. As long as the chain exists and the smart contract is deployed, every past signature remains verifiable.
