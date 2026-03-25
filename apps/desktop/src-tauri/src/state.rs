use reqwest::Client;
use std::sync::Mutex;

pub struct AppState {
    pub api_base: String,
    pub http: Client,
    pub jwt: Mutex<Option<String>>,
}
