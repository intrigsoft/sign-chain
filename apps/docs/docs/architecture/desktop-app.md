---
sidebar_position: 2
---

# Desktop App

The desktop app is built with **Tauri 2**, combining a Rust backend for security-critical operations with a React TypeScript frontend for the UI.

## Design Principle: PDF Bytes Never Leave the Machine

The React frontend handles user interaction -- file selection, signature placement, previews. All PDF manipulation happens in the Rust backend via Tauri commands. The only data that leaves the machine is:

- Composite hash (SHA-256)
- Encrypted signer payload
- Previous transaction hash (for chaining)

## Rust Backend

### Module Structure

```
src-tauri/src/
├── lib.rs              App entry, plugin registration, deep link handling
├── state.rs            AppState (API base URL, HTTP client, JWT)
├── anchor.rs           RelayRequest/Response types, API communication
├── payload.rs          Payload construction, AES-128-GCM encryption, QR URL building
├── commands/
│   ├── auth.rs         Keychain JWT/profile storage, open_auth_browser
│   ├── library.rs      Persistent signature & text snippet storage
│   ├── pdf.rs          Tauri commands: sign, verify, save, extract revision
│   └── documents.rs    Document listing
└── pdf/
    ├── embed.rs        Signature image, text field, and QR code embedding
    ├── chain.rs        Signature chain detection and extraction
    └── hash.rs         SHA-256 hashing of PDF content
```

### Key Tauri Commands

| Command | Description |
|---|---|
| `open_auth_browser` | Opens auth provider URL in system browser |
| `get_stored_jwt` | Reads JWT from OS keychain |
| `store_jwt` | Saves JWT to OS keychain |
| `clear_stored_jwt` | Removes JWT and profile from keychain |
| `store_profile` | Saves signer profile JSON to keychain |
| `get_stored_profile` | Reads signer profile from keychain |
| `load_library` | Loads all saved signatures and text snippets metadata |
| `save_library_signature` | Saves a signature PNG to app data directory |
| `delete_library_signature` | Deletes a saved signature |
| `load_library_signature` | Loads a signature PNG as base64 |
| `update_library_signature_label` | Renames a saved signature |
| `save_text_snippet` | Saves a reusable text snippet |
| `delete_text_snippet` | Deletes a saved text snippet |
| `get_sync_enabled` | Returns whether cloud sync is enabled |
| `set_sync_enabled` | Persists cloud sync preference |
| `open_pdf_picker` | Opens OS file dialog, returns selected path |
| `get_pdf_page_count` | Returns page count for a PDF |
| `sign_document` | Full signing pipeline (embed, hash, encrypt, anchor, QR) |
| `save_signed_pdf` | Save-as dialog for the signed PDF |
| `verify_document` | Verify a signed PDF against blockchain |
| `extract_revision` | Extract a specific revision from an incremental PDF |

### PDF Processing Pipeline

The signing pipeline uses **lopdf** for PDF manipulation:

1. **IncrementalDocument** -- Opens the PDF for incremental updates (preserving previous revisions)
2. **Deep-clone resources** -- Page Resources dictionaries are cloned from the previous document to avoid dangling references
3. **CTM reset** -- Any inherited coordinate transforms are inverted to ensure correct signature positioning
4. **Embed signature** -- PNG image added as XObject, placed via content stream operations
5. **Embed text fields** -- Helvetica text rendered at specified coordinates
6. **Compute hash** -- SHA-256 of the intermediate PDF
7. **Embed QR** -- QR code image added as XObject with branding text

## React Frontend

### State Management

The app uses **Zustand** for state management with two stores:

**`useAuthStore`** -- Authentication state:
- JWT token and decoded user claims (email, name, trust anchor, verified)
- Loaded from OS keychain on startup via `useAuthInit` hook

**`useSigningStore`** -- Signing session state:
- User identity (name, email, company, position)
- Current file path, page count
- Signature and text field placements
- Signing progress (idle -> preparing -> embedding -> hashing -> anchoring -> finalising -> done)
- Signed PDF path

**`useLibraryStore`** -- Persistent reusable assets:
- Saved signatures (PNG images stored in app data directory)
- Saved text snippets (name, address, company, etc.) with label, text, and font size
- Loaded from disk on startup, persists across sessions
- **Cloud sync** (opt-in): when enabled, local mutations are debounced and pushed to the API. On new devices, a `CloudLibraryPrompt` modal offers to download existing cloud library data

### Routing

Uses **React Router** with `MemoryRouter` (no browser URL bar in Tauri):

| Route | Page |
|---|---|
| `/identity` | Authentication (magic link / OAuth) + profile setup |
| `/dashboard` | Document list (requires auth) |
| `/upload` | File picker |
| `/sign` | Signature placement + signing |
| `/verify` | Document verification |
| `/document/:id` | Document details |
| `/library` | Manage saved signatures and text snippets |

A `RequireAuth` route guard redirects unauthenticated users to `/identity`. Authentication requires both a valid JWT and a completed signer profile.

### PDF Rendering

PDF preview uses **pdfjs-dist** with a centralized worker setup (`src/lib/pdfjs.ts`). Two viewer modes:

- `usePdfPreview` -- Single-page preview with navigation
- `usePdfScrollViewer` -- Scrollable multi-page view (used in signature placement)

## File Associations

The app registers as a PDF handler via Tauri's `fileAssociations` config. When a user opens a PDF with SignChain:

- **Linux/Windows**: File path received as CLI argument
- **macOS**: File path received via `RunEvent::Opened`

A chooser dialog offers "Sign with SignChain" or "Verify with SignChain".
