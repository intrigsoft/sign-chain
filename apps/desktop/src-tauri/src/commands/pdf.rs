use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

use crate::pdf::{
    chain::{self, PlacementRecord, SignChainMeta, SignerRecord, TextFieldRecord},
    embed, hash, normalise,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignaturePlacement {
    pub page_number: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFieldPlacement {
    pub page_number: u32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub text: String,
    pub font_size: f32,
    pub field_type: String,
}

#[tauri::command]
pub async fn open_pdf_picker(app: AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("PDF Files", &["pdf"])
        .blocking_pick_file();

    Ok(file.map(|f| f.to_string()))
}

#[tauri::command]
pub async fn get_pdf_page_count(path: String) -> Result<u32, String> {
    let path = PathBuf::from(&path);
    let doc = lopdf::Document::load(&path).map_err(|e| format!("Failed to load PDF: {e}"))?;
    let pages = doc.get_pages().len() as u32;
    Ok(pages)
}

#[tauri::command]
pub async fn sign_document(
    app: AppHandle,
    path: String,
    signature_png_base64: String,
    signer_name: String,
    signer_email: String,
    placements: Vec<SignaturePlacement>,
    text_fields: Vec<TextFieldPlacement>,
) -> Result<String, String> {
    let _ = app.emit("signing:status", "preparing");

    // Read raw PDF bytes from disk
    let pdf_bytes =
        std::fs::read(&path).map_err(|e| format!("Failed to read PDF: {e}"))?;

    // Hash the input file — used for tamper detection
    let input_file_hash = hash::sha256_hash(&pdf_bytes);

    // Try to detect existing chain metadata to determine first vs subsequent signer
    let existing_chain = match lopdf::Document::load_mem(&pdf_bytes) {
        Ok(probe_doc) => chain::read_chain(&probe_doc)
            .map_err(|e| format!("Failed to read chain: {e}"))?,
        Err(_) => chain::read_chain_from_bytes(&pdf_bytes)
            .map_err(|e| format!("Failed to read chain: {e}"))?,
    };

    let is_first_signer = existing_chain.is_none();

    let placement_records: Vec<PlacementRecord> = placements
        .iter()
        .map(|p| PlacementRecord {
            page: p.page_number,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
        })
        .collect();

    let text_field_records: Vec<TextFieldRecord> = text_fields
        .iter()
        .filter(|tf| !tf.text.is_empty())
        .map(|tf| TextFieldRecord {
            page: tf.page_number,
            x: tf.x,
            y: tf.y,
            width: tf.width,
            height: tf.height,
            text: tf.text.clone(),
            font_size: tf.font_size,
            field_type: tf.field_type.clone(),
        })
        .collect();

    let final_pdf = if is_first_signer {
        sign_first(
            &app,
            &pdf_bytes,
            &input_file_hash,
            &signature_png_base64,
            &signer_name,
            &signer_email,
            &placements,
            &placement_records,
            &text_fields,
            &text_field_records,
        )?
    } else {
        sign_subsequent(
            &app,
            &pdf_bytes,
            &input_file_hash,
            &signature_png_base64,
            &signer_name,
            &signer_email,
            &placements,
            &placement_records,
            &text_fields,
            &text_field_records,
            existing_chain.unwrap(),
        )?
    };

    // Write to temp directory for preview; user saves via save dialog later
    let temp_dir = std::env::temp_dir().join("signchain");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let src = std::path::Path::new(&path);
    let stem = src.file_stem().unwrap_or_default().to_string_lossy();
    let temp_path = temp_dir.join(format!("{stem}.signed.pdf"));

    std::fs::write(&temp_path, &final_pdf)
        .map_err(|e| format!("Failed to write temp signed PDF: {e}"))?;

    let _ = app.emit("signing:status", "done");

    Ok(temp_path.to_string_lossy().to_string())
}

/// Clone objects that normalise and embed need into `inc_doc.new_document`
/// so they can be modified in the incremental layer.
fn clone_mutable_objects(
    inc_doc: &mut lopdf::IncrementalDocument,
    placements: &[SignaturePlacement],
    text_fields: &[TextFieldPlacement],
) -> Result<BTreeMap<u32, lopdf::ObjectId>, String> {
    // Collect all object IDs we need to clone BEFORE taking mutable borrows.
    let (catalog_id, info_id, page_ids) = {
        let prev = inc_doc.get_prev_documents();
        let catalog_id = prev
            .trailer
            .get(b"Root")
            .ok()
            .and_then(|r| r.as_reference().ok());
        let info_id = prev
            .trailer
            .get(b"Info")
            .ok()
            .and_then(|r| r.as_reference().ok());
        let page_ids = prev.get_pages();
        (catalog_id, info_id, page_ids)
    };

    // Collect unique page numbers from both signature placements and text fields
    let mut pages_to_clone: std::collections::HashSet<u32> =
        placements.iter().map(|p| p.page_number).collect();
    for tf in text_fields {
        pages_to_clone.insert(tf.page_number);
    }

    // Now clone — no immutable borrow of inc_doc is alive
    if let Some(id) = catalog_id {
        inc_doc
            .opt_clone_object_to_new_document(id)
            .map_err(|e| format!("Failed to clone catalog: {e}"))?;
    }
    if let Some(id) = info_id {
        inc_doc
            .opt_clone_object_to_new_document(id)
            .map_err(|e| format!("Failed to clone Info dict: {e}"))?;
    }
    for page_num in pages_to_clone {
        if let Some(&page_id) = page_ids.get(&page_num) {
            inc_doc
                .opt_clone_object_to_new_document(page_id)
                .map_err(|e| format!("Failed to clone page: {e}"))?;
        }
    }

    Ok(page_ids)
}

/// First signer: load as IncrementalDocument (preserves original bytes) →
/// normalise → embed sig → hash → embed QR → write chain → save incrementally.
fn sign_first(
    app: &AppHandle,
    pdf_bytes: &[u8],
    input_file_hash: &str,
    signature_png_base64: &str,
    signer_name: &str,
    signer_email: &str,
    placements: &[SignaturePlacement],
    placement_records: &[PlacementRecord],
    text_fields: &[TextFieldPlacement],
    text_field_records: &[TextFieldRecord],
) -> Result<Vec<u8>, String> {
    // Create IncrementalDocument from original bytes — preserves original PDF as base layer
    let prev_doc = lopdf::Document::load_mem(pdf_bytes)
        .map_err(|e| format!("Failed to parse PDF: {e}"))?;
    let mut inc_doc =
        lopdf::IncrementalDocument::create_from(pdf_bytes.to_vec(), prev_doc);

    // Clone catalog, Info dict, and target pages into new_document
    let page_ids = clone_mutable_objects(&mut inc_doc, placements, text_fields)?;

    // Step 1: Normalise (operates on new_document — original bytes untouched)
    normalise::normalise_pdf(&mut inc_doc.new_document)
        .map_err(|e| format!("Normalisation failed: {e}"))?;

    // Step 2: Embed signature block
    let _ = app.emit("signing:status", "embedding");
    embed::embed_signature_block(
        &mut inc_doc.new_document,
        &page_ids,
        signature_png_base64,
        placements,
    )
    .map_err(|e| format!("Embedding failed: {e}"))?;

    // Step 2b: Embed text fields
    embed::embed_text_fields(&mut inc_doc.new_document, &page_ids, text_fields)
        .map_err(|e| format!("Text field embedding failed: {e}"))?;

    // Step 3: Compute hash on the serialized bytes (before QR)
    let _ = app.emit("signing:status", "hashing");
    let mut with_sig = Vec::new();
    inc_doc
        .save_to(&mut with_sig)
        .map_err(|e| format!("Failed to serialize PDF: {e}"))?;
    let doc_hash = hash::sha256_hash(&with_sig);

    // Step 4: Anchor (stubbed — fake tx hash)
    let _ = app.emit("signing:status", "anchoring");
    let tx_hash = format!("0x{}", &doc_hash[..40]);
    let qr_payload = format!("https://signchain.com/p/{}", tx_hash);

    // Step 5: Embed QR with tx hash
    let _ = app.emit("signing:status", "finalising");
    embed::embed_qr_with_tx(
        &mut inc_doc.new_document,
        &page_ids,
        &qr_payload,
        placements,
    )
    .map_err(|e| format!("QR embedding failed: {e}"))?;

    // Step 6: Write chain metadata
    let signer_record = SignerRecord {
        signer: signer_name.to_string(),
        email: signer_email.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        doc_hash,
        prev_doc_hash: None,
        input_file_hash: input_file_hash.to_string(),
        qr_url: qr_payload,
        eof_byte_offset: 0, // placeholder — set after save
        placements: placement_records.to_vec(),
        text_fields: text_field_records.to_vec(),
    };

    let meta = SignChainMeta {
        version: 1,
        signatures: vec![signer_record],
    };
    chain::write_chain(&mut inc_doc.new_document, &meta)
        .map_err(|e| format!("Failed to write chain metadata: {e}"))?;

    // Step 7: Save incrementally — original bytes preserved as base layer
    let mut final_pdf = Vec::new();
    inc_doc
        .save_to(&mut final_pdf)
        .map_err(|e| format!("Failed to save incremental PDF: {e}"))?;

    // eofByteOffset is left as 0. V1 verification uses prevDocHash chain linkage
    // and inputFileHash, not byte-level truncation. The actual offset is the file size.

    Ok(final_pdf)
}

/// Subsequent signer: verify chain → load incremental → embed sig → hash →
/// embed QR → append chain → save incrementally.
fn sign_subsequent(
    app: &AppHandle,
    pdf_bytes: &[u8],
    input_file_hash: &str,
    signature_png_base64: &str,
    signer_name: &str,
    signer_email: &str,
    placements: &[SignaturePlacement],
    placement_records: &[PlacementRecord],
    text_fields: &[TextFieldPlacement],
    text_field_records: &[TextFieldRecord],
    mut existing_meta: SignChainMeta,
) -> Result<Vec<u8>, String> {
    // --- Verify existing chain before signing ---
    // Check prevDocHash linkage
    for (i, record) in existing_meta.signatures.iter().enumerate() {
        if i == 0 {
            if record.prev_doc_hash.is_some() {
                return Err("Chain integrity check failed: first signer has a prevDocHash".into());
            }
        } else {
            let prev = &existing_meta.signatures[i - 1];
            if record.prev_doc_hash.as_deref() != Some(&prev.doc_hash) {
                return Err(format!(
                    "Chain integrity check failed: signer {} has invalid prevDocHash",
                    record.email
                ));
            }
        }
    }

    // Verify the input file hasn't been tampered since the last signer.
    // The last signer's eofByteOffset tells us the expected file size of their output.
    // If the file was modified, the hash will differ from what a clean output would produce.
    // For v1 we log the inputFileHash; full byte-level verification is a future enhancement.

    // Load as IncrementalDocument to preserve prior bytes
    let mut inc_doc = lopdf::IncrementalDocument::create_from(
        pdf_bytes.to_vec(),
        lopdf::Document::load_mem(pdf_bytes)
            .map_err(|e| format!("Failed to parse PDF: {e}"))?,
    );

    // Clone target pages and catalog into new_document
    let page_ids = clone_mutable_objects(&mut inc_doc, placements, text_fields)?;

    // Step 1: Embed signature block (skip normalisation — already done by first signer)
    let _ = app.emit("signing:status", "embedding");
    embed::embed_signature_block(
        &mut inc_doc.new_document,
        &page_ids,
        signature_png_base64,
        placements,
    )
    .map_err(|e| format!("Embedding failed: {e}"))?;

    // Step 1b: Embed text fields
    embed::embed_text_fields(&mut inc_doc.new_document, &page_ids, text_fields)
        .map_err(|e| format!("Text field embedding failed: {e}"))?;

    // Step 2: Compute hash on the serialized bytes (before QR)
    let _ = app.emit("signing:status", "hashing");
    let mut with_sig = Vec::new();
    inc_doc
        .save_to(&mut with_sig)
        .map_err(|e| format!("Failed to serialize PDF: {e}"))?;
    let doc_hash = hash::sha256_hash(&with_sig);

    // Step 3: Anchor (stubbed)
    let _ = app.emit("signing:status", "anchoring");
    let tx_hash = format!("0x{}", &doc_hash[..40]);
    let qr_payload = format!("https://signchain.com/p/{}", tx_hash);

    // Step 4: Embed QR
    let _ = app.emit("signing:status", "finalising");
    embed::embed_qr_with_tx(
        &mut inc_doc.new_document,
        &page_ids,
        &qr_payload,
        placements,
    )
    .map_err(|e| format!("QR embedding failed: {e}"))?;

    // Step 5: Build signer record and append to chain
    let prev_doc_hash = existing_meta
        .signatures
        .last()
        .map(|s| s.doc_hash.clone());

    let signer_record = SignerRecord {
        signer: signer_name.to_string(),
        email: signer_email.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        doc_hash,
        prev_doc_hash,
        input_file_hash: input_file_hash.to_string(),
        qr_url: qr_payload,
        eof_byte_offset: 0, // placeholder
        placements: placement_records.to_vec(),
        text_fields: text_field_records.to_vec(),
    };
    existing_meta.signatures.push(signer_record);

    // Write updated chain metadata
    chain::write_chain(&mut inc_doc.new_document, &existing_meta)
        .map_err(|e| format!("Failed to write chain metadata: {e}"))?;

    // Step 6: Save incrementally — preserves all prior bytes + appends new layer
    let mut final_pdf = Vec::new();
    inc_doc
        .save_to(&mut final_pdf)
        .map_err(|e| format!("Failed to save incremental PDF: {e}"))?;

    Ok(final_pdf)
}

// --- Verification ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerVerification {
    pub signer: String,
    pub email: String,
    pub timestamp: String,
    pub hash: String,
    pub status: String, // "valid" | "tampered" | "unverifiable"
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub is_signchain_document: bool,
    pub chain_valid: bool,
    pub signers: Vec<SignerVerification>,
}

#[tauri::command]
pub async fn verify_document(path: String) -> Result<VerificationResult, String> {
    let pdf_bytes =
        std::fs::read(&path).map_err(|e| format!("Failed to read PDF: {e}"))?;

    // Try loading via lopdf; if that fails (e.g. cross-reference stream PDFs
    // with incremental layers), fall back to raw byte extraction.
    let meta = match lopdf::Document::load_mem(&pdf_bytes) {
        Ok(doc) => chain::read_chain(&doc)
            .map_err(|e| format!("Failed to read chain: {e}"))?,
        Err(_) => chain::read_chain_from_bytes(&pdf_bytes)
            .map_err(|e| format!("Failed to read chain: {e}"))?,
    };

    let Some(meta) = meta else {
        return Ok(VerificationResult {
            is_signchain_document: false,
            chain_valid: false,
            signers: vec![],
        });
    };

    let mut signers = Vec::new();
    let mut chain_valid = true;

    for (i, record) in meta.signatures.iter().enumerate() {
        let status = if i == 0 {
            // First signer: prevDocHash must be None
            if record.prev_doc_hash.is_none() {
                "valid".to_string()
            } else {
                chain_valid = false;
                "tampered".to_string()
            }
        } else {
            // Subsequent signers: prevDocHash must match previous signer's docHash
            let prev = &meta.signatures[i - 1];
            if record.prev_doc_hash.as_deref() == Some(&prev.doc_hash) {
                "valid".to_string()
            } else {
                chain_valid = false;
                "tampered".to_string()
            }
        };

        signers.push(SignerVerification {
            signer: record.signer.clone(),
            email: record.email.clone(),
            timestamp: record.timestamp.clone(),
            hash: record.doc_hash.clone(),
            status,
        });
    }

    Ok(VerificationResult {
        is_signchain_document: true,
        chain_valid,
        signers,
    })
}

#[tauri::command]
pub async fn extract_revision(path: String, signer_index: Option<usize>) -> Result<String, String> {
    let pdf_bytes =
        std::fs::read(&path).map_err(|e| format!("Failed to read PDF: {e}"))?;

    // Scan for all %%EOF markers in the raw bytes
    let eof_marker = b"%%EOF";
    let mut eof_positions: Vec<usize> = Vec::new();
    for i in 0..pdf_bytes.len().saturating_sub(eof_marker.len() - 1) {
        if pdf_bytes[i..].starts_with(eof_marker) {
            let mut end = i + eof_marker.len();
            if end < pdf_bytes.len() && pdf_bytes[end] == b'\r' {
                end += 1;
            }
            if end < pdf_bytes.len() && pdf_bytes[end] == b'\n' {
                end += 1;
            }
            eof_positions.push(end);
        }
    }

    if eof_positions.is_empty() {
        return Err("No %%EOF markers found in PDF".into());
    }

    // Each signer produces 2 incremental saves (sig+hash, then QR+chain).
    // None = original document → %%EOF[0]
    // Some(N) = signer N complete → %%EOF[2*N + 2]
    let (eof_index, label) = match signer_index {
        None => (0, "original".to_string()),
        Some(n) => (2 * n + 2, format!("signer-{n}")),
    };

    if eof_index >= eof_positions.len() {
        return Err(format!(
            "Revision index out of range: need %%EOF[{}] but only found {} markers",
            eof_index,
            eof_positions.len()
        ));
    }

    let truncated = &pdf_bytes[..eof_positions[eof_index]];

    let temp_dir = std::env::temp_dir().join("signchain");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let src = std::path::Path::new(&path);
    let stem = src.file_stem().unwrap_or_default().to_string_lossy();
    let temp_path = temp_dir.join(format!("{stem}.revision-{label}.pdf"));

    std::fs::write(&temp_path, truncated)
        .map_err(|e| format!("Failed to write revision PDF: {e}"))?;

    Ok(temp_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_signed_pdf(app: AppHandle, temp_path: String) -> Result<Option<String>, String> {
    let src = std::path::Path::new(&temp_path);
    let default_name = src
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let dest = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("PDF Files", &["pdf"])
        .blocking_save_file();

    let Some(dest) = dest else {
        return Ok(None); // user cancelled
    };

    let dest_path = PathBuf::from(dest.to_string());
    std::fs::copy(&temp_path, &dest_path)
        .map_err(|e| format!("Failed to save file: {e}"))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_path);

    Ok(Some(dest_path.to_string_lossy().to_string()))
}
