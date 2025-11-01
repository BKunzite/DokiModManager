use std::{fs, io};
use std::fs::{create_dir_all, File};
use std::path::PathBuf;
use unrar::Archive;
use zip::ZipArchive;

pub fn extract_rar_archive(archive_path: &PathBuf, target_dir: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let mut archive =
        Archive::new(archive_path.to_str().unwrap())
            .open_for_processing()
            .unwrap();
    while let Some(header) = archive.read_header()? {


        archive = if header.entry().is_directory() {
            // println!("New Directory");
            header.skip()?
        } else if header.entry().is_file(){
            // println!("New File {}", entry);
            header.extract_with_base(target_dir)?
            // header.extract_to(add_path(&format!("{}\\{}", target_dir.to_str().unwrap(), entry)))?
        } else {
            // println!("Skipping");
            header.skip()?
        };
    }
    Ok(())
}

pub fn extract_zip_archive_without_toplevel(archive: &mut ZipArchive<&mut File>, target_dir: &PathBuf, top_path: &str) -> Result<(), String> {
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| e.to_string())?;

        let outpath = match file.enclosed_name() {
            Some(path) => {
                let p = path.to_str().unwrap().replacen(top_path, "", 1);
                if p.starts_with("/") {
                    target_dir.join(PathBuf::from(&p[1..]))
                } else {
                    target_dir.join(PathBuf::from(p))
                }
            },
            None => continue,
        };

        if file.name().ends_with('/') {
            create_dir_all(&outpath)
                .map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    create_dir_all(p)
                        .map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = File::create(&outpath)
                .map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile)
                .map_err(|e| e.to_string())?;
        }
    }
    println!("Extracted {} files.", archive.len());
    Ok(())
}

pub fn extract_zip_archive(archive: &mut ZipArchive<File>, target_dir: &PathBuf) -> Result<(), String> {
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| e.to_string())?;

        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            create_dir_all(&outpath)
                .map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)
                        .map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = File::create(&outpath)
                .map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}