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
| `AuthModule` | Magic link (6-digit code), Google OAuth, Microsoft OAuth, JWT issuance |
| `PrismaModule` | Prisma client provider |
| `RelayerModule` | Meta-transaction submission to blockchain |
| `VerifyModule` | Public verification endpoint wrapping blockchain RPC |
| `LibraryModule` | Cloud library sync — opt-in backup of saved signatures and text snippets |

---

## Authentication

Three auth methods: magic link (email), Google OAuth, Microsoft OAuth. All implemented via Passport.js strategies in `apps/api/src/auth/`.

### Magic Link Flow

```
1. Client POST /auth/magic-link        → backend sends 6-digit code via email
2. Client POST /auth/magic-link/verify  → validates code, returns JWT
```

### OAuth Flow (Google / Microsoft)

```
1. Desktop app opens system browser → GET /auth/google (or /auth/microsoft)
2. Passport redirects to provider's OAuth consent screen
3. Provider redirects back → GET /auth/google/callback
4. Backend upserts user, issues JWT
5. Redirects to signchain://auth/callback?token=<jwt>
6. Desktop captures deep link, stores JWT in OS keychain
```

### Auth Endpoints

#### `POST /auth/magic-link`

Send a 6-digit verification code to the given email.

```typescript
// Request
{ email: string }   // validated with @IsEmail()

// Response 201
{ message: "Magic link sent" }
```

Behaviour:
- Generates a random 6-digit numeric code
- Stores in `MagicLink` table with 10-minute expiry
- Sends email via nodemailer (SMTP)
- Always returns 201 regardless of whether email exists (prevents enumeration)

#### `POST /auth/magic-link/verify`

Verify a 6-digit code and receive a JWT.

```typescript
// Request
{ code: string }   // validated with @Length(6, 6)

// Response 200
{ accessToken: string }

// Response 401
{ message: "Invalid or expired code" }
```

Behaviour:
- Finds unexpired, unused MagicLink matching the code
- Marks the code as used
- Find-or-create User with `authProvider: "email"`
- Issues and returns a signed JWT

#### `GET /auth/google`

Initiates Google OAuth flow. Passport redirects to Google's consent screen.

#### `GET /auth/google/callback`

Handles Google's OAuth callback. Upserts user, issues JWT, redirects to `signchain://auth/callback?token=<jwt>`.

#### `GET /auth/microsoft`

Initiates Microsoft OAuth flow. Passport redirects to Microsoft's consent screen.

#### `GET /auth/microsoft/callback`

Handles Microsoft's OAuth callback. Same behaviour as Google callback.

#### `GET /auth/me`

Return current authenticated user.

```typescript
// Auth: Required (JWT)

// Response 200
{ id: string, email: string, name: string | null, authProvider: string }
```

#### `POST /auth/refresh`

Re-issue JWT if the current token is valid.

```typescript
// Auth: Required (JWT)

// Response 200
{ accessToken: string }
```

### JWT

- Signed with HS256, secret from `JWT_SECRET` environment variable
- Payload: `{ sub: userId, email: string, name: string, trust: authProvider, verified: true }`
- Expiry: 24 hours
- Protected endpoints validate JWT via `JwtAuthGuard` (Passport JWT strategy)
- `trust` and `verified` claims flow into the signature payload automatically

---

## Users

Users are created automatically during authentication (find-or-create pattern). There are no separate user registration endpoints. The `GET /auth/me` endpoint serves as the user profile endpoint.

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

## Cloud Library (Opt-In Sync)

The library module allows authenticated users to opt-in to syncing their saved signatures and text snippets to the cloud. This is entirely optional — data is never uploaded without explicit user consent.

Storage uses base64 in Postgres TEXT columns (no S3 — signatures are typically 5-50 KB each). Sync strategy is push-on-change with last-write-wins conflict resolution via `updatedAt` timestamps.

### Library Endpoints

All library endpoints require JWT authentication (`JwtAuthGuard`).

#### `GET /library`

Return the user's cloud signatures and text snippets.

```typescript
// Response 200
{
  signatures: [{ id, label, base64Png, updatedAt, createdAt }],
  textSnippets: [{ id, label, text, fontSize, updatedAt, createdAt }]
}
```

#### `PUT /library/sync`

Bulk upsert and delete in a single Prisma transaction.

```typescript
// Request
{
  signatures: [{ id, label, base64Png, updatedAt }],
  textSnippets: [{ id, label, text, fontSize, updatedAt }],
  deletedSignatureIds: string[],
  deletedSnippetIds: string[]
}

// Response 200 — returns full updated library (same shape as GET /library)
```

Only updates items where client `updatedAt` > existing `updatedAt` (last-write-wins).

#### `DELETE /library`

Wipe all cloud library data for the user. Called when the user disables sync.

#### `GET /library/exists`

Check whether the user has any cloud library data. Used by the new-device prompt.

```typescript
// Response 200
{ exists: boolean }
```

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
  name            string nullable
  authProvider    string default "email"    -- "email", "google", "microsoft"
  providerId      string nullable           -- provider's unique user ID
  walletAddress   string nullable unique
  anchorCount     integer default 0
  createdAt       timestamp
  updatedAt       timestamp

  unique(authProvider, providerId)

Session
  id              uuid PK
  userId          uuid FK → User (cascade delete)
  token           string unique
  expiresAt       timestamp
  createdAt       timestamp

MagicLink
  id              uuid PK
  email           string
  code            string unique             -- 6-digit numeric code
  expiresAt       timestamp
  used            boolean default false
  createdAt       timestamp

Anchor
  id              uuid PK
  txHash          string unique
  compositeHash   string
  encryptedPayload string
  userId          uuid FK → User nullable
  createdAt       timestamp

CloudSignature
  id              uuid PK (client-generated)
  userId          uuid FK → User (cascade delete)
  label           string
  base64Png       text          -- base64-encoded PNG (typically 5-50 KB)
  updatedAt       timestamp
  createdAt       timestamp
  index(userId)

CloudTextSnippet
  id              uuid PK (client-generated)
  userId          uuid FK → User (cascade delete)
  label           string
  text            string
  fontSize        float
  updatedAt       timestamp
  createdAt       timestamp
  index(userId)
```

---

## Email

Emails sent via nodemailer (SMTP). For local development, use Mailpit (port 1025).

| Trigger | Template | Recipients |
|---------|----------|------------|
| `POST /auth/magic-link` | 6-digit verification code | Requesting user |

The magic link email contains an HTML template with the 6-digit code and a 10-minute expiry notice. Additional email templates (signer invitations, completion notifications) will be added as those features are built.

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
# Database
DATABASE_URL                Prisma PostgreSQL connection string

# Blockchain
RPC_URL                     JSON-RPC endpoint (e.g. http://127.0.0.1:8545 for local)
RELAYER_PRIVATE_KEY         Hot wallet private key
SIGNCHAIN_CONTRACT_ADDRESS  Deployed SignChain.sol address
FORWARDER_CONTRACT_ADDRESS  Deployed EIP-2771 forwarder address

# Quota
ANCHOR_QUOTA                Max anchors per user (default 50)

# Auth
JWT_SECRET                  HS256 signing secret
GOOGLE_CLIENT_ID            Google OAuth client ID (empty = disabled)
GOOGLE_CLIENT_SECRET        Google OAuth client secret
GOOGLE_CALLBACK_URL         Google OAuth redirect URI
MICROSOFT_CLIENT_ID         Microsoft OAuth client ID (empty = disabled)
MICROSOFT_CLIENT_SECRET     Microsoft OAuth client secret
MICROSOFT_CALLBACK_URL      Microsoft OAuth redirect URI

# Mail (SMTP)
SMTP_HOST                   SMTP server host
SMTP_PORT                   SMTP port (1025 for local Mailpit)
SMTP_USER                   SMTP username
SMTP_PASS                   SMTP password
MAIL_FROM                   Sender email address
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