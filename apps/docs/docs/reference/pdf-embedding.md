---
sidebar_position: 2
---

# PDF Embedding

SignChain uses **incremental updates** to embed signatures into PDFs without modifying the original document content. This preserves previous revisions and enables signature chain verification.

## Incremental Updates

PDF supports appending new data to the end of a file without rewriting existing content. Each append creates a new **revision**:

```
┌──────────────────────────┐
│  Original PDF content    │  Revision 0
│  %%EOF                   │
├──────────────────────────┤
│  Signature 1 (appended)  │  Revision 1
│  %%EOF                   │
├──────────────────────────┤
│  Signature 2 (appended)  │  Revision 2
│  %%EOF                   │
└──────────────────────────┘
```

SignChain uses `lopdf::IncrementalDocument` to append without touching prior data. This means:

- The original document hash can always be recomputed from revision 0
- Each signature's integrity can be verified independently
- Removing a later signature doesn't affect earlier ones

## Coordinate System

PDF uses a bottom-left origin coordinate system:

```
┌─────────────────────────┐
│                    (w,h) │
│                          │
│          Page            │
│                          │
│(0,0)                     │
└─────────────────────────┘
```

All coordinates (signature placement, QR position, text fields) are in **PDF points** (1 point = 1/72 inch).

### CTM (Current Transformation Matrix)

Some PDF generators apply a global transformation matrix at the start of the content stream. For example, Microsoft Print to PDF uses:

```
0.75 0 0 -0.75 0 1008 cm
```

This scales and flips the coordinate system. If we append content without undoing this transform, signatures appear at wrong positions or inverted.

**Solution:** Before embedding anything, SignChain:

1. Reads the first content stream of each target page
2. Finds the initial `cm` operator (if any)
3. Computes the inverse matrix
4. Prepends a `cm` operation with the inverse to reset coordinates

```rust
// Inverse of [a,b,c,d,e,f]: det = a*d - b*c
let inv = [
    d / det,   -b / det,
    -c / det,   a / det,
    (c*f - d*e) / det,
    (b*e - a*f) / det,
];
```

## Embedding Pipeline

Each element (signature image, text field, QR code) follows the same pattern:

### 1. Create XObject (images)

Images are added as PDF XObject streams:

```
Stream {
    Type: XObject
    Subtype: Image
    Filter: FlateDecode
    Width: <pixels>
    Height: <pixels>
    ColorSpace: DeviceRGB | DeviceGray
    BitsPerComponent: 8
    SMask: <alpha channel reference>  (for PNG transparency)
}
```

**Signature images** (PNG with transparency):
- Decoded from base64
- Separated into RGB and Alpha channels
- RGB stored as main XObject with `SMask` pointing to alpha XObject
- Both compressed with zlib

**QR code images** (grayscale, no transparency):
- Rendered at 570x570 pixels
- Stored as single DeviceGray XObject
- Generated once, referenced by all placements

### 2. Build Content Stream

Each placement gets its own content stream appended to the page's Contents array:

```
q                          % Save graphics state
<w> 0 0 <h> <x> <y> cm    % Position and scale
/SigImg0 Do               % Draw XObject
Q                          % Restore graphics state
```

For text:
```
q
0 0 0 rg                  % Set fill color (black)
BT
/Helv <size> Tf            % Set font
<x> <y> Td                 % Position
(text content) Tj          % Draw text
ET
Q
```

### 3. Register Resources

Each XObject and font must be registered in the page's Resources dictionary:

```
Resources: {
    XObject: {
        SigImg0: <reference>
        QRImg0: <reference>
    }
    Font: {
        Helv: {
            Type: Font
            Subtype: Type1
            BaseFont: Helvetica
        }
    }
}
```

Resource names are unique per placement (`SigImg0`, `SigImg1`, `QRImg0`, etc.).

## Element Positioning

### Signature Block

Placed exactly where the user positions it in the React UI:

```
(x, y) ───────────────────────┐
│                              │
│     Signature PNG image      │  height
│                              │
└──────────────────────────────┘
              width
```

### QR Code

Placed immediately to the right of the signature block, bottom-aligned:

```
                    4pt gap
Signature block ──┤         ├── QR code
┌────────────────┐ ┌───────┐
│                │ │       │
│   Signature    │ │  QR   │  max(height, 34pt)
│                │ │       │
└────────────────┘ └───────┘
                   Signed with SignChain
```

- Gap: 4 PDF points between signature and QR
- QR size: `max(signature_height, 34pt)` (enforced minimum)
- Branding text: below QR, right-aligned with QR pattern edge

### Text Fields

Rendered at user-specified coordinates with a baseline offset:

```rust
let baseline_y = field.y + (field.font_size * 0.25);
```

The 0.25em offset positions the text baseline slightly above the bottom of the bounding box, accounting for descenders.

## Deep-Clone Resources

When using `IncrementalDocument`, the new revision inherits page objects from the previous document. However, the Resources dictionary may be shared by reference. Modifying it directly would corrupt the previous revision.

SignChain deep-clones the Resources dictionary for each page that receives a signature, ensuring the original revision remains intact.
