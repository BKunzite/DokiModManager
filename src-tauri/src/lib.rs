use std::{env, fs};
use std::env::{home_dir};
use std::fs::{create_dir_all, remove_dir_all, remove_file, File};
use std::io::{Write};
use std::os::windows::fs::MetadataExt;
use std::process::{Command, Stdio};
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter, Manager};
use window_vibrancy::{apply_acrylic};
use tokio::fs::{File as TokioFile};
use tokio::io::{AsyncWriteExt, AsyncReadExt};
use std::path::{PathBuf};
use std::time::{Duration, Instant};
use rand::{thread_rng, Rng};
use tauri_plugin_fs_pro::{is_dir, is_file};
use unrar::Archive;
use zip::ZipArchive;
use sysinfo::{ProcessesToUpdate, System};
use regex::Regex;
use reqwest::get;
use serde_json::json;
use crate::hash::get_file_hash;
use tauri_plugin_aptabase::EventTracker;
static SCRIPTSRPA_HASH: &str = "da7ba6d3cf9ec1ae666ec29ae07995a65d24cca400cd266e470deb55e03a51d4";
static DDLC_HASH: &str = "2a3dd7969a06729a32ace0a6ece5f2327e29bdf460b8b39e6a8b0875e545632e";
static RELEASES_URL: &str = "https://github.com/BKunzite/DokiModManager/releases";
static LATEST_ARTIFACT: &str = "https://github.com/BKunzite/DokiModManager/raw/refs/heads/main/BUILD_LATEST_ARTIFACT/dokimodmanager.exe";
#[tauri::command]
 fn close(window: tauri::Window) {
    let _ = window.close();
}
#[tauri::command]
 fn minimize(window: tauri::Window) {
    println!("Key Passed");
    let _ = window.minimize();
}
#[derive(Serialize, Deserialize)]
struct ConfigData {
    directory: String,
}
#[derive(Clone, Serialize)]
struct ReturnData<'a> {
    id: &'a str
}

#[derive(Clone, Serialize)]
struct StringData<'a> {
    text: &'a str
}

#[derive(Clone, Serialize)]
struct ReturnPath<'a> {
    final_data: &'a str,
    path: &'a str,
    local_path: &'a str,
    reinstall: bool
}

#[tauri::command]
async fn path_select(path: &str) -> Result<(), String> {
    let default_config_data: ConfigData = ConfigData {
        directory: path.to_string(),
    };
    let json_data = serde_json::to_string_pretty(&default_config_data)
        .map_err(|e| e.to_string())?;
    
    let mut file = TokioFile::create("DNNconfig.json")
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
        directory: env::current_dir().unwrap().display().to_string() + "\\store\\mods",
    };
    let mut contents = String::new();
    
    if !fs::metadata("DNNconfig.json").is_ok() {
        let json_data = serde_json::to_string_pretty(&default_config_data)
            .map_err(|e| e.to_string())?;
        let mut file = TokioFile::create("DNNconfig.json")
            .await
            .map_err(|e| e.to_string())?;
        file.write_all(json_data.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        contents = json_data;
    } else {
        let mut file = TokioFile::open("DNNconfig.json")
            .await
            .map_err(|e| e.to_string())?;
        file.read_to_string(&mut contents)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    let final_data: ConfigData = serde_json::from_str(&contents)
        .map_err(|e| e.to_string())?;
    app.emit("pathRespond", ReturnPath { final_data: &final_data.directory, local_path: &*env::current_dir().unwrap().to_string_lossy(), path: home_dir().unwrap().join("Downloads").to_str().unwrap(), reinstall: false})
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_path(app_handle: AppHandle, path: &str) {

    match remove_dir_all(path) {
        Ok(_) => println!("Deleted"),
        Err(e) => {
            println!("Failed to delete");

            app_handle.emit("popup", StringData { text: format!("Failed to delete: {}",e.to_string()).as_str() }).expect("Popup Error");
        },
    }

}
fn is_process_running(search_name: &str) -> bool {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    let search_name_lower = search_name.to_lowercase();
    system.processes().iter().any(|(_, process)| {
        let process_name = process.name().to_string_lossy().to_lowercase();
        process_name.contains(&search_name_lower) ||
            process_name.starts_with(&search_name_lower) ||
            process_name.ends_with(&search_name_lower)
    })
}

async fn default_rpa(scripts: &PathBuf) -> bool {
    let scriptsrpa = PathBuf::from(&scripts).join("scripts.rpa");
    if !is_file(scriptsrpa.clone()).await {
        return false;
    }
    let hash = get_file_hash(scriptsrpa.to_str().unwrap()).unwrap();
    hash == SCRIPTSRPA_HASH
}

async fn fix_renpy_8(renpy: &str, scripts: &PathBuf) {
    let scriptsrpa = PathBuf::from(&scripts).join("scripts.rpa");
    if !is_file(scriptsrpa.clone()).await {return}
    let file_size = File::open(&scriptsrpa).unwrap().metadata().unwrap().file_size();
    println!("File Size: {}", file_size );
    if file_size > 280_0000 {return}
    let version = version_f32(renpy);
    if version.is_none() {return}
    let versionint = version.unwrap();
    let equal = default_rpa(&scripts).await;
    println!("Version: {} ({}f32); Equal: {};", renpy, versionint, equal);
    if versionint >= 8.0 && equal {
        remove_file(PathBuf::from(&scripts).join("scripts.rpa")).unwrap();
        println!("[REMOVED] scripts.rpa file removed in order to fix DDLC Mods >= RenPy 8.0");
    }
}

#[tauri::command]
async fn launch(app: AppHandle, path: &str, id: &str, renpy: &str) -> Result<(), String> {
    let _ = app.get_window("main").unwrap().minimize();
    let scripts = PathBuf::from(&path)
        .parent()
        .unwrap()
        .join("game");

    let dir = PathBuf::from(&path)
        .parent()
        .unwrap()
        .display()
        .to_string();

    println!("{}", path);
    fix_renpy_8(&renpy, &scripts).await;
    set_playing(id);

    let mut launch_result = Command::new(path)
        .current_dir(&dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut try_admin = false;
    let file_path = PathBuf::from(path);
    let file_name = file_path.file_name().unwrap().to_str().unwrap();
    let mut launch_time = Instant::now();
    let mut error: Option<String> = None;
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

    if try_admin {
        app.emit("popup", StringData { text: "Running as normal user failed; re-running as admin. Do not give 'random mods' admin privileges. (3s)"}).expect("Popup Error");
        tokio::time::sleep(Duration::from_millis(3000)).await;
        launch_time = Instant::now();

        launch_result = Command::new("powershell")
            .args([
                "-Command",
                &format!(
                    "Start-Process '{}' -Verb RunAs -WorkingDirectory '{}'",
                    path.replace("'", "''"),
                    dir.replace("'", "''")
                )
            ])

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
        // println!("{}", is_process_running(file_name));
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

    if error.is_some() {
        let msg = error.unwrap();
        let success = msg.eq("exit code: 0");
        if !success {
            app.track_event("Error", Some(json!({
                "msg": msg,
                "name": id,
                "exe": file_name,
                "renpy": renpy
            }))).expect("Failed to send tracking event");
            app.emit("popup", StringData { text: format!("An Error Has Occurred Whilst Launching The Game!\n\n{}", msg).as_str() }).expect("Popup Error");

        }
    }

    if launch_time.elapsed().as_secs() < 30 && default_rpa(&scripts).await && is_file(
        file_path.clone().parent()
        .unwrap()
        .join("log.txt")
    ).await {
        let log_file = file_path.clone().parent().unwrap().join("log.txt");
        let contents =  fs::read_to_string(log_file).unwrap();
        if contents.contains("'sayoriTime'") {
            remove_file(PathBuf::from(&scripts).join("scripts.rpa")).unwrap();
            Box::pin(launch(app.clone(), path, id, renpy)).await.expect("Launch Error");
        }
    }

    discord_rpc::set_activity("In Main Menu");
    app.emit("closed", ReturnData { id }).unwrap();
    app.get_window("main").unwrap().unminimize().expect("Failed To Unminimize");
    app.get_window("main").unwrap().set_focus().expect("Failed to lose focus");

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
    discord_rpc::set_activity(&format!(
        "Playing '{}\n' Mod",
        name
    ));
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
    let config_contents = tokio::fs::read_to_string("DNNconfig.json")
        .await
        .map_err(|e| e.to_string())?;
    
    let config_data: ConfigData = serde_json::from_str(&config_contents)
        .map_err(|e| e.to_string())?;
    
    let source_file = PathBuf::from(&path);
    let raw_rpa = path.ends_with(".rpa");
    let source_name = if raw_rpa {
        &format!("Unknown_{}", thread_rng().gen_range(0..99999).to_string())
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
            .trim_end_matches(|c: char| c.is_ascii_whitespace())
    );

    let mut target_dir = PathBuf::from(&config_data.directory).join(source_name_no_ext);

    let mut file = File::open(&source_file)
        .map_err(|e| e.to_string())?;

    let mut zip_archive_opt: Option<ZipArchive<File>> = None;

    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| e.to_string())?;

    post_status(&app, &format!("Duplicating DDLC's Files Into '{}'",target_dir.display()));

    let _ = copy_dir_recursive(&PathBuf::from("./store/ddlc"), &target_dir).expect("Failed to copy ddlc!");

    post_status(&app, &format!("Extracting '{}'",source_name_no_ext));

    if path.ends_with(".rar") {
        if import_game_rar(&source_file) {
            target_dir = target_dir.join("game");
        }
        let _ = extractor::extract_rar_archive(&source_file, &target_dir);
    } else if path.ends_with(".rpa") {
        let file_content = fs::read(&source_file).unwrap();
        fs::write(
            &target_dir.join(format!("game/{}", &source_file.file_name().unwrap().to_str().unwrap())),
            &file_content
        ).unwrap();
    } else {

        let mut archive = ZipArchive::new(file.try_clone().unwrap())
            .map_err(|e| e.to_string())?;
        let nest_check = detect_nest_1(Some(&mut archive));
        if import_game_zip(&mut archive, "") {
            target_dir = target_dir.join("game");
        }

        if !target_dir.to_str().unwrap().ends_with("game") && nest_check.clone().is_some() {
            if import_game_zip(&mut archive, &*nest_check.clone().unwrap()) {
                target_dir = target_dir.join("game");
            }
            println!("Extract A");
            let _ = extractor::extract_zip_archive_without_toplevel(&mut ZipArchive::new(&mut file).unwrap(), &target_dir, &nest_check.unwrap().replace("/",""))
                .map_err(|e| e.to_string())?;
        } else {
            let _ = extractor::extract_zip_archive(&mut archive, &target_dir)
                .map_err(|e| e.to_string())?;
        }

        zip_archive_opt = Some(archive);
    }

    let mut loop_time = 0;

    loop {
        let mut is_game = false;
        let nested = &detect_nest(source_name_no_ext, &target_dir.to_str().unwrap(), zip_archive_opt.as_mut()).await;
        loop_time += 1;
        if nested == "None"  {
            break;
        } else {
            println!("Fixing Nested");
            post_status(&app, &format!("Fixing Nested Zip File... Try {}", loop_time));
            if !is_game {
                let p = &PathBuf::from(nested);
                for file in p.read_dir().unwrap() {
                    let path = file.unwrap().path();
                    let close_dir = path.to_str().unwrap().replace(&format!("{}\\",nested), "");
                    if is_game_folder(&close_dir) && !close_dir.contains("\\") {
                        is_game = true;
                        break;
                    }
                }
            }
            if is_game {
                let _ = copy_dir_recursive(&PathBuf::from(nested),&target_dir.join("game"));
            } else {
                let _ = copy_dir_recursive(&PathBuf::from(nested),&target_dir);
            }
            remove_dir_all(nested).unwrap();
        }
    }
    if is_file(PathBuf::from(&target_dir).join("game/firstrun")).await {
        remove_file(PathBuf::from(&target_dir).join("game/firstrun")).unwrap();
    }

    app.emit("import_done",StringData { text: &format!("{}",source_name_no_ext) }).unwrap();

    Ok(())
}

fn post_status(app: &AppHandle,status: &str) {
    app.emit("substring", StringData { text: status }).expect("Popup Error");
}

fn remove_numbered_suffix(input: &str) -> &str {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
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
        let file = archive.by_index(i)
            .map_err(|e| e.to_string()).unwrap();
        let name = file.name().to_string();
        if name.contains("/") {
            let newest = if let Some(s) = newest_found.as_ref() {
                s
            } else {
                ""
            };
            let zero = name.split("/").next().unwrap();
            if format!("{}",zero) == format!("{}",newest) || newest_found.is_none() {
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
async fn detect_nest(string: &str, target_dir: &str,   zip_archive: Option<&mut ZipArchive<File>>) -> String {
    let paths = [
        string,
        &"-Renpy7Mod".to_string(),
        &"-Renpy8Mod".to_string(),
        &format!("{}V3", string),
        &"-1.0-pc".to_string(),
        "CupcakeDelivery-1.0.1-pc"
    ];

    if zip_archive.is_some() {
        let newest_found: Option<String> = detect_nest_1(zip_archive);

        if newest_found.is_some() {
            let newest = newest_found.unwrap();
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

    for dir in PathBuf::from(target_dir).read_dir().expect("Failed to read dir") {
        if let Ok(entry) = dir {
            let path = entry.path();
            if !path.is_dir() {continue;}
            for selected in paths {
                if path.file_name().unwrap().to_str().unwrap().ends_with(selected) {
                    return path.to_str().unwrap().to_string();
                }
            }
        }
    }

    String::from("None")
}

fn import_game_rar(archive_path: &PathBuf) -> bool {
    let mut found = false;
    let mut archive =
        Archive::new(archive_path.to_str().unwrap())
            .open_for_processing()
            .unwrap();
    while let Some(header) = archive.read_header().unwrap() {


        archive = if header.entry().is_directory() {
            // println!("New File {}", header.entry().filename.to_str().unwrap());

            if header.entry().filename.to_str().expect("Failed To Read File").starts_with("mod_assets") {
                found = true;
                break;
            }
            header.skip().expect("Failed to skip header")
        } else if header.entry().is_file(){
            // println!("New File {}", header.entry().filename.to_str().unwrap());
            if is_game_folder( header.entry().filename.to_str().unwrap()) && !header.entry().filename.to_str().unwrap().contains("\\") {
                found = true;
                break;
            }
            header.skip().expect("Failed to skip header")
            // header.extract_to(add_path(&format!("{}\\{}", target_dir.to_str().unwrap(), entry)))?
        } else {
            // println!("Skipping");
            header.skip().expect("Failed to skip header")
        };
    }
    found
}

fn is_game_folder(name: &str) -> bool {
    name.ends_with(".rpyc") || name.ends_with(".rpa") || name.starts_with("mod_assets")
}

#[tauri::command]
fn rename_dir(app: AppHandle, path: &str, new_name: &str, id: &str) {
    let dir = PathBuf::from(path);
    if dir.is_dir() {
        fs::rename(path, new_name).unwrap_or_else(|_| {
            create_dir_all(new_name).unwrap();
            copy_dir_recursive(&dir, &PathBuf::from(new_name)).unwrap();
            remove_dir_all(dir).unwrap();
        });
    }
    app.emit("rename_done", StringData { text: &format!("{}",id) }).unwrap();
}

fn import_game_zip(archive: &mut ZipArchive<File>, toppath: &str) -> bool {
    let mut found = false;
    for i in 0..archive.len() {
        let file = archive.by_index(i)
            .map_err(|e| e.to_string()).unwrap();
        let mut formatted = file.enclosed_name().unwrap().to_str().unwrap().replace(toppath, "");
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

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    if src.is_dir() {
        create_dir_all(dst)?;
        
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            
            if src_path.is_dir() {
                copy_dir_recursive(&src_path, &dst_path)?;
            } else {
                fs::copy(&src_path, &dst_path)?;
            }
        }
    }
    Ok(())
}
#[tauri::command]
async fn set_ddlc_zip(path: &str) ->  Result<(), bool> {
    if !is_file(PathBuf::from(path)).await {
        return Err(false);
    }

    if get_file_hash(path).expect("Failed to get Hash") != DDLC_HASH {
        return Err(false);
    }

    fs::copy(PathBuf::from(path), env::current_dir().unwrap().join("store").join("ddlc.zip")).unwrap();
    downloader::extract_folder(&PathBuf::from("./store/ddlc"),&mut File::open(PathBuf::from("./store/ddlc.zip")).unwrap()).await;

    Ok(())
}
#[tauri::command]
async fn update_exe() {
    println!("Updating Using {}", LATEST_ARTIFACT);
    let resp = get(LATEST_ARTIFACT).await.expect("Failed to download latest");
    let mut out = File::create("./dokimodmanager-new.exe").expect("Failed to create file");
    out.write_all(&mut resp.bytes().await.expect("Failed to write bytes")).unwrap();
    let update_script = format!(
        r#"
        $Host.UI.RawUI.WindowTitle = 'Doki Doki Mod Manager Updater';
        echo "Waiting for DDMM To Close... (3s)";
        Start-Sleep 3;
        echo "Updating DDMM...";
        if (Test-Path 'dokimodmanager-new.exe') {{
            if (Test-Path 'dokimodmanager.exe') {{
                Remove-Item 'dokimodmanager.exe' -Force -ErrorAction SilentlyContinue;
            }}
            Rename-Item 'dokimodmanager-new.exe' 'dokimodmanager.exe';
        }}
        echo "Updated DDMM, Launching... (2s)";
        Start-Sleep 2;
        if (Test-Path 'dokimodmanager.exe') {{
            $dir = Get-Location
            $binDir = (Get-Location).Path
            Start-Process '.\dokimodmanager.exe' -WorkingDirectory $binDir -WindowStyle Normal
        }}
        "#
    );

    println!("{:?}", env::current_dir().unwrap().display());

    Command::new("powershell")
        .current_dir(env::current_dir().unwrap())
        .args([
            "-NoProfile",
            "-Command", &update_script])
        .spawn()
        .expect("failed to launch cmd");
    std::process::exit(0);
}
#[tauri::command]
fn open_path(path: &str) {
    let _ = Command::new("explorer.exe")
        .args([path])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("failed to launch cmd");
}
#[tauri::command]
fn tracker(app: AppHandle, event: String, props: Option<serde_json::Value>) {
    track(&app, event, props);
}

fn track(app: &AppHandle, event: String, props: Option<serde_json::Value>) {
    app.track_event(&event, props).expect("Failed to track event");
}
async fn make_config() {

    let default_config_data: ConfigData = ConfigData {
        directory: env::current_dir().unwrap().display().to_string() + "\\store\\mods",
    };

    let json_data = serde_json::to_string_pretty(&default_config_data).unwrap();
    if !fs::metadata("DNNconfig.json").is_ok() {
        let file = File::create("DNNconfig.json");
        let _ = file.expect("write failure").write_all(json_data.as_bytes());
    }
}

mod downloader;
mod discord_rpc;
mod extractor;
mod hash;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub async fn run() {
    create_dir_all(env::current_dir().unwrap().join("store/mods").display().to_string()).expect("FS Error: Failed To Create Store/Mods");
    create_dir_all(env::current_dir().unwrap().join("store/images").display().to_string()).expect("FS Error: Failed To Create Store/Mods");

    std::thread::spawn(move || {discord_rpc::start();});
    discord_rpc::set_activity("In Main Menu");
    make_config().await;
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_fs_pro::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_aptabase::Builder::new("A-US-9509641067".into()).build())

        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "windows")]
            apply_acrylic(&window,Some((0, 0, 0, 10)))
                .expect("Unsupported platform! 'apply_blur' is only supported on Windows");
            let result = app.track_event("app_started", None).unwrap();
            let app_handle = app.handle().clone();
            println!("{:?}", &result);
            app.get_webview_window("main").unwrap().on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    app_handle.track_event("app_closed", None).expect("TODO: panic message");
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![close, minimize, launch, path_select, request_path, open_path, import_mod, delete_path, rename_dir, update, set_ddlc_zip, update_exe, tracker])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}