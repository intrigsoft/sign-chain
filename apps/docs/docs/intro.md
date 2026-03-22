---
slug: /
sidebar_position: 1
---

# Introduction

SignChain is a document signing platform that anchors signatures on a blockchain, providing tamper-evident proof that a specific person signed a specific document at a specific time.

## What Problem Does SignChain Solve?

Traditional digital signatures rely on certificate authorities (CAs) and PKI infrastructure. If a CA is compromised, revoked, or simply ceases to exist, the trust chain breaks. SignChain takes a different approach:

- **Blockchain anchoring** provides an immutable, publicly verifiable record of every signature
- **Cryptographic hashing** binds the signature to the exact document content
- **Client-side encryption** ensures signer privacy while maintaining verifiability
- **QR codes** embedded in the PDF enable instant verification by anyone with a phone

## How It Works (30-second version)

1. **Sign** -- The signer opens a PDF in the SignChain desktop app, places their signature, and confirms
2. **Hash** -- The app computes a SHA-256 hash of the signed document
3. **Anchor** -- The hash is recorded on a blockchain via a smart contract
4. **Embed** -- A QR code containing the verification URL is embedded into the PDF
5. **Verify** -- Anyone can scan the QR code to verify the signature against the blockchain record

## Key Properties

| Property | How |
|---|---|
| **Tamper evidence** | Any change to the PDF invalidates the hash stored on-chain |
| **Non-repudiation** | Blockchain record is immutable and timestamped |
| **Privacy** | Signer data is encrypted; only the QR holder can decrypt |
| **Offline signing** | PDF operations happen locally; only the hash goes to the network |
| **No vendor lock-in** | Blockchain record is public; verification is open |

## Components

- **Desktop App** (Tauri 2 + React) -- Signing interface; all PDF operations run in Rust
- **API Server** (NestJS) -- Relays transactions to the blockchain and stores encrypted payloads
- **Smart Contract** (Solidity) -- On-chain anchor registry
- **Verification Web App** (React) -- Mobile-friendly page opened by QR scan
