# SignChain Desktop — Application Specification

## Overview

The SignChain desktop application is the primary interface for document owners. It is built with Tauri 2 (Rust backend) and React (TypeScript frontend). It handles the complete owner-side signing flow: uploading a PDF, configuring signers, signing the document locally, and monitoring signing progress.

The PDF pipeline runs entirely in Rust. The React layer handles UI state only — it never touches PDF bytes.

---

## Package Structure

```
packages/desktop/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json              Tauri 2 permission grants
│   └── src/
│       ├── main.rs                   App entry — registers commands, plugins
│       ├── lib.rs                    Shared state, AppState definition
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── auth.rs               Keychain JWT/profile storage, open_auth_browser
│       │   ├── library.rs            Persistent signature & text snippet storage + sync preference
│       │   ├── pdf.rs                sign_document, preview_pdf
│       │   ├── documents.rs          list_documents, get_document
│       │   └── quota.rs              get_quota
│       └── pdf/
│           ├── mod.rs
│           ├── normalise.rs          Strip volatile metadata
│           ├── embed.rs              Signature block + QR embedding
│           └── hash.rs               SHA-256 of normalised+embedded PDF
├── src/
│   ├── main.tsx                      React entry
│   ├── App.tsx                       Router root
│   ├── routes/
│   │   ├── auth/
│   │   │   └── Callback.tsx          Deep link auth callback handler
│   │   ├── dashboard/
│   │   │   ├── index.tsx             Document list
│   │   │   └── DocumentRow.tsx
│   │   ├── upload/
│   │   │   └── index.tsx             File picker + PDF preview
│   │   ├── signers/
│   │   │   └── index.tsx             Add signers, set order
│   │   ├── sign/
│   │   │   ├── index.tsx             Signature canvas + confirm
│   │   │   └── SigningProgress.tsx    Anchor progress overlay
│   │   └── document/
│   │       └── [id].tsx              Document detail + signer status
│   ├── components/
│   │   ├── ui/                       Primitives (Button, Input, Badge, etc.)
│   │   ├── PdfPreview.tsx            PDF.js renderer (read-only)
│   │   ├── SignatureCanvas.tsx        Draw / upload signature
│   │   ├── SignerList.tsx            Drag-to-reorder signer rows
│   │   ├── QuotaBadge.tsx            Signs used / quota display
│   │   ├── ChainStatus.tsx           Hash chain visualisation
│   │   ├── CloudLibraryPrompt.tsx    New-device cloud library download prompt
│   │   └── TitleBar.tsx              Custom draggable title bar (shows user email + sign out)
│   ├── hooks/
│   │   ├── useAuthInit.ts            Load JWT + profile from keychain on mount, listen for deep link
│   │   ├── useSign.ts                Orchestrates the full signing flow (includes trust metadata)
│   │   ├── useDocuments.ts           Document list + polling
│   │   ├── useQuota.ts               Fetch and cache quota state
│   │   └── usePdfPreview.ts          PDF.js load + page management
│   ├── lib/
│   │   ├── tauri.ts                  Typed invoke() wrappers (includes trust/verified params)
│   │   ├── api.ts                    Backend HTTP client (attaches JWT from auth store)
│   │   └── constants.ts              API base URL, chain ID, etc.
│   └── store/
│       ├── signing.ts                Zustand store for in-progress signing session
│       ├── auth.ts                   Zustand store for JWT + decoded user claims
│       └── library.ts                Zustand store for saved signatures, text snippets + cloud sync
├── package.json
└── vite.config.ts
```

---

## Rust Layer

### AppState

```rust
// src-tauri/src/state.rs

pub struct AppState {
    pub jwt: Mutex<Option<String>>,         // JWT — loaded from keychain on startup
    pub api_base: String,                   // Backend base URL from env
    pub http: reqwest::Client,              // Shared HTTP client
}
```

`AppState` is initialised in `lib.rs` and injected into every command via `tauri::State`.

---

### Commands

All commands are `async` and return `Result<T, String>`. Errors are plain strings surfaced to the React layer via the invoke error path.

#### `auth`

```rust
// open_auth_browser(provider: String) → ()
// Opens {api_base}/auth/{provider} in the system browser via shell plugin.
// provider is "google", "microsoft", or "magic-link".

// get_stored_jwt() → Option<String>
// Reads JWT from OS keychain (service: "com.intrigsoft.signchain", user: "jwt").

// store_jwt(token: String) → ()
// Saves JWT to OS keychain + updates AppState.jwt.

// clear_stored_jwt() → ()
// Removes JWT and profile from OS keychain, clears AppState.jwt.

// store_profile(profile_json: String) → ()
// Saves user profile JSON to OS keychain (user: "profile").
// Profile contains: { name, company, position }.

// get_stored_profile() → Option<String>
// Reads profile JSON from OS keychain.
```

Keychain storage uses the `keyring` crate with service `"com.intrigsoft.signchain"`.

#### `pdf`

```rust
// sign_document(payload: SignPayload) → SigningResult
//
// SignPayload {
//   pdf_path: String,
//   signer_email: String,
//   signature_image_base64: String,   // PNG from React canvas
//   document_id: String,              // backend document ID
//   previous_tx_hash: Option<String>,
// }
//
// SigningResult {
//   doc_hash: String,       // hex SHA-256
//   tx_hash: String,        // Polygon transaction hash (from backend)
//   output_path: String,    // path to signed PDF written to disk
// }
//
// Internal steps:
//   1. Read PDF bytes from pdf_path
//   2. normalise::normalise(&bytes)
//   3. embed::embed_signature_block(&normalised, &sig_image, &email, None)
//   4. hash::sha256_hex(&embedded)
//   5. POST /documents/:id/anchor { docHash, signerEmail, previousTxHash } → txHash
//   6. embed::embed_qr_with_tx(&embedded, &tx_hash)
//   7. Write final PDF to <pdf_path>.signed.pdf
//   8. Return SigningResult

// open_pdf_picker() → Option<String>
// Opens a native file picker filtered to .pdf
// Returns the selected file path or None if cancelled.

// get_pdf_page_count(path: String) → u32
// Returns page count so the React layer can render the right number of pages.
```

#### `documents`

```rust
// list_documents() → Vec<DocumentSummary>
// Proxies GET /documents from the backend.
// Attaches JWT from AppState.

// get_document(id: String) → DocumentDetail
// Proxies GET /documents/:id from the backend.

// create_document(title: String, signer_emails: Vec<SignerInvite>) → Document
// Proxies POST /documents.
// Called after the owner has signed — registers the document and triggers
// invitations to the next signer.

// get_quota() → QuotaState
// QuotaState { used: u32, quota: u32, reset_at: String }
// Proxies GET /users/me/quota.
```

#### `library`

```rust
// save_library_signature(id, label, base64_png) → ()
// Decodes base64 PNG and writes to app data dir. Updates library.json metadata.

// delete_library_signature(id) → ()
// Removes PNG file and metadata entry.

// load_library_signature(id) → String
// Returns base64-encoded PNG from app data dir.

// load_library() → LibraryData
// Returns all signature entries and text snippets metadata from library.json.

// save_text_snippet(id, label, text, font_size) → ()
// Adds or updates a text snippet in library.json.

// delete_text_snippet(id) → ()
// Removes a text snippet from library.json.

// update_library_signature_label(id, label) → ()
// Updates the label of a saved signature.

// get_sync_enabled() → bool
// Returns whether cloud sync is enabled (from library.json sync_enabled field).

// set_sync_enabled(enabled: bool) → ()
// Persists the sync preference to library.json.
```

Library data is stored in the app data directory under `library/`:
- `library.json` — metadata for all signatures and text snippets, plus `syncEnabled` flag
- `library/signatures/*.png` — signature image files

---

### PDF Pipeline Detail

#### Normalisation (`normalise.rs`)

Steps performed in order:
1. Parse PDF with `lopdf::Document::load_mem`
2. Remove info dictionary keys: `Producer`, `Creator`, `ModDate`, `CreationDate`
3. Remove XMP metadata streams (objects with `/Subtype /XML`)
4. Remove `/ID` array from trailer
5. Re-serialise with `Document::save_to` using deterministic object numbering

The output must be byte-for-byte identical given the same input. This is validated in unit tests by hashing the normalised output of the same PDF twice and asserting equality.

#### Signature Block Embedding (`embed.rs`)

Layout spec v1 — never changed once set. Any change increments the version and old documents remain verifiable under the previous spec.

```
Block position:   bottom-right corner of the last page
                  x = page_width  - 10mm - block_width
                  y = 10mm (from bottom)

Block dimensions: width  = 85mm
                  height = 32mm

Internal layout (left to right):
  [QR code]       25mm × 25mm, 3.5mm from left edge, vertically centred
  [divider]       0.3pt vertical rule
  [text column]   remaining width
    Line 1: "Signed by"  — 6pt, label style
    Line 2: signer email — 8pt, semibold
    Line 3: "Verified on Polygon" — 6pt, label style
    Line 4: tx hash truncated (first 8 + … + last 6 chars) — 6pt, monospace
    Line 5: timestamp — 6pt

Border:           0.5pt rectangle around entire block
Version tag:      /SignChainLayoutVersion 1 added to block XObject dictionary
```

In the first embed pass (before anchoring), the QR slot contains a blank white rectangle as a placeholder. In the second pass (`embed_qr_with_tx`), the placeholder XObject is replaced with the real QR image.

#### Hashing (`hash.rs`)

```rust
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}
```

Hashing occurs after the full embed (including QR placeholder). This means the hash covers the signature block structure. The QR is embedded after hashing, so the QR image itself is not part of the hash — only its placeholder bounding box is.

---

### Tauri Configuration

```json
// tauri.conf.json (key sections)
{
  "identifier": "com.intrigsoft.signchain",
  "productName": "SignChain",
  "version": "0.1.0",
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["signchain"]
      }
    }
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [
      {
        "title": "SignChain",
        "width": 1200,
        "height": 780,
        "minWidth": 960,
        "minHeight": 640,
        "decorations": false,
        "transparent": false,
        "resizable": true
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "msi", "appimage"]
  }
}
```

Deep link handling: On macOS, `tauri-plugin-deep-link` emits `deep-link://new-url` events. On Linux/Windows, the URL arrives as a CLI argument. Both paths extract the JWT from `signchain://auth/callback?token=<jwt>` and emit an `auth-callback` Tauri event to the frontend.

```json
// capabilities/default.json
{
  "identifier": "signchain-default",
  "permissions": [
    "core:path:default",
    "core:event:default",
    "core:window:default",
    "dialog:allow-open",
    "shell:allow-open",
    "http:default"
  ]
}
```

---

## React Layer

### Routing

```
/                     → redirect to /dashboard if authenticated, else /identity
/identity             → login flow (magic link / OAuth) + profile step
/dashboard            → document list (requires JWT + userIdentity)
/upload               → file picker + PDF preview
/signers              → add signers, set order (receives pdf_path in location state)
/sign                 → signature canvas + confirm (receives pdf_path, signers in state)
/documents/:id        → document detail, signer status timeline
/library              → manage saved signatures and text snippets, cloud sync toggle
```

React Router v6 with `MemoryRouter` (no browser URL bar in Tauri).

**Route guard** (`RequireAuth`): checks both `jwt` (from auth store) and `userIdentity` (from signing store). Missing either → redirect to `/identity`.

---

### State Management

**Zustand** for both auth state and the in-progress signing session.

#### Auth Store (`src/store/auth.ts`)

```typescript
interface AuthUser {
  sub: string;
  email: string;
  name: string;
  trust: string;     // "email", "google", "microsoft"
  verified: boolean;
}

interface AuthState {
  jwt: string | null;
  user: AuthUser | null;   // decoded from JWT payload
  loading: boolean;
  setJwt: (token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}
```

JWT is decoded client-side (base64 payload, no verification needed since the API already validated it). The `trust` and `verified` fields flow into the signing payload.

#### Signing Store (`src/store/signing.ts`)

```typescript
interface SigningSession {
  pdfPath: string | null;
  pdfPageCount: number;
  signers: SignerInvite[];       // { email: string, order: number }
  signatureBase64: string | null;
  status: 'idle' | 'normalising' | 'embedding' | 'hashing'
        | 'anchoring' | 'finalising' | 'done' | 'error';
  error: string | null;
  result: SigningResult | null;

  setPdfPath: (path: string, pageCount: number) => void;
  setSigners: (signers: SignerInvite[]) => void;
  setSignature: (base64: string) => void;
  setStatus: (status: SigningSession['status']) => void;
  setError: (error: string) => void;
  setResult: (result: SigningResult) => void;
  reset: () => void;
}
```

#### Library Store (`src/store/library.ts`)

```typescript
interface LibraryState {
  signatures: LibrarySignature[];
  textSnippets: LibraryTextSnippet[];
  loaded: boolean;

  // Cloud sync state
  syncEnabled: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;

  // Local CRUD
  load: () => Promise<void>;
  saveSignature: (base64: string, label: string) => Promise<string>;
  deleteSignature: (id: string) => Promise<void>;
  // ... other local mutations

  // Cloud sync actions
  setSyncEnabled: (enabled: boolean) => Promise<void>;
  pushToCloud: (opts?) => Promise<void>;
  pullFromCloud: () => Promise<void>;
  checkCloudLibrary: () => Promise<boolean>;
  disableAndDeleteCloud: () => Promise<void>;
}
```

**Cloud sync** is opt-in. When `syncEnabled` is true and a JWT is present, every local mutation triggers a debounced (500ms) `pushToCloud()` call. Network errors are silently ignored (fire-and-forget). When switching devices, `checkCloudLibrary()` detects existing cloud data and the `CloudLibraryPrompt` component offers to download it.

**Server state** (documents, quota) managed with **TanStack Query**. Polling interval for document list: 15 seconds while the dashboard is active.

---

### Hooks

#### `useAuthInit`

Initialises auth state on app mount. Called once from `AuthInitializer` wrapper in `App.tsx`.

```typescript
// src/hooks/useAuthInit.ts

export function useAuthInit() {
  // On mount:
  // 1. Load JWT from keychain via get_stored_jwt()
  // 2. Load profile from keychain via get_stored_profile()
  // 3. If JWT found: set auth store (jwt + decoded user)
  // 4. If profile found: set signing store userIdentity
  // 5. Listen for 'auth-callback' Tauri events (from deep link handler)
  //    On event: store JWT in keychain, set auth store
  // 6. Set loading = false when done
}
```

#### `useSign`

Orchestrates the full signing flow. Called from the Sign screen. Reads `authUser` from the auth store and passes `trust` and `verified` to the Rust `sign_document` command.

```typescript
// src/hooks/useSign.ts

export function useSign() {
  const store = useSigningStore();
  const queryClient = useQueryClient();

  async function sign() {
    const { pdfPath, signers, signatureBase64 } = store;
    if (!pdfPath || !signatureBase64) return;

    try {
      // 1. Create document record on backend first
      store.setStatus('normalising');
      const doc = await api.post('/documents', {
        signers: signers.map(s => ({ email: s.email, order: s.order })),
      });

      // 2. Invoke Rust signing command
      // Status transitions happen inside the command via Tauri events:
      //   signchain://status  payload: 'embedding' | 'hashing' | 'anchoring' | 'finalising'
      const result = await tauriCommands.signDocument({
        pdfPath,
        signerEmail: store.ownerEmail,
        signatureImageBase64: signatureBase64,
        documentId: doc.id,
        previousTxHash: undefined,
      });

      store.setResult(result);
      store.setStatus('done');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (e) {
      store.setStatus('error');
      store.setError(e instanceof Error ? e.message : String(e));
    }
  }

  return { sign };
}
```

The Rust `sign_document` command emits Tauri events at each pipeline stage so the React UI can display granular progress without polling.

```rust
// In sign_document command, emit progress events:
app_handle.emit("signing:status", "embedding").ok();
// ... after embed
app_handle.emit("signing:status", "hashing").ok();
// ... after hash
app_handle.emit("signing:status", "anchoring").ok();
// ... after backend anchor
app_handle.emit("signing:status", "finalising").ok();
```

```typescript
// React listens:
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  const unlisten = listen<string>('signing:status', (event) => {
    store.setStatus(event.payload as SigningSession['status']);
  });
  return () => { unlisten.then(f => f()); };
}, []);
```

---

### Screens

---

#### 1. Identity Screen (`/identity`)

**Purpose:** Entry point for unauthenticated users. Two-phase flow: login then profile.

**Phase 1 — Login:**
Two tabs:
- **Magic Link tab**: email input → POST `/auth/magic-link` → 6-digit code input → POST `/auth/magic-link/verify` → JWT
- **Social tab**: "Sign in with Google" and "Sign in with Microsoft" buttons → `open_auth_browser(provider)` → deep link callback → JWT

**Phase 2 — Profile:**
After JWT is obtained, collect signer details:
- Name (pre-filled from JWT if available)
- Company (optional)
- Position (optional)
- Submit stores profile to OS keychain via `store_profile` and sets signing store `userIdentity`

**Auto-redirect:** If both JWT and userIdentity already exist (returning user), skip to `/dashboard` automatically.

**States:**
- `login` — show login tabs
- `profile` — show profile form (JWT obtained)
- `loading` — show spinner during API calls

---

#### 2. Dashboard (`/dashboard`)

**Purpose:** Central hub. Shows all documents the user owns, with signer status at a glance.

**Layout:**
- Left sidebar (240px): nav links (Dashboard, Settings), quota badge, sign-out
- Main area: document list

**Quota Badge (`QuotaBadge`):**
```
[■■■■■□□□□□]  5 / 10 signs used
Resets in 18 days
```
Shown in the sidebar below the nav. Turns amber when usage > 70%, red when > 90%.

**Document List:**
- Each row: document title, created date, status badge, signer progress indicator
- Status badges: `Pending` (grey), `In Progress` (blue), `Completed` (green), `Revoked` (red)
- Signer progress: avatar-style circles, one per signer — grey (waiting), blue (invited), green (signed)
- Click row → `/documents/:id`
- Empty state: illustration + "Upload your first document to get started" + Upload button

**Header actions:**
- "New Document" button → `/upload`

**Polling:** document list refetches every 15 seconds via TanStack Query `refetchInterval`.

---

#### 3. Upload Screen (`/upload`)

**Purpose:** Select a PDF and preview it before proceeding.

**Layout:**
- Left panel (50%): file picker area
    - Drag-and-drop zone with dashed border
    - "Browse" button triggers `open_pdf_picker` Tauri command
    - After selection: filename, file size, page count displayed
- Right panel (50%): PDF preview (`PdfPreview` component)
    - Renders via PDF.js
    - Page navigation (prev / next) if multi-page
    - Read-only — no interaction
- Bottom bar: "Continue" button (disabled until file selected) → `/signers`

**Validation:**
- File must be a valid PDF (checked by attempting `get_pdf_page_count`)
- If invalid: inline error "This file doesn't appear to be a valid PDF"
- Max file size warning at 50MB (soft warning, not a hard block)

---

#### 4. Signers Screen (`/signers`)

**Purpose:** Add signers and define signing order.

**Layout:**
- Header: PDF filename (read-only reminder of which document)
- Signer list — drag-to-reorder rows
- Each row: order number, email input field, remove button
- "Add signer" button appends a new empty row
- Bottom bar: back button, "Continue to Sign" button

**Signer Row:**
```
[1]  [email@example.com          ]  [×]
[2]  [another@example.com        ]  [×]
     [+ Add signer]
```

Order numbers update automatically as rows are dragged. The owner's email is shown above the list as "You (owner)" — always first and not draggable.

**Validation:**
- Each email must be valid format
- Duplicate emails not allowed (inline error on duplicate)
- At least one additional signer required to proceed (owner-only signing is allowed but the "Add signer" step is skippable — user can go directly to Sign)
- "Continue" disabled if any email field has a validation error

**UX note:** the order here is the invitation order. Signer 1 (the owner) has already signed by the time signers 2+ are invited. Signers 2+ sign sequentially.

---

#### 5. Sign Screen (`/sign`)

**Purpose:** The owner draws or uploads their signature and confirms signing.

**Layout:**
- Top: PDF preview (compact, scrollable, read-only) — owner must see what they're signing
- Middle: signature input area
    - Two tabs: "Draw" / "Upload image"
    - Draw tab: `SignatureCanvas` component (white canvas with subtle grid, draw with mouse/trackpad)
    - Upload tab: image file picker, preview of uploaded image
    - "Clear" button on Draw tab
- Bottom bar: back button, "Sign & Anchor" primary button

**SignatureCanvas component:**
- 480 × 180px canvas
- Stroke captured as pointer events (works with mouse and drawing tablets)
- Exports as PNG base64 via `canvas.toDataURL('image/png')`
- "Clear" resets canvas

**"Sign & Anchor" button:**
- Disabled until signature is drawn/uploaded
- On click: confirms with a modal before proceeding

**Confirmation modal:**
```
┌─────────────────────────────────────┐
│  Ready to sign?                     │
│                                     │
│  Once signed, the document will be  │
│  anchored to the Polygon blockchain  │
│  and cannot be unsigned.            │
│                                     │
│  [Cancel]           [Sign Document] │
└─────────────────────────────────────┘
```

After confirmation → triggers `useSign` → navigates to `SigningProgress` overlay.

---

#### 6. Signing Progress Overlay

Displayed over the Sign screen while `useSign` is running. Full-screen modal, not dismissable.

**States and labels:**

| `status` | Icon | Label |
|----------|------|-------|
| `normalising` | spinner | Preparing document… |
| `embedding` | spinner | Embedding signature… |
| `hashing` | spinner | Computing document hash… |
| `anchoring` | animated chain icon | Anchoring to Polygon blockchain… |
| `finalising` | spinner | Finalising signed PDF… |
| `done` | ✓ checkmark | Document signed and anchored |
| `error` | ✗ | Error message + "Try again" button |

The `anchoring` state takes the longest (blockchain confirmation). Show an additional note: "This usually takes 5–15 seconds."

On `done`:
- Show `txHash` (truncated) with a "Copy" button
- Show output path with "Show in Finder / Explorer" button
- "Go to document" button → `/documents/:id`

---

#### 7. Document Detail (`/documents/:id`)

**Purpose:** Full status view for a specific document. Signer timeline, chain integrity, actions.

**Layout:**
- Header: document title, status badge, created date
- Left column (60%):
    - Signer timeline — vertical chain of signer cards
    - Each card: signer email, status (waiting / invited / signed), signed timestamp, txHash (linked to Polygonscan)
    - Chain connector lines between cards show the hash chain relationship
- Right column (40%):
    - Document metadata: page count, file size (if available), IPFS CID (if set)
    - Quota impact: "This document used 1 of your 10 monthly signs"
    - "Resend invitation" button (if a signer is in `invited` state and hasn't signed yet)
    - Chain integrity badge: "All signatures valid ✓" or "Chain broken ✗"

**Signer Card states:**

```
┌─────────────────────────────────────┐
│ ● alice@example.com          SIGNED │
│   Signed 14 Mar 2026 at 09:41       │
│   0x3f4a...c821  ↗ Polygonscan      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ○ bob@example.com           INVITED │
│   Invited 14 Mar 2026 at 09:42      │
│   Waiting for signature…            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ○ carol@example.com         WAITING │
│   Will be invited after Bob signs   │
└─────────────────────────────────────┘
```

---

#### 8. Settings (`/settings`)

Minimal for PoC.

- **Account:** display name, email (read-only from JWT), sign-out button
- **Quota:** current tier, signs used / quota, reset date, "Upgrade plan" link (placeholder for PoC)
- **About:** app version, link to Polygonscan contract, link to open-source repo

---

### Components

#### `PdfPreview`

```typescript
interface PdfPreviewProps {
  path: string;           // local file path — loaded via Tauri asset protocol
  currentPage?: number;
  onPageCountLoaded?: (count: number) => void;
  compact?: boolean;      // reduced height for Sign screen header
}
```

Uses PDF.js (`pdfjs-dist`) to render. File loaded via `convertFileSrc(path)` from `@tauri-apps/api/core`, which converts a local path to a safe `asset://` URL the WebView can load.

#### `SignatureCanvas`

```typescript
interface SignatureCanvasProps {
  onChange: (base64: string | null) => void;
}
```

Maintains internal canvas ref. On every pointer-up event, exports the canvas as PNG base64 and calls `onChange`. If the canvas is blank (no strokes), calls `onChange(null)`.

#### `SignerList`

```typescript
interface SignerListProps {
  signers: SignerInvite[];
  onChange: (signers: SignerInvite[]) => void;
}
```

Uses `@dnd-kit/sortable` for drag-to-reorder. Each signer row has an email input with inline validation. Order integers are recalculated on every reorder.

#### `ChainStatus`

```typescript
interface ChainStatusProps {
  signers: SignerDetail[];  // each has txHash, previousTxHash, signedAt
}
```

Displays the hash chain as a vertical connected list. Optionally walks `previousTxHash` links to verify chain integrity client-side (by calling `/verify/:txHash` for each link). Shows a green "chain intact" or red "broken link" banner.

#### `QuotaBadge`

```typescript
interface QuotaBadgeProps {
  used: number;
  quota: number;
  resetAt: string;
}
```

Segmented progress bar. Colours: neutral → amber at 70% → red at 90%.

---

### API Client

```typescript
// src/lib/api.ts

import { useAuthStore } from '../store/auth';

const BASE = import.meta.env.VITE_API_BASE_URL;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const jwt = useAuthStore.getState().jwt;  // sync read from Zustand
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
```

JWT is read synchronously from the Zustand auth store (not from Tauri invoke).

---

### Typed Tauri Command Wrappers

```typescript
// src/lib/tauri.ts

import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface SigningResult {
  docHash: string;
  txHash: string;
  outputPath: string;
}

// Auth commands (keychain-based)
export function openAuthBrowser(provider: string) {
  return invoke<void>('open_auth_browser', { provider });
}
export function getStoredJwt() {
  return invoke<string | null>('get_stored_jwt');
}
export function storeJwt(token: string) {
  return invoke<void>('store_jwt', { token });
}
export function clearStoredJwt() {
  return invoke<void>('clear_stored_jwt');
}
export function storeProfile(profileJson: string) {
  return invoke<void>('store_profile', { profileJson });
}
export function getStoredProfile() {
  return invoke<string | null>('get_stored_profile');
}

// PDF commands
export function signDocument(params: {
  pdfPath: string;
  signerEmail: string;
  signatureImageBase64: string;
  previousTxHash?: string;
  trust?: string;
  verified?: boolean;
}) {
  return invoke<SigningResult>('sign_document', params);
}

export function pdfAssetUrl(path: string) {
  return convertFileSrc(path);
}
```

The `signDocument` function now accepts `trust` and `verified` parameters, which are passed to the Rust `SignerInfo` struct and embedded in the anchor payload.

---

## Error Handling

**Rust command errors** are returned as `Err(String)` and surface as a rejected `invoke()` promise in React. Every `invoke()` call is wrapped in try/catch. Errors are either:
- Shown inline (Upload screen: invalid file)
- Shown in the progress overlay (Sign screen: anchor failure)
- Shown as a toast for background failures (document list refetch)

**Network errors** from the API client surface as thrown `Error` objects with the backend's error message. TanStack Query's `onError` callback handles toast display.

**Quota exceeded** — the backend returns HTTP 402 when a user exceeds their monthly quota. The API client detects 402 and emits a special `QuotaExceededError`. The React layer catches this specifically and shows a quota upgrade prompt instead of a generic error.

---

## Signing Flow: Complete Sequence

```
User                   React                 Rust Command           Backend              Polygon
 |                       |                        |                     |                    |
 | picks PDF             |                        |                     |                    |
 |──────────────────────>| open_pdf_picker()       |                     |                    |
 |                       |──────────────────────>  |                     |                    |
 |                       |<── path ────────────── |                     |                    |
 |                       |                        |                     |                    |
 | adds signers          |                        |                     |                    |
 | draws signature       |                        |                     |                    |
 | confirms modal        |                        |                     |                    |
 |──────────────────────>|                        |                     |                    |
 |                       | POST /documents ───────────────────────────>|                    |
 |                       |<── { id } ─────────────────────────────────|                    |
 |                       |                        |                     |                    |
 |                       | sign_document(payload) |                     |                    |
 |                       |──────────────────────> |                     |                    |
 |                       |  event: normalising    |                     |                    |
 |                       |  event: embedding      |                     |                    |
 |                       |  event: hashing        |                     |                    |
 |                       |  event: anchoring      |                     |                    |
 |                       |                        | POST /anchor ──────>|                    |
 |                       |                        |                     | anchorDocument()──>|
 |                       |                        |                     |<── txHash ─────────|
 |                       |                        |<── txHash ─────────|                    |
 |                       |  event: finalising     |                     |                    |
 |                       |                        | write signed PDF    |                    |
 |                       |<── SigningResult ──────|                     |                    |
 |                       |                        |                     |                    |
 | sees done screen      |                        |                     |                    |
 |<──────────────────────|                        |                     |                    |
```

---

## Dependencies

### Rust (`Cargo.toml`)

```toml
[dependencies]
tauri              = { version = "2", features = ["protocol-asset"] }
tauri-plugin-dialog = "2"
tauri-plugin-shell  = "2"
tauri-plugin-http   = "2"
tauri-plugin-deep-link = "2"
keyring            = "3"
url                = "2"

lopdf   = "0.32"
sha2    = "0.10"
hex     = "0.4"
qrcode  = "0.14"
image   = { version = "0.25", features = ["png"] }

reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
tokio   = { version = "1", features = ["full"] }
serde   = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow  = "1"
base64  = "0.22"
```

### Frontend (`package.json`)

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "zustand": "^4",
    "@tanstack/react-query": "^5",
    "pdfjs-dist": "^4",
    "@dnd-kit/core": "^6",
    "@dnd-kit/sortable": "^8"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5"
  }
}
```

---

## Development Commands

```bash
# Install dependencies
npm install

# Run in dev mode (Vite HMR + Tauri)
cargo tauri dev

# Build distributable
cargo tauri build

# Run Rust unit tests only
cd src-tauri && cargo test

# Type-check frontend
npx tsc --noEmit
```

---

## Multi-Party Sequential Signing

### Incremental Save Model

The single-signer pipeline uses `lopdf::Document` which rewrites the entire PDF on save — this destroys previous signers' byte boundaries. Multi-party signing uses `lopdf::IncrementalDocument` instead, which preserves the original bytes and appends changes after `%%EOF`. Each signer produces a new incremental layer.

### Chain Metadata

Signing chain metadata is embedded directly in the PDF as a stream object linked from the document catalog via a `/SignChainMeta` key. This makes the PDF the sole source of truth — fully offline-verifiable with no backend dependency.

**Format:**

```json
{
  "version": 1,
  "signatures": [
    {
      "signer": "Alice",
      "email": "alice@example.com",
      "timestamp": "2026-03-18T14:30:00Z",
      "docHash": "abc123...",
      "prevDocHash": null,
      "qrUrl": "https://signchain.com/p/0xabc123...",
      "eofByteOffset": 84210,
      "placements": [{ "page": 1, "x": 100, "y": 200, "width": 150, "height": 60 }]
    },
    {
      "signer": "Bob",
      "email": "bob@corp.com",
      "timestamp": "2026-03-18T15:00:00Z",
      "docHash": "def456...",
      "prevDocHash": "abc123...",
      "qrUrl": "https://signchain.com/p/0xdef456...",
      "eofByteOffset": 96430,
      "placements": [{ "page": 2, "x": 50, "y": 100, "width": 150, "height": 60 }]
    }
  ]
}
```

Key fields:
- `prevDocHash` — links each signer to the previous, forming the chain
- `eofByteOffset` — byte position of the `%%EOF` after this signer's incremental save (needed to truncate and re-verify)
- `placements` — which signature blocks belong to this signer

### First Signer Flow

1. Load PDF as `Document` (full rewrite is acceptable — no prior signatures to preserve)
2. Normalise (strip volatile metadata)
3. Embed signature block(s) at user-specified placements
4. Serialize to bytes → compute SHA-256 hash (covers sig but not QR)
5. Anchor hash on-chain → receive `txHash`
6. Embed QR with `https://signchain.com/p/0x<hash>` payload
7. Write chain metadata with single `SignerRecord` (prevDocHash: null)
8. Convert to `IncrementalDocument` and save — produces the initial `%%EOF` boundary
9. Record `eofByteOffset` = total output byte count

### Subsequent Signer Flow

1. Read raw PDF bytes from disk
2. Load as `IncrementalDocument` — preserves all prior bytes
3. Read existing chain metadata from the previous document
4. **Skip normalisation** — already done by first signer
5. Clone target pages into `new_document` via `opt_clone_object_to_new_document(page_id)`
6. Embed signature block(s) via `&mut inc_doc.new_document` with explicit page-to-objectId mapping
7. Serialize to bytes → compute SHA-256 hash
8. Embed QR with hash payload
9. Append new `SignerRecord` to chain metadata (prevDocHash = previous signer's docHash)
10. Save incrementally — appends new layer after existing `%%EOF`
11. Record `eofByteOffset` = total output byte count

### Embed Function Adaptation

To support both `Document` (first signer) and `IncrementalDocument.new_document` (subsequent signers), embed functions accept an explicit `page_ids: &BTreeMap<u32, ObjectId>` parameter instead of calling `doc.get_pages()` internally. The caller provides the page map from the appropriate source:
- First signer: `doc.get_pages()`
- Subsequent signer: `inc_doc.get_prev_documents().get_pages()`

---

## Verification Pipeline

### `/verify` Route

A dedicated route where users can pick any signed PDF and verify its signing chain integrity. No backend connection required — verification is fully offline.

### Verification Steps

1. Read PDF bytes from disk
2. Parse as `Document`, extract chain metadata from `/SignChainMeta`
3. If no chain metadata: display "This PDF does not contain SignChain metadata"
4. Verify chain link integrity: for each signer N (after the first), confirm `prevDocHash` matches the previous signer's `docHash`
5. Return per-signer verification status

### Hash Verification Model (v1)

For v1, verification checks chain link consistency (prevDocHash linkage) rather than full re-embedding verification. Full byte-level re-verification (truncate at eofByteOffset, re-embed, recompute hash) is a future enhancement.

### Verification UI

Result display with per-signer cards:

```
[✓] Alice (alice@example.com)     — Valid
    Signed 2026-03-18 14:30
    Hash: 0xabc1...23ef

[✓] Bob (bob@corp.com)            — Valid
    Signed 2026-03-18 15:00
    Hash: 0xdef4...56ab
```

States:
- **Not a SignChain document**: "This PDF does not contain SignChain metadata"
- **Chain valid**: green banner "Document integrity verified", all signers show checkmarks
- **Chain broken**: red banner "Chain integrity broken", highlight which signer's link failed

---

## Acceptance Criteria (Desktop)

- [ ] Auth: magic link sends 6-digit code, code verification returns JWT
- [ ] Auth: OAuth opens system browser, deep link returns JWT via signchain:// protocol
- [ ] Auth: JWT and profile persist in OS keychain across app restarts
- [ ] Auth: sign-out clears keychain and redirects to identity page
- [ ] Auth: trust metadata (tr, v) included in signature payload
- [ ] Upload: file picker opens, invalid PDFs are rejected inline, valid PDF renders in preview
- [ ] Signers: email validation works, drag-to-reorder updates order numbers, duplicates are flagged
- [ ] Sign: canvas draw and image upload both export valid PNG base64
- [ ] Sign: confirmation modal appears before triggering the pipeline
- [ ] Sign: progress overlay transitions through all pipeline stages with correct labels
- [ ] Sign: signed PDF is written to disk next to the source file
- [ ] Sign: document owner receives txHash and output path on success
- [ ] Dashboard: document list polls every 15 seconds
- [ ] Dashboard: quota badge shows correct usage and colour state
- [ ] Document detail: signer timeline shows correct state per signer
- [ ] Quota exceeded: 402 response shows upgrade prompt, not a generic error
- [ ] PDF bytes never leave the machine — confirmed by inspecting network traffic
- [ ] Multi-party: first signer produces valid chain metadata with single entry
- [ ] Multi-party: second signer preserves first signer's bytes (incremental save produces two `%%EOF` markers)
- [ ] Multi-party: chain metadata contains correct prevDocHash linkage
- [ ] Verify: `/verify` route picks PDF, extracts chain, shows per-signer status
- [ ] Verify: valid chain shows green "Document integrity verified" banner
- [ ] Verify: tampered chain link shows red banner with specific signer highlighted
- [ ] Verify: non-SignChain PDF shows "does not contain SignChain metadata" message
- [ ] Library: cloud sync toggle visible only when authenticated
- [ ] Library: toggling sync ON pushes library to cloud
- [ ] Library: toggling sync OFF shows confirmation, deletes cloud data
- [ ] Library: local mutations auto-push to cloud when sync enabled (debounced)
- [ ] Library: new device with empty library + authenticated + cloud data → download prompt appears
- [ ] Library: downloading from cloud restores signatures and text snippets locally
- [ ] Library: network errors during sync are silently ignored (no crash, no toast)