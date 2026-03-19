use sha2::{Digest, Sha256};

/// Compute SHA-256 hash of PDF bytes, returned as hex string.
pub fn sha256_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}
