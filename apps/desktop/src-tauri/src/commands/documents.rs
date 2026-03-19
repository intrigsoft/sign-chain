use serde::Serialize;

#[derive(Serialize)]
pub struct DocumentSummary {
    pub id: String,
    pub filename: String,
    pub status: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_documents() -> Result<Vec<DocumentSummary>, String> {
    // Stub — will call API when backend is ready
    Ok(vec![])
}
