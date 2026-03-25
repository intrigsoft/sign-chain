mod anchor;
mod commands;
mod payload;
mod pdf;
mod state;

use state::AppState;
use std::sync::Mutex;
use tauri::{Emitter, Listener, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        api_base: "http://localhost:3000/api".to_string(),
        http: reqwest::Client::new(),
        jwt: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::pdf::open_pdf_picker,
            commands::pdf::get_pdf_page_count,
            commands::pdf::sign_document,
            commands::pdf::save_signed_pdf,
            commands::pdf::verify_document,
            commands::pdf::extract_revision,
            commands::documents::list_documents,
            commands::auth::open_auth_browser,
            commands::auth::get_stored_jwt,
            commands::auth::store_jwt,
            commands::auth::clear_stored_jwt,
            commands::auth::store_profile,
            commands::auth::get_stored_profile,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Handle deep links (signchain://auth/callback?token=<jwt>)
            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                let payload = event.payload();
                if let Some(token) = extract_token_from_deep_link(payload) {
                    // Store in keyring
                    if let Ok(entry) = keyring::Entry::new("com.intrigsoft.signchain", "jwt") {
                        let _ = entry.set_password(&token);
                    }
                    // Update app state
                    if let Some(state) = handle.try_state::<AppState>() {
                        if let Ok(mut jwt) = state.jwt.lock() {
                            *jwt = Some(token.clone());
                        }
                    }
                    // Emit event to frontend
                    let _ = handle.emit("auth-callback", token);
                }
            });

            // On Linux/Windows, deep links and file associations arrive as CLI args
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let arg = &args[1];
                if arg.starts_with("signchain://") {
                    // Deep link via CLI arg (Linux/Windows)
                    if let Some(token) = extract_token_from_deep_link(arg) {
                        if let Ok(entry) = keyring::Entry::new("com.intrigsoft.signchain", "jwt") {
                            let _ = entry.set_password(&token);
                        }
                        if let Some(state) = app.handle().try_state::<AppState>() {
                            if let Ok(mut jwt) = state.jwt.lock() {
                                *jwt = Some(token.clone());
                            }
                        }
                        let _ = app.handle().emit("auth-callback", token);
                    }
                } else if arg.ends_with(".pdf") || arg.ends_with(".PDF") {
                    let _ = app.handle().emit("file-open", arg.to_string());
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS file open events handled here when targeting macOS
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Some(path_str) = path.to_str() {
                            let _ = _app.emit("file-open", path_str.to_string());
                        }
                    }
                }
            }
        });
}

/// Extract JWT token from a deep link URL like signchain://auth/callback?token=<jwt>
fn extract_token_from_deep_link(payload: &str) -> Option<String> {
    // Payload from deep-link plugin may be JSON-encoded or raw URL
    let url_str = payload.trim_matches('"');
    let url = url::Url::parse(url_str).ok()?;

    if url.host_str()? == "auth" && url.path() == "/callback" {
        url.query_pairs()
            .find(|(key, _)| key == "token")
            .map(|(_, value)| value.into_owned())
    } else {
        None
    }
}
