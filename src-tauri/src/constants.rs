#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "linux")]
pub use linux::*;

#[cfg(target_os = "macos")]
pub mod mac_os;
#[cfg(target_os = "macos")]
pub use mac_os::*;

#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

pub const SCRIPTS_RPA_HASH: &str = "da7ba6d3cf9ec1ae666ec29ae07995a65d24cca400cd266e470deb55e03a51d4";
#[cfg(any(target_os = "windows", target_os = "linux"))]
pub const DDLC_HASH: &str = "2a3dd7969a06729a32ace0a6ece5f2327e29bdf460b8b39e6a8b0875e545632e";
#[cfg(target_os = "macos")]
pub const DDLC_HASH: &str = "abc3d2fee9433ad454decd15d6cfd75634283c17aa3a6ac321952c601f7700ec";