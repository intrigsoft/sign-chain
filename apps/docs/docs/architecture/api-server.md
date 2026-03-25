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

## Authentication

The API uses self-hosted authentication with three providers:

- **Magic link** -- 6-digit code sent via email (SMTP/nodemailer)
- **Google OAuth** -- via Passport.js strategy
- **Microsoft OAuth** -- via Passport.js strategy

All auth endpoints live under `/api/auth/`. OAuth callbacks redirect to `signchain://auth/callback?token=<jwt>` for deep link capture by the desktop app. JWTs are signed with HS256 and expire after 24 hours.

JWT claims include a `trust` field (the auth provider: `"email"`, `"google"`, `"microsoft"`) and `verified: true`. These flow into the signature payload, allowing verifiers to see how the signer's identity was confirmed.

## Endpoints

### `POST /api/relay`

Submits a document anchor to the blockchain. **Requires JWT authentication.**

**Request:**
```json
{
  "compositeHash": "0xabc...def",
  "previousTxHash": "0x000...000",
  "encryptedPayload": "<base64url-encoded ciphertext>"
}
```

**Process:**
1. Validates the JWT and extracts user ID
2. Validates the request
3. Submits a transaction to the `DocumentAnchor` smart contract
4. Waits for the transaction receipt
5. Stores the anchor record in the database (tx hash, composite hash, encrypted payload, user ID)
6. Returns the transaction hash

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
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String?
  authProvider  String    @default("email")
  providerId    String?
  walletAddress String?   @unique
  anchorCount   Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  anchors       Anchor[]
}

model Session {
  id          String   @id @default(uuid())
  userId      String
  token       String   @unique
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model MagicLink {
  id        String   @id @default(uuid())
  email     String
  code      String   @unique
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model Anchor {
  id                String   @id @default(uuid())
  txHash            String   @unique
  compositeHash     String
  encryptedPayload  String
  userId            String?
  user              User?    @relation(fields: [userId], references: [id])
  createdAt         DateTime @default(now())
}
```

The `encryptedPayload` field stores the AES-128-GCM ciphertext as a base64url string. The server cannot decrypt this data -- it simply stores and returns it.

### Cloud Library (Opt-In Sync)

```prisma
model CloudSignature {
  id        String   @id            // client-generated UUID
  userId    String
  label     String
  base64Png String                  // base64 PNG stored as TEXT
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
  user      User     @relation(...)
  @@index([userId])
}

model CloudTextSnippet {
  id        String   @id
  userId    String
  label     String
  text      String
  fontSize  Float
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
  user      User     @relation(...)
  @@index([userId])
}
```

## Library Endpoints

The `LibraryModule` provides opt-in cloud sync for saved signatures and text snippets. All endpoints require JWT authentication. Data is never uploaded without explicit user consent.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/library` | Return user's cloud signatures + text snippets |
| `PUT` | `/api/library/sync` | Bulk upsert + delete in a Prisma transaction (last-write-wins via `updatedAt`) |
| `DELETE` | `/api/library` | Wipe all cloud library data (when disabling sync) |
| `GET` | `/api/library/exists` | Check if cloud data exists (for new-device prompt) |

Signatures are stored as base64 in Postgres TEXT columns (no S3 -- signatures are typically 5-50 KB each).

## Security Considerations

- **CORS enabled** -- Required for the verification web app to call the API
- **Validation** -- All incoming DTOs are validated with `class-validator`
- **No authentication on verify** -- Verification is intentionally public
- **Relay authentication** -- JWT required; unauthenticated requests receive 401
