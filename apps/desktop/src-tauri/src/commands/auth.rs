use crate::state::AppState;
use keyring::Entry;
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;

const SERVICE: &str = "com.intrigsoft.signchain";
const USER_JWT: &str = "jwt";
const USER_PROFILE: &str = "profile";

fn keyring_entry(user: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, user).map_err(|e| format!("Keyring error: {e}"))
}

#[tauri::command]
pub async fn open_auth_browser(
    app: AppHandle,
    provider: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let url = format!("{}/auth/{}", state.api_base, provider);
    app.shell()
        .open(&url, None)
        .map_err(|e| format!("Failed to open browser: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn get_stored_jwt() -> Result<Option<String>, String> {
    let entry = keyring_entry(USER_JWT)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keyring read error: {e}")),
    }
}

#[tauri::command]
pub async fn store_jwt(
    token: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = keyring_entry(USER_JWT)?;
    entry
        .set_password(&token)
        .map_err(|e| format!("Keyring write error: {e}"))?;

    let mut jwt = state
        .jwt
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    *jwt = Some(token);

    Ok(())
}

#[tauri::command]
pub async fn clear_stored_jwt(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = keyring_entry(USER_JWT)?;
    match entry.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("Keyring delete error: {e}")),
    }

    // Also clear stored profile
    let profile_entry = keyring_entry(USER_PROFILE)?;
    match profile_entry.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("Keyring delete error: {e}")),
    }

    let mut jwt = state
        .jwt
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    *jwt = None;

    Ok(())
}

/// Store user profile as JSON in keychain (name, signerType, company, position)
#[tauri::command]
pub async fn store_profile(json: String) -> Result<(), String> {
    let entry = keyring_entry(USER_PROFILE)?;
    entry
        .set_password(&json)
        .map_err(|e| format!("Keyring write error: {e}"))?;
    Ok(())
}

/// Load stored user profile JSON from keychain
#[tauri::command]
pub async fn get_stored_profile() -> Result<Option<String>, String> {
    let entry = keyring_entry(USER_PROFILE)?;
    match entry.get_password() {
        Ok(json) => Ok(Some(json)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keyring read error: {e}")),
    }
}
