---
sidebar_position: 5
---

# Verification Web App

The verification web app is a lightweight React application served at `signchain.app`. Its sole purpose is to verify document signatures when a user scans the QR code on a signed PDF.

## Design Goals

- **Zero friction** -- No app install, no account, no login
- **Mobile first** -- Optimized for phone screens (QR scanning)
- **Client-side decryption** -- The encryption key never leaves the browser
- **Fast** -- Minimal bundle size, single API call

## How It Works

### URL Routing

```
https://signchain.app/v/<base64url(txHash)>#<base64url(key)>
                         └──── path ────┘   └── fragment ──┘
```

The React Router matches `/v/:txHashB64` and extracts both the path parameter and the URL fragment.

### Verification Sequence

```
1. Parse URL
   ├── Decode txHashB64 → hex tx hash
   └── Extract key from fragment

2. API call
   GET /api/verify/0x<txHash>
   └── Returns: blockchain data + encrypted payload

3. Decrypt (in browser)
   AES-128-GCM decrypt(key, encryptedPayload)
   └── Returns: JSON with signer info

4. Display results
```

### Security: The Fragment Stays Private

The `#fragment` portion of a URL is never sent to the server in HTTP requests. This is a fundamental property of URLs defined in RFC 3986. This means:

- The API server never sees the decryption key
- Network logs and proxies never capture the key
- Only the browser (and by extension, the user) has access to the key

## Technology

| Aspect | Choice |
|---|---|
| Framework | React 19 |
| Bundler | Vite |
| Crypto | Web Crypto API (`crypto.subtle`) |
| Styling | Inline styles (no CSS framework) |
| Hosting | Any static file host |

### Web Crypto API Requirement

The Web Crypto API requires a **secure context** (HTTPS). The verification page will not work over plain HTTP. In production, this is handled by serving from an HTTPS domain. For local development, a self-signed certificate is used via `@vitejs/plugin-basic-ssl`.

## Verification States

The page displays one of three states:

### Verified (Green)
All checks passed. Shows:
- Signer name, email, type, company, position
- Document hash, signing timestamp, geolocation
- Transaction hash, composite hash, chain length

### Partial Verification (Yellow)
The blockchain anchor exists but the URL fragment (decryption key) is missing. This can happen if:
- The QR was manually typed without the fragment
- The URL was shared without the fragment

Shows: transaction hash, composite hash, block time, chain length.

### Verification Failed (Red)
The transaction was not found or the API returned an error. Shows the error message.

## Bundle Size

The verification app is intentionally minimal:
- No PDF rendering library
- No state management library
- No CSS framework
- Total bundle: ~70 KB gzipped (mostly React)
