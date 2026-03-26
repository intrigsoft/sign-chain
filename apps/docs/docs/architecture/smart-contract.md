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

address public immutable trustedRelayer;

function anchorDocument(
    bytes32 compositeHash,
    bytes32 previousTxHash
) external onlyRelayer;
```

### `anchorDocument` Function

Records a document signature on-chain. Only callable by the trusted relayer address set at deployment.

**Parameters:**
- `compositeHash` -- SHA-256 of the signer payload JSON (includes document hash, signer info, timestamp, salt)
- `previousTxHash` -- Transaction hash of the previous signature in the chain (zero hash for the first signature)

**Behavior:**
1. Reverts with `UnauthorizedRelayer` if the caller is not the trusted relayer
2. Emits a `DocumentAnchored` event with the provided data, `_msgSender()`, and `block.timestamp`
3. The event is indexed by `compositeHash` and `signer` for efficient querying

### Access Control

The contract restricts who can anchor documents via an `onlyRelayer` modifier. The `trustedRelayer` address is set as an `immutable` in the constructor, meaning it cannot be changed after deployment. This prevents unauthorized parties from polluting the contract with fake anchors.

If the relayer key needs to be rotated, a new contract must be deployed. This is straightforward given the event-only design (no state to migrate).

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

![Signature chaining](/img/diagrams/signature-chain.svg)

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

## Verification Security

The verification API enforces two checks to ensure anchors are authentic:

1. **Contract address pinning** -- The API only accepts events emitted from the official `SIGNCHAIN_CONTRACT_ADDRESS`. Events from copycat deployments are rejected.
2. **Relayer restriction** -- The `onlyRelayer` modifier on-chain ensures only the trusted relayer can write to the contract, preventing unauthorized anchors at the source.

Together, these prevent both copycat contracts and unauthorized writes to the official contract.

## Upgradeability

The current contract is not upgradeable. Once deployed, the contract code is immutable. This is intentional -- it means no one can change the rules after deployment, which strengthens the trust model.

If a new version is needed, a new contract is deployed and the API is updated to point to it. Old signatures remain verifiable on the old contract.
