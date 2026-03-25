# Auth Module Architecture

## Overview

Self-hosted authentication module built with NestJS + Passport.js. No third-party auth provider owns the user base. Three providers implemented: magic link (email), Google OAuth, and Microsoft OAuth.

## Trust Model

One auth system, multiple providers. Each provider is a **trust anchor** recorded in the signature payload. No tiers or levels — the verifier interprets the trust weight naturally.

```
Magic link    → trust: "email"       (email-verified identity)
Google        → trust: "google"      (Google-verified identity)
Microsoft     → trust: "microsoft"   (Microsoft-verified identity)
```

Future providers (deferred):
```
Apple         → trust: "apple"       (Apple-verified identity)
Singpass      → trust: "singpass"    (government-verified identity)
eID           → trust: "eid"         (EU government-verified)
```

Every signature requires authentication. No anonymous relay.

## Signature Payload Extension

The `s` (signer) field in the anchor payload gains trust metadata via short keys:

```json
{
  "d": "<doc_hash>",
  "s": {
    "t": "individual",
    "n": "John Doe",
    "e": "john@example.com",
    "tr": "google",
    "v": true
  },
  "ts": 1774288200,
  "salt": "<random>"
}
```

| Field | Serde Key | Description | Required |
|-------|-----------|-------------|----------|
| `trust` | `tr` | Trust anchor identifier (`"email"`, `"google"`, `"microsoft"`) | Optional |
| `verified` | `v` | Whether identity was verified by the trust anchor | Optional |

The verifier displays the trust level:
- **Google/Microsoft** — "Authenticated via Google/Microsoft" (yellow badge)
- **Email** — "Email verified via magic link" (grey badge)

## System Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Desktop App  │────▶│  Auth API    │────▶│  Passport         │
│ (Tauri)      │     │  (NestJS)    │     │  Strategies       │
└──────────────┘     └──────┬───────┘     └──────┬───────────┘
                            │                     │
                     ┌──────▼───────┐     ┌──────▼───────────┐
                     │  User DB     │     │ ● Magic Link     │
                     │  (Postgres)  │     │ ● Google OAuth   │
                     └──────────────┘     │ ● Microsoft OAuth│
                                          └──────────────────┘
```

## Components

### 1. Auth API (`apps/api/src/auth/`)

```
auth/
├── auth.module.ts              # Imports PassportModule, JwtModule; provides strategies
├── auth.controller.ts          # 8 endpoints (see below)
├── auth.service.ts             # Token issuance, magic link, user upsert
├── jwt.strategy.ts             # Passport JWT strategy (validates Bearer tokens)
├── jwt-auth.guard.ts           # Guard that applies JWT strategy
├── google.strategy.ts          # Passport Google OAuth2 strategy
├── microsoft.strategy.ts       # Passport Microsoft OAuth2 strategy
├── mail.service.ts             # Sends magic link emails via nodemailer
├── passport-microsoft.d.ts     # Type declaration for passport-microsoft
└── dto/
    ├── magic-link.dto.ts       # { email: string } with @IsEmail()
    └── magic-link-verify.dto.ts # { code: string } with @Length(6, 6)
```

### 2. Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/magic-link` | None | Send 6-digit code to email |
| `POST` | `/auth/magic-link/verify` | None | Verify code, return JWT |
| `GET` | `/auth/google` | None | Redirect to Google OAuth |
| `GET` | `/auth/google/callback` | None | Google callback → `signchain://auth/callback?token=<jwt>` |
| `GET` | `/auth/microsoft` | None | Redirect to Microsoft OAuth |
| `GET` | `/auth/microsoft/callback` | None | Microsoft callback → `signchain://auth/callback?token=<jwt>` |
| `GET` | `/auth/me` | JWT | Return current user |
| `POST` | `/auth/refresh` | JWT | Re-issue JWT if current token is valid |

### 3. Auth Service Logic

- **`sendMagicLink(email)`**: Generate 6-digit code, store in `MagicLink` table (10min expiry), send email via nodemailer
- **`verifyMagicLink(code)`**: Find unexpired/unused code, find-or-create User (authProvider="email"), issue JWT
- **`handleOAuthCallback(provider, profile)`**: Find-or-create User by email (upgrade authProvider if needed), issue JWT
- **`issueJwt(user)`**: Sign with `{ sub, email, name, trust: user.authProvider, verified: true }`
- **`refreshToken(userId)`**: Re-issue JWT for existing valid session
- **`getMe(userId)`**: Return user record

OAuth callbacks redirect to `signchain://auth/callback?token=<jwt>` for deep link capture by the desktop app.

### 4. Desktop App Flow

```
1. User clicks "Sign in with Google" (or magic link, or Microsoft)
2. App calls open_auth_browser(provider) → opens system browser
3. Browser navigates to API: /auth/{provider}
4. User completes auth in browser
5. API redirects → signchain://auth/callback?token=<jwt>
6. Tauri deep link handler captures URL, emits auth-callback event
7. React listener receives JWT, stores in OS keychain via keyring crate
8. User profile (name, company, position) collected in profile step
9. Profile stored in OS keychain as JSON
10. Subsequent API calls include JWT in Authorization header
```

### 5. Database Schema

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String?
  authProvider  String    @default("email")   // "email", "google", "microsoft"
  providerId    String?                       // provider's unique user ID
  walletAddress String?   @unique
  anchorCount   Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions      Session[]
  anchors       Anchor[]

  @@unique([authProvider, providerId])
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
```

### 6. JWT Claims

```json
{
  "sub": "user-uuid",
  "email": "john@example.com",
  "name": "John Doe",
  "trust": "google",
  "verified": true,
  "iat": 1774288200,
  "exp": 1774374600
}
```

- Signed with HS256 via `@nestjs/jwt`
- Expiry: 24 hours
- `trust` = auth provider ID, flows into signature payload as `tr`
- `verified` = always true (all implemented providers verify identity/email)

### 7. OS Keychain Storage (Desktop)

JWT and user profile are stored in the OS keychain via the `keyring` crate:

| Entry | Service | User | Content |
|-------|---------|------|---------|
| JWT | `com.intrigsoft.signchain` | `jwt` | Raw JWT string |
| Profile | `com.intrigsoft.signchain` | `profile` | JSON: `{ name, company, position }` |

Rust commands:
- `get_stored_jwt()` / `store_jwt(token)` / `clear_stored_jwt()`
- `get_stored_profile()` / `store_profile(json)`
- `open_auth_browser(provider)` — opens `/auth/{provider}` in system browser

### 8. Deep Link Protocol

Protocol: `signchain://`

Registered in `tauri.conf.json`:
```json
{ "plugins": { "deep-link": { "desktop": { "schemes": ["signchain"] } } } }
```

The API redirects OAuth callbacks to `signchain://auth/callback?token=<jwt>`. On macOS, Tauri's deep-link plugin emits `deep-link://new-url`. On Linux/Windows, the URL arrives as a CLI argument.

## Relay API Changes

The relay endpoint requires authentication:

```
POST /api/relay
Authorization: Bearer <jwt>    ← required

{
  "compositeHash": "0x...",
  "encryptedPayload": "..."
}
```

- **With JWT**: Accepted. User ID recorded on anchor. Rate limit by user.
- **Without JWT**: Rejected (401 Unauthorized)

## Environment Variables

```
JWT_SECRET                  HS256 signing secret
GOOGLE_CLIENT_ID            Google OAuth client ID
GOOGLE_CLIENT_SECRET        Google OAuth client secret
GOOGLE_CALLBACK_URL         Google OAuth redirect URI
MICROSOFT_CLIENT_ID         Microsoft OAuth client ID
MICROSOFT_CLIENT_SECRET     Microsoft OAuth client secret
MICROSOFT_CALLBACK_URL      Microsoft OAuth redirect URI
SMTP_HOST                   SMTP server host
SMTP_PORT                   SMTP server port (1025 for local Mailpit)
SMTP_USER                   SMTP username
SMTP_PASS                   SMTP password
MAIL_FROM                   Sender email address
```

OAuth strategies gracefully handle empty client IDs — they fall back to `'not-configured'` to prevent startup crashes when OAuth is not set up.

## Migration Path

1. **Implemented**: Magic link + Google OAuth + Microsoft OAuth
2. **Future**: Apple Sign-In
3. **Future**: Singpass (first government ID, targets Singapore market)
4. **Future**: Additional government IDs per market expansion

## Verification Display

The web verification page shows a trust badge based on the `tr` field:

```
┌────────────────────────────────────┐
│ ✅ Verified                        │
│                                    │
│ Signer: John Doe                   │
│ Email:  john@example.com           │
│                                    │
│ 🔒 Authenticated via Google        │
│                                    │
│ Document Hash: 0xabcd...           │
│ Signed: 24 Mar 2026, 10:30 AM     │
│ Chain: 2 signature(s)             │
└────────────────────────────────────┘
```

Badge styles:
- `"google"` / `"microsoft"` → yellow background (#fefce8)
- `"email"` → grey background (#f3f4f6)
- No `tr` field → no badge shown
