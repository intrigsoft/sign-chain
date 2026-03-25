use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const LIBRARY_DIR: &str = "library";
const LIBRARY_JSON: &str = "library.json";
const SIGNATURES_DIR: &str = "signatures";

fn library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(data_dir.join(LIBRARY_DIR))
}

fn ensure_dirs(app: &AppHandle) -> Result<PathBuf, String> {
    let lib_dir = library_dir(app)?;
    let sigs_dir = lib_dir.join(SIGNATURES_DIR);
    fs::create_dir_all(&sigs_dir).map_err(|e| format!("Failed to create library dirs: {e}"))?;
    Ok(lib_dir)
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedSignatureEntry {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedTextSnippet {
    pub id: String,
    pub label: String,
    pub text: String,
    pub font_size: f64,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryData {
    pub signatures: Vec<SavedSignatureEntry>,
    pub text_snippets: Vec<SavedTextSnippet>,
    #[serde(default)]
    pub sync_enabled: Option<bool>,
}

fn read_library(lib_dir: &PathBuf) -> LibraryData {
    let path = lib_dir.join(LIBRARY_JSON);
    match fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => LibraryData::default(),
    }
}

fn write_library(lib_dir: &PathBuf, data: &LibraryData) -> Result<(), String> {
    let path = lib_dir.join(LIBRARY_JSON);
    let json =
        serde_json::to_string_pretty(data).map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write library: {e}"))?;
    Ok(())
}

// ── Signature commands ──────────────────────────────────────

#[tauri::command]
pub async fn save_library_signature(
    app: AppHandle,
    id: String,
    label: String,
    base64_png: String,
) -> Result<(), String> {
    let lib_dir = ensure_dirs(&app)?;
    let filename = format!("{id}.png");

    // Decode and write PNG
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &base64_png,
    )
    .map_err(|e| format!("Invalid base64: {e}"))?;
    let sig_path = lib_dir.join(SIGNATURES_DIR).join(&filename);
    fs::write(&sig_path, bytes).map_err(|e| format!("Failed to write signature: {e}"))?;

    // Update metadata
    let mut data = read_library(&lib_dir);
    data.signatures.retain(|s| s.id != id);
    data.signatures.push(SavedSignatureEntry {
        id,
        label,
        filename,
        created_at: chrono::Utc::now().timestamp_millis(),
    });
    write_library(&lib_dir, &data)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_library_signature(app: AppHandle, id: String) -> Result<(), String> {
    let lib_dir = ensure_dirs(&app)?;
    let mut data = read_library(&lib_dir);

    if let Some(entry) = data.signatures.iter().find(|s| s.id == id) {
        let sig_path = lib_dir.join(SIGNATURES_DIR).join(&entry.filename);
        let _ = fs::remove_file(sig_path);
    }

    data.signatures.retain(|s| s.id != id);
    write_library(&lib_dir, &data)?;
    Ok(())
}

#[tauri::command]
pub async fn load_library_signature(app: AppHandle, id: String) -> Result<String, String> {
    let lib_dir = library_dir(&app)?;
    let data = read_library(&lib_dir);

    let entry = data
        .signatures
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| "Signature not found".to_string())?;

    let sig_path = lib_dir.join(SIGNATURES_DIR).join(&entry.filename);
    let bytes = fs::read(&sig_path).map_err(|e| format!("Failed to read signature: {e}"))?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &bytes,
    ))
}

/// Load the full library metadata (signatures list + text snippets)
#[tauri::command]
pub async fn load_library(app: AppHandle) -> Result<LibraryData, String> {
    let lib_dir = ensure_dirs(&app)?;
    Ok(read_library(&lib_dir))
}

// ── Text snippet commands ───────────────────────────────────

#[tauri::command]
pub async fn save_text_snippet(
    app: AppHandle,
    id: String,
    label: String,
    text: String,
    font_size: f64,
) -> Result<(), String> {
    let lib_dir = ensure_dirs(&app)?;
    let mut data = read_library(&lib_dir);
    data.text_snippets.retain(|s| s.id != id);
    data.text_snippets.push(SavedTextSnippet {
        id,
        label,
        text,
        font_size,
        created_at: chrono::Utc::now().timestamp_millis(),
    });
    write_library(&lib_dir, &data)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_text_snippet(app: AppHandle, id: String) -> Result<(), String> {
    let lib_dir = ensure_dirs(&app)?;
    let mut data = read_library(&lib_dir);
    data.text_snippets.retain(|s| s.id != id);
    write_library(&lib_dir, &data)?;
    Ok(())
}

#[tauri::command]
pub async fn update_library_signature_label(
    app: AppHandle,
    id: String,
    label: String,
) -> Result<(), String> {
    let lib_dir = ensure_dirs(&app)?;
    let mut data = read_library(&lib_dir);
    if let Some(entry) = data.signatures.iter_mut().find(|s| s.id == id) {
        entry.label = label;
    }
    write_library(&lib_dir, &data)?;
    Ok(())
}

// ── Sync preference commands ────────────────────────────────

#[tauri::command]
pub async fn get_sync_enabled(app: AppHandle) -> Result<bool, String> {
    let lib_dir = ensure_dirs(&app)?;
    let data = read_library(&lib_dir);
    Ok(data.sync_enabled.unwrap_or(false))
}

#[tauri::command]
pub async fn set_sync_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let lib_dir = ensure_dirs(&app)?;
    let mut data = read_library(&lib_dir);
    data.sync_enabled = Some(enabled);
    write_library(&lib_dir, &data)?;
    Ok(())
}
