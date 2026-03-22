---
sidebar_position: 1
---

# QR Code

SignChain embeds a QR code alongside each signature block. The QR encodes a verification URL that links the physical document to its blockchain proof.

## URL Format

```
https://signchain.app/v/<base64url(txHashBytes)>#<base64url(key)>
                         └──── path param ──────┘  └── fragment ─┘
```

| Segment | Encoding | Size | Purpose |
|---|---|---|---|
| `txHashBytes` | Base64url (no padding) | 43 chars (32 bytes) | Identifies the blockchain transaction |
| `key` | Base64url (no padding) | 22 chars (16 bytes) | AES-128-GCM decryption key |

The `#fragment` is never sent to any server (RFC 3986). The decryption key stays entirely client-side.

### Example URL Breakdown

```
https://signchain.app/v/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA#BBBBBBBBBBBBBBBBBBBBBB
├── base URL (27 chars) ──┤├── tx hash b64url (43 chars) ──────────────────────────────┤ ├── key b64url (22 chars) ─┤
```

**Total URL length:** ~95 characters.

## Version & Error Correction Selection

QR codes have 40 versions (1--40) and 4 error correction levels. Higher versions hold more data but produce denser (harder to scan) codes. Higher EC levels tolerate more damage but reduce data capacity.

### Capacity Table (Binary Mode)

| Version | Modules | EC Level L | EC Level M | EC Level Q | EC Level H |
|---|---|---|---|---|---|
| V5 | 37x37 | 106 bytes | 84 bytes | 60 bytes | 46 bytes |
| V6 | 41x41 | 134 bytes | 106 bytes | 74 bytes | 58 bytes |
| V7 | 45x45 | 154 bytes | 122 bytes | 86 bytes | 64 bytes |
| V8 | 49x49 | 192 bytes | 152 bytes | 108 bytes | 84 bytes |
| V9 | 53x53 | 230 bytes | 180 bytes | 130 bytes | 98 bytes |
| V10 | 57x57 | 271 bytes | 213 bytes | 151 bytes | 119 bytes |

### SignChain's Choice: V6 / EC Level M

- **URL size:** ~95 bytes
- **V6/M capacity:** 106 bytes -- fits with margin
- **Error correction:** 15% damage tolerance (suitable for printed documents)
- **Module count:** 41x41 -- compact enough for small signature blocks

The QR is generated with an explicit version to avoid the library auto-selecting a larger version:

```rust
QrCode::with_version(url.as_bytes(), Version::Normal(6), EcLevel::M)
```

### Why Not Higher EC?

| Option | Capacity | Fits ~95 byte URL? |
|---|---|---|
| V6/H | 58 bytes | No |
| V6/Q | 74 bytes | No |
| V6/M | 106 bytes | Yes |
| V5/L | 106 bytes | Yes (same capacity, smaller) |

V6/M was chosen over V5/L because the extra error correction (15% vs 7%) is worth the slightly larger module count for printed documents that may get scratched or folded.

## Quiet Zone

The QR specification requires a 4-module quiet zone (blank padding) around the QR pattern. The `qrcode` crate includes this in the rendered image.

For V6 (41 pattern modules + 2x4 quiet zone = 49 total modules):

```
Quiet zone fraction = 4 / 49 ≈ 8.2%
```

This matters for positioning the branding text relative to the actual QR pattern:

```rust
let quiet_zone_frac = 4.0 / 49.0;
let quiet_zone = qr_size * quiet_zone_frac;
let inner_qr = qr_size - 2.0 * quiet_zone;
```

## Minimum Size

The QR code is rendered at a minimum of **34 PDF points (~12mm)**. Below this size, phone cameras struggle to resolve individual modules.

| Module count | Min size (pt) | Module size | Pixels at 300 DPI |
|---|---|---|---|
| 49 (V6 + quiet zone) | 34 | 0.69 pt | ~2.9 px/module |

For reliable scanning, each module should be at least 2--3 pixels at the scanner's resolution. At 34pt printed at 300 DPI, this gives ~2.9 pixels per module -- at the lower bound but workable for good cameras.

## Rendering

The QR image is rendered as a grayscale (DeviceGray) PDF XObject:

1. Generate QR using the `qrcode` crate at 570x570 pixels (high resolution for clean scaling)
2. Flip horizontally (compensates for PDF coordinate system interactions)
3. Compress with zlib (FlateDecode)
4. Add as a single XObject, referenced by all placement content streams

### Branding Text

Below the QR code, "Signed with SignChain" is rendered in light gray Helvetica, right-aligned with the QR pattern edge (accounting for quiet zone offset).
