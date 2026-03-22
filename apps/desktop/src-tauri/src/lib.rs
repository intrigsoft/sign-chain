mod anchor;
mod commands;
mod payload;
mod pdf;
mod state;

use state::AppState;
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        api_base: "http://localhost:3000/api".to_string(),
        http: reqwest::Client::new(),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::pdf::open_pdf_picker,
            commands::pdf::get_pdf_page_count,
            commands::pdf::sign_document,
            commands::pdf::save_signed_pdf,
            commands::pdf::verify_document,
            commands::pdf::extract_revision,
            commands::documents::list_documents,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // On Linux/Windows, file associations pass file path as CLI arg
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let path = &args[1];
                if path.ends_with(".pdf") || path.ends_with(".PDF") {
                    let _ = app.handle().emit("file-open", path.to_string());
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
