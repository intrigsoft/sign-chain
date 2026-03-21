use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes128Gcm, Nonce};
use base64ct::{Base64UrlUnpadded, Encoding};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// QR Version 5 / EC L = 106 bytes max.
pub const QR_BYTE_BUDGET: usize = 106;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignerInfo {
    #[serde(rename = "t")]
    pub signer_type: String,
    #[serde(rename = "n")]
    pub name: String,
    #[serde(rename = "e")]
    pub email: String,
    #[serde(rename = "c", skip_serializing_if = "Option::is_none")]
    pub company: Option<String>,
    #[serde(rename = "p", skip_serializing_if = "Option::is_none")]
    pub position: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoLocation {
    #[serde(rename = "la")]
    pub lat: f64,
    #[serde(rename = "ln")]
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchorPayload {
    #[serde(rename = "d")]
    pub doc_hash: String,
    #[serde(rename = "s")]
    pub signer: SignerInfo,
    pub ts: i64,
    #[serde(rename = "g", skip_serializing_if = "Option::is_none")]
    pub geo: Option<GeoLocation>,
    pub salt: String,
}

/// Build the anchor payload JSON and compute its composite hash (SHA-256).
/// Returns (json_string, composite_hash_hex).
pub fn build_payload(
    doc_hash: &str,
    signer_info: SignerInfo,
    geo: Option<GeoLocation>,
) -> Result<(String, String), String> {
    let mut salt_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut salt_bytes);
    let salt = hex::encode(salt_bytes);

    let payload = AnchorPayload {
        doc_hash: doc_hash.to_string(),
        signer: signer_info,
        ts: chrono::Utc::now().timestamp(),
        geo,
        salt,
    };

    let json = serde_json::to_string(&payload)
        .map_err(|e| format!("Failed to serialize payload: {e}"))?;

    let mut hasher = Sha256::new();
    hasher.update(json.as_bytes());
    let composite_hash = format!("0x{}", hex::encode(hasher.finalize()));

    Ok((json, composite_hash))
}

/// Encrypt JSON payload with AES-128-GCM.
/// Returns (key, ciphertext) where ciphertext = nonce(12) || encrypted || tag(16).
pub fn encrypt_payload(plaintext: &[u8]) -> Result<([u8; 16], Vec<u8>), String> {
    let key = Aes128Gcm::generate_key(OsRng);
    let cipher = Aes128Gcm::new(&key);

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {e}"))?;

    // Prepend nonce to ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend(ciphertext);

    let mut key_arr = [0u8; 16];
    key_arr.copy_from_slice(&key);

    Ok((key_arr, result))
}

/// Build the QR URL with base64url-encoded tx hash and encryption key.
/// Format: https://signchain.app/v/<base64url(txHashBytes)>#<base64url(key)>
/// Total: ~89 bytes (fits in QR Version 9 / EC Q = 134 bytes).
pub fn build_qr_url(tx_hash_hex: &str, key: &[u8; 16]) -> Result<String, String> {
    // Strip 0x prefix and decode hex to raw bytes
    let hex_str = tx_hash_hex.strip_prefix("0x").unwrap_or(tx_hash_hex);
    let tx_bytes = hex::decode(hex_str)
        .map_err(|e| format!("Invalid tx hash hex: {e}"))?;

    let tx_b64 = Base64UrlUnpadded::encode_string(&tx_bytes);
    let key_b64 = Base64UrlUnpadded::encode_string(key);

    Ok(format!("https://signchain.app/v/{}#{}", tx_b64, key_b64))
}
