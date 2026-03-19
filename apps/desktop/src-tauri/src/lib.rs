mod commands;
mod pdf;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        api_base: "http://localhost:3000".to_string(),
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
