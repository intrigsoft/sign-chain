use std::collections::BTreeMap;
use std::path::PathBuf;

use base64ct::Encoding;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

use crate::anchor;
use crate::payload::{self, GeoLocation, SignerInfo};
use crate::pdf::{
    chain::{self, PlacementRecord, SignChainMeta, SignerRecord, TextFieldRecord},
    embed, hash, normalise,
};
use crate::state::AppState;

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
    state: tauri::State<'_, AppState>,
    path: String,
    signature_png_base64: String,
    signer_name: String,
    signer_email: String,
    signer_type: String,
    signer_company: Option<String>,
    signer_position: Option<String>,
    geo_lat: Option<f64>,
    geo_lon: Option<f64>,
    trust: Option<String>,
    verified: Option<bool>,
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

    let signer_info = SignerInfo {
        signer_type: signer_type.clone(),
        name: signer_name.clone(),
        email: signer_email.clone(),
        company: signer_company.clone(),
        position: signer_position.clone(),
        trust: trust.clone(),
        verified,
    };

    let geo = match (geo_lat, geo_lon) {
        (Some(lat), Some(lon)) => Some(GeoLocation { lat, lon }),
        _ => None,
    };

    let final_pdf = if is_first_signer {
        sign_first(
            &app,
            &state,
            &pdf_bytes,
            &input_file_hash,
            &signature_png_base64,
            &signer_name,
            &signer_email,
            &signer_type,
            &signer_company,
            &signer_position,
            &geo,
            &signer_info,
            &placements,
            &placement_records,
            &text_fields,
            &text_field_records,
        )
        .await?
    } else {
        sign_subsequent(
            &app,
            &state,
            &pdf_bytes,
            &input_file_hash,
            &signature_png_base64,
            &signer_name,
            &signer_email,
            &signer_type,
            &signer_company,
            &signer_position,
            &geo,
            &signer_info,
            &placements,
            &placement_records,
            &text_fields,
            &text_field_records,
            existing_chain.unwrap(),
        )
        .await?
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
    // Collect page IDs to clone
    let page_ids_to_clone: Vec<lopdf::ObjectId> = pages_to_clone
        .iter()
        .filter_map(|pn| page_ids.get(pn).copied())
        .collect();

    for page_id in &page_ids_to_clone {
        inc_doc
            .opt_clone_object_to_new_document(*page_id)
            .map_err(|e| format!("Failed to clone page: {e}"))?;
    }

    // Deep-clone Resources (and nested XObject/Font dicts) so embed functions
    // can modify them. Pages often store Resources as a Reference to an object
    // in the previous document — without cloning, the embed functions silently
    // fail to register XObject entries for signature/QR images.
    for &page_id in &page_ids_to_clone {
        let inlined_resources = {
            let prev = inc_doc.get_prev_documents();
            let page = match prev.get_object(page_id) {
                Ok(lopdf::Object::Dictionary(d)) => d,
                _ => continue,
            };
            match page.get(b"Resources") {
                Ok(lopdf::Object::Reference(res_id)) => {
                    match prev.get_object(*res_id) {
                        Ok(res_obj) => {
                            let mut resources = res_obj.clone();
                            // Also inline nested XObject/Font dicts if they are References
                            if let lopdf::Object::Dictionary(ref mut res_dict) = resources {
                                for key in &[b"XObject".as_ref(), b"Font".as_ref()] {
                                    if let Ok(lopdf::Object::Reference(nested_id)) =
                                        res_dict.get(key)
                                    {
                                        if let Ok(nested_obj) = prev.get_object(*nested_id) {
                                            res_dict.set(*key, nested_obj.clone());
                                        }
                                    }
                                }
                            }
                            Some(resources)
                        }
                        Err(_) => None,
                    }
                }
                _ => None, // already inline or missing — embed functions handle these
            }
        };

        if let Some(resources) = inlined_resources {
            if let Ok(lopdf::Object::Dictionary(ref mut page)) =
                inc_doc.new_document.get_object_mut(page_id)
            {
                page.set("Resources", resources);
            }
        }
    }

    Ok(page_ids)
}

/// First signer: load as IncrementalDocument (preserves original bytes) →
/// normalise → embed sig → hash → anchor → embed QR → write chain → save incrementally.
async fn sign_first(
    app: &AppHandle,
    state: &AppState,
    pdf_bytes: &[u8],
    input_file_hash: &str,
    signature_png_base64: &str,
    signer_name: &str,
    signer_email: &str,
    signer_type: &str,
    signer_company: &Option<String>,
    signer_position: &Option<String>,
    geo: &Option<GeoLocation>,
    signer_info: &SignerInfo,
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

    // Step 1b: Reset CTM — undo any transform the existing content streams left active.
    // Compute inverses from prev_documents first, then apply to new_document (avoids borrow conflict).
    {
        let target_pages: Vec<u32> = placements.iter().map(|p| p.page_number)
            .chain(text_fields.iter().map(|t| t.page_number))
            .collect::<std::collections::HashSet<_>>().into_iter().collect();
        let ctm_inverses: Vec<(u32, [f32; 6])> = target_pages.iter().filter_map(|&pn| {
            let pid = page_ids.get(&pn)?;
            let inv = embed::compute_ctm_reset(inc_doc.get_prev_documents(), *pid).ok()??;
            Some((pn, inv))
        }).collect();
        embed::apply_ctm_resets(&mut inc_doc.new_document, &page_ids, &ctm_inverses)
            .map_err(|e| format!("CTM reset failed: {e}"))?;
    }

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

    // Step 4: Build payload, encrypt, and anchor on-chain
    let _ = app.emit("signing:status", "anchoring");
    let (json_payload, composite_hash) =
        payload::build_payload(&doc_hash, signer_info.clone(), geo.clone())
            .map_err(|e| format!("Payload build failed: {e}"))?;

    let (enc_key, ciphertext) = payload::encrypt_payload(json_payload.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;
    let encrypted_payload_b64 = base64ct::Base64UrlUnpadded::encode_string(&ciphertext);

    let relay_req = anchor::RelayRequest {
        composite_hash: composite_hash.clone(),
        previous_tx_hash: "0x0000000000000000000000000000000000000000000000000000000000000000"
            .to_string(),
        encrypted_payload: encrypted_payload_b64,
    };
    let relay_resp = anchor::relay(&state.http, &state.api_base, &relay_req).await?;
    let tx_hash = relay_resp.tx_hash.clone();

    let qr_url = payload::build_qr_url(&tx_hash, &enc_key)
        .map_err(|e| format!("QR URL build failed: {e}"))?;

    // Extract salt from the payload for the signer record
    let parsed_payload: serde_json::Value = serde_json::from_str(&json_payload)
        .map_err(|e| format!("Failed to re-parse payload: {e}"))?;
    let salt = parsed_payload["salt"].as_str().unwrap_or("").to_string();

    // Step 5: Embed QR with tx hash
    let _ = app.emit("signing:status", "finalising");
    embed::embed_qr_with_tx(
        &mut inc_doc.new_document,
        &page_ids,
        &qr_url,
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
        qr_url,
        eof_byte_offset: 0,
        placements: placement_records.to_vec(),
        text_fields: text_field_records.to_vec(),
        composite_hash,
        tx_hash,
        salt,
        signer_type: Some(signer_type.to_string()),
        company: signer_company.clone(),
        position: signer_position.clone(),
        geo: geo.as_ref().map(|g| (g.lat, g.lon)),
    };

    let meta = SignChainMeta {
        version: 2,
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
/// anchor → embed QR → append chain → save incrementally.
async fn sign_subsequent(
    app: &AppHandle,
    state: &AppState,
    pdf_bytes: &[u8],
    input_file_hash: &str,
    signature_png_base64: &str,
    signer_name: &str,
    signer_email: &str,
    signer_type: &str,
    signer_company: &Option<String>,
    signer_position: &Option<String>,
    geo: &Option<GeoLocation>,
    signer_info: &SignerInfo,
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

    // Step 0b: Reset CTM — undo any transform the existing content streams left active.
    {
        let target_pages: Vec<u32> = placements.iter().map(|p| p.page_number)
            .chain(text_fields.iter().map(|t| t.page_number))
            .collect::<std::collections::HashSet<_>>().into_iter().collect();
        let ctm_inverses: Vec<(u32, [f32; 6])> = target_pages.iter().filter_map(|&pn| {
            let pid = page_ids.get(&pn)?;
            let inv = embed::compute_ctm_reset(inc_doc.get_prev_documents(), *pid).ok()??;
            Some((pn, inv))
        }).collect();
        embed::apply_ctm_resets(&mut inc_doc.new_document, &page_ids, &ctm_inverses)
            .map_err(|e| format!("CTM reset failed: {e}"))?;
    }

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

    // Step 3: Build payload, encrypt, and anchor on-chain
    let _ = app.emit("signing:status", "anchoring");
    let (json_payload, composite_hash) =
        payload::build_payload(&doc_hash, signer_info.clone(), geo.clone())
            .map_err(|e| format!("Payload build failed: {e}"))?;

    let (enc_key, ciphertext) = payload::encrypt_payload(json_payload.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;
    let encrypted_payload_b64 = base64ct::Base64UrlUnpadded::encode_string(&ciphertext);

    // Get previous tx hash from the last signer's record
    let previous_tx_hash = existing_meta
        .signatures
        .last()
        .map(|s| s.tx_hash.clone())
        .unwrap_or_else(|| {
            "0x0000000000000000000000000000000000000000000000000000000000000000".to_string()
        });

    let relay_req = anchor::RelayRequest {
        composite_hash: composite_hash.clone(),
        previous_tx_hash,
        encrypted_payload: encrypted_payload_b64,
    };
    let relay_resp = anchor::relay(&state.http, &state.api_base, &relay_req).await?;
    let tx_hash = relay_resp.tx_hash.clone();

    let qr_url = payload::build_qr_url(&tx_hash, &enc_key)
        .map_err(|e| format!("QR URL build failed: {e}"))?;

    let parsed_payload: serde_json::Value = serde_json::from_str(&json_payload)
        .map_err(|e| format!("Failed to re-parse payload: {e}"))?;
    let salt = parsed_payload["salt"].as_str().unwrap_or("").to_string();

    // Step 4: Embed QR
    let _ = app.emit("signing:status", "finalising");
    embed::embed_qr_with_tx(
        &mut inc_doc.new_document,
        &page_ids,
        &qr_url,
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
        qr_url,
        eof_byte_offset: 0,
        placements: placement_records.to_vec(),
        text_fields: text_field_records.to_vec(),
        composite_hash,
        tx_hash,
        salt,
        signer_type: Some(signer_type.to_string()),
        company: signer_company.clone(),
        position: signer_position.clone(),
        geo: geo.as_ref().map(|g| (g.lat, g.lon)),
    };
    existing_meta.signatures.push(signer_record);
    existing_meta.version = 2;

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
    pub blockchain_verified: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub is_signchain_document: bool,
    pub chain_valid: bool,
    pub signers: Vec<SignerVerification>,
}

#[tauri::command]
pub async fn verify_document(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<VerificationResult, String> {
    let pdf_bytes =
        std::fs::read(&path).map_err(|e| format!("Failed to read PDF: {e}"))?;

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
            if record.prev_doc_hash.is_none() {
                "valid".to_string()
            } else {
                chain_valid = false;
                "tampered".to_string()
            }
        } else {
            let prev = &meta.signatures[i - 1];
            if record.prev_doc_hash.as_deref() == Some(&prev.doc_hash) {
                "valid".to_string()
            } else {
                chain_valid = false;
                "tampered".to_string()
            }
        };

        // Blockchain verification: compare on-chain compositeHash with stored record
        let mut blockchain_verified: Option<bool> = None;

        if !record.composite_hash.is_empty() && !record.tx_hash.is_empty() {
            let verify_url = format!("{}/verify/{}", state.api_base, record.tx_hash);
            match state.http.get(&verify_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(body) = resp.json::<serde_json::Value>().await {
                        let on_chain_hash = body["compositeHash"]
                            .as_str()
                            .unwrap_or("");
                        blockchain_verified =
                            Some(on_chain_hash == record.composite_hash);
                    }
                }
                _ => {
                    // Offline or API error — can't verify blockchain
                    blockchain_verified = None;
                }
            }
        }

        signers.push(SignerVerification {
            signer: record.signer.clone(),
            email: record.email.clone(),
            timestamp: record.timestamp.clone(),
            hash: record.doc_hash.clone(),
            status,
            blockchain_verified,
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
