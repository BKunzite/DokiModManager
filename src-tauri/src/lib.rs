use dirs::{download_dir, home_dir};
use futures_util::TryStreamExt;
use include_dir::{include_dir, Dir};
use jwalk::WalkDir;
use rand::{rng, RngExt};
use rayon::prelude::*;
use rayon::{ThreadPool, ThreadPoolBuilder};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs::{create_dir_all, exists, remove_dir_all, remove_file, File};
#[allow(unused_imports)]
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::{env, fs};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, ProcessesToUpdate, System};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Emitter, Listener, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_fs_pro::{is_dir, is_file};
use tokio::fs::File as TokioFile;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::task;

#[cfg(target_os = "linux")]
use tauri::{PhysicalSize, PixelUnit, WindowSizeConstraints, Size};
#[cfg(target_os = "linux")]
use tauri::webview::Color;
#[cfg(target_os = "linux")]
use tokio::sync::oneshot;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use window_vibrancy::apply_acrylic;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

mod constants;
mod discord_rpc;
mod downloader;
mod hash;
mod simple_logger;
mod unarc_extractor;

use crate::unarc_extractor::*;
use crate::hash::get_file_hash;
use constants::*;
use simple_logger::*;

static RELEASES_URL: &str = "https://github.com/BKunzite/DokiModManager/releases";
static RESOURCES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/resources");
static COPY_POOL: OnceLock<ThreadPool> = OnceLock::new();
static DOWNLOAD_STATE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

#[cfg(target_os = "linux")]
static PENDING_FALLBACKS: OnceLock<Mutex<HashMap<String, oneshot::Sender<()>>>> = OnceLock::new();

#[cfg(target_os = "linux")]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum InstallType {
    Appimage,
    Deb,
    Rpm,
    Unknown,
}

#[cfg(target_os = "linux")]
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

#[derive(Clone, Serialize)]
struct DoubleStringData<'a> {
    text: &'a str,
    text2: &'a str,
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
struct IntData<'a> {
    number: u16,
    number_goal: u16,
    path: &'a str,
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
    push_stamp("Secondary <INIT>");
    let default_config_data: ConfigData = ConfigData {
        directory: get_current_dir().display().to_string()
            + std::path::MAIN_SEPARATOR_STR
            + "store"
            + std::path::MAIN_SEPARATOR_STR
            + "mods",
    };
    let mut contents = String::new();

    stamp("Getting DNNconfig.json");
    if fs::metadata(get_current_dir().join("DNNconfig.json")).is_err() {
        stamp("DNNconfig.json not found!");
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
        stamp("DNNconfig.json found! Loading File.");
        let mut file = TokioFile::open(get_current_dir().join("DNNconfig.json"))
            .await
            .map_err(|e| e.to_string())?;
        file.read_to_string(&mut contents)
            .await
            .map_err(|e| e.to_string())?;
    }
    stamp("Done!");
    stamp("Posting JS (pathRespond) Response");

    let final_data: ConfigData = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    app.emit(
        "pathRespond",
        ReturnPath {
            final_data: &final_data.directory,
            local_path: &get_current_dir().to_string_lossy(),
            path: home_dir().unwrap().join("Downloads").to_str().unwrap(),
            reinstall: false,
        },
    )
    .map_err(|e| e.to_string())?;

    stamp("Done!");
    pop_stamp();
    Ok(())
}

#[tauri::command]
fn delete_path(app_handle: AppHandle, path: &str) {
    match remove_dir_all(path) {
        Ok(_) => stamp(format!("Deleted {}", path).as_str()),
        Err(e) => {
            stamp(format!("Failed to delete {} with error {}", path, e.to_string()).as_str());

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

    let file_size = File::open(&scriptsrpa).unwrap().metadata().unwrap().len();
    push_stamp("Ren'Py 8 Fix");
    stamp(format!("File Size: {}", file_size).as_str());
    if file_size > 280_0000 {
        stamp("Large File Size! Modified scripts.rpa - Fix should not be ran");
        pop_stamp();
        return;
    }
    let version = version_f32(renpy);
    if version.is_none() {
        stamp("Unknown Ren'Py Version! This Should Never Occur!");
        pop_stamp();
        return;
    }
    let versionint = version.unwrap();
    let equal = default_rpa(scripts).await;
    stamp(
        format!(
            "Version: {} ({}f32); Default scripts.rpa?: {};",
            renpy, versionint, equal
        )
        .as_str(),
    );
    if versionint < 8.0 {
        stamp(format!("Ren'Py Version Older Then 8.0 - {}", versionint).as_str());
    } else if !equal {
        stamp("Custom scripts.rpa Detected - Ren'Py 8.0+ - Fix should not be ran");
    } else {
        remove_file(PathBuf::from(&scripts).join("scripts.rpa")).unwrap();
        stamp("[REMOVED] scripts.rpa file removed in order to fix DDLC Mods >= RenPy 8.0");
    }
    pop_stamp();
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
                        .join(format!(
                            "ddmm-temp-options{}{}",
                            std::path::MAIN_SEPARATOR,
                            ""
                        ))
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
    let early_path = path_out.join(format!(
        "ddmm-temp-options{}options.rpy",
        std::path::MAIN_SEPARATOR
    ));
    println!("path - {}", early_path.to_str().unwrap());
    if exists(&early_path).unwrap() {
        println!("Found Options File! (EARLY ESCAPE)");

        return parse_source(&fs::read_to_string(early_path).unwrap(), option).unwrap_or_default();
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
                    .join(format!(
                        "ddmm-temp-options{}{}",
                        std::path::MAIN_SEPARATOR,
                        cmain
                    ))
                    .to_str()
                    .unwrap()
            );
            let mut file = File::create(
                path_out
                    .join(format!(
                        "ddmm-temp-options{}{}",
                        std::path::MAIN_SEPARATOR,
                        cmain
                    ))
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
    #[cfg(any(target_os = "linux", target_os = "macos"))]
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
            .join(format!(
                "ddmm-temp-options{}{}",
                std::path::MAIN_SEPARATOR,
                cmain
            ))
            .as_path()
            .to_str()
            .unwrap(),
    );
    #[cfg(windows)]
    {
        exchild.creation_flags(0x08000000);
    }
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

        let data: PathBuf = if cfg!(target_os = "windows") {
            dirs::config_dir().unwrap().join("RenPy").join(content)
        } else {
            home_dir().unwrap().join(".renpy").join(content)
        };

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
    let unrpyc_path = get_unrpyc_filename();

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
#[cfg(not(target_os = "windows"))]
fn chmod_x_file(path: &str) {
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    if permissions.mode() & 0o111 == 0 {
        permissions.set_mode(permissions.mode() | 0o111);
        fs::set_permissions(path, permissions).unwrap();
        stamp(format!("chmod +x {}", path).as_str());
    }
}

#[cfg(not(target_os = "windows"))]
fn chmod_x_directory(execs: &PathBuf) {
    for entry in WalkDir::new(&execs)
        .skip_hidden(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        chmod_x_file(path.to_str().unwrap());
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

    stamp(format!("Got Command To Launch Binary : {}", path).as_str());
    fix_renpy_8(renpy, &scripts).await;
    set_playing(id);

    #[cfg(target_os = "linux")]
    if path.ends_with(".sh") {
        chmod_x_file(path);

        stamp("\n\nChecking For Executables That Require chmod +x.\n");

        let lib_folder = PathBuf::from(&path)
            .parent()
            .unwrap()
            .join("lib");

        for path in LINUX_DDLC_LIB_PATHS {
            let final_location = lib_folder.join(path);
            if is_dir(
                final_location.clone()
            )
                .await
            {
                stamp(
                    format!(
                        "[+] Executables Found In Path: {}",
                        &final_location.to_str().unwrap(),
                    )
                        .as_str(),
                );
                chmod_x_directory(&final_location);
            } else {
                stamp(
                    format!(
                        "[-] No Executables Found In Path: {}",
                        &final_location.to_str().unwrap(),
                    )
                        .as_str(),
                );
            }
        }
    }
    #[cfg(target_os = "macos")]
    chmod_x_directory(&PathBuf::from(&dir));
    let mut launch_result = if (cfg!(target_os = "linux")) {
        Command::new(path)
            .env_remove("DESKTOPINTEGRATION")
            .env_remove("WEBKIT_DISABLE_DMABUF_RENDERER")
            .env_remove("LD_PRELOAD")
            .current_dir(&dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    } else {
        Command::new(path)
            .current_dir(&dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    };

    match launch_result {
        Ok(process) => {
            stamp("File Launched Successfully!");
            let output = process.wait_with_output().unwrap();

            if output.status.success() {
                error = Some("Exit code: 0 (Success)".to_string());
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                stamp(format!("Command failed with error:\n{}", stderr).as_str());
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
        app.emit("popup", StringData { text: "Running as script failed; trying to execute <file>.sh through bash. If it still doesnt run, this mod cannot be ran on linux." }).expect("Popup Error");
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

    stamp(
        format!(
            "Application Closed! Time: {}",
            launch_time.elapsed().as_secs()
        )
        .as_str(),
    );

    if launch_time.elapsed().as_secs() <= 10 {
        tokio::time::sleep(Duration::from_millis(1000)).await;
        if is_process_running(file_name) {
            stamp("File Launched Child Process!");
            loop {
                if !is_process_running(file_name) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(1000)).await;
            }
        }
    }

    if let Some(msg) = error {
        let success = msg.eq("Exit code: 0 (Success)");
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
            path,
        },
    )
    .unwrap();

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
    let mut logger = SimpleLogger::new(format!(
        "Import_Mod {}",
        source_file
            .parent()
            .unwrap()
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
    ));

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
    let mut is_archive = false;

    logger.log(String::from("Starting Init"));

    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| e.to_string())?;

    logger.log(String::from("I/O Create Dir Finished"));

    post_status(
        &app,
        &format!("Extracting - Cloning DDLC|ppathIdentifier|{}", path),
    );

    app.emit(
        "set_bar",
        IntData {
            number: 40,
            number_goal: 80,
            path,
        },
    )
    .unwrap();

    copy_dir_recursive(&get_current_dir().join("store").join("ddlc"), &target_dir)
        .expect("Failed to copy ddlc!");

    logger.log(String::from("I/O Copy DDLC Files Finished"));

    post_status(
        &app,
        &format!(
            "Extracting '{}'|ppathIdentifier|{}",
            source_name_no_ext, path
        ),
    );

    app.emit(
        "set_bar",
        IntData {
            number: 80,
            number_goal: 95,
            path,
        },
    )
    .unwrap();

    if cfg!(target_os = "macos") {
        let app_contents = target_dir.join("DDLC.app/Contents");
        let regular_contents = app_contents.join("Resources/autorun");
        let macos_contents = app_contents.join("MacOS");
        create_dir_all(&macos_contents).expect("Failed to create temp extract");
        create_dir_all(&regular_contents).expect("Failed to create temp extract");

        if path.ends_with(".rpa") {

        } else {
            let nest_check = detect_nest(&source_file).expect("Failed to get nest");
            let mut is_game = false;

            is_archive = true;

            if is_archive_game_folder(&source_file, "").expect("Failed to get archive game folder") {
                target_dir = target_dir.join("game");
                is_game = true;
            }

            if !is_game && nest_check.clone().is_some() {
                if is_archive_game_folder(&source_file, &nest_check.clone().unwrap())
                    .expect("Failed to get archive game folder")
                {
                    target_dir = target_dir.join("game");
                }
                stamp("Importing Archive Without Toplevel");
                extract_archive_without_tld(&source_file, &regular_contents, &nest_check.unwrap())
                    .map_err(|e| e.to_string())?;
            } else {
                stamp("Importing Archive");
                extract_archive(&source_file, &regular_contents).map_err(|e| e.to_string())?;
            }

            for entry in WalkDir::new(&regular_contents).into_iter().filter_map(|e| e.ok()) {
                if entry.file_name().to_string_lossy().ends_with(".app") {
                    stamp("Found Executable!");
                    stamp(&entry.path().to_string_lossy());
                    let entry_contents = entry.path().join("Contents");
                    if entry_contents.exists() {
                        copy_dir_recursive(&entry_contents, &app_contents).expect("Failed to copy dir");
                        break;
                    }
                }
            }
        }
    } else {
        if path.ends_with(".rpa") {
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
            let nest_check = detect_nest(&source_file).expect("Failed to get nest");
            let mut is_game = false;

            is_archive = true;

            if is_archive_game_folder(&source_file, "").expect("Failed to get archive game folder") {
                target_dir = target_dir.join("game");
                is_game = true;
            }

            if !is_game && nest_check.clone().is_some() {
                if is_archive_game_folder(&source_file, &nest_check.clone().unwrap())
                    .expect("Failed to get archive game folder")
                {
                    target_dir = target_dir.join("game");
                }
                stamp("Importing Archive Without Toplevel");
                extract_archive_without_tld(&source_file, &target_dir, &nest_check.unwrap())
                    .map_err(|e| e.to_string())?;
            } else {
                stamp("Importing Archive");
                extract_archive(&source_file, &target_dir).map_err(|e| e.to_string())?;
            }
        }
    }

    let mut loop_time = 0;

    app.emit(
        "set_bar",
        IntData {
            number: 95,
            number_goal: 0,
            path,
        },
    )
    .unwrap();

    if is_archive && cfg!(not(target_os = "macos")) {
        loop {
            let mut is_game = false;
            let nested = &fallback_legacy_nest_check(
                source_name_no_ext,
                target_dir.to_str().unwrap(),
                &source_file,
            )
            .await;

            loop_time += 1;
            if nested == "None" {
                break;
            } else {
                stamp("Fixing Nested File (This is a fallback and should not occur)");
                logger.log(String::from("I/O [BAD] Fixing Nested"));

                post_status(
                    &app,
                    &format!(
                        "Fixing Nested Zip File... Try {}|ppathIdentifier|{}",
                        loop_time, path
                    ),
                );
                if !is_game {
                    let p = &PathBuf::from(nested);
                    for file in p.read_dir().unwrap() {
                        let path = file.unwrap().path();
                        let close_dir = path
                            .to_str()
                            .unwrap()
                            .replace(&format!("{}{}", nested, std::path::MAIN_SEPARATOR), "");
                        if is_game_folder(&close_dir)
                            && !close_dir.contains(std::path::MAIN_SEPARATOR)
                        {
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
            path,
        },
    )
    .unwrap();
    app.emit(
        "import_done",
        DoubleStringData {
            text: PathBuf::from(&initial_target_dir)
                .file_name()
                .expect("Could not get file name")
                .to_str()
                .unwrap(),
            text2: path,
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

async fn fallback_legacy_nest_check(string: &str, target_dir: &str, zip: &PathBuf) -> String {
    println!(
        "\nRunning Ren'Py Nested Folder Detection Engine -> Path: {} \n",
        string
    );
    push_stamp("Legacy nest Check");

    let paths = [
        string,
        "-Renpy7Mod",
        "-Renpy8Mod",
        &format!("{}V3", string),
        "-1.0-pc",
        "CupcakeDelivery-1.0.1-pc",
    ];

    let newest_found = detect_nest(&zip).expect("Failed to get nest");
    if let Some(newest) = newest_found {
        if newest == "game" {
            stamp(format!("Invalid Newest: {}", newest).as_str())
        } else {
            stamp(format!("Newest: {}", newest).as_str());
            let candidate = PathBuf::from(target_dir).join(newest);
            let inval = is_dir(candidate.clone()).await;
            if inval {
                return candidate.as_path().to_str().unwrap().to_string();
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
            stamp(
                format!(
                    "Checking: '{}' against '{}' with result '{}'",
                    file_name,
                    selected,
                    file_name.contains(selected)
                )
                .as_str(),
            );
            if file_name.contains(selected) {
                return path.to_str().unwrap().to_string();
            }
        }
        if file_name.contains(" -") && string == file_name.replace(" -", "") {
            return path.to_str().unwrap().to_string();
        }
    }

    pop_stamp();
    String::from("None")
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
    let response = reqwest::get(url.clone()).await.unwrap();
    let total = response.content_length().unwrap_or(0);
    let url_clone = url.clone();
    let mut file = tokio::fs::File::create(save_path).await.unwrap();
    let mut stream = response.bytes_stream();
    let mut start = Instant::now();

    let mut downloaded = 0u64;
    let mut last_downloaded = 0u64;

    while let Some(chunk) = stream.try_next().await.unwrap() {
        file.write_all(&chunk).await.unwrap();
        downloaded += chunk.len() as u64;

        if start.elapsed().as_secs() >= 1 {
            let download_percent = (downloaded as f64 / total as f64) * 100f64;
            app.emit(
                "download_percent",
                StringData {
                    text: &format!(
                        "{} | {:.1}% ({:.1} MB/s) | {}",
                        url_clone,
                        download_percent,
                        (downloaded - last_downloaded) as f64
                            / start.elapsed().as_millis().max(1) as f64
                            / 1024f64,
                        download_percent
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

#[cfg(target_os = "linux")]
fn file_name_from_url(url: &Url) -> String {
    url.path_segments()
        .and_then(|segments| segments.filter(|segment| !segment.is_empty()).last())
        .unwrap_or("download")
        .to_owned()
}

#[cfg(target_os = "linux")]
fn is_archive_url(url: &Url) -> bool {
    url.path().rsplit_once('.').is_some_and(|(_, extension)| {
        matches!(extension.to_ascii_lowercase().as_str(), "zip" | "rar")
    })
}

async fn run_download(app: AppHandle, url: String, path: PathBuf) {
    let path_string = path.to_string_lossy().into_owned();

    stamp(format!("Downloading: {}", url).as_str());

    app.emit(
        "download_start",
        StringData {
            text: &format!("{} | {}", url, path_string),
        },
    )
    .unwrap();

    let _ = download_file(&app, url.clone(), path_string.clone()).await;

    app.emit(
        "download_end",
        StringData {
            text: &format!("{} | {} | {}", url, path_string, true),
        },
    )
    .unwrap();
}
fn download_state() -> &'static Mutex<HashMap<String, bool>> {
    DOWNLOAD_STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(target_os = "linux")]
fn pending_fallbacks() -> &'static Mutex<HashMap<String, oneshot::Sender<()>>> {
    PENDING_FALLBACKS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
async fn open_webview(app: AppHandle, url: &str, name: &str) -> Result<(), String> {
    let external_url = Url::parse(url).map_err(|error| error.to_string())?;

    let script = RESOURCES
        .get_file("link_open_redirector.js")
        .and_then(|file| file.contents_utf8())
        .ok_or_else(|| "Failed to load link_open_redirector.js".to_string())?;

    let store_dir = get_current_dir().join("store");
    let downloads_dir = store_dir.join("downloads");
    let cache_dir = store_dir.join("cache");

    create_dir_all(&downloads_dir)
        .map_err(|error| format!("Failed to create downloads directory: {error}"))?;

    create_dir_all(&cache_dir)
        .map_err(|error| format!("Failed to create cache directory: {error}"))?;

    let navigation_app = app.clone();
    let downloads_app = app.clone();
    let navigation_downloads_dir = downloads_dir.clone();
    let download_downloads_dir = downloads_dir.clone();

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();

    let window_label = format!("external-{}_{}", name, timestamp);

    WebviewWindowBuilder::new(&app, window_label, WebviewUrl::External(external_url))
        .inner_size(1200.0, 600.0)
        .title(name.replace('_', " "))
        .initialization_script(script)
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/146.0.0.0 Safari/537.36",
        )
        .on_navigation(move |navigation_url| {
            // println!("Navigation received: {navigation_url}");
            if navigation_url.domain() == Some("econventa.com") {
                return false;
            }

            #[cfg(target_os = "linux")]
            {
                if is_archive_url(navigation_url) {
                    let url = navigation_url.to_string();
                    let app = navigation_app.clone();

                    if url.starts_with("blob") {
                        let confirmed = app
                            .dialog()
                            .message(
                                "Mega.NZ downloads are not natively supported, running fallback"
                                    .to_string(),
                            )
                            .title("Download Request")
                            .buttons(MessageDialogButtons::Ok)
                            .blocking_show();
                        return true;
                    }

                    let already_downloading = download_state()
                        .lock()
                        .expect("download_state mutex poisoned")
                        .get(&url)
                        .copied()
                        .unwrap_or(false);

                    if already_downloading {
                        println!("Fallback not scheduled; already downloading: {url}");
                        return true;
                    }

                    let file_name = file_name_from_url(navigation_url);
                    let downloads_dir = navigation_downloads_dir.clone();

                    let (cancel_sender, mut cancel_receiver) = oneshot::channel::<()>();

                    {
                        let mut fallbacks = pending_fallbacks()
                            .lock()
                            .expect("pending_fallbacks mutex poisoned");

                        if let Some(previous_sender) = fallbacks.insert(url.clone(), cancel_sender)
                        {
                            let _ = previous_sender.send(());
                        }
                    }

                    println!("Fallback scheduled: {url}");

                    let fallback_url = url.clone();

                    tauri::async_runtime::spawn(async move {
                        tokio::select! {
                            _ = &mut cancel_receiver => {
                                println!("Fallback cancelled: {fallback_url}");
                            }

                            _ = tokio::time::sleep(Duration::from_secs(10)) => {
                                pending_fallbacks()
                                    .lock()
                                    .expect("pending_fallbacks mutex poisoned")
                                    .remove(&fallback_url);

                                let already_downloading = download_state()
                                    .lock()
                                    .expect("download_state mutex poisoned")
                                    .get(&fallback_url)
                                    .copied()
                                    .unwrap_or(false);

                                if already_downloading {
                                    println!("Fallback skipped after timer: {fallback_url}");
                                    return;
                                }

                                download_state()
                                    .lock()
                                    .expect("download_state mutex poisoned")
                                    .insert(fallback_url.clone(), true);

                                println!("Fallback downloading: {fallback_url}");

                                let path = downloads_dir.join(file_name);

                                run_download(app, fallback_url, path).await;
                            }
                        }
                    });
                }
            }

            true
        })
        .data_directory(cache_dir)
        .on_new_window(move |event, _| {
            if event.domain() == Some("econventa.com") {
                NewWindowResponse::Deny
            } else {
                NewWindowResponse::Allow
            }
        })
        .on_download(move |webview, event| match event {
            DownloadEvent::Requested { url, destination } => {
                let url = url.to_string();

                if url.starts_with("blob") {
                    let confirmed = downloads_app
                        .dialog()
                        .message(
                            "Mega.NZ downloads are not natively supported, running fallback"
                                .to_string(),
                        )
                        .title("Download Request")
                        .buttons(MessageDialogButtons::Ok)
                        .blocking_show();
                    *destination = download_dir().unwrap();
                    return true;
                }

                download_state()
                    .lock()
                    .expect("download_state mutex poisoned")
                    .insert(url.clone(), true);

                #[cfg(target_os = "linux")]
                {
                    match pending_fallbacks()
                        .lock()
                        .expect("pending_fallbacks mutex poisoned")
                        .remove(&url)
                    { Some(cancel_sender) => {
                        let _ = cancel_sender.send(());
                        println!("Fallback cancellation sent: {url}");
                    } _ => {
                        println!("No pending fallback to cancel: {url}");
                    }}
                }

                let app = webview.app_handle().clone();

                let file_name = destination
                    .file_name()
                    .unwrap_or_else(|| OsStr::new("download"));

                let path = download_downloads_dir.join(file_name);

                tauri::async_runtime::spawn(async move {
                    run_download(app, url, path).await;
                });

                false
            }

            DownloadEvent::Finished { .. } => true,

            _ => false,
        })
        .build()
        .map_err(|error| error.to_string())?;

    Ok(())
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
async fn set_ddlc_zip(app_handle: AppHandle, path: &str) -> Result<(), bool> {
    if !is_file(PathBuf::from(path)).await {
        stamp("Failed to find zip file");
        return Err(false);
    }

    if get_file_hash(path).expect("Failed to get Hash") != DDLC_HASH {
        stamp("Invalid DDLC Zip");
        app_handle
            .emit(
                "popup",
                StringData {
                    text: "Invalid DDLC Zip Checksum - Re-download the zip from ddlc.moe!",
                },
            )
            .expect("Popup Error");
        return Err(false);
    }

    create_dir_all(get_current_dir().join("store")).unwrap();
    match fs::copy(
        PathBuf::from(path),
        get_current_dir().join("store").join("ddlc.zip"),
    ) {
        Ok(_) => {
            stamp("DDLC Zip Copied");
        }
        Err(error) => {
            app_handle
                .emit(
                    "popup",
                    StringData {
                        text: format!("Failed to copy file: {}", error.to_string()).as_str(),
                    },
                )
                .expect("Popup Error");
            return Err(false);
        }
    };

    downloader::extract_folder(
        &get_current_dir().join("store").join("ddlc"),
        &get_current_dir().join("store").join("ddlc.zip"),
    )
    .await;

    stamp("DDLC Zip Extracted");

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

#[cfg(target_os = "linux")]
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
    if exists(get_current_dir().join("update.sh")).unwrap() {
        remove_file(get_current_dir().join("update.sh")).unwrap();
    }

    let mut update_script_path = File::create(get_current_dir().join("update.sh")).unwrap();
    update_script_path
        .write_all(update_script.as_bytes())
        .unwrap();
    chmod_x_file(
        get_current_dir()
            .join("update.sh")
            .display()
            .to_string()
            .as_str(),
    );

    match install_info.kind {
        InstallType::Appimage => {
            println!("Updating DokimodManager - AppImage");
            let resp = reqwest::get(LATEST_ARTIFACT_LINUX_APP)
                .await
                .expect("Failed to download latest");
            if exists(get_current_dir().join("dokimodmanager-new.AppImage")).unwrap() {
                remove_file(get_current_dir().join("dokimodmanager-new.AppImage")).unwrap();
            }
            let mut out =
                File::create("dokimodmanager-new.AppImage").expect("Failed to create file");
            out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
                .unwrap();

            let script2 = RESOURCES
                .get_file("update_app.sh")
                .expect("Failed to get script path");

            let update_script2 = script2.contents_utf8().unwrap();
            if exists(get_current_dir().join("update_app.sh")).unwrap() {
                remove_file(get_current_dir().join("update_app.sh")).unwrap();
            }
            let mut update_script_path2 =
                File::create(get_current_dir().join("update_app.sh")).unwrap();
            update_script_path2
                .write_all(update_script2.as_bytes())
                .unwrap();
            run_solo_proc_linux(
                get_current_dir()
                    .join("update_app.sh")
                    .display()
                    .to_string(),
            );
        }
        InstallType::Deb => {
            println!("Updating DokimodManager - Debian");
            let resp = reqwest::get(LATEST_ARTIFACT_LINUX_DEB)
                .await
                .expect("Failed to download latest");
            if exists(get_current_dir().join("dokimodmanager.deb")).unwrap() {
                remove_file(get_current_dir().join("dokimodmanager.deb")).unwrap();
            }
            let mut out = File::create(get_current_dir().join("dokimodmanager.deb"))
                .expect("Failed to create file");
            out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
                .unwrap();

            run_proc_linux(
                get_current_dir().join("update.sh").display().to_string(),
                get_current_dir()
                    .join("dokimodmanager.deb")
                    .display()
                    .to_string(),
            );
        }
        InstallType::Rpm => {
            println!("Updating DokimodManager - RPM");
            let resp = reqwest::get(LATEST_ARTIFACT_LINUX_RPM)
                .await
                .expect("Failed to download latest");
            if exists(get_current_dir().join("dokimodmanager.rpm")).unwrap() {
                remove_file(get_current_dir().join("dokimodmanager.rpm")).unwrap();
            }
            let mut out = File::create(get_current_dir().join("dokimodmanager.rpm"))
                .expect("Failed to create file");
            out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
                .unwrap();
            run_proc_linux(
                get_current_dir().join("update.sh").display().to_string(),
                get_current_dir()
                    .join("dokimodmanager.rpm")
                    .display()
                    .to_string(),
            );
        }
        InstallType::Unknown => {
            println!("Unknown Install Type");
            open::that(RELEASES_URL).unwrap();
        }
    }

    std::process::exit(0);
}
#[cfg(target_os = "linux")]
fn run_proc_linux(executor: String, path: String) {
    let _ = Command::new("setsid")
        .arg("--fork")
        .arg("x-terminal-emulator")
        .arg("-e")
        .arg(executor)
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())
        .expect("Failed to run script");
}

#[cfg(target_os = "linux")]
fn run_solo_proc_linux(executor: String) {
    let _ = Command::new("setsid")
        .arg("--fork")
        .arg("x-terminal-emulator")
        .arg("-e")
        .arg(executor)
        .spawn()
        .map_err(|e| e.to_string())
        .expect("Failed to run script");
}
#[cfg(target_os = "windows")]
async fn update_windows_binary() {
    println!("Updating Using {}", LATEST_ARTIFACT_WINDOWS);
    let resp = reqwest::get(LATEST_ARTIFACT_WINDOWS)
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

#[tauri::command]
fn sync_log(msgs: Vec<&str>) {
    let len = msgs.len();
    for msg_id in 0..len {
        stamp(format!("(JS) {}", msgs[msg_id]).as_str());
    }
}

fn track(app: &AppHandle, event: String, props: Option<serde_json::Value>) {
    app.track_event(&event, props)
        .expect("Failed to track event");
}

async fn make_config() {
    let default_config_data: ConfigData = ConfigData {
        directory: get_current_dir().display().to_string()
            + std::path::MAIN_SEPARATOR_STR
            + "store"
            + std::path::MAIN_SEPARATOR_STR
            + "mods",
    };

    let json_data = serde_json::to_string_pretty(&default_config_data).unwrap();
    if fs::metadata(get_current_dir().join("DNNconfig.json")).is_err() {
        let file = File::create(get_current_dir().join("DNNconfig.json"));
        let _ = file.expect("write failure").write_all(json_data.as_bytes());
    }
}

async fn update_unrpyc() {
    push_stamp("UnRPYC Update");
    let rpyc = UN_RPYC;
    let resp = reqwest::get(rpyc).await.expect("Failed to download latest");
    let path = if cfg!(target_os = "windows") {
        get_current_dir().join("unrpyc.exe")
    } else {
        get_current_dir().join("unrpyc.sh")
    };

    let mut out = File::create(&path).expect("Failed to create file");

    stamp(
        format!(
            "Writing Bytes To: {}",
            &path.to_str().expect("Failed to convert path to string")
        )
        .as_str(),
    );

    out.write_all(&resp.bytes().await.expect("Failed to write bytes"))
        .unwrap();

    #[cfg(target_os = "linux")]
    chmod_x_file(&get_current_dir().join("unrpyc.sh").display().to_string());

    pop_stamp();
}

pub fn get_current_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        env::current_dir().expect("Could Not Get Current Directory")
    } else {
        env::current_dir()
            .expect("Could Not Get Current Directory")
            .join(".dokimodmanager")
    }
}

pub fn get_unrpyc_filename() -> String {
    if cfg!(target_os = "linux") {
        String::from("unrpyc.sh")
    } else {
        String::from("unrpyc.exe")
    }
}

async fn stamp_system_info() {
    stamp("====================== HARDWARE SPECS ======================");

    stamp("- OS Info -");
    stamp(format!("{}", os_info::get()).as_str());

    let mut system = System::new();
    tokio::time::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL).await;

    system.refresh_memory_specifics(MemoryRefreshKind::everything());
    system.refresh_cpu_specifics(CpuRefreshKind::everything());

    stamp("- CPU Info -");

    for cpu in system.cpus() {
        stamp("");
        stamp(format!("    CPU - {}", cpu.name()).as_str());
        stamp(format!("    Brand - {}", cpu.brand()).as_str());
        stamp(format!("    Freq - {:.2} Ghz", cpu.frequency() as f32 / 1000f32).as_str());
        stamp(format!("    VendorID - {}", cpu.vendor_id()).as_str());
    }

    stamp("");
    stamp("- RAM Info -");

    let bytes_to_gb = 1f32/1024f32/1024f32/1024f32;

    stamp(format!("    Physical Ram Size - {:.2} GB", system.total_memory() as f32 * bytes_to_gb).as_str());
    stamp(format!("    Swap Ram Size - {:.2} GB", system.total_swap() as f32 * bytes_to_gb).as_str());
    stamp(format!("    Used Physical Ram Size - {:.2} GB", system.used_memory() as f32 * bytes_to_gb).as_str());
    stamp(format!("    Used Swap Ram Size - {:.2} GB", system.used_swap() as f32 * bytes_to_gb).as_str());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub async fn run() {
    setup_logs();
    push_stamp("<INIT>");

    stamp("Starting Doki Doki Mod Manager");
    stamp_system_info().await;

    push_stamp("CREATE_STORE");
    create_dir_all(get_current_dir().join("store/mods").display().to_string())
        .expect("FS Error: Failed To Create Store/Mods");
    create_dir_all(get_current_dir().join("store/images").display().to_string())
        .expect("FS Error: Failed To Create Store/Mods");
    pop_stamp();

    let exec_name = get_unrpyc_filename();

    push_stamp("UnRPYC Hash");
    if !exists(get_current_dir().join(&exec_name)).unwrap()
        || get_file_hash(&get_current_dir().join(&exec_name).display().to_string())
            .expect("Unable to get hash on UNRPYC")
            != UN_RPYC_HASH
    {
        stamp("UnRPYC Update Required");
        update_unrpyc().await;
    } else {
        stamp("UnRPYC - UnRPYC Up To Date!");
    }
    pop_stamp();

    std::thread::spawn(move || {
        discord_rpc::start();
    });

    discord_rpc::set_activity("In Main Menu");

    make_config().await;
    pop_stamp();

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
            #[cfg(target_os = "linux")]
            {
                let _ = window.set_size(Size::Physical(PhysicalSize::new(1200, 600)));
                window
                    .set_size_constraints(WindowSizeConstraints {
                        min_width: Some(PixelUnit::Physical(tauri::PhysicalUnit(1200))),
                        max_width: Some(PixelUnit::Physical(tauri::PhysicalUnit(1200))),
                        min_height: Some(PixelUnit::Physical(tauri::PhysicalUnit(600))),
                        max_height: Some(PixelUnit::Physical(tauri::PhysicalUnit(600))),
                    })
                    .ok();
            }

            #[cfg(target_os = "windows")]
            apply_acrylic(&window, Some((0, 0, 0, 10)))
                .expect("Unsupported platform! 'apply_blur' is only supported on Windows");

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Unsupported platform! 'apply_blur' is only supported on MacOs");

            #[cfg(target_os = "linux")]
            {
                let _ = window.set_background_color(Some(Color(50, 50, 50, 255)));
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
                    let data: DownloadRequest =
                        serde_json::from_str(&payload).expect("Failed to read download request");
                    let downloads_dir = get_current_dir().join("store").join("downloads");
                    let confirmed = value
                        .dialog()
                        .message(format!("Do you want to download \"{}\"?", data.file_name))
                        .title("Download Request")
                        .buttons(MessageDialogButtons::YesNo)
                        .blocking_show();
                    if confirmed {
                        let _ = download_file(
                            &value,
                            data.url.to_string(),
                            downloads_dir.join(data.file_name).display().to_string(),
                        )
                        .await;
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

            if downloads_dir.exists() {
                stamp("Clearing Downloads Folder");
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
            goto_main,
            sync_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
