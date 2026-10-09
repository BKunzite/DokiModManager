use std::env;

pub fn get_current_directory(app: &tauri::AppHandle) -> PathBuf {
    if cfg!(target_os = "macos") {
        return app.path().app_data_dir();
    } else {
        return env::current_dir().expect("Could Not Get Current Directory");
    }
}