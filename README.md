<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="docs/logo.png" />
    <img src="docs/logo.png" alt="SignChain" height="48" />
  </picture>
</p>

<h3 align="center">Blockchain-anchored document signing</h3>

<p align="center">
  Sign PDFs locally. Anchor proof on-chain. Verify with a QR scan.
</p>

<p align="center">
  <a href="https://intrigsoft.github.io/sign-chain/">Documentation</a>
</p>

---

## What is SignChain?

SignChain is a document signing platform that anchors every signature on a blockchain, providing tamper-evident proof that a specific person signed a specific document at a specific time.

Traditional digital signatures rely on certificate authorities and PKI infrastructure. If a CA is compromised, revoked, or ceases to exist, the trust chain breaks. SignChain takes a different approach:

- **Blockchain anchoring** -- an immutable, publicly verifiable record of every signature
- **Client-side hashing** -- PDF bytes never leave the signer's machine
- **Encrypted metadata** -- signer identity is encrypted; only the QR holder can decrypt
- **QR verification** -- anyone can scan the embedded QR code to verify against the on-chain record

## How It Works

1. **Sign** -- Open a PDF in the desktop app, place your signature, confirm
2. **Hash** -- The app computes a cryptographic hash of the signed document locally
3. **Anchor** -- The hash is recorded on-chain via a smart contract
4. **Embed** -- A QR code with the verification URL is embedded into the PDF
5. **Verify** -- Scan the QR code to verify the signature against the blockchain record

## Architecture

```
 Desktop App           API Server           Blockchain
 (Tauri + React)       (NestJS)             (Polygon)
 ┌────────────┐       ┌────────────┐       ┌────────────┐
 │ PDF ops    │       │ Relay tx   │       │ SignChain  │
 │ Hashing    │──────>│ Auth       │──────>│ contract   │
 │ QR embed   │       │ Workflow   │       │ (events)   │
 └────────────┘       └────────────┘       └────────────┘
                                                  │
                      ┌────────────┐              │
                      │ Verify     │<─────────────┘
                      │ (Web/Mobile)│
                      └────────────┘
```

| Component | Tech | Purpose |
|---|---|---|
| **Desktop App** | Tauri 2 (Rust) + React 19 | Signing interface. All PDF operations run locally in Rust. |
| **API Server** | NestJS + Prisma + PostgreSQL | Coordinates signing workflow, relays transactions to blockchain. |
| **Smart Contract** | Solidity (OpenZeppelin ERC2771) | On-chain anchor registry. Immutable event log, no stored state. |
| **Verification Web** | React + Vite | Lightweight page opened by QR scan. Queries blockchain directly. |
| **Verification App** | Expo (React Native) | Mobile app for QR-based verification. Hardcoded API endpoint. |
| **Documentation** | Docusaurus | Architecture, trust model, and flow documentation. |

## Repository Structure

```
apps/
  desktop/          Tauri 2 desktop app (Rust + React)
  api/              NestJS backend
  web/              Verification web page
  verify/           Expo mobile verification app
  docs/             Docusaurus documentation site
libs/shared/
  crypto/           Shared cryptographic utilities
  types/            Shared TypeScript interfaces
  ui/               Shared UI components
contracts/          Solidity smart contracts (Hardhat)
docs/               Specifications and diagrams
```

This is an [Nx](https://nx.dev) monorepo. All tasks are run through Nx:

```sh
npx nx build desktop        # Build the desktop app
npx nx serve api            # Start the API server
npx nx build web            # Build the verification page
npx nx start verify         # Start the mobile app (Expo)
npx nx build docs           # Build the documentation site
```

## Prerequisites

- **Node.js** >= 20.17
- **Rust** (stable) -- for the Tauri desktop app
- **PostgreSQL** -- for the API server
- A **Polygon RPC endpoint** -- for blockchain interaction

## Getting Started

```sh
# Install dependencies
npm install

# Start the API server
npx nx serve api

# Start the desktop app (dev mode)
npx nx serve desktop

# Deploy contracts to local Hardhat network
cd contracts && npx hardhat node &
npx hardhat run scripts/deploy.ts --network localhost
```

See the [documentation](https://intrigsoft.github.io/sign-chain/) for detailed setup and architecture guides.

## Key Design Decisions

- **PDF bytes never leave the machine.** Rust handles all PDF operations; the React layer is UI only.
- **No stored state on-chain.** The smart contract emits events only -- no storage writes, ~25k gas per anchor.
- **Relayer pattern.** The API submits meta-transactions on behalf of users, so signers don't need a wallet or ETH.
- **Contract address pinning.** The verification API only accepts events from the official contract address, preventing copycat deployments.
- **Offline resilient.** If the backend is unreachable, the desktop app continues to function locally.

## Trust Model

SignChain's trust model is anchored in three properties:

| Property | Guarantee |
|---|---|
| **Tamper evidence** | Any change to the PDF invalidates the hash stored on-chain |
| **Non-repudiation** | Blockchain record is immutable and timestamped |
| **Privacy** | Signer data is encrypted; only the QR code holder can decrypt it |

The verification flow is protected against phishing: the mobile app hardcodes the API endpoint into the binary, shifting the trust root from a URL to an App Store listing.

Read more in the [Trust Model documentation](https://intrigsoft.github.io/sign-chain/trust-model/overview).

## License

This project is source-available under the [Business Source License 1.1](LICENSE).

The source code is published for transparency and auditability. You can read, review, and audit the code. Commercial use, self-hosting, and redistribution are restricted under the BSL terms.

The license converts to Apache 2.0 on 2030-03-27.
