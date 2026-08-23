use crate::unarc_extractor::extract_archive_without_tld;
use std::fs;
use std::path::PathBuf;

pub async fn extract_folder(target_dir: &PathBuf, file: &PathBuf) {
    fs::create_dir_all(target_dir).unwrap();
    extract_archive_without_tld(file, target_dir, "DDLC-1.1.1-pc").unwrap();
}
