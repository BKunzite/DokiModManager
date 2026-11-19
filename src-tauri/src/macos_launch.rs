// macOS fixes contributed, 2026-11-19. No game-content repair or recursive chmod.
use std::{fs::File, io::{Read, Seek, SeekFrom}, path::{Path, PathBuf}, process::Command};

const X86: u32 = 7;
const X86_64: u32 = 0x01000007;
const ARM64: u32 = 0x0100000c;

pub fn macho_architectures(path: &Path) -> Result<Vec<u32>, String> {
    let mut file = File::open(path).map_err(|error| format!("Cannot read {}: {error}", path.display()))?;
    let mut header = [0; 8];
    if file.read_exact(&mut header).is_err() { return Ok(vec![]); }
    let magic = u32::from_be_bytes(header[..4].try_into().unwrap());
    match magic {
        0xfeedface | 0xfeedfacf => Ok(vec![u32::from_be_bytes(header[4..].try_into().unwrap())]),
        0xcefaedfe | 0xcffaedfe => Ok(vec![u32::from_le_bytes(header[4..].try_into().unwrap())]),
        0xcafebabe | 0xcafebabf | 0xbebafeca | 0xbfbafeca => {
            let little = matches!(magic, 0xbebafeca | 0xbfbafeca);
            let number = |bytes: [u8; 4]| if little { u32::from_le_bytes(bytes) } else { u32::from_be_bytes(bytes) };
            let count = number(header[4..].try_into().unwrap());
            if count > 32 { return Err("Invalid universal executable header".into()); }
            let stride = if matches!(magic, 0xcafebabf | 0xbfbafeca) { 32 } else { 20 };
            let mut architectures = vec![];
            for index in 0..count {
                file.seek(SeekFrom::Start(8 + u64::from(index) * stride)).map_err(|error| error.to_string())?;
                let mut cpu = [0; 4];
                file.read_exact(&mut cpu).map_err(|error| error.to_string())?;
                architectures.push(number(cpu));
            }
            Ok(architectures)
        }
        _ => Ok(vec![]),
    }
}

// Legacy Ren'Py shell launchers delegate to lib/darwin-x86_64/<launcher-name>.
// Inspect that binary, rather than assuming that the shell's ARM architecture is the game's.
pub fn engine_path(launcher: &Path) -> PathBuf {
    let parent = launcher.parent().unwrap_or(Path::new("."));
    let name = launcher.file_stem().unwrap_or_default();
    let engine = parent.join("lib/darwin-x86_64").join(name);
    if engine.is_file() { engine } else { launcher.to_path_buf() }
}

pub fn architecture_requirement(architectures: &[u32], apple_silicon: bool, rosetta: bool) -> Result<(), String> {
    if architectures.contains(&X86) && !architectures.contains(&X86_64) && !architectures.contains(&ARM64) {
        return Err("This game has a 32-bit Intel engine. Current macOS cannot run it; Rosetta 2 cannot translate 32-bit apps. Use a compatible 64-bit release of the mod.".into());
    }
    if apple_silicon && architectures.contains(&X86_64) && !architectures.contains(&ARM64) && !rosetta {
        return Err("This mod uses an Intel (x86_64) engine and needs Apple's Rosetta 2 on this Apple silicon Mac. Install Rosetta using Apple's instructions: https://support.apple.com/102527\n\nTerminal: softwareupdate --install-rosetta\n\nThen try Play again. No game or save files were changed.".into());
    }
    Ok(())
}

pub fn check(launcher: &Path) -> Result<(), String> {
    let architectures = macho_architectures(&engine_path(launcher))?;
    let needs_rosetta = cfg!(target_arch = "aarch64") && architectures.contains(&X86_64) && !architectures.contains(&ARM64);
    // Probe a harmless system executable; never execute game code as a check.
    let rosetta = !needs_rosetta || Command::new("/usr/bin/arch").args(["-x86_64", "/usr/bin/true"])
        .output().map(|output| output.status.success()).unwrap_or(false);
    architecture_requirement(&architectures, cfg!(target_arch = "aarch64"), rosetta)
}

pub fn command(launcher: &Path) -> Result<Command, String> {
    check(launcher)?;
    let engine = engine_path(launcher);
    // An extracted engine may lack its owner execute bit. Only that exact file
    // needs it; libraries, scripts, artwork and saves must retain their modes.
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = std::fs::metadata(&engine).map_err(|error| error.to_string())?.permissions();
    if permissions.mode() & 0o100 == 0 {
        permissions.set_mode(permissions.mode() | 0o100);
        std::fs::set_permissions(&engine, permissions).map_err(|error| error.to_string())?;
    }
    let mut header = [0; 128];
    let length = File::open(launcher).and_then(|mut file| file.read(&mut header)).map_err(|error| error.to_string())?;
    let shell = header[..length].starts_with(b"#!/bin/sh") || header[..length].starts_with(b"#!/bin/bash");
    let mut command = if shell {
        let mut command = Command::new("/bin/sh");
        command.arg(launcher);
        command
    } else { Command::new(launcher) };
    command.current_dir(launcher.parent().ok_or("Launcher has no parent directory")?);
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::PermissionsExt, sync::atomic::{AtomicU64, Ordering}};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("ddmm-launch-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
            fs::create_dir(&path).unwrap(); Self(path)
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { fs::remove_dir_all(&self.0).unwrap(); } }
    #[test]
    fn reads_intel_and_arm_headers_in_both_byte_orders() {
        let fixture = Fixture::new(); let path = fixture.0.join("binary");
        for cpu in [X86, X86_64, ARM64] {
            for little in [true, false] {
                let mut bytes = if little { 0xfeedfacfu32.to_le_bytes().to_vec() } else { 0xfeedfacfu32.to_be_bytes().to_vec() };
                bytes.extend(if little { cpu.to_le_bytes() } else { cpu.to_be_bytes() });
                fs::write(&path, bytes).unwrap();
                assert_eq!(macho_architectures(&path).unwrap(), vec![cpu]);
            }
        }
    }
    #[test]
    fn universal_arm_engine_does_not_require_rosetta() {
        let fixture = Fixture::new(); let path = fixture.0.join("universal");
        let mut bytes = vec![0; 48];
        bytes[..4].copy_from_slice(&0xcafebabeu32.to_be_bytes());
        bytes[4..8].copy_from_slice(&2u32.to_be_bytes());
        bytes[8..12].copy_from_slice(&X86_64.to_be_bytes());
        bytes[28..32].copy_from_slice(&ARM64.to_be_bytes());
        fs::write(&path, bytes).unwrap();
        let architectures = macho_architectures(&path).unwrap();
        assert_eq!(architectures, vec![X86_64, ARM64]);
        assert!(architecture_requirement(&architectures, true, false).is_ok());
    }
    #[test]
    fn missing_rosetta_and_32bit_have_distinct_actionable_errors() {
        assert!(architecture_requirement(&[X86_64], true, false).unwrap_err().contains("softwareupdate --install-rosetta"));
        assert!(architecture_requirement(&[X86_64], true, true).is_ok());
        assert!(architecture_requirement(&[X86_64], false, false).is_ok());
        assert!(architecture_requirement(&[X86], true, true).unwrap_err().contains("32-bit"));
    }
    #[test]
    fn legacy_shell_resolves_the_embedded_engine_without_mutating_files() {
        let fixture = Fixture::new(); let launcher = fixture.0.join("DDLC");
        let engine = fixture.0.join("lib/darwin-x86_64/DDLC");
        fs::create_dir_all(engine.parent().unwrap()).unwrap();
        fs::write(&launcher, b"#!/bin/sh\nexit 0\n").unwrap();
        fs::write(&engine, b"synthetic engine").unwrap();
        let before = fs::metadata(&engine).unwrap().permissions().mode();
        assert_eq!(engine_path(&launcher), engine);
        check(&launcher).unwrap();
        assert_eq!(fs::metadata(engine).unwrap().permissions().mode(), before);
    }
    #[test]
    fn preparation_only_changes_the_exact_engine_execute_bit() {
        let fixture = Fixture::new(); let launcher = fixture.0.join("DDLC");
        let engine = fixture.0.join("lib/darwin-x86_64/DDLC");
        fs::create_dir_all(engine.parent().unwrap()).unwrap();
        fs::write(&launcher, b"#!/bin/sh\nexit 0\n").unwrap();
        fs::write(&engine, b"synthetic engine").unwrap();
        let files = [fixture.0.join("story.rpa"), fixture.0.join("persistent"), engine.with_file_name("libpython.dylib")];
        for path in [&launcher, &engine].into_iter().chain(files.iter()) {
            fs::write(path, if path == &launcher { b"#!/bin/sh\nexit 0\n".as_slice() } else { b"unchanged" }).unwrap();
            fs::set_permissions(path, fs::Permissions::from_mode(0o644)).unwrap();
        }
        let command = command(&launcher).unwrap();
        assert_eq!(command.get_program(), "/bin/sh");
        assert_eq!(fs::metadata(&engine).unwrap().permissions().mode() & 0o777, 0o744);
        for path in [&launcher].into_iter().chain(files.iter()) {
            assert_eq!(fs::metadata(path).unwrap().permissions().mode() & 0o777, 0o644);
        }
        assert_eq!(fs::read(&engine).unwrap(), b"unchanged");
    }

    #[test]
    fn executes_shell_launchers_with_spaces_and_reports_their_real_exit_status() {
        let fixture = Fixture::new();
        let directory = fixture.0.join("Mod with spaces");
        fs::create_dir(&directory).unwrap();
        let launcher = directory.join("DDLC");
        let story = directory.join("story.rpa");
        let save = directory.join("persistent");
        for path in [&story, &save] {
            fs::write(path, b"opaque fixture data").unwrap();
            fs::set_permissions(path, fs::Permissions::from_mode(0o644)).unwrap();
        }
        for code in [0, 7] {
            fs::write(&launcher, format!("#!/bin/sh\npwd\nprintf 'fixture stderr' >&2\nexit {code}\n")).unwrap();
            fs::set_permissions(&launcher, fs::Permissions::from_mode(0o644)).unwrap();
            let output = command(&launcher).unwrap().output().unwrap();
            assert_eq!(output.status.code(), Some(code));
            assert_eq!(String::from_utf8_lossy(&output.stderr), "fixture stderr");
            assert_eq!(fs::canonicalize(String::from_utf8_lossy(&output.stdout).trim()).unwrap(), fs::canonicalize(&directory).unwrap());
        }
        for path in [&story, &save] {
            assert_eq!(fs::read(path).unwrap(), b"opaque fixture data");
            assert_eq!(fs::metadata(path).unwrap().permissions().mode() & 0o777, 0o644);
        }
    }

    #[test]
    fn unsupported_engine_is_rejected_before_any_permission_or_content_change() {
        let fixture = Fixture::new();
        let launcher = fixture.0.join("DDLC");
        let engine = fixture.0.join("lib/darwin-x86_64/DDLC");
        fs::create_dir_all(engine.parent().unwrap()).unwrap();
        fs::write(&launcher, b"#!/bin/sh\nexit 0\n").unwrap();
        let mut bytes = 0xfeedfaceu32.to_le_bytes().to_vec();
        bytes.extend(X86.to_le_bytes());
        fs::write(&engine, &bytes).unwrap();
        for path in [&launcher, &engine] {
            fs::set_permissions(path, fs::Permissions::from_mode(0o644)).unwrap();
        }
        assert!(command(&launcher).unwrap_err().contains("32-bit"));
        assert_eq!(fs::read(&engine).unwrap(), bytes);
        for path in [&launcher, &engine] {
            assert_eq!(fs::metadata(path).unwrap().permissions().mode() & 0o777, 0o644);
        }
    }
}
