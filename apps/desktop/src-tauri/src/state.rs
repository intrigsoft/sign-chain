use reqwest::Client;

pub struct AppState {
    pub api_base: String,
    pub http: Client,
}
