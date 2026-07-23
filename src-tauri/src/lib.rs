use crate::hash::get_file_hash;
use futures_util::TryStreamExt;
use include_dir::{include_dir, Dir};
use jwalk::WalkDir;
use rand::{rng, Rng};
use rayon::prelude::*;
use rayon::{ThreadPool, ThreadPoolBuilder};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::{create_dir_all, exists, remove_dir_all, remove_file, File};
#[allow(unused_imports)]
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::{env, fs};
use std::fmt::format;
use dirs::home_dir;
use sysinfo::{ProcessesToUpdate, System};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Emitter, Listener, Manager, PhysicalSize, PixelUnit, Size, Url, WebviewUrl, WebviewWindowBuilder, WindowSizeConstraints};
use tauri::window::Color;
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_fs_pro::{is_dir, is_file};
use tokio::fs::File as TokioFile;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::task;
use unrar::Archive;
use window_vibrancy::{apply_acrylic, apply_vibrancy, NSVisualEffectMaterial};
use zip::ZipArchive;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

mod discord_rpc;
mod downloader;
mod extractor;
mod hash;
mod simple_logger;

static RELEASES_URL: &str = "https://github.com/BKunzite/DokiModManager/releases";
static LATEST_ARTIFACT: &str = "https://github.com/BKunzite/DokiModManager/raw/refs/heads/main/BUILD_LATEST_ARTIFACT/dokimodmanager.exe";
static LATEST_ARTIFACT_LINUX_DEB: &str = "https://github.com/BKunzite/DokiModManager/raw/refs/heads/main/BUILD_LATEST_ARTIFACT/LINUX_BINARY/DEB/dokimodmanager.deb";
static LATEST_ARTIFACT_LINUX_APP: &str = "https://github.com/BKunzite/DokiModManager/raw/refs/heads/main/BUILD_LATEST_ARTIFACT/LINUX_BINARY/APP/dokimodmanager.AppImage";
static LATEST_ARTIFACT_LINUX_RPM: &str = "https://github.com/BKunzite/DokiModManager/raw/refs/heads/main/BUILD_LATEST_ARTIFACT/LINUX_BINARY/RPM/dokimodmanager.rpm";

static UN_RPYC: &str =
    "https://github.com/BKunzite/DokiModManager/raw/refs/heads/main/src-tauri/unrpyc.exe";
static UN_RPYC_LINUX: &str =
    "https://github.com/BKunzite/DokiModManager/raw/refs/heads/main/src-tauri/unrpyc.sh";

static UN_RPYC_HASH: &str = "6bd359dccf6ad7612ccc479bd65a4c768465d925177ec682b796d3d67739755c";
static UN_RPYC_LINUX_HASH: &str = "b74b408f748bf45fe8a8023525ba728d25fac6a677b711c77dc8aa8d7e4a25f6";
static SCRIPTS_RPA_HASH: &str = "da7ba6d3cf9ec1ae666ec29ae07995a65d24cca400cd266e470deb55e03a51d4";
static DDLC_HASH: &str = "2a3dd7969a06729a32ace0a6ece5f2327e29bdf460b8b39e6a8b0875e545632e";

static RESOURCES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/resources");
static COPY_POOL: OnceLock<ThreadPool> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum InstallType {
    Appimage,
    Deb,
    Rpm,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize)]
struct InstallData {
    kind: InstallType,
    path: Option<PathBuf>,
    package: Option<String>,
}

#[tauri::command]
fn close(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
fn minimize(window: tauri::Window) {
    let _ = window.minimize();
}

#[derive(Serialize, Deserialize)]
struct ConfigData {
    directory: String,
}

#[derive(Clone, Serialize)]
struct ReturnData<'a> {
    id: &'a str,
}

#[derive(Clone, Serialize)]
struct StringData<'a> {
    text: &'a str,
}

#[derive(serde::Deserialize)]
struct WebviewOpen<'a> {
    url: &'a str,
    name: &'a str,
}

#[derive(serde::Deserialize)]
struct DownloadRequest<'a> {
    file_name: &'a str,
    url: &'a str,
}

#[derive(Clone, Serialize)]
struct IntData {
    number: u16,
    number_goal: u16,
}

#[derive(Clone, Serialize)]
struct ReturnPath<'a> {
    final_data: &'a str,
    path: &'a str,
    local_path: &'a str,
    reinstall: bool,
}

#[tauri::command]
async fn path_select(path: &str) -> Result<(), String> {
    let default_config_data: ConfigData = ConfigData {
        directory: path.to_string(),
    };
    let json_data =
        serde_json::to_string_pretty(&default_config_data).map_err(|e| e.to_string())?;

    let mut file = TokioFile::create(get_current_dir().join("DNNconfig.json"))
        .await
        .map_err(|e| e.to_string())?;

    println!("Ready! {path}");
    file.write_all(json_data.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn request_path(app: AppHandle) -> Result<(), String> {
    let default_config_data: ConfigData = ConfigData {
        directory: get_current_dir()
            .display()
            .to_string()
            + std::path::MAIN_SEPARATOR_STR + "store" + std::path::MAIN_SEPARATOR_STR + "mods",
    };
    let mut contents = String::new();

    if fs::metadata(get_current_dir().join("DNNconfig.json")).is_err() {
        let json_data =
            serde_json::to_string_pretty(&default_config_data).map_err(|e| e.to_string())?;
        let mut file = TokioFile::create(get_current_dir().join("DNNconfig.json"))
            .await
            .map_err(|e| e.to_string())?;
        file.write_all(json_data.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        contents = json_data;
    } else {
        let mut file = TokioFile::open(get_current_dir().join("DNNconfig.json"))
            .await
            .map_err(|e| e.to_string())?;
        file.read_to_string(&mut contents)
            .await
            .map_err(|e| e.to_string())?;
    }

    let final_data: ConfigData = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    app.emit(
        "pathRespond",
        ReturnPath {
            final_data: &final_data.directory,
            local_path: &get_current_dir()
                .to_string_lossy(),
            path: dirs::home_dir()
                .unwrap()
                .join("Downloads")
                .to_str()
                .unwrap(),
            reinstall: false,
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_path(app_handle: AppHandle, path: &str) {
    match remove_dir_all(path) {
        Ok(_) => println!("Deleted"),
        Err(e) => {
            println!("Failed to delete");

            app_handle
                .emit(
                    "popup",
                    StringData {
                        text: format!("Failed to delete: {}", e).as_str(),
                    },
                )
                .expect("Popup Error");
        }
    }
}

fn is_process_running(search_name: &str) -> bool {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    let search_name_lower = search_name.to_lowercase();
    system.processes().iter().any(|(_, process)| {
        let process_name = process.name().to_string_lossy().to_lowercase();
        process_name.contains(&search_name_lower)
            || process_name.starts_with(&search_name_lower)
            || process_name.ends_with(&search_name_lower)
    })
}

async fn default_rpa(scripts: &PathBuf) -> bool {
    let scriptsrpa = PathBuf::from(&scripts).join("scripts.rpa");
    if !is_file(scriptsrpa.clone()).await {
        return false;
    }
    let hash = get_file_hash(scriptsrpa.to_str().unwrap()).unwrap();
    hash == SCRIPTS_RPA_HASH
}

async fn fix_renpy_8(renpy: &str, scripts: &PathBuf) {
    let scriptsrpa = PathBuf::from(&scripts).join("scripts.rpa");
    if !is_file(scriptsrpa.clone()).await {
        return;
    }

    let file_size = File::open(&scriptsrpa)
        .unwrap()
        .metadata()
        .unwrap()
        .len();

    println!("File Size: {}", file_size);
    if file_size > 280_0000 {
        return;
    }
    let version = version_f32(renpy);
    if version.is_none() {
        return;
    }
    let versionint = version.unwrap();
    let equal = default_rpa(scripts).await;
    println!("Version: {} ({}f32); Equal: {};", renpy, versionint, equal);
    if versionint >= 8.0 && equal {
        remove_file(PathBuf::from(&scripts).join("scripts.rpa")).unwrap();
        println!("[REMOVED] scripts.rpa file removed in order to fix DDLC Mods >= RenPy 8.0");
    }
}

#[tauri::command]
fn extract_game_script(app: AppHandle, path: &str, out: &str) {
    extract_rpa(&app, path, out);
}

#[tauri::command]
fn rpa_data(app: AppHandle, path: &str, out: &str, option: &str) -> String {
    println!("{} | {}", path, out);
    let binding = PathBuf::from(path);
    let path_out = &PathBuf::from(out);
    if !exists(path).unwrap() || !path.ends_with(".rpa") {
        if path.ends_with("options.rpyc") {
            create_dir_all(path_out.join("ddmm-temp-options")).unwrap();
            if !path_out
                .join("ddmm-temp-options")
                .join("options.rpy")
                .exists()
            {
                println!(
                    "{}",
                    path_out
                        .join(format!("ddmm-temp-options{}{}",std::path::MAIN_SEPARATOR, ""))
                        .to_str()
                        .unwrap()
                );
                extract_rpyc(
                    &app,
                    path,
                    path_out.join("ddmm-temp-options").to_str().unwrap(),
                );
            }
            return parse_source(
                fs::read_to_string(path_out.join("ddmm-temp-options").join("options.rpy"))
                    .unwrap()
                    .as_str(),
                option,
            )
            .unwrap_or_default();
        }

        return String::new();
    }
    let mut rpa_archive = warpalib::RenpyArchive::open(binding.as_path()).unwrap();

    create_dir_all(path_out.as_path()).unwrap();
    let early_path = path_out.join(format!("ddmm-temp-options{}options.rpy", std::path::MAIN_SEPARATOR));
    println!("path - {}", early_path.to_str().unwrap() );
    if exists(&early_path).unwrap() {
        println!("Found Options File! (EARLY ESCAPE)");

        return parse_source(
            &fs::read_to_string(early_path).unwrap(),
            option,
        )
        .unwrap_or_default();
    }
    for (output, content) in rpa_archive.content.iter() {
        if output.as_path().to_str().unwrap().contains("option") {
            let cmain = output.as_path().to_str().unwrap();
            if cmain.contains("/") {
                continue;
            }
            create_dir_all(path_out.join("ddmm-temp-options")).unwrap();
            println!(
                "{}",
                path_out
                    .join(format!("ddmm-temp-options{}{}",std::path::MAIN_SEPARATOR, cmain))
                    .to_str()
                    .unwrap()
            );
            let mut file = File::create(
                path_out
                    .join(format!("ddmm-temp-options{}{}",std::path::MAIN_SEPARATOR, cmain))
                    .as_path()
                    .to_str()
                    .unwrap(),
            )
            .unwrap();
            content.copy_to(&mut rpa_archive.reader, &mut file).unwrap();
            println!("Found Options! Extracting Data");

            let response = rpa_archive_option(path_out, cmain, option);
            if !response.is_empty() {
                return response;
            }
        }
    }
    println!("Done!");
    String::new()
}

fn rpa_archive_option(path_out: &Path, cmain: &str, option: &str) -> String {
    let mut exchild: Command;
    #[cfg(windows)]
    {
        exchild = Command::new(
            get_current_dir()
                .join("unrpyc.exe")
                .as_path()
                .to_str()
                .unwrap(),
        );
    }
    #[cfg(target_os = "linux")]
    {
        exchild = Command::new(
            get_current_dir()
                .join("unrpyc.sh")
                .as_path()
                .to_str()
                .unwrap(),
        );
    }
    exchild.arg(
        path_out
            .join(format!("ddmm-temp-options{}{}",std::path::MAIN_SEPARATOR, cmain))
            .as_path()
            .to_str()
            .unwrap(),
    );
    println!("{:?}", exchild);

    let rput = exchild
        .spawn()
        .map_err(|e| format!("Failed to start executable: {}", e))
        .unwrap()
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for child process: {}", e))
        .unwrap();

    if rput.status.success() {
        println!("{}", String::from_utf8_lossy(&rput.stdout));
        let output_src = path_out.join(format!(
            "ddmm-temp-options{}{}",
            std::path::MAIN_SEPARATOR,
            cmain.replace(".rpyc", ".rpy")
        ));
        println!("{:?}", output_src);
        if output_src.exists() {
            println!("Found RPY File! Extracting Data");
            let src_text = fs::read_to_string(output_src.as_path().to_str().unwrap()).unwrap();
            return parse_source(&src_text, &option).unwrap_or_default();
        } else {
            eprintln!("Failed to find RPY File!");
        }
    } else {
        let error_msg = String::from_utf8_lossy(&rput.stderr);
        eprintln!(
            "unrpyc failed with status: {}\nError: {}",
            rput.status, error_msg
        );
    }
    String::new()
}

fn parse_source(source: &str, option: &str) -> Option<String> {
    for line in source.split("\n").filter(|line| !line.starts_with("#")) {
        if !line.contains(option) {
            continue;
        }
        let mut contents = line.split('"');
        contents.next()?;
        let content = contents.next().unwrap_or("");
        println!("{}", line);
        let mut data: PathBuf;
        #[cfg(target_os = "linux")]
        {
            data = home_dir().unwrap().join(".renpy").join(content);
        }
        #[cfg(windows)]
        {
            data = dirs::config_dir().unwrap().join("RenPy").join(content);
        }
        println!("Found Mod Data @ {}", data.as_path().to_str().unwrap());
        return Some(data.to_str().unwrap().to_string());
    }
    None
}
fn extract_rpa(app: &AppHandle, path: &str, out: &str) {
    if exists(out).unwrap() {
        return;
    }
    if !exists(path).unwrap() {
        return;
    }
    if !path.ends_with(".rpa") {
        if path.ends_with(".rpyc") {
            extract_rpyc(app, path, out);
        }
        return;
    }
    let binding = PathBuf::from(path);
    let mut rpa_archive = warpalib::RenpyArchive::open(binding.as_path()).unwrap();
    let path_out = PathBuf::from(out);
    create_dir_all(path_out.as_path()).unwrap();
    for (output, content) in rpa_archive.content.iter() {
        let output = path_out.join(output.as_path());
        if let Some(parent) = output.parent() {
            if !parent.exists() {
                create_dir_all(parent).unwrap();
            }
        }

        let mut file = File::create(&output).unwrap();
        content.copy_to(&mut rpa_archive.reader, &mut file).unwrap();
    }
    decrypt_rpa_dir(app, path_out.as_path());
}

fn extract_rpyc(app: &AppHandle, path: &str, out: &str) {
    let binding = PathBuf::from(path);
    let path_out = PathBuf::from(out);

    create_dir_all(path_out.as_path()).unwrap();
    let file_path = path_out.join(binding.file_name().unwrap().to_str().unwrap());
    let mut file = File::create(&file_path).unwrap();
    file.write_all(&fs::read(&binding).unwrap()).unwrap();
    println!(
        "{} | {}",
        &file_path.to_str().unwrap(),
        &binding.to_str().unwrap()
    );
    decrypt_rpa_dir(app, path_out.as_path());
}

fn decrypt_rpa_dir(app: &AppHandle, root_path: &Path) {
    let exe_dir = get_current_dir();
    let mut unrpyc_path = exe_dir.join("unrpyc.exe");
    #[cfg(target_os = "linux")]
    {
        unrpyc_path = exe_dir.join("unrpyc.sh");
    }

    let files: Vec<_> = WalkDir::new(root_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "rpyc"))
        .map(|e| e.path().to_owned())
        .collect();

    files.par_iter().for_each(|rpyc_path| {
        println!("Decompiling: {:?}", rpyc_path.file_name().unwrap());
        post_status(
            app,
            format!(
                "Decompiling {}",
                rpyc_path.file_name().unwrap().to_str().unwrap()
            )
            .as_str(),
        );

        let mut cmd = Command::new(&unrpyc_path);
        cmd.arg(rpyc_path);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let status = cmd.status();

        match status {
            Ok(s) if s.success() => {}
            Ok(s) => eprintln!("Failed: {:?} (Exit code: {:?})", rpyc_path, s.code()),
            Err(e) => eprintln!("Error spawning process for {:?}: {}", rpyc_path, e),
        }
    });

    println!("Done!");
}
#[cfg(target_os = "linux")]
fn chmod_x_file(path: &str) {
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    if permissions.mode() & 0o111 == 0 {
        permissions.set_mode(permissions.mode() | 0o111);
        fs::set_permissions(path, permissions).unwrap();
        println!("chmod +x {}", path);
    }
}
#[tauri::command]
async fn launch(app: AppHandle, path: &str, id: &str, renpy: &str) -> Result<(), String> {
    let _ = app.get_window("main").unwrap().minimize();
    let scripts = PathBuf::from(&path).parent().unwrap().join("game");
    let dir = PathBuf::from(&path).parent().unwrap().display().to_string();
    let mut try_admin = false;
    let file_path = PathBuf::from(path);
    let file_name = file_path.file_name().unwrap().to_str().unwrap();
    let mut launch_time = Instant::now();
    let mut error: Option<String> = None;

    println!("{}", path);
    fix_renpy_8(renpy, &scripts).await;
    set_playing(id);

    #[cfg(target_os = "linux")]
    if path.ends_with(".sh") {
        chmod_x_file(path);
        let execs = PathBuf::from(&path).parent().unwrap().join("lib").join("py2-linux-x86_64");
        if is_dir(PathBuf::from(&path).parent().unwrap().join("lib").join("py2-linux-x86_64")).await {
            for entry in WalkDir::new(&execs)
                .skip_hidden(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let file_name = path.file_name().unwrap().to_str().unwrap();
                chmod_x_file(path.to_str().unwrap());
            }
        } else {
            println!("No Execs Found! path={}", &execs.to_str().unwrap());
        }
    }

    let mut launch_result = Command::new(path)
        .current_dir(&dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();


    match launch_result {
        Ok(process) => {
            println!("File Launched Successfully!");
            let output = process.wait_with_output().unwrap();

            if output.status.success() {
                error = Some("exit code: 0".to_string());
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("Command failed with error:\n{}", stderr);
                error = Some(format!("{}", stderr));
            }
        }
        Err(_) => {
            try_admin = true;
        }
    }

    #[cfg(windows)]
    if try_admin {
        app.emit("popup", StringData { text: "Running as normal user failed; re-running as admin. Do not give 'random mods' admin privileges. (3s)" }).expect("Popup Error");
        tokio::time::sleep(Duration::from_millis(3000)).await;
        launch_time = Instant::now();

        launch_result = Command::new("powershell")
            .args([
                "-Command",
                &format!(
                    "Start-Process '{}' -Verb RunAs -WorkingDirectory '{}'",
                    path.replace("'", "''"),
                    dir.replace("'", "''")
                ),
            ])
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn();

        if let Ok(mut process) = launch_result {
            let _ = process.wait();
        }
    }

    #[cfg(target_os = "linux")]
    if try_admin {
        app.emit("popup", StringData { text: "Running as script failed; tring to execute sh through bash. If it still doesnt run, this mod cannot be ran on linux." }).expect("Popup Error");
        tokio::time::sleep(Duration::from_millis(3000)).await;
        launch_time = Instant::now();

        launch_result = Command::new("bash")
            .arg(path)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn();

        if let Ok(mut process) = launch_result {
            let _ = process.wait();
        }
    }

    println!("Time: {}", launch_time.elapsed().as_secs());

    if launch_time.elapsed().as_secs() <= 10 {
        tokio::time::sleep(Duration::from_millis(1000)).await;
        if is_process_running(file_name) {
            println!("File Launched Child Process!");
            loop {
                if !is_process_running(file_name) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(1000)).await;
            }
        }
    }

    if let Some(msg) = error {
        let success = msg.eq("exit code: 0");
        if !success {
            app.track_event(
                "Error",
                Some(json!({
                    "msg": msg,
                    "name": id,
                    "exe": file_name,
                    "renpy": renpy
                })),
            )
            .expect("Failed to send tracking event");
            app.emit(
                "popup",
                StringData {
                    text: format!(
                        "An Error Has Occurred Whilst Launching The Game!\n\n{}",
                        msg
                    )
                    .as_str(),
                },
            )
            .expect("Popup Error");
        }
    }

    if launch_time.elapsed().as_secs() < 30
        && default_rpa(&scripts).await
        && is_file(file_path.clone().parent().unwrap().join("log.txt")).await
    {
        let log_file = file_path.clone().parent().unwrap().join("log.txt");
        let contents = fs::read_to_string(log_file).unwrap();
        if contents.contains("'sayoriTime'") {
            remove_file(PathBuf::from(&scripts).join("scripts.rpa")).unwrap();
            Box::pin(launch(app.clone(), path, id, renpy))
                .await
                .expect("Launch Error");
        }
    }

    discord_rpc::set_activity("In Main Menu");
    app.emit("closed", ReturnData { id }).unwrap();
    app.get_window("main")
        .unwrap()
        .unminimize()
        .expect("Failed To Unminimize");

    app.get_window("main")
        .unwrap()
        .show()
        .expect("Failed to focus");

    app.get_window("main")
        .unwrap()
        .set_focus()
        .expect("Failed to focus");

    Ok(())
}

fn version_f32(s: &str) -> Option<f32> {
    let mut indices = s.char_indices().map(|(i, _)| i);
    let end_index = indices.nth(3).unwrap_or(s.len());
    let sub_string = &s[0..end_index];
    println!("{}", sub_string);
    sub_string.parse::<f32>().ok()
}

fn set_playing(name: &str) {
    discord_rpc::set_activity(&format!("Playing '{}\n' Mod", name));
}
#[tauri::command]
async fn update(app: AppHandle, close: bool) {
    open::that(RELEASES_URL).expect("Open Release URL Failed");
    if close {
        app.exit(404);
    }
}

#[tauri::command]
async fn import_mod(app: AppHandle, path: &str) -> Result<(), String> {
    app.emit(
        "set_bar",
        IntData {
            number: 10,
            number_goal: 0,
        },
    )
    .unwrap();

    let mut logger = simple_logger::SimpleLogger::new(format!("Import_Mod {}", path));
    let config_contents = tokio::fs::read_to_string(get_current_dir().join("DNNconfig.json"))
        .await
        .map_err(|e| e.to_string())?;

    let config_data: ConfigData =
        serde_json::from_str(&config_contents).map_err(|e| e.to_string())?;

    let source_file = PathBuf::from(&path);
    let raw_rpa = path.ends_with(".rpa");
    let source_name = if raw_rpa {
        &format!("Unknown_{}", rng().random_range(0..99999))
    } else {
        source_file
            .file_name()
            .ok_or("Unable to get source file name")?
            .to_str()
            .ok_or("Invalid source file name")?
    };

    let source_name_no_ext = remove_numbered_suffix(
        source_name
            .rsplit_once('.')
            .map(|(name, _ext)| name)
            .unwrap_or(source_name)
            .trim_end_matches(|c: char| c.is_ascii_whitespace()),
    );

    let target_dir_parent = PathBuf::from(&config_data.directory);
    let mut target_dir = target_dir_parent.join(source_name_no_ext);

    if target_dir.exists() {
        let mut extention = 0;
        while target_dir_parent
            .join(format!("{} {}", source_name_no_ext, extention))
            .exists()
        {
            extention += 1;
        }
        target_dir = target_dir_parent.join(format!("{} {}", source_name_no_ext, extention));
    }

    let initial_target_dir = target_dir.clone();

    let mut file = File::open(&source_file).map_err(|e| e.to_string())?;

    let mut zip_archive_opt: Option<ZipArchive<File>> = None;

    logger.log(String::from("Starting Init"));

    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| e.to_string())?;

    logger.log(String::from("I/O Create Dir Finished"));

    post_status(
        &app,
        &format!(
            "Extracting - Duplicating DDLC's Files Into '{}'",
            target_dir.display()
        ),
    );

    app.emit(
        "set_bar",
        IntData {
            number: 40,
            number_goal: 80,
        },
    )
    .unwrap();

    copy_dir_recursive(&get_current_dir().join("store").join("ddlc"), &target_dir).expect("Failed to copy ddlc!");

    logger.log(String::from("I/O Copy DDLC Files Finished"));

    post_status(&app, &format!("Extracting '{}'", source_name_no_ext));

    app.emit(
        "set_bar",
        IntData {
            number: 80,
            number_goal: 95,
        },
    )
    .unwrap();

    if path.ends_with(".rar") {
        if import_game_rar(&source_file) {
            target_dir = target_dir.join("game");
        }
        let _ = extractor::extract_rar_archive(&source_file, &target_dir);
    } else if path.ends_with(".rpa") {
        let file_content = fs::read(&source_file).unwrap();
        fs::write(
            target_dir.join(format!(
                "game/{}",
                &source_file.file_name().unwrap().to_str().unwrap()
            )),
            &file_content,
        )
        .unwrap();
    } else {
        let mut archive = ZipArchive::new(file.try_clone().unwrap()).map_err(|e| e.to_string())?;
        let nest_check = detect_nest_1(Some(&mut archive));
        if import_game_zip(&mut archive, "") {
            target_dir = target_dir.join("game");
        }

        if !target_dir.to_str().unwrap().ends_with("game") && nest_check.clone().is_some() {
            if import_game_zip(&mut archive, &nest_check.clone().unwrap()) {
                target_dir = target_dir.join("game");
            }
            println!("Extract A");
            extractor::extract_zip_archive_without_toplevel(
                &mut ZipArchive::new(&mut file).unwrap(),
                &target_dir,
                &nest_check.unwrap().replace("/", ""),
            )
            .map_err(|e| e.to_string())?;
        } else {
            extractor::extract_zip_archive(&mut archive, &target_dir).map_err(|e| e.to_string())?;
        }

        zip_archive_opt = Some(archive);
    }

    let mut loop_time = 0;

    app.emit(
        "set_bar",
        IntData {
            number: 95,
            number_goal: 0,
        },
    )
    .unwrap();

    loop {
        let mut is_game = false;
        let nested = &detect_nest(
            source_name_no_ext,
            target_dir.to_str().unwrap(),
            zip_archive_opt.as_mut(),
        )
        .await;
        loop_time += 1;
        if nested == "None" {
            break;
        } else {
            println!("Fixing Nested");
            logger.log(String::from("I/O [BAD] Fixing Nested"));

            post_status(
                &app,
                &format!("Fixing Nested Zip File... Try {}", loop_time),
            );
            if !is_game {
                let p = &PathBuf::from(nested);
                for file in p.read_dir().unwrap() {
                    let path = file.unwrap().path();
                    let close_dir = path.to_str().unwrap().replace(&format!("{}{}", nested, std::path::MAIN_SEPARATOR), "");
                    if is_game_folder(&close_dir) && !close_dir.contains(std::path::MAIN_SEPARATOR) {
                        is_game = true;
                        break;
                    }
                }
            }
            if is_game {
                copy_dir_recursive(&PathBuf::from(nested), &target_dir.join("game")).unwrap();
            } else {
                copy_dir_recursive(&PathBuf::from(nested), &target_dir).unwrap();
            }
            remove_dir_all(nested).unwrap();
        }
    }

    if !target_dir.ends_with("game")
        && is_file(PathBuf::from(&target_dir).join("game").join("firstrun")).await
    {
        remove_file(PathBuf::from(&target_dir).join("game").join("firstrun")).unwrap();
    }

    app.emit(
        "set_bar",
        IntData {
            number: 100,
            number_goal: 0,
        },
    )
    .unwrap();
    app.emit(
        "import_done",
        StringData {
            text: PathBuf::from(&initial_target_dir)
                .file_name()
                .expect("Could not get file name")
                .to_str()
                .unwrap(),
        },
    )
    .unwrap();
    logger.finish();
    Ok(())
}

fn post_status(app: &AppHandle, status: &str) {
    app.emit("substring", StringData { text: status })
        .expect("Popup Error");
}

fn remove_numbered_suffix(input: &str) -> &str {
    static RE: OnceLock<Regex> = OnceLock::new();
    let regex = RE.get_or_init(|| Regex::new(r"\s*\(\d+\)$").unwrap());

    if let Some(m) = regex.find(input) {
        &input[..m.start()]
    } else {
        input
    }
}

fn detect_nest_1(zip_archive: Option<&mut ZipArchive<File>>) -> Option<String> {
    let mut newest_found: Option<String> = None;
    let archive = zip_archive.unwrap();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string()).unwrap();
        let name = file.name().to_string();
        if name.contains("/") {
            let newest = if let Some(s) = newest_found.as_ref() {
                s
            } else {
                ""
            };
            let zero = name.split("/").next().unwrap();
            if zero == newest || newest_found.is_none() {
                newest_found = Some(zero.to_string());
            } else {
                newest_found = None;
                break;
            }
        } else if !name.to_lowercase().contains("credit") {
            newest_found = None;
            break;
        }
    }
    newest_found
}
async fn detect_nest(
    string: &str,
    target_dir: &str,
    zip_archive: Option<&mut ZipArchive<File>>,
) -> String {
    let paths = [
        string,
        "-Renpy7Mod",
        "-Renpy8Mod",
        &format!("{}V3", string),
        "-1.0-pc",
        "CupcakeDelivery-1.0.1-pc",
    ];

    if zip_archive.is_some() {
        let newest_found: Option<String> = detect_nest_1(zip_archive);
        if let Some(newest) = newest_found {
            if newest == "game" {
                println!("Invalid Newest: {}", newest)
            } else {
                println!("Newest: {}", newest);
                let candidate = PathBuf::from(target_dir).join(newest);
                let inval = is_dir(candidate.clone()).await;
                if inval {
                    return candidate.as_path().to_str().unwrap().to_string();
                }
            }
        }
    }

    for entry in PathBuf::from(target_dir)
        .read_dir()
        .expect("Failed to read dir")
        .flatten()
    {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let file_name = path.file_name().unwrap().to_str().unwrap();
        for selected in paths {
            println!(
                "Checking: '{}' against '{}' with result '{}'",
                file_name,
                selected,
                file_name.contains(selected)
            );
            if file_name.contains(selected) {
                return path.to_str().unwrap().to_string();
            }
        }
        if file_name.contains(" -") && string == file_name.replace(" -", "") {
            return path.to_str().unwrap().to_string();
        }
    }

    String::from("None")
}

fn import_game_rar(archive_path: &Path) -> bool {
    let mut found = false;
    let mut archive = Archive::new(archive_path.to_str().unwrap())
        .open_for_processing()
        .unwrap();
    while let Some(header) = archive.read_header().unwrap() {
        archive = if header.entry().is_directory() {
            if header
                .entry()
                .filename
                .to_str()
                .expect("Failed To Read File")
                .starts_with("mod_assets")
            {
                found = true;
                break;
            }
            header.skip().expect("Failed to skip header")
        } else if header.entry().is_file() {
            if is_game_folder(header.entry().filename.to_str().unwrap())
                && !header.entry().filename.to_str().unwrap().contains(std::path::MAIN_SEPARATOR)
            {
                found = true;
                break;
            }
            header.skip().expect("Failed to skip header")
        } else {
            header.skip().expect("Failed to skip header")
        };
    }
    found
}

#[tauri::command]
fn goto_main(app: AppHandle) {
    for (label, webview) in app.windows() {
        if label != "main" {
            let _ = webview.destroy();
        }
    }

    app.get_window("main")
        .unwrap()
        .set_focus()
        .expect("Failed to focus");
}

async fn download_file(app: &AppHandle, url: String, save_path: String) -> Result<(), String> {
    let response = reqwest::get(url).await.unwrap();
    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(save_path).await.unwrap();
    let mut stream = response.bytes_stream();
    let mut start = Instant::now();

    let mut downloaded = 0u64;
    let mut last_downloaded = 0u64;

    while let Some(chunk) = stream.try_next().await.unwrap() {
        file.write_all(&chunk).await.unwrap();
        downloaded += chunk.len() as u64;

        if start.elapsed().as_secs() >= 1 {
            app.emit(
                "download_percent",
                StringData {
                    text: &format!(
                        "{:.1}% ({:.1} MB/s)",
                        (downloaded as f64 / total as f64) * 100f64,
                        (downloaded - last_downloaded) as f64
                            / start.elapsed().as_millis().max(1) as f64
                            / 1024f64
                    ),
                },
            )
            .unwrap();
            start = Instant::now();
            last_downloaded = downloaded.clone();
        }
    }

    file.flush().await.unwrap();
    Ok(())
}

#[tauri::command]
async fn open_webview(app: AppHandle, url: &str, name: &str) -> Result<(), String> {
    let script_path = RESOURCES
        .get_file("link_open_redirector.js")
        .expect("Failed to get script path");
    let script = script_path.contents_utf8().unwrap();
    let downloads_dir = get_current_dir()
        .join("store")
        .join("downloads")
        .display()
        .to_string();
    let cache_dir = get_current_dir().join("store").join("cache");

    create_dir_all(&downloads_dir).expect("FS Error: Failed To Create Store/Mods");
    create_dir_all(&cache_dir).expect("FS Error: Failed To Create Store/Cache");

    let _window =
        WebviewWindowBuilder::new(&app.clone(), format!("external-{}_{}",name, SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()), WebviewUrl::External(Url::parse(url).unwrap()))
            .inner_size(1200f64, 600f64)
            .title(name.split("_").collect::<Vec<&str>>().join(" "))
            .initialization_script(script)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
            .on_navigation(move |_| {
                true
            })
            .data_directory(
                cache_dir.clone()
            )
            .on_new_window(move |e, _| {
                if e.domain().unwrap().eq("econventa.com") {
                    return NewWindowResponse::Deny;
                }
                NewWindowResponse::Allow
            })
            .on_download(move |webview, event| {
                match event {
                    DownloadEvent::Requested { url, destination } => {
                        let url = url.to_string();
                        let path = PathBuf::from(downloads_dir.clone()).join(destination.file_name().unwrap());
                        let app = webview.app_handle().clone();

                        tauri::async_runtime::spawn(async move {
                            app.emit("download_start",
                                     StringData {
                                              text: &format!("{} | {}", url, path.to_str().expect("Failed to get path")),
                                          }).unwrap();
                            let _ = download_file(&app, url.clone(), path.to_str().expect("Failed to get path").to_string()).await.unwrap();
                            app.emit("download_end",
                                             StringData {
                                                 text: &format!("{} | {} | {}", url, path.to_str().expect("Failed to get path"), true),
                                             }).unwrap();
                        });

                        false
                    }
                    DownloadEvent::Finished { .. } => {
                        true
                    }
                    _ => false,
                }
            })
            .build()
            .expect("Failed to build webview");
    Ok(())
}

fn is_game_folder(name: &str) -> bool {
    name.ends_with(".rpyc")
        || name.ends_with(".rpa")
        || name.starts_with("mod_assets")
        || name.ends_with(".rpy")
}

#[tauri::command]
fn rename_dir(app: AppHandle, path: &str, new_name: &str, id: &str) {
    let dir = PathBuf::from(path);
    if dir.is_dir() {
        fs::rename(path, new_name).unwrap_or_else(|_| {
            create_dir_all(new_name).unwrap();
            copy_dir_recursive(&dir, &PathBuf::from(new_name)).unwrap();
            remove_dir_all(dir).unwrap_or_else(|_| {
                println!("Failed to remove dir Fully");
            });
        });
    }
    app.emit("rename_done", StringData { text: id }).unwrap();
}

fn import_game_zip(archive: &mut ZipArchive<File>, toppath: &str) -> bool {
    let mut found = false;
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string()).unwrap();
        let mut formatted = file
            .enclosed_name()
            .unwrap()
            .to_str()
            .unwrap()
            .replace(toppath, "");
        if formatted.starts_with("/") {
            formatted.remove(0);
        }
        if is_game_folder(file.name()) && !formatted.contains("/") {
            found = true;
            break;
        }
    }
    found
}

fn get_pool() -> &'static ThreadPool {
    COPY_POOL.get_or_init(|| ThreadPoolBuilder::new().num_threads(8).build().unwrap())
}

pub fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    let mut dirs: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut files: Vec<(PathBuf, PathBuf)> = Vec::new();

    for entry in WalkDir::new(src)
        .skip_hidden(false)
        .parallelism(jwalk::Parallelism::RayonExistingPool {
            pool: std::sync::Arc::new(ThreadPoolBuilder::new().num_threads(8).build().unwrap()),
            busy_timeout: None,
        })
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let src_path = entry.path();
        let dst_path = dst.join(src_path.strip_prefix(src).unwrap());

        if entry.file_type().is_dir() {
            dirs.push((src_path, dst_path));
        } else {
            files.push((src_path, dst_path));
        }
    }

    dirs.sort_unstable_by_key(|(p, _)| p.components().count());

    for (_, dst_dir) in &dirs {
        create_dir_all(dst_dir)?;
    }

    get_pool().install(|| {
        files
            .par_iter()
            .try_for_each(|(src_file, dst_file)| fs::copy(src_file, dst_file).map(|_| ()))
    })
}
#[tauri::command]
async fn set_ddlc_zip(path: &str) -> Result<(), bool> {
    if !is_file(PathBuf::from(path)).await {
        return Err(false);
    }

    if get_file_hash(path).expect("Failed to get Hash") != DDLC_HASH {
        return Err(false);
    }

    create_dir_all(get_current_dir().join("store")).unwrap();

    fs::copy(
        PathBuf::from(path),
        get_current_dir().join("store").join("ddlc.zip")
    )
    .unwrap();

    downloader::extract_folder(
        &get_current_dir().join("store").join("ddlc"),
        &mut File::open(get_current_dir().join("store").join("ddlc.zip")).unwrap(),
    )
    .await;

    Ok(())
}
#[tauri::command]
fn get_host_name() -> String {
    gethostname::gethostname()
        .into_string()
        .unwrap_or_else(|_| "Monika".to_string())
}
#[tauri::command]
async fn update_exe() {
    #[cfg(target_os = "windows")]
    update_windows_binary().await;

    #[cfg(target_os = "linux")]
    update_linux_binary().await;
}

fn command_succeeds(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .output()
        .is_ok_and(|output| output.status.success())
}
#[cfg(target_os = "linux")]
fn detect_install(exe: &Path) -> InstallData {
    if exe.extension().is_some_and(|ext| ext == "AppImage") {
        return InstallData {
            kind: InstallType::Appimage,
            path: Some(exe.to_owned()),
            package: None,
        };
    }

    let exe_string = exe.to_string_lossy();

    if command_succeeds("dpkg-query", &["-S", &exe_string]) {
        return InstallData {
            kind: InstallType::Deb,
            path: None,
            package: Some("dokimodmanager".into()),
        };
    }

    if command_succeeds("rpm", &["-qf", &exe_string]) {
        return InstallData {
            kind: InstallType::Rpm,
            path: None,
            package: Some("dokimodmanager".into()),
        };
    }

    InstallData {
        kind: InstallType::Unknown,
        path: Some(exe.to_owned()),
        package: None,
    }
}
#[cfg(target_os = "linux")]
async fn update_linux_binary() {
    let exe = std::env::current_exe().expect("Failed to get current exe");
    let install_info = detect_install(&exe);
    let script = RESOURCES
        .get_file("update.sh")
        .expect("Failed to get script path");

    let update_script = script.contents_utf8().unwrap();
    let mut update_script_path = File::create(get_current_dir().join("update.sh")).unwrap();
    update_script_path.write_all(update_script.as_bytes()).unwrap();
    chmod_x_file(&get_current_dir().join("update.sh")).unwrap();

    match install_info.kind {
        InstallType::Appimage => {
            let resp = reqwest::get(LATEST_ARTIFACT_LINUX_APP)
                .await
                .expect("Failed to download latest");

            let mut out = File::create("dokimodmanager-new.AppImage").expect("Failed to create file");
            out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
                .unwrap();

            let script2 = RESOURCES
                .get_file("update_app.sh")
                .expect("Failed to get script path");

            let update_script2 = script2.contents_utf8().unwrap();
            let mut update_script_path2 = File::create(get_current_dir().join("update_app.sh")).unwrap();
            update_script_path2.write_all(update_script.as_bytes()).unwrap();
            chmod_x_file(get_current_dir().join("update_app.sh").display().to_string());

            let status = Command::new("pkexec")
                .arg(get_current_dir().join("update_app.sh").display().to_string())
                .status()
                .map_err(|e| e.to_string()).expect("Failed to run command");
        }
        InstallType::Deb => {
            let resp = reqwest::get(LATEST_ARTIFACT_LINUX_DEB)
                .await
                .expect("Failed to download latest");
            let mut out = File::create(get_current_dir().join("dokimodmanager.deb")).expect("Failed to create file");
            out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
                .unwrap();

            let status = Command::new("pkexec")
                .arg(get_current_dir().join("update.sh").display().to_string())
                .arg(get_current_dir().join("dokimodmanager.deb").display().to_string())
                .status()
                .map_err(|e| e.to_string()).expect("Failed to run update script");
        }
        InstallType::Rpm => {
            let resp = reqwest::get(LATEST_ARTIFACT_LINUX_RPM)
                .await
                .expect("Failed to download latest");
            let mut out = File::create(get_current_dir().join("dokimodmanager.rpm")).expect("Failed to create file");
            out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
                .unwrap();
            let status = Command::new("pkexec")
                .arg(get_current_dir().join("update.sh").display().to_string())
                .arg(get_current_dir().join("dokimodmanager.rpm").display().to_string())
                .status()
                .map_err(|e| e.to_string()).expect("Failed to run script");
        }
        InstallType::Unknown => {

        }
    }

    std::process::exit(0);
}
#[cfg(target_os = "windows")]
async fn update_windows_binary() {
    println!("Updating Using {}", LATEST_ARTIFACT);
    let resp = reqwest::get(LATEST_ARTIFACT)
        .await
        .expect("Failed to download latest");

    let mut out = File::create("./dokimodmanager-new.exe").expect("Failed to create file");
    out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
        .unwrap();

    let script = RESOURCES
        .get_file("update.ps1")
        .expect("Failed to get script path");

    let update_script = script.contents_utf8().unwrap();

    println!("{:?}", get_current_dir().display());

    Command::new("powershell")
        .current_dir(get_current_dir())
        .args(["-NoProfile", "-Command", update_script])
        .spawn()
        .expect("failed to launch cmd");
    std::process::exit(0);
}

#[tauri::command]
fn open_path(path: &str) {
    let ppath = Path::new(path);
    if ppath.exists() {
        if ppath.is_dir() {
            opener::open(path).expect("Failed to open path");
        } else {
            opener::reveal(path).expect("Failed to open path");
        }
    }

}

#[tauri::command]
fn tracker(app: AppHandle, event: String, props: Option<serde_json::Value>) {
    track(&app, event, props);
}

fn track(app: &AppHandle, event: String, props: Option<serde_json::Value>) {
    app.track_event(&event, props)
        .expect("Failed to track event");
}

async fn make_config() {
    let default_config_data: ConfigData = ConfigData {
        directory: get_current_dir().display().to_string() + std::path::MAIN_SEPARATOR_STR + "store" + std::path::MAIN_SEPARATOR_STR + "mods",
    };

    let json_data = serde_json::to_string_pretty(&default_config_data).unwrap();
    if fs::metadata(get_current_dir().join("DNNconfig.json")).is_err() {
        let file = File::create(get_current_dir().join("DNNconfig.json"));
        let _ = file.expect("write failure").write_all(json_data.as_bytes());
    }
}

async fn update_unrpyc() {
    let mut rpyc = UN_RPYC;
    #[cfg(target_os = "linux")]
    {
        rpyc = UN_RPYC_LINUX;
    }
    let resp = reqwest::get(rpyc)
        .await
        .expect("Failed to download latest");
    let mut out;
    #[cfg(target_os = "windows")]
    {
        out = File::create(get_current_dir().join("unrpyc.exe")).expect("Failed to create file");
    }
    #[cfg(target_os = "linux")]
    {
        out = File::create(get_current_dir().join("unrpyc.sh")).expect("Failed to create file");
    }
    out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
        .unwrap();
}

pub fn get_current_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        return env::current_dir().expect("Could Not Get Current Directory");
    }
    #[cfg(target_os = "linux")]
    {
        return env::current_dir().expect("Could Not Get Current Directory").join(".dokimodmanager");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub async fn run() {
    create_dir_all(
        get_current_dir()
            .join("store/mods")
            .display()
            .to_string(),
    )
    .expect("FS Error: Failed To Create Store/Mods");
    create_dir_all(
        get_current_dir()
            .join("store/images")
            .display()
            .to_string(),
    )
    .expect("FS Error: Failed To Create Store/Mods");

    #[cfg(target_os = "windows")]
    {
        if !exists("./unrpyc.exe").unwrap()
            || crate::hash::get_file_hash("./unrpyc.exe").expect("Unable to get hash on UNRPYC") != crate::UN_RPYC_HASH
        {
            crate::update_unrpyc().await;
        }
    }

    #[cfg(target_os = "linux")]
    {
        if !exists("./unrpyc.sh").unwrap()
            || get_file_hash("./unrpyc.sh").expect("Unable to get hash on UNRPYC") != UN_RPYC_LINUX_HASH
        {
            update_unrpyc().await;
        }
    }

    std::thread::spawn(move || {
        discord_rpc::start();
    });
    discord_rpc::set_activity("In Main Menu");
    make_config().await;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_fs_pro::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_aptabase::Builder::new("A-US-9509641067").build())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();
            let clone_handle = app.handle().clone();
            let clone_handle2 = app.handle().clone();
            let downloads_dir = get_current_dir().join("store").join("downloads");
            app.track_event("app_started", None).unwrap();
            let _ = window.set_size(Size::Physical(PhysicalSize::new(1200, 600)));
            window.set_size_constraints(WindowSizeConstraints {
                min_width: Some(PixelUnit::Physical(tauri::PhysicalUnit(1200))),
                max_width: Some(PixelUnit::Physical(tauri::PhysicalUnit(1200))),
                min_height: Some(PixelUnit::Physical(tauri::PhysicalUnit(600))),
                max_height: Some(PixelUnit::Physical(tauri::PhysicalUnit(600))),
            }).ok();

            #[cfg(target_os = "windows")]
            apply_acrylic(&window, Some((0, 0, 0, 10)))
                .expect("Unsupported platform! 'apply_blur' is only supported on Windows");

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Unsupported platform! 'apply_blur' is only supported on MacOs");

            #[cfg(target_os = "linux")]
            {
                let _ = window.set_background_color(Some(Color(50,50,50,255)));
            }

            // Track App Closed
            app.get_webview_window("main")
                .unwrap()
                .on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        app_handle
                            .track_event("app_closed", None)
                            .expect("TODO: panic message");
                        std::thread::sleep(Duration::from_millis(100));
                    }
                });

            app.listen("request_download", move |event2| {
                let payload = event2.payload().to_string();
                let value = clone_handle2.clone();

                task::spawn(async move {
                    let data: DownloadRequest = serde_json::from_str(&payload).expect("Failed to read download request");
                    let downloads_dir = get_current_dir()
                        .join("store")
                        .join("downloads");
                    let confirmed = value
                        .dialog()
                        .message(format!("Do you want to download \"{}\"?", data.file_name))
                        .title("Download Request")
                        .buttons(MessageDialogButtons::YesNo)
                        .blocking_show();
                    if confirmed {
                        let _ = download_file(&value, data.url.to_string(), downloads_dir.join(data.file_name).display().to_string()).await;
                    }
                });
            });

            // Track Webview Open
            app.listen("open_webview", move |event| {
                let payload = event.payload().to_string();
                let value = clone_handle.clone();

                task::spawn(async move {
                    let command: WebviewOpen = serde_json::from_str(&payload).expect("Failed");

                    let _ = open_webview(
                        value,
                        command.url,
                        &command.name.replace(" ", "_").to_lowercase(),
                    )
                    .await;
                });
            });

            // Clear Downloads On Start
            if downloads_dir.exists() {
                let _ = remove_dir_all(downloads_dir);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close,
            minimize,
            launch,
            path_select,
            request_path,
            open_path,
            import_mod,
            delete_path,
            rename_dir,
            update,
            set_ddlc_zip,
            update_exe,
            tracker,
            rpa_data,
            extract_game_script,
            get_host_name,
            open_webview,
            goto_main
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
