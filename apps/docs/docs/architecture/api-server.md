---
sidebar_position: 3
---

# API Server

The API server is a **NestJS** application that acts as a relay between the desktop app and the blockchain. It also stores encrypted payloads and serves verification queries.

## Why a Relay?

The desktop app does not interact with the blockchain directly because:

1. **Private key management** -- The relay holds the wallet private key for submitting transactions. Users don't need their own blockchain wallet.
2. **Gas management** -- The relay pays gas fees, abstracting blockchain costs from end users.
3. **Rate limiting and quotas** -- The API can enforce usage limits per user/plan.

## Endpoints

### `POST /api/relay`

Submits a document anchor to the blockchain.

**Request:**
```json
{
  "compositeHash": "0xabc...def",
  "previousTxHash": "0x000...000",
  "encryptedPayload": "<base64url-encoded ciphertext>"
}
```

**Process:**
1. Validates the request
2. Submits a transaction to the `DocumentAnchor` smart contract
3. Waits for the transaction receipt
4. Stores the anchor record in the database (tx hash, composite hash, encrypted payload)
5. Returns the transaction hash

**Response:**
```json
{
  "txHash": "0x123...789",
  "blockNumber": 42
}
```

### `GET /api/verify/:txHash`

Verifies a document signature by looking up the blockchain transaction.

**Process:**
1. Checks the in-memory cache (60-second TTL)
2. Fetches the transaction receipt from the blockchain
3. Parses the `DocumentAnchored` event from the logs
4. Walks the signature chain backwards (following `previousTxHash`)
5. Looks up the encrypted payload from the database
6. Returns the full verification result

**Response:**
```json
{
  "txHash": "0x123...789",
  "compositeHash": "0xabc...def",
  "signer": "0xWalletAddress",
  "timestamp": 1711094400,
  "previousTxHash": "0x000...000",
  "chain": [...],
  "encryptedPayload": "<base64url-encoded ciphertext>"
}
```

## Database Schema

```prisma
model Anchor {
  id                String   @id @default(uuid())
  txHash            String   @unique
  compositeHash     String
  encryptedPayload  String
  createdAt         DateTime @default(now())
}
```

The `encryptedPayload` field stores the AES-128-GCM ciphertext as a base64url string. The server cannot decrypt this data -- it simply stores and returns it.

## Security Considerations

- **CORS enabled** -- Required for the verification web app to call the API
- **Validation** -- All incoming DTOs are validated with `class-validator`
- **No authentication on verify** -- Verification is intentionally public
- **Relay authentication** -- Future: require JWT from authenticated desktop app users
