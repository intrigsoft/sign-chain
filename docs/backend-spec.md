# SignChain — Backend Service Specification

## Overview

The backend is a thin coordination layer. It is not the source of cryptographic truth — the Polygon blockchain is. Its responsibilities are limited to workflow coordination, signer invitation, meta-transaction relaying, and public verification. It never processes PDF files or computes document hashes.

**Stack:** NestJS, TypeScript, Prisma, PostgreSQL, AWS Lightsail

---

## Principles

- The backend never handles PDF content under any circumstances
- Cryptographic hashes are always computed client-side (in the desktop app) and submitted to the backend after anchoring
- The relayer is the only point of contact with Polygon — and the policy enforcement chokepoint
- Verification data is always sourced from Polygon directly, not from the database

---

## Modules

| Module | Responsibility |
|--------|---------------|
| `AuthModule` | Magic link issuance and TOTP verification |
| `UsersModule` | Account creation and wallet address registration |
| `DocumentsModule` | Document workflow state and signer queue management |
| `RelayerModule` | EIP-2771 meta-transaction submission to Polygon |
| `VerifyModule` | Public verification endpoint wrapping Polygon RPC |
| `EmailModule` | Resend integration for magic links and signer invitations |

---

## Authentication

### Flow

**First login (account setup):**

```
1. Client POST /auth/magic-link        → backend sends magic link email
2. Client POST /auth/magic-link/verify → validates token, returns TOTP setup payload
3. Client POST /auth/totp/setup        → user scans QR, submits first TOTP code, returns JWT
```

**Subsequent logins:**

```
1. Client POST /auth/magic-link        → backend sends magic link email
2. Client POST /auth/magic-link/verify → validates token, returns TOTP challenge
3. Client POST /auth/totp/verify       → submits TOTP code, returns JWT
```

### Auth Endpoints

#### `POST /auth/magic-link`

Request a magic link email.

```typescript
// Request
{ email: string }

// Response 200
{ message: "Magic link sent" }
```

Behaviour:
- Generates a secure random token (32 bytes, hex-encoded)
- Stores hashed token in DB with 15-minute expiry
- Sends email via Resend with link to desktop app deep link: `signchain://auth/verify?token=<token>`
- Always returns 200 regardless of whether email exists (prevents enumeration)

#### `POST /auth/magic-link/verify`

Verify a magic link token.

```typescript
// Request
{ token: string }

// Response 200 — TOTP not yet set up
{ status: "totp_setup_required", totpSecret: string, totpUri: string }

// Response 200 — TOTP already configured
{ status: "totp_required" }

// Response 401
{ message: "Invalid or expired token" }
```

Behaviour:
- Looks up and validates token (single use, invalidated immediately on use)
- If `totpVerified = false`: generates TOTP secret, stores encrypted, returns setup payload
- If `totpVerified = true`: returns challenge status only (no secret transmitted)

#### `POST /auth/totp/setup`

Complete TOTP setup on first login.

```typescript
// Request
{ email: string, code: string }

// Response 200
{ accessToken: string }

// Response 401
{ message: "Invalid TOTP code" }
```

Behaviour:
- Validates TOTP code against stored secret
- Sets `totpVerified = true`
- Returns signed JWT (24-hour expiry)

#### `POST /auth/totp/verify`

Verify TOTP code on subsequent logins.

```typescript
// Request
{ email: string, code: string }

// Response 200
{ accessToken: string }

// Response 401
{ message: "Invalid TOTP code" }
```

### JWT

- Signed with HS256, secret from environment variable
- Payload: `{ sub: userId, email: string, iat: number, exp: number }`
- Expiry: 24 hours
- All protected endpoints validate JWT via `AuthGuard`

---

## Users

### User Endpoints

#### `POST /users`

Create a new user account. Called by the desktop app on first launch after TOTP setup.

```typescript
// Auth: Required (JWT)

// Request
{ walletAddress: string }

// Response 201
{ id: string, email: string, walletAddress: string, createdAt: string }

// Response 409
{ message: "User already exists" }
```

Behaviour:
- Creates User record if not already exists
- Associates the owner's Ethereum wallet address with the account
- Wallet address is used as the `from` field in EIP-2771 meta-transactions

#### `PATCH /users/me/wallet`

Update wallet address (e.g. if keypair is regenerated).

```typescript
// Auth: Required (JWT)

// Request
{ walletAddress: string }

// Response 200
{ walletAddress: string }
```

#### `GET /users/me`

Return current user profile.

```typescript
// Auth: Required (JWT)

// Response 200
{ id: string, email: string, walletAddress: string, anchorCount: number, createdAt: string }
```

---

## Documents

The document record tracks workflow state only. No PDF content is stored server-side.

### Document Endpoints

#### `POST /documents`

Register a new document signing workflow. Called by the desktop app immediately after the owner has signed and anchored their own signature.

```typescript
// Auth: Required (JWT)

// Request
{
  title: string,
  ownerTxHash: string,       // Polygon txHash from owner's anchor
  docHash: string,           // SHA-256 hash owner computed locally
  signers: [
    { email: string, order: number }
  ]
}

// Response 201
{
  id: string,
  title: string,
  status: "in_progress",
  ownerTxHash: string,
  signers: [{ id: string, email: string, order: number, status: "pending" }],
  createdAt: string
}
```

Behaviour:
- Creates Document and Signer records
- Owner is automatically recorded as order=0, status="signed"
- Does NOT automatically invite signer order=1 — caller must invoke `/documents/:id/invite`

#### `GET /documents`

List all documents owned by the authenticated user.

```typescript
// Auth: Required (JWT)

// Response 200
{
  documents: [
    {
      id: string,
      title: string,
      status: "pending" | "in_progress" | "completed",
      signerCount: number,
      signedCount: number,
      createdAt: string
    }
  ]
}
```

#### `GET /documents/:id`

Get full document state including per-signer status.

```typescript
// Auth: Required (JWT)

// Response 200
{
  id: string,
  title: string,
  status: string,
  ownerTxHash: string,
  signers: [
    {
      id: string,
      email: string,
      order: number,
      status: "pending" | "invited" | "signed",
      txHash: string | null,
      signedAt: string | null
    }
  ],
  createdAt: string
}

// Response 404
{ message: "Document not found" }
```

Behaviour:
- Only the document owner may retrieve this
- Returns 404 if document belongs to another user

#### `POST /documents/:id/invite`

Send magic link invitation email to the next pending signer.

```typescript
// Auth: Required (JWT)

// Response 200
{ message: "Invitation sent", signerEmail: string }

// Response 400
{ message: "No pending signers" | "Previous signer has not completed" }

// Response 404
{ message: "Document not found" }
```

Behaviour:
- Finds the lowest-order signer with status="pending"
- Verifies the previous signer (order - 1) has status="signed"
- Generates a magic token (32 bytes, hex-encoded), stores hashed with 24-hour expiry
- Sends invitation email via Resend containing the document title, a brief description, and a download/deep-link URL
- Sets signer status to "invited"

#### `POST /documents/:id/sign`

Record a completed signing event. Called by the desktop app after the signer has locally anchored their signature.

```typescript
// Auth: Magic token (passed as Bearer token in Authorization header)

// Request
{
  txHash: string,         // Polygon txHash from signer's anchor
  previousTxHash: string, // txHash of the immediately preceding signer
  docHash: string         // SHA-256 hash signer computed locally
}

// Response 200
{
  message: "Signing recorded",
  nextSigner: string | null   // email of next signer, or null if complete
}

// Response 401
{ message: "Invalid or expired token" }

// Response 409
{ message: "Already signed" }
```

Behaviour:
- Validates magic token (single use, invalidated on use)
- Updates Signer record: status="signed", txHash, previousTxHash, docHash, signedAt
- If all signers have signed: sets Document status="completed"
- If more signers remain: does NOT auto-invite — owner is responsible for triggering next invite

---

## Relayer

The relayer submits EIP-2771 meta-transactions to Polygon on behalf of desktop signers. The desktop app signs the transaction locally (using the owner's keypair in the OS keychain) and sends the signed payload here. The backend hot wallet pays the gas and forwards the call to the `SignChain.sol` contract.

### Relayer Endpoint

#### `POST /relay`

Submit a signed meta-transaction for anchoring.

```typescript
// Auth: Required (JWT)

// Request
{
  from: string,          // Signer's wallet address
  data: string,          // ABI-encoded anchorDocument() call
  signature: string      // EIP-712 signature produced by signer's keypair
}

// Response 200
{
  txHash: string,        // Polygon transaction hash
  blockNumber: number
}

// Response 402
{ message: "Anchor quota exceeded" }

// Response 400
{ message: "Invalid signature" }

// Response 503
{ message: "Relayer wallet balance too low" }
```

Behaviour:

1. Validate JWT — extract `userId`
2. Check user quota against `anchorCount` — reject with 402 if exceeded
3. Verify EIP-712 signature — recover `from` address and confirm it matches `users.walletAddress` for this user
4. Decode `data` — confirm it is a valid `anchorDocument()` call (correct selector, valid bytes32 hashes)
5. Check relayer wallet balance — reject with 503 if below minimum threshold
6. Submit via ethers.js: call `SignChain.sol` via the forwarder contract with the original `from` preserved
7. Wait for 1 confirmation
8. Increment `users.anchorCount`
9. Return `txHash`

### Relayer Configuration

```
RELAYER_PRIVATE_KEY        Hot wallet private key (environment variable, never committed)
RELAYER_RPC_URL            Alchemy RPC URL for Polygon Amoy
SIGNCHAIN_CONTRACT_ADDRESS Deployed SignChain.sol address
FORWARDER_CONTRACT_ADDRESS Deployed EIP-2771 forwarder address
RELAYER_MIN_BALANCE_MATIC  Minimum balance threshold (warn + reject below this)
```

### Quota (PoC)

Free tier: 50 anchors per account per calendar month. Counter resets on the 1st of each month via a scheduled NestJS cron job.

---

## Verification

### Verify Endpoint

#### `GET /verify/:txHash`

Public endpoint. Returns human-readable verification data for a Polygon transaction.

```typescript
// Auth: None

// Response 200
{
  txHash: string,
  docHash: string,
  signerEmail: string,
  timestamp: string,          // ISO 8601, derived from block.timestamp
  previousTxHash: string,     // "0x0000...0000" for first signer
  chainId: number,
  contractAddress: string,
  chain: [                    // Full chain walked backwards via previousTxHash
    {
      txHash: string,
      signerEmail: string,
      timestamp: string,
      order: number           // 0 = first signer (owner)
    }
  ]
}

// Response 404
{ message: "Transaction not found on chain" }
```

Behaviour:
- Queries Polygon RPC via Alchemy using `verifyDocument(txHash)` on `SignChain.sol`
- Walks the chain backwards via `previousTxHash` links until `bytes32(0)` is reached
- Never reads from the PostgreSQL database — all data comes from Polygon
- Results may be cached in-memory for up to 60 seconds to reduce RPC usage

---

## Database Schema

```
User
  id              uuid PK
  email           string unique
  walletAddress   string nullable
  totpSecret      string nullable  -- encrypted at rest (AES-256-GCM)
  totpVerified    boolean default false
  anchorCount     integer default 0
  createdAt       timestamp

Document
  id              uuid PK
  ownerId         uuid FK → User
  title           string
  ownerTxHash     string           -- txHash from owner's anchor (first signer)
  status          enum { in_progress, completed }
  createdAt       timestamp

Signer
  id              uuid PK
  documentId      uuid FK → Document
  email           string
  order           integer          -- 0 = owner, 1 = first invited signer, etc.
  status          enum { pending, invited, signed }
  txHash          string nullable
  previousTxHash  string nullable
  docHash         string nullable  -- hash signer reported; informational only
  inviteToken     string nullable  -- stored as SHA-256 hash
  tokenExpiry     timestamp nullable
  signedAt        timestamp nullable

MagicToken                         -- for auth magic links (separate from signer invite tokens)
  id              uuid PK
  userId          uuid FK → User nullable  -- null if email not yet registered
  email           string
  tokenHash       string           -- SHA-256 of raw token
  expiresAt       timestamp
  usedAt          timestamp nullable
  createdAt       timestamp
```

---

## Email Templates

All emails sent via Resend.

| Trigger | Template | Recipients |
|---------|----------|------------|
| `POST /auth/magic-link` | Login magic link | Requesting user |
| `POST /documents/:id/invite` | Signing invitation | Next pending signer |
| Document completed | Completion notification | Document owner |

Email content is minimal — no HTML branding in PoC. Plain text with relevant links.

---

## Error Handling

All error responses follow a consistent shape:

```typescript
{ statusCode: number, message: string, error?: string }
```

Global exception filter catches unhandled errors and returns 500 with a generic message. Detailed errors are logged server-side only, never exposed in responses.

---

## Environment Variables

```
# App
PORT                        NestJS listen port (default 3000)
NODE_ENV                    development | production

# Auth
JWT_SECRET                  HS256 signing secret (min 32 chars)
MAGIC_LINK_BASE_URL         Base URL for desktop deep links (signchain://)

# Database
DATABASE_URL                Prisma PostgreSQL connection string

# Email
RESEND_API_KEY              Resend API key
EMAIL_FROM                  Sender address (e.g. noreply@signchain.io)

# Relayer
RELAYER_PRIVATE_KEY         Hot wallet private key
RELAYER_RPC_URL             Alchemy Polygon Amoy RPC URL
SIGNCHAIN_CONTRACT_ADDRESS  Deployed contract address
FORWARDER_CONTRACT_ADDRESS  EIP-2771 forwarder address
RELAYER_MIN_BALANCE_MATIC   Minimum MATIC balance before rejecting relay requests

# Encryption
TOTP_ENCRYPTION_KEY         AES-256-GCM key for encrypting TOTP secrets at rest
```

---

## Deployment

- Single NestJS process on AWS Lightsail (2 GB RAM, 1 vCPU)
- PostgreSQL co-located on same Lightsail instance
- Reverse-proxied via nginx (TLS termination, rate limiting)
- Prisma migrations run on deploy via `prisma migrate deploy`
- Environment variables injected via Lightsail environment config (never in source)

### Rate Limiting

Applied at nginx layer:

| Endpoint | Limit |
|----------|-------|
| `POST /auth/magic-link` | 5 requests / 15 min per IP |
| `POST /relay` | 20 requests / min per user |
| All other endpoints | 60 requests / min per IP |

---

## Out of Scope (PoC)

- Web signer flow (deferred to v2)
- Subscription billing and plan management
- Webhook notifications
- Audit log export
- Multi-tenant / organisation accounts
- Document revocation

---

*SignChain is a project of intrigsoft (Private) Limited.*