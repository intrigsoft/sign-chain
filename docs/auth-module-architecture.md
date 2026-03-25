# Auth Module Architecture

## Overview

Self-hosted authentication module with graduated trust levels. No third-party auth provider owns the user base.

## Trust Model

One auth system, multiple providers. Each provider is simply a **trust anchor** recorded in the signature. No tiers or levels — the verifier interprets the trust weight naturally.

```
Magic link    → trust: "email"       (self-claimed email)
Google        → trust: "google"      (Google-verified email)
Apple         → trust: "apple"       (Apple-verified identity)
Singpass      → trust: "singpass"    (government-verified identity)
eID           → trust: "eid"         (EU government-verified)
```

Every signature requires authentication. No anonymous relay.

## Signature Payload Extension

The `s` (signer) field in the anchor payload gains trust metadata:

```json
{
  "d": "<doc_hash>",
  "s": {
    "t": "individual",
    "n": "John Doe",
    "e": "john@example.com",
    "trust": "singpass",
    "verified": true,
    "provider": "sgid",
    "pid": "S1234567D"
  },
  "ts": 1774288200,
  "salt": "<random>"
}
```

| Field | Description | Required |
|-------|-------------|----------|
| `trust` | Trust anchor identifier (`"self"`, `"google"`, `"singpass"`, `"eid"`) | Yes |
| `verified` | Whether identity was verified by the trust anchor | Yes |
| `provider` | Specific provider within the trust anchor | Optional |
| `pid` | Provider-specific identity (e.g., NRIC for Singpass) | Optional, encrypted |

The verifier displays the trust level prominently:
- 🟢 **Government Verified** — "Identity confirmed by Singpass"
- 🟡 **Authenticated** — "Signed in via Google"
- ⚪ **Self-Claimed** — "Identity not verified"

## System Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Desktop App  │────▶│  Auth API    │────▶│  Provider        │
│ (Tauri)      │     │  (NestJS)    │     │  Adapters        │
└──────────────┘     └──────┬───────┘     └──────┬───────────┘
                            │                     │
                     ┌──────▼───────┐     ┌──────▼───────────┐
                     │  User DB     │     │ ● Magic Link     │
                     │  (Postgres)  │     │ ● Google OAuth   │
                     └──────────────┘     │ ● Apple Sign-In  │
                                          │ ● Microsoft      │
                                          │ ● Singpass OIDC  │
                                          │ ● eID (eIDAS)    │
                                          └──────────────────┘
```

## Components

### 1. Auth API (`apps/api/src/auth/`)

```
auth/
├── auth.module.ts
├── auth.controller.ts          # /auth/login, /auth/callback, /auth/refresh
├── auth.service.ts             # Token issuance, session management
├── auth.guard.ts               # JWT guard for protected routes
├── strategies/
│   ├── magic-link.strategy.ts  # Email magic link (passwordless)
│   ├── google.strategy.ts      # Google OAuth 2.0
│   ├── apple.strategy.ts       # Apple Sign-In
│   ├── microsoft.strategy.ts   # Microsoft OAuth 2.0
│   └── singpass.strategy.ts    # Singpass OIDC (Level 2)
├── providers/
│   ├── provider.interface.ts   # Common interface for all providers
│   └── provider.registry.ts    # Dynamic provider registration
├── dto/
│   ├── login.dto.ts
│   └── callback.dto.ts
└── entities/
    └── user.entity.ts          # Prisma model
```

### 2. Provider Interface

```typescript
interface AuthProvider {
  id: string;                           // "google", "singpass", etc.
  trustLevel: 0 | 1 | 2;
  displayName: string;

  // Initiate auth flow — returns redirect URL
  getAuthUrl(state: string): Promise<string>;

  // Handle callback — returns verified identity
  handleCallback(code: string): Promise<ProviderIdentity>;
}

interface ProviderIdentity {
  providerId: string;                   // Provider's unique ID for this user
  email: string;
  name: string;
  verified: boolean;                    // Did the provider verify identity?
  trustAnchor: string;                  // "google", "singpass", etc.
  metadata?: Record<string, string>;    // Provider-specific (e.g., NRIC)
}
```

### 3. Desktop App Flow

```
1. User clicks "Sign in with Google" (or magic link, or Singpass)
2. App opens system browser → https://api.signchain.app/auth/login?provider=google
3. User completes auth in browser
4. Browser redirects → signchain://auth/callback?code=xxx&state=yyy
5. App captures deep link, exchanges code for JWT
6. JWT stored in OS keychain (not localStorage)
7. Subsequent API calls include JWT in Authorization header
```

### 4. Database Schema

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  accounts      Account[]
  sessions      Session[]
}

model Account {
  id              String   @id @default(cuid())
  userId          String
  provider        String   // "magic-link", "google", "singpass"
  providerUserId  String   // Provider's unique ID
  trustLevel      Int      // 0, 1, or 2
  verified        Boolean  @default(false)
  metadata        Json?    // Provider-specific data (encrypted at rest)
  createdAt       DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id])

  @@unique([provider, providerUserId])
}

model Session {
  id          String   @id @default(cuid())
  userId      String
  token       String   @unique
  expiresAt   DateTime
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id])
}
```

### 5. JWT Claims

```json
{
  "sub": "user_cuid",
  "email": "john@example.com",
  "name": "John Doe",
  "trust": "singpass",
  "verified": true,
  "iat": 1774288200,
  "exp": 1774374600
}
```

The `trust` and `verified` claims flow into the signature payload automatically — the desktop app reads them from the JWT when building the anchor payload.

## Singpass Integration (Level 2 Example)

Singpass uses OpenID Connect (OIDC) with PKCE:

1. **Register** at Singpass Developer Portal → get client_id
2. **Auth URL**: `https://id.singpass.gov.sg/auth?client_id=...&scope=openid&nonce=...`
3. **Callback**: Exchange code for ID token
4. **ID Token** contains verified NRIC, name, etc.
5. **Trust level**: 2 (government-verified)

The same pattern applies to any OIDC-compliant government ID system.

## Relay API Changes

The relay endpoint becomes optionally authenticated:

```
POST /api/relay
Authorization: Bearer <jwt>    ← required

{
  "compositeHash": "0x...",
  "previousTxHash": "0x..."
}
```

- **With JWT**: Required. Rate limit by user, trust metadata included in response
- **Without JWT**: Rejected (401 Unauthorized)

## Migration Path

1. **Phase 1**: Magic link auth (simplest, no OAuth complexity)
2. **Phase 2**: Google + Apple (covers most users)
3. **Phase 3**: Singpass (first government ID, targets Singapore market)
4. **Phase 4**: Additional government IDs per market expansion

## Verification Display

The web verification page shows trust level:

```
┌────────────────────────────────────┐
│ ✅ Verified                        │
│                                    │
│ Signer: John Doe                   │
│ Email:  john@example.com           │
│                                    │
│ 🏛️ Identity verified by Singpass   │
│ Trust Level: Government Verified   │
│                                    │
│ Document Hash: 0xabcd...           │
│ Signed: 24 Mar 2026, 10:30 AM     │
│ Chain: 2 signature(s)             │
└────────────────────────────────────┘
```

vs anonymous:

```
┌────────────────────────────────────┐
│ ✅ Verified                        │
│                                    │
│ Signer: John Doe                   │
│ Email:  john@example.com           │
│                                    │
│ ⚠️ Identity is self-claimed        │
│ Trust Level: Not Verified          │
│                                    │
│ ...                                │
└────────────────────────────────────┘
```
