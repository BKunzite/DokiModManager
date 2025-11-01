use std::{fs};
use std::fs::File;
use std::io::{Cursor};
use std::path::PathBuf;
use tauri_plugin_fs_pro::{is_dir};
use zip::ZipArchive;
use crate::extractor;
pub async fn extract_folder(target_dir: &PathBuf, file: &mut File) {
    fs::create_dir_all(&target_dir).unwrap();
    println!("Extracting file");

    let mut archive = ZipArchive::new(file)
        .map_err(|e| e.to_string()).unwrap();
    extractor::extract_zip_archive_without_toplevel(&mut archive, &target_dir, "DDLC-1.1.1-pc").unwrap();
    println!("File downloaded");
}