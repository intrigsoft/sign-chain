use anyhow::{anyhow, Result};
use lopdf::{dictionary, Document, Object, Stream};
use serde::{Deserialize, Serialize};

/// A single signer's placement within the PDF.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacementRecord {
    pub page: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Metadata for one signer in the chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerRecord {
    pub signer: String,
    pub email: String,
    pub timestamp: String,
    /// SHA-256 of the PDF bytes after embedding this signer's signature (before QR).
    pub doc_hash: String,
    /// docHash of the previous signer — forms the chain.
    pub prev_doc_hash: Option<String>,
    /// SHA-256 of the complete input file this signer received.
    /// First signer: hash of the original PDF. Subsequent: hash of the previous signer's output.
    /// Used to detect tampering between signers.
    pub input_file_hash: String,
    pub qr_url: String,
    pub eof_byte_offset: u64,
    pub placements: Vec<PlacementRecord>,
}

/// Top-level chain metadata embedded in the PDF.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignChainMeta {
    pub version: u32,
    pub signatures: Vec<SignerRecord>,
}

/// Read chain metadata from a PDF document's catalog `/SignChainMeta` stream.
pub fn read_chain(doc: &Document) -> Result<Option<SignChainMeta>> {
    let catalog_id = doc
        .trailer
        .get(b"Root")
        .ok()
        .and_then(|r| r.as_reference().ok());

    let Some(catalog_id) = catalog_id else {
        return Ok(None);
    };

    let catalog = match doc.get_object(catalog_id) {
        Ok(Object::Dictionary(dict)) => dict,
        _ => return Ok(None),
    };

    let meta_ref = match catalog.get(b"SignChainMeta") {
        Ok(obj) => obj,
        Err(_) => return Ok(None),
    };

    let meta_id = meta_ref
        .as_reference()
        .map_err(|_| anyhow!("SignChainMeta is not a reference"))?;

    let meta_stream = match doc.get_object(meta_id) {
        Ok(Object::Stream(ref stream)) => stream,
        _ => return Err(anyhow!("SignChainMeta object is not a stream")),
    };

    let content = meta_stream.content.clone();
    // Try decompressed first, fall back to raw content
    let json_bytes = meta_stream
        .decompressed_content()
        .unwrap_or(content);

    let meta: SignChainMeta = serde_json::from_slice(&json_bytes)
        .map_err(|e| anyhow!("Failed to parse SignChainMeta JSON: {e}"))?;

    Ok(Some(meta))
}

/// Fallback: extract chain metadata directly from raw PDF bytes by scanning for
/// the JSON payload. Used when lopdf's Document parser fails on incremental PDFs.
pub fn read_chain_from_bytes(bytes: &[u8]) -> Result<Option<SignChainMeta>> {
    // The chain metadata JSON starts with {"version": and is stored as a stream.
    // Scan backwards for the LAST occurrence (most recent incremental layer).
    let needle = br#""version""#;
    let mut pos = None;
    for i in (0..bytes.len().saturating_sub(needle.len())).rev() {
        if &bytes[i..i + needle.len()] == &needle[..] {
            // Walk backwards to find the opening brace
            let mut brace_pos = i;
            while brace_pos > 0 && bytes[brace_pos] != b'{' {
                brace_pos -= 1;
            }
            if bytes[brace_pos] == b'{' {
                pos = Some(brace_pos);
                break;
            }
        }
    }

    let Some(start) = pos else {
        return Ok(None);
    };

    // Find the matching closing brace
    let mut depth = 0i32;
    let mut end = start;
    for (i, &b) in bytes[start..].iter().enumerate() {
        match b {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    end = start + i + 1;
                    break;
                }
            }
            _ => {}
        }
    }

    if depth != 0 {
        return Ok(None);
    }

    let json_slice = &bytes[start..end];
    match serde_json::from_slice::<SignChainMeta>(json_slice) {
        Ok(meta) => Ok(Some(meta)),
        Err(_) => Ok(None),
    }
}

/// Write (upsert) chain metadata into the PDF catalog as a `/SignChainMeta` stream.
pub fn write_chain(doc: &mut Document, meta: &SignChainMeta) -> Result<()> {
    let json = serde_json::to_vec_pretty(meta)?;

    let stream = Stream::new(
        dictionary! {
            "Type" => "SignChainMeta",
        },
        json,
    );
    let stream_id = doc.add_object(stream);

    // Get catalog object id
    let catalog_id = doc
        .trailer
        .get(b"Root")
        .map_err(|_| anyhow!("No Root in trailer"))?
        .as_reference()
        .map_err(|_| anyhow!("Root is not a reference"))?;

    if let Ok(Object::Dictionary(ref mut catalog)) = doc.get_object_mut(catalog_id) {
        catalog.set("SignChainMeta", Object::Reference(stream_id));
    } else {
        return Err(anyhow!("Catalog is not a dictionary"));
    }

    Ok(())
}
