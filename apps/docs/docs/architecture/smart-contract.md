---
sidebar_position: 4
---

# Smart Contract

The `DocumentAnchor` smart contract is the on-chain component of SignChain. It stores composite hashes and emits events that serve as the immutable proof of signing.

## Contract Interface

```solidity
event DocumentAnchored(
    bytes32 indexed compositeHash,
    address indexed signer,
    bytes32 previousTxHash,
    uint256 timestamp
);

function anchor(
    bytes32 compositeHash,
    bytes32 previousTxHash
) external;
```

### `anchor` Function

Records a document signature on-chain.

**Parameters:**
- `compositeHash` -- SHA-256 of the signer payload JSON (includes document hash, signer info, timestamp, salt)
- `previousTxHash` -- Transaction hash of the previous signature in the chain (zero hash for the first signature)

**Behavior:**
1. Emits a `DocumentAnchored` event with the provided data, `msg.sender`, and `block.timestamp`
2. The event is indexed by `compositeHash` and `signer` for efficient querying

### `DocumentAnchored` Event

The event serves as the permanent record. Event fields:

| Field | Type | Indexed | Purpose |
|---|---|---|---|
| `compositeHash` | `bytes32` | Yes | Identifies the signing payload |
| `signer` | `address` | Yes | Blockchain address that submitted the tx |
| `previousTxHash` | `bytes32` | No | Links to previous signature (chain) |
| `timestamp` | `uint256` | No | Block timestamp at anchoring |

## Signature Chaining

When a document is signed multiple times, each signature references the previous one:

```
Signature 1:  compositeHash=H1, previousTxHash=0x000...000
    │
    └── tx hash: 0xAAA...
              │
Signature 2:  compositeHash=H2, previousTxHash=0xAAA...
    │
    └── tx hash: 0xBBB...
              │
Signature 3:  compositeHash=H3, previousTxHash=0xBBB...
```

The verification API walks this chain backwards to present the complete signing history.

## Development Setup

The project uses **Hardhat** for local blockchain development:

```bash
# Start local blockchain
npx hardhat node

# Deploy contract
npx hardhat run scripts/deploy.ts --network localhost
```

## Gas Costs

The `anchor` function is gas-efficient:
- No storage writes (only events)
- Events are stored in transaction logs, not contract storage
- Approximate cost: ~25,000 gas per anchor

## Upgradeability

The current contract is not upgradeable. Once deployed, the contract code is immutable. This is intentional -- it means no one can change the rules after deployment, which strengthens the trust model.

If a new version is needed, a new contract is deployed and the API is updated to point to it. Old signatures remain verifiable on the old contract.
