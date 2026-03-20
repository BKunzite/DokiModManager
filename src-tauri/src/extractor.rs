use std::fs::{create_dir_all, File};
use std::path::PathBuf;
use std::{io};
use std::io::BufWriter;
use unrar::Archive;
use zip::ZipArchive;
pub fn extract_rar_archive(
    archive_path: &PathBuf,
    target_dir: &PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut archive = Archive::new(archive_path.to_str().unwrap())
        .open_for_processing()
        .unwrap();
    while let Some(header) = archive.read_header()? {
        archive = if header.entry().is_directory() {
            header.skip()?
        } else if header.entry().is_file() {
            header.extract_with_base(target_dir)?
        } else {
            header.skip()?
        };
    }
    Ok(())
}

pub fn extract_zip_archive_without_toplevel(
    archive: &mut ZipArchive<&mut File>,
    target_dir: &PathBuf,
    top_path: &str,
) -> Result<(), String> {
    let mut simple_logger = crate::simple_logger::SimpleLogger::new(format!("TL Extract {}", target_dir.to_str().unwrap()));
    let archive_len = archive.len();
    for i in 0..archive_len {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;

        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(PathBuf::from(path.to_str().unwrap().strip_prefix(top_path).expect("Invalid Path").trim_start_matches('/'))),
            None => continue,
        };

        if file.name().ends_with('/') {
            create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            simple_logger.log(format!("Extract {}", file.enclosed_name().unwrap().to_str().unwrap()));
            let mut outfile = BufWriter::with_capacity(256 * 1024, outfile);
            io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    simple_logger.finish();
    Ok(())
}

pub fn extract_zip_archive(
    archive: &mut ZipArchive<File>,
    target_dir: &PathBuf,
) -> Result<(), String> {
    let archive_len = archive.len();
    let mut simple_logger = crate::simple_logger::SimpleLogger::new(format!("Extract {}", target_dir.to_str().unwrap()));
    for i in 0..archive_len {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;

        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                create_dir_all(p).map_err(|e| e.to_string())?;
            }
            simple_logger.log(format!("Extract {}", file.enclosed_name().unwrap().to_str().unwrap()));
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    simple_logger.finish();
    Ok(())
}
