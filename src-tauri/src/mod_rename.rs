// Added for the local macOS fixes, 2026-11-19.
use std::{fs, io, path::Path};

/// Rename one mod within its library, retaining every file in the directory.
/// Save identifiers and external profile directories are deliberately untouched.
pub fn rename_mod_directory(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_absolute() || !destination.is_absolute() {
        return Err("Mod paths must be absolute".into());
    }
    let name = destination.file_name().and_then(|name| name.to_str())
        .ok_or("Invalid destination name")?;
    if name.trim().is_empty() || name.len() > 255 || name.encode_utf16().count() > 100
        || name.contains('\0') || name.contains('/')
    {
        return Err("Invalid destination name".into());
    }
    #[cfg(target_os = "macos")]
    if name.contains(':') {
        return Err("Invalid destination name".into());
    }
    let source_parent = source.parent().ok_or("Missing source parent")?
        .canonicalize().map_err(|error| error.to_string())?;
    let destination_parent = destination.parent().ok_or("Missing destination parent")?
        .canonicalize().map_err(|error| error.to_string())?;
    if source_parent != destination_parent {
        return Err("A renamed mod must remain in the same library".into());
    }
    if !fs::symlink_metadata(source).map_err(|error| error.to_string())?.is_dir() {
        return Err("Source is not a mod directory".into());
    }
    match fs::symlink_metadata(destination) {
        Ok(_) => return Err("The destination already exists".into()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {},
        Err(error) => return Err(error.to_string()),
    }
    // Never copy/delete as a fallback: a failed rename must retain the source.
    rename_without_replace(source, destination).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn rename_without_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    unsafe extern "C" {
        fn renamex_np(from: *const std::ffi::c_char, to: *const std::ffi::c_char, flags: u32) -> i32;
    }
    // <sys/stdio.h>: RENAME_EXCL also prevents overwrites if the target appears
    // between the existence check and the rename, including APFS case aliases.
    const RENAME_EXCL: u32 = 0x00000004;
    let from = CString::new(source.as_os_str().as_bytes())?;
    let to = CString::new(destination.as_os_str().as_bytes())?;
    // SAFETY: both arguments are live, NUL-terminated strings for this call.
    if unsafe { renamex_np(from.as_ptr(), to.as_ptr(), RENAME_EXCL) } == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(target_os = "macos"))]
fn rename_without_replace(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("ddmm-rename-{}-{}-{}",
                std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos(),
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir(&path).unwrap();
            Self(path.canonicalize().unwrap())
        }
        fn source(&self) -> PathBuf {
            let path = self.0.join("DDFA fix");
            fs::create_dir(&path).unwrap();
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) { fs::remove_dir_all(&self.0).unwrap(); }
    }

    #[test]
    fn rename_preserves_bundle_metadata_local_saves_and_external_profiles() {
        let fixture = Fixture::new();
        let source = fixture.source();
        let game = Path::new("DDLC.app/Contents/Resources/autorun/game/saves");
        fs::create_dir_all(source.join(game)).unwrap();
        fs::write(source.join(game).join("persistent"), [0, 255, 42, 9]).unwrap();
        let executable = Path::new("DDLC.app/Contents/MacOS/DDLC");
        fs::create_dir_all(source.join(executable).parent().unwrap()).unwrap();
        fs::write(source.join(executable), b"synthetic executable").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::{symlink, PermissionsExt};
            fs::set_permissions(source.join(executable), fs::Permissions::from_mode(0o755)).unwrap();
            symlink("DDLC", source.join(executable).parent().unwrap().join("launcher-link")).unwrap();
        }
        let config = br#"{"coverId":"custom.png","executable":"DDLC.app/Contents/MacOS/DDLC"}"#;
        fs::write(source.join(".ddmm.config.json"), config).unwrap();
        let profiles = fixture.0.join("stable-save-id--profiles");
        fs::create_dir(&profiles).unwrap();
        fs::write(profiles.join("Default.ddmm.profile.json"), b"opaque profile").unwrap();
        let external_save = fixture.0.join("stable-save-id");
        fs::create_dir(&external_save).unwrap();
        fs::write(external_save.join("persistent"), b"opaque save").unwrap();
        let destination = fixture.0.join("Fallen Angel");
        rename_mod_directory(&source, &destination).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read(destination.join(game).join("persistent")).unwrap(), [0, 255, 42, 9]);
        assert_eq!(fs::read(destination.join(".ddmm.config.json")).unwrap(), config);
        assert_eq!(fs::read(destination.join(executable)).unwrap(), b"synthetic executable");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(destination.join(executable)).unwrap().permissions().mode() & 0o777, 0o755);
            assert_eq!(fs::read_link(destination.join(executable).parent().unwrap().join("launcher-link")).unwrap(), Path::new("DDLC"));
        }
        assert_eq!(fs::read(profiles.join("Default.ddmm.profile.json")).unwrap(), b"opaque profile");
        assert_eq!(fs::read(external_save.join("persistent")).unwrap(), b"opaque save");
    }

    #[test]
    fn existing_empty_target_is_not_replaced() {
        let fixture = Fixture::new();
        let source = fixture.source();
        let target = fixture.0.join("Fallen Angel");
        fs::create_dir(&target).unwrap();
        assert!(rename_mod_directory(&source, &target).is_err());
        assert!(source.is_dir() && target.is_dir());
    }

    #[test]
    fn existing_file_is_not_overwritten() {
        let fixture = Fixture::new();
        let source = fixture.source();
        let target = fixture.0.join("Fallen Angel");
        fs::write(&target, b"keep").unwrap();
        assert!(rename_mod_directory(&source, &target).is_err());
        assert!(source.is_dir());
        assert_eq!(fs::read(target).unwrap(), b"keep");
    }

    #[test]
    fn missing_source_reports_failure_without_creating_target() {
        let fixture = Fixture::new();
        let target = fixture.0.join("Fallen Angel");
        assert!(rename_mod_directory(&fixture.0.join("missing"), &target).is_err());
        assert!(!target.exists());
    }

    #[test]
    fn rejects_moves_outside_the_library() {
        let fixture = Fixture::new();
        let other = Fixture::new();
        let source = fixture.source();
        assert!(rename_mod_directory(&source, &other.0.join("Fallen Angel")).is_err());
        assert!(source.is_dir());
    }

    #[test]
    fn rejects_relative_paths_and_dot_components() {
        let fixture = Fixture::new();
        let source = fixture.source();
        assert!(rename_mod_directory(&source, Path::new("Fallen Angel")).is_err());
        assert!(rename_mod_directory(&source, &fixture.0.join("..")).is_err());
        assert!(source.is_dir());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_source_and_target() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let source = fixture.source();
        let alias = fixture.0.join("alias");
        symlink(&source, &alias).unwrap();
        assert!(rename_mod_directory(&alias, &fixture.0.join("Fallen Angel")).is_err());
        assert!(rename_mod_directory(&source, &alias).is_err());
        assert!(source.is_dir());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn kernel_exclusive_rename_refuses_an_existing_target() {
        let fixture = Fixture::new();
        let source = fixture.source();
        let target = fixture.0.join("Fallen Angel");
        fs::create_dir(&target).unwrap();
        assert!(rename_without_replace(&source, &target).is_err());
        assert!(source.is_dir() && target.is_dir());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn rejects_colons_and_preserves_case_aliases() {
        let fixture = Fixture::new();
        let source = fixture.source();
        assert!(rename_mod_directory(&source, &fixture.0.join("Fallen:Angel")).is_err());
        let alias = fixture.0.join("ddfa FIX");
        if alias.exists() {
            assert!(rename_mod_directory(&source, &alias).is_err());
            assert!(source.is_dir());
        }
    }
}
