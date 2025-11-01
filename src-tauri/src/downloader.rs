use std::{fs};
use std::fs::File;
use std::io::{Cursor};
use std::path::PathBuf;
use tauri_plugin_fs_pro::{is_dir};
use zip::ZipArchive;
use crate::extractor;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
pub async fn download_url(url: String, file_name: String) -> Result<()> {
    if !is_dir("./store/ddlc/".parse().unwrap()).await {
        println!("Downloading file");
        fs::create_dir_all("./store/ddlc/")?;
        let response = reqwest::get(url).await?;
        let mut file ;
        if !PathBuf::from(&file_name).exists() {
            file = File::create(&file_name)?;
            let mut content = Cursor::new(response.bytes().await?);
            std::io::copy(&mut content, &mut file)?;
        }
    } else {
        println!("File already exists");
    }
    
    Ok(())
}

pub async fn extract_folder(target_dir: &PathBuf, file: &mut File) {
    fs::create_dir_all(&target_dir).unwrap();
    println!("Extracting file");

    let mut archive = ZipArchive::new(file)
        .map_err(|e| e.to_string()).unwrap();
    extractor::extract_zip_archive_without_toplevel(&mut archive, &target_dir, "DDLC-1.1.1-pc").unwrap();
    println!("File downloaded");
}