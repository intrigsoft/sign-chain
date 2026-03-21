use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayRequest {
    pub composite_hash: String,
    pub previous_tx_hash: String,
    pub encrypted_payload: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayResponse {
    pub tx_hash: String,
    pub block_number: u64,
}

pub async fn relay(
    http: &Client,
    api_base: &str,
    req: &RelayRequest,
) -> Result<RelayResponse, String> {
    let url = format!("{}/relay", api_base);
    let resp = http
        .post(&url)
        .json(req)
        .send()
        .await
        .map_err(|e| format!("Relay request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Relay failed ({status}): {body}"));
    }

    resp.json::<RelayResponse>()
        .await
        .map_err(|e| format!("Failed to parse relay response: {e}"))
}
