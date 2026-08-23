use std::fs::{create_dir_all, File};
use std::path::PathBuf;
use unarc_rs::unified::ArchiveFormat;

pub fn is_archive_game_folder(
    path: &PathBuf,
    tld: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let mut archive = ArchiveFormat::open_path(path)?;
    let mut is_game = false;

    while let Some(entry) = archive.next_entry()? {
        let mut name = strip_slash_prefix(entry.name());

        if name.starts_with(tld) {
            name = strip_slash_prefix(name.replace(tld, "").as_str());
        }

        if is_game_folder(&name) && !name.contains(std::path::MAIN_SEPARATOR) {
            is_game = true;
            break;
        }
    }

    Ok(is_game)
}

pub fn detect_nest(archive_file: &PathBuf) -> Result<Option<String>, Box<dyn std::error::Error>> {
    let mut newest_found: Option<String> = None;
    let mut archive = ArchiveFormat::open_path(archive_file)?;
    let archive_name = archive_file.file_stem().unwrap().to_str().unwrap().trim();

    while let Some(entry) = archive.next_entry()? {
        let name = entry.name();
        if name.contains("/")
            || name.contains("\\")
            || entry.is_directory()
            || name.trim() == archive_name
        {
            let tld = if name.contains("/") {
                name.split("/").next().unwrap()
            } else if name.contains("\\") {
                name.split("\\").next().unwrap()
            } else {
                name
            };

            let newest = if let Some(some) = newest_found.as_ref() {
                some
            } else {
                tld
            };

            if tld == newest {
                newest_found = Some(tld.to_string());
                archive.skip(&entry)?;
            } else {
                println!("Different TLD Found: {}", name);
                newest_found = None;
                break;
            }
        } else if !name.to_lowercase().contains("credit") {
            println!("NonDir Found: {}", name);
            newest_found = None;
            break;
        } else {
            archive.skip(&entry)?;
        }
    }

    Ok(newest_found)
}

pub fn extract_archive(
    path: &PathBuf,
    target_dir: &PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut archive = ArchiveFormat::open_path(path)?;
    let mut simple_logger = crate::simple_logger::SimpleLogger::new(format!(
        "Extract {}",
        target_dir.to_str().unwrap()
    ));

    while let Some(entry) = archive.next_entry()? {
        let name = strip_slash_prefix(entry.name());
        let path = target_dir.join(name);

        if entry.is_directory() {
            create_dir_all(&path).unwrap_or_else(|_| {
                println!("Failed to create directories!");
            });
            archive.skip(&entry)?;
            continue;
        } else {
            create_parent(&path).unwrap_or_else( |_| {
                println!("Failed to create parent!");
            });
        }

        let mut output = File::create(&path)?;
        simple_logger.log(format!(
            "Extract {} as {}",
            entry.file_name(),
            path.to_str().expect("Invalid Path")
        ));
        archive.read_to(&entry, &mut output)?;
    }

    simple_logger.finish();
    Ok(())
}

pub fn extract_archive_without_tld(
    path: &PathBuf,
    target_dir: &PathBuf,
    tld_s: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let binding = strip_slash_prefix(tld_s);
    let tld = binding.as_str();
    let mut archive = ArchiveFormat::open_path(path)?;
    let mut simple_logger =
        crate::simple_logger::SimpleLogger::new(format!("Extract (w/o TLD) TLD = {}", tld));

    while let Some(entry) = archive.next_entry()? {
        let mut name = strip_slash_prefix(entry.name());

        if name.starts_with(tld) {
            name = strip_slash_prefix(name.replace(tld, "").as_str());
        }

        let path = target_dir.join(name);
        if entry.is_directory() || path.is_dir() {
            create_dir_all(&path).unwrap_or_else(|_| {
                println!("Failed to create directories!");
            });
            archive.skip(&entry)?;
            continue;
        } else {
            create_parent(&path).unwrap_or_else( |_| {
                println!("Failed to create parent!");
            });
        }

        let mut output = File::create(&path)?;
        simple_logger.log(format!(
            "Extract {} as {}",
            entry.file_name(),
            path.to_str().expect("Invalid Path")
        ));
        archive.read_to(&entry, &mut output)?;
    }

    simple_logger.finish();
    Ok(())
}

fn create_parent(path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let parent = path.parent().expect("Invalid Path");
    create_dir_all(parent)?;
    Ok(())
}

fn strip_slash_prefix(name: &str) -> String {
    strip_backslash_prefix(name.strip_prefix("/").unwrap_or(name))
        .trim()
        .to_string()
}

fn strip_backslash_prefix(name: &str) -> String {
    if cfg!(target_os = "windows") {
        path_fix_windows(name.strip_prefix("\\").unwrap_or(name).to_string())
    } else {
        path_fix_linux(name.strip_prefix("\\").unwrap_or(name).to_string())
    }
}

fn path_fix_windows(path: String) -> String {
    path.replace("/", &*std::path::MAIN_SEPARATOR.to_string())
}

fn path_fix_linux(path: String) -> String {
    path.replace("\\", &*std::path::MAIN_SEPARATOR.to_string())
}

pub fn is_game_folder(name: &str) -> bool {
    name.ends_with(".rpyc")
        || name.ends_with(".rpa")
        || name.starts_with("mod_assets")
        || name.ends_with(".rpy")
}
