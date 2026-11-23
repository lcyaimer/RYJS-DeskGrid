use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    time::UNIX_EPOCH,
};

#[cfg(target_os = "windows")]
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

#[cfg(target_os = "windows")]
use windows::{
    core::{BOOL, Ref},
    Win32::{
        Foundation::{HWND, LPARAM, POINTL},
        System::{
            Com::{CoTaskMemFree, IDataObject, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL},
            Ole::{
                IDropTarget, IDropTarget_Impl, CF_HDROP, DROPEFFECT, DROPEFFECT_COPY,
                DROPEFFECT_NONE, OleInitialize, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop,
            },
            SystemServices::MODIFIERKEYS_FLAGS,
        },
        UI::{
            Shell::{
                DragQueryFileW, IShellItemArray, SHCreateShellItemArrayFromDataObject,
                SIGDN_FILESYSPATH, HDROP,
            },
            WindowsAndMessaging::EnumChildWindows,
        },
    },
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, PhysicalSize, WindowEvent,
};

const MAX_BOOKMARKS: usize = 5000;
const MAX_TEXT_BYTES: u64 = 20 * 1024 * 1024;
const MAX_DROPPED_PATHS: usize = 200;

static OVERLAY_ACTIVE: AtomicBool = AtomicBool::new(false);
static PENDING_SETTINGS_TAB: Mutex<Option<String>> = Mutex::new(None);

const SHELL_TARGETS: &[&str] = &[
    "shell:MyComputerFolder",
    "shell:Downloads",
    "shell:Documents",
    "shell:Desktop",
    "shell:Pictures",
    "shell:Music",
    "shell:Videos",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemPaths {
    home: String,
    desktop: String,
    documents: String,
    downloads: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BookmarkSource {
    browser: String,
    profile: String,
    path: String,
    count: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BookmarkLink {
    title: String,
    url: String,
    folder: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PathInfo {
    path: String,
    name: String,
    is_dir: bool,
    is_app: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
}

#[derive(Deserialize)]
struct WindowRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    #[serde(default)]
    radius: i32,
}

#[tauri::command]
fn system_paths() -> SystemPaths {
    let home = dirs::home_dir().unwrap_or_default();
    let desktop = dirs::desktop_dir().unwrap_or_else(|| home.join("Desktop"));
    let documents = dirs::document_dir().unwrap_or_else(|| home.join("Documents"));
    let downloads = dirs::download_dir().unwrap_or_else(|| home.join("Downloads"));
    SystemPaths {
        home: home.to_string_lossy().into_owned(),
        desktop: desktop.to_string_lossy().into_owned(),
        documents: documents.to_string_lossy().into_owned(),
        downloads: downloads.to_string_lossy().into_owned(),
    }
}

#[tauri::command]
fn open_target(target: String) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("目标路径为空".to_string());
    }

    if target.starts_with("shell:") {
        if !SHELL_TARGETS.contains(&target) {
            return Err("不支持的系统位置".to_string());
        }
        #[cfg(target_os = "windows")]
        {
            return std::process::Command::new("explorer.exe")
                .arg(target)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("无法打开系统位置：{error}"));
        }
        #[cfg(not(target_os = "windows"))]
        return Err("系统位置仅支持 Windows".to_string());
    }

    let normalized_target = target.to_ascii_lowercase();
    let is_http =
        normalized_target.starts_with("http://") || normalized_target.starts_with("https://");
    if !is_http {
        let path = Path::new(target);
        if !path.exists() {
            return Err("目标不存在，可能已被移动或删除".to_string());
        }

        // Explorer opens a directory directly, while ShellExecute would select it
        // inside its parent folder.
        #[cfg(target_os = "windows")]
        if path.is_dir() {
            return std::process::Command::new("explorer.exe")
                .arg(target)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("无法打开文件夹：{error}"));
        }
    }

    open::that_detached(target).map_err(|error| format!("系统无法打开此目标：{error}"))
}

fn url_shortcut_target(path: &Path) -> Option<String> {
    if !path
        .extension()
        .map(|value| value.to_string_lossy().eq_ignore_ascii_case("url"))
        .unwrap_or(false)
    {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    if bytes.len() > 64 * 1024 {
        return None;
    }
    let text = String::from_utf8_lossy(&bytes);
    for line in text.lines() {
        let line = line.trim().trim_start_matches('\u{feff}');
        if let Some((key, value)) = line.split_once('=') {
            if key.trim().eq_ignore_ascii_case("url") {
                let url = value.trim();
                if url.starts_with("http://") || url.starts_with("https://") {
                    return Some(url.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
fn inspect_paths(paths: Vec<String>) -> Vec<PathInfo> {
    paths
        .into_iter()
        .take(MAX_DROPPED_PATHS)
        .filter_map(|path| {
            let trimmed = path.trim().to_string();
            if trimmed.is_empty() {
                return None;
            }
            let file_path = std::path::PathBuf::from(&trimmed);
            let metadata = fs::metadata(&file_path).ok()?;
            let name = file_path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| trimmed.clone());
            let is_dir = metadata.is_dir();
            let extension = file_path
                .extension()
                .map(|value| value.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            let is_app = !is_dir
                && matches!(
                    extension.as_str(),
                    "exe" | "lnk" | "appref-ms" | "bat" | "cmd" | "msi" | "com"
                );
            let url = if !is_dir && extension == "url" {
                url_shortcut_target(&file_path)
            } else {
                None
            };
            Some(PathInfo {
                path: trimmed,
                name,
                is_dir,
                is_app,
                url,
            })
        })
        .collect()
}

#[cfg(target_os = "windows")]
static ICON_CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

/// Read the real Windows shell icon for an app or shortcut. The result is a
/// compact RGBA PNG data URL. PNG preserves the icon's transparent corners;
/// BMP transparency is ignored by WebView2 and rendered as a black box.
#[cfg(target_os = "windows")]
fn icon_png_data_url(path: &Path) -> Option<String> {
    use std::{ffi::c_void, mem::size_of, os::windows::ffi::OsStrExt};

    #[repr(C)]
    struct ShFileInfoW {
        h_icon: isize,
        i_icon: i32,
        dw_attributes: u32,
        sz_display_name: [u16; 260],
        sz_type_name: [u16; 80],
    }

    #[repr(C)]
    struct IconInfo {
        f_icon: i32,
        x_hotspot: u32,
        y_hotspot: u32,
        hbm_mask: isize,
        hbm_color: isize,
    }

    #[repr(C)]
    struct Bitmap {
        bm_type: u32,
        bm_width: i32,
        bm_height: i32,
        bm_width_bytes: i32,
        bm_planes: u16,
        bm_bits_pixel: u16,
        bm_bits: *mut u8,
    }

    #[repr(C)]
    struct BitmapInfoHeader {
        bi_size: u32,
        bi_width: i32,
        bi_height: i32,
        bi_planes: u16,
        bi_bit_count: u16,
        bi_compression: u32,
        bi_size_image: u32,
        bi_x_pels_per_meter: i32,
        bi_y_pels_per_meter: i32,
        bi_clr_used: u32,
        bi_clr_important: u32,
    }

    #[repr(C)]
    struct BitmapInfo {
        header: BitmapInfoHeader,
        colors: [u32; 256],
    }

    #[link(name = "shell32")]
    extern "system" {
        fn SHGetFileInfoW(
            path: *const u16,
            attributes: u32,
            info: *mut ShFileInfoW,
            info_size: u32,
            flags: u32,
        ) -> usize;
    }
    #[link(name = "user32")]
    extern "system" {
        fn DestroyIcon(icon: isize) -> i32;
        fn GetIconInfo(icon: isize, info: *mut IconInfo) -> i32;
        fn GetDC(window: isize) -> isize;
        fn ReleaseDC(window: isize, dc: isize) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn GetObjectW(object: isize, size: i32, out: *mut c_void) -> i32;
        fn GetDIBits(
            dc: isize,
            bitmap: isize,
            start: u32,
            lines: u32,
            bits: *mut c_void,
            info: *mut BitmapInfo,
            usage: u32,
        ) -> i32;
        fn DeleteObject(object: isize) -> i32;
    }

    const SHGFI_ICON: u32 = 0x0000_0100;
    const SHGFI_LARGEICON: u32 = 0x0000_0000;

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut shell_info: ShFileInfoW = std::mem::zeroed();
        let found = SHGetFileInfoW(
            wide.as_ptr(),
            0,
            &mut shell_info,
            size_of::<ShFileInfoW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if found == 0 || shell_info.h_icon == 0 {
            return None;
        }

        let icon = shell_info.h_icon;
        let mut icon_info: IconInfo = std::mem::zeroed();
        if GetIconInfo(icon, &mut icon_info) == 0 {
            DestroyIcon(icon);
            return None;
        }
        let color_bitmap = icon_info.hbm_color;
        let mask_bitmap = icon_info.hbm_mask;

        let result = (|| -> Option<String> {
            if color_bitmap == 0 {
                return None;
            }
            let mut bitmap: Bitmap = std::mem::zeroed();
            if GetObjectW(
                color_bitmap,
                size_of::<Bitmap>() as i32,
                &mut bitmap as *mut Bitmap as *mut c_void,
            ) == 0
            {
                return None;
            }
            let width = bitmap.bm_width;
            let height = bitmap.bm_height;
            if width <= 0 || height <= 0 || width > 512 || height > 512 {
                return None;
            }

            let dc = GetDC(0);
            if dc == 0 {
                return None;
            }
            let pixel_count = width as usize * height as usize;
            let stride = width as usize * 4;
            let mut pixels = vec![0u8; pixel_count * 4];
            let mut info = BitmapInfo {
                header: BitmapInfoHeader {
                    bi_size: size_of::<BitmapInfoHeader>() as u32,
                    bi_width: width,
                    bi_height: height,
                    bi_planes: 1,
                    bi_bit_count: 32,
                    bi_compression: 0,
                    bi_size_image: (pixel_count * 4) as u32,
                    bi_x_pels_per_meter: 0,
                    bi_y_pels_per_meter: 0,
                    bi_clr_used: 0,
                    bi_clr_important: 0,
                },
                colors: [0; 256],
            };
            let copied = GetDIBits(
                dc,
                color_bitmap,
                0,
                height as u32,
                pixels.as_mut_ptr() as *mut c_void,
                &mut info,
                0,
            );
            if copied == 0 {
                ReleaseDC(0, dc);
                return None;
            }

            let has_alpha = pixels.chunks_exact(4).any(|pixel| pixel[3] != 0);
            if !has_alpha {
                if mask_bitmap != 0 {
                    let mask_stride = (width as usize + 31) / 32 * 4;
                    let mut mask = vec![0u8; mask_stride * height as usize];
                    let mut mask_info = BitmapInfo {
                        header: BitmapInfoHeader {
                            bi_size: size_of::<BitmapInfoHeader>() as u32,
                            bi_width: width,
                            bi_height: height,
                            bi_planes: 1,
                            bi_bit_count: 1,
                            bi_compression: 0,
                            bi_size_image: mask.len() as u32,
                            bi_x_pels_per_meter: 0,
                            bi_y_pels_per_meter: 0,
                            bi_clr_used: 0,
                            bi_clr_important: 0,
                        },
                        colors: [0; 256],
                    };
                    let mask_copied = GetDIBits(
                        dc,
                        mask_bitmap,
                        0,
                        height as u32,
                        mask.as_mut_ptr() as *mut c_void,
                        &mut mask_info,
                        0,
                    );
                    if mask_copied != 0 {
                        for y in 0..height as usize {
                            for x in 0..width as usize {
                                let byte = mask[y * mask_stride + x / 8];
                                let transparent = byte & (1 << (7 - (x % 8))) != 0;
                                pixels[(y * width as usize + x) * 4 + 3] =
                                    if transparent { 0 } else { 255 };
                            }
                        }
                    } else {
                        for pixel in pixels.chunks_exact_mut(4) {
                            pixel[3] = 255;
                        }
                    }
                } else {
                    for pixel in pixels.chunks_exact_mut(4) {
                        pixel[3] = 255;
                    }
                }
            }
            ReleaseDC(0, dc);

            // GetDIBits returns bottom-up BGRA; PNG expects top-down RGBA.
            let mut top_down = Vec::with_capacity(pixels.len());
            for row in (0..height as usize).rev() {
                let start = row * stride;
                let end = start + stride;
                let mut line = pixels[start..end].to_vec();
                for pixel in line.chunks_exact_mut(4) {
                    pixel.swap(0, 2);
                }
                top_down.extend_from_slice(&line);
            }

            let mut png_bytes = Vec::new();
            {
                let mut encoder =
                    png::Encoder::new(&mut png_bytes, width as u32, height as u32);
                encoder.set_color(png::ColorType::Rgba);
                encoder.set_depth(png::BitDepth::Eight);
                encoder.set_compression(png::Compression::Fast);
                let mut writer = encoder.write_header().ok()?;
                writer.write_image_data(&top_down).ok()?;
                writer.finish().ok()?;
            }
            Some(format!(
                "data:image/png;base64,{}",
                BASE64.encode(&png_bytes)
            ))
        })();

        DestroyIcon(icon);
        if mask_bitmap != 0 {
            DeleteObject(mask_bitmap);
        }
        if color_bitmap != 0 {
            DeleteObject(color_bitmap);
        }
        result
    }
}

#[tauri::command]
fn app_icon_data_url(path: String) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let file = Path::new(path.trim());
        if !file.is_file() {
            return None;
        }
        let metadata = fs::metadata(file).ok()?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let key = format!(
            "{}|{}|{}",
            file.to_string_lossy(),
            metadata.len(),
            modified
        );
        let cache = ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(cache) = cache.lock() {
            if let Some(value) = cache.get(&key) {
                return value.clone();
            }
        }
        let value = icon_png_data_url(file);
        if let Ok(mut cache) = cache.lock() {
            if cache.len() >= 512 {
                cache.clear();
            }
            cache.insert(key, value.clone());
        }
        value
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        None
    }
}

#[cfg(target_os = "windows")]
const AUTOSTART_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const AUTOSTART_VALUE_NAME: &str = "RYJS DeskGrid";

#[cfg(target_os = "windows")]
fn autostart_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn autostart_command() -> Result<Vec<u16>, String> {
    use std::os::windows::ffi::OsStrExt;

    let executable =
        std::env::current_exe().map_err(|error| format!("无法定位程序路径：{error}"))?;
    let mut command = Vec::with_capacity(2);
    command.push('"' as u16);
    command.extend(executable.as_os_str().encode_wide());
    command.push('"' as u16);
    command.push(0);
    Ok(command)
}

#[cfg(target_os = "windows")]
fn autostart_value() -> Option<String> {
    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            key: isize,
            sub_key: *const u16,
            options: u32,
            desired: u32,
            result: *mut isize,
        ) -> i32;
        fn RegQueryValueExW(
            key: isize,
            value_name: *const u16,
            reserved: *mut u32,
            value_type: *mut u32,
            data: *mut u8,
            data_size: *mut u32,
        ) -> i32;
        fn RegCloseKey(key: isize) -> i32;
    }

    #[cfg(target_pointer_width = "64")]
    const HKEY_CURRENT_USER: isize = 0xFFFF_FFFF_8000_0001u64 as isize;
    #[cfg(target_pointer_width = "32")]
    const HKEY_CURRENT_USER: isize = 0x8000_0001u32 as isize;
    const KEY_QUERY_VALUE: u32 = 0x0001;
    const REG_SZ: u32 = 1;

    unsafe {
        let sub_key = autostart_wide(AUTOSTART_KEY);
        let value_name = autostart_wide(AUTOSTART_VALUE_NAME);
        let mut key: isize = 0;
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            sub_key.as_ptr(),
            0,
            KEY_QUERY_VALUE,
            &mut key,
        ) != 0
        {
            return None;
        }

        let mut value_type = 0u32;
        let mut size = 0u32;
        let mut status = RegQueryValueExW(
            key,
            value_name.as_ptr(),
            std::ptr::null_mut(),
            &mut value_type,
            std::ptr::null_mut(),
            &mut size,
        );
        if status != 0 || value_type != REG_SZ || size == 0 {
            RegCloseKey(key);
            return None;
        }

        let mut bytes = vec![0u8; size as usize];
        status = RegQueryValueExW(
            key,
            value_name.as_ptr(),
            std::ptr::null_mut(),
            &mut value_type,
            bytes.as_mut_ptr(),
            &mut size,
        );
        RegCloseKey(key);
        if status != 0 {
            return None;
        }

        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        let value = String::from_utf16_lossy(&units)
            .trim_end_matches('\0')
            .trim()
            .to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    }
}

#[cfg(target_os = "windows")]
fn set_autostart(enabled: bool) -> Result<(), String> {
    #[link(name = "advapi32")]
    extern "system" {
        fn RegCreateKeyExW(
            key: isize,
            sub_key: *const u16,
            reserved: u32,
            class: *mut u16,
            options: u32,
            desired: u32,
            security: *mut std::ffi::c_void,
            result: *mut isize,
            disposition: *mut u32,
        ) -> i32;
        fn RegOpenKeyExW(
            key: isize,
            sub_key: *const u16,
            options: u32,
            desired: u32,
            result: *mut isize,
        ) -> i32;
        fn RegSetValueExW(
            key: isize,
            value_name: *const u16,
            reserved: u32,
            value_type: u32,
            data: *const u8,
            data_size: u32,
        ) -> i32;
        fn RegDeleteValueW(key: isize, value_name: *const u16) -> i32;
        fn RegCloseKey(key: isize) -> i32;
    }

    #[cfg(target_pointer_width = "64")]
    const HKEY_CURRENT_USER: isize = 0xFFFF_FFFF_8000_0001u64 as isize;
    #[cfg(target_pointer_width = "32")]
    const HKEY_CURRENT_USER: isize = 0x8000_0001u32 as isize;
    const KEY_SET_VALUE: u32 = 0x0002;
    const REG_SZ: u32 = 1;
    const ERROR_FILE_NOT_FOUND: i32 = 2;

    unsafe {
        let sub_key = autostart_wide(AUTOSTART_KEY);
        let value_name = autostart_wide(AUTOSTART_VALUE_NAME);

        if enabled {
            let command = autostart_command()?;
            let mut key: isize = 0;
            let mut disposition = 0u32;
            let status = RegCreateKeyExW(
                HKEY_CURRENT_USER,
                sub_key.as_ptr(),
                0,
                std::ptr::null_mut(),
                0,
                KEY_SET_VALUE,
                std::ptr::null_mut(),
                &mut key,
                &mut disposition,
            );
            if status != 0 {
                return Err(format!("无法打开开机自启注册表项（错误 {status}）"));
            }
            let status = RegSetValueExW(
                key,
                value_name.as_ptr(),
                0,
                REG_SZ,
                command.as_ptr() as *const u8,
                (command.len() * 2) as u32,
            );
            RegCloseKey(key);
            if status != 0 {
                return Err(format!("无法写入开机自启设置（错误 {status}）"));
            }
            return Ok(());
        }

        let mut key: isize = 0;
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            sub_key.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut key,
        ) != 0
        {
            return Ok(());
        }
        let status = RegDeleteValueW(key, value_name.as_ptr());
        RegCloseKey(key);
        if status != 0 && status != ERROR_FILE_NOT_FOUND {
            return Err(format!("无法关闭开机自启（错误 {status}）"));
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn autostart_matches_current() -> bool {
    let Some(value) = autostart_value() else {
        return false;
    };
    let Ok(command) = autostart_command() else {
        return false;
    };
    let expected = String::from_utf16_lossy(&command[..command.len().saturating_sub(1)]);
    let normalize = |text: &str| {
        text.trim()
            .trim_matches('"')
            .replace('/', "\\")
            .to_lowercase()
    };
    normalize(&value) == normalize(&expected)
}

#[tauri::command]
fn get_autostart_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        return autostart_matches_current();
    }
    #[cfg(not(target_os = "windows"))]
    false
}

#[tauri::command]
fn set_autostart_enabled(enabled: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        set_autostart(enabled)?;
        return Ok(autostart_matches_current());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Err("开机自启仅支持 Windows".to_string())
    }
}

#[tauri::command]
fn create_folder(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("创建路径为空".to_string());
    }
    let folder = Path::new(trimmed);
    if folder.exists() {
        return Err("同名文件或文件夹已经存在".to_string());
    }
    fs::create_dir_all(folder).map_err(|error| format!("创建文件夹失败：{error}"))
}

#[tauri::command]
fn create_file(path: String, content: Option<String>) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("创建路径为空".to_string());
    }
    let file_path = Path::new(trimmed);
    if file_path.exists() {
        return Err("同名文件或文件夹已经存在".to_string());
    }
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建上级目录失败：{error}"))?;
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(file_path)
        .map_err(|error| format!("创建文件失败：{error}"))?;
    if let Some(value) = content {
        file.write_all(value.as_bytes())
            .map_err(|error| format!("写入文件失败：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let file_path = Path::new(path.trim());
    let metadata = fs::metadata(file_path).map_err(|error| format!("无法读取文件信息：{error}"))?;
    if metadata.len() > MAX_TEXT_BYTES {
        return Err("文件过大，请选择 20 MB 以内的书签或配置文件".to_string());
    }
    let bytes = fs::read(file_path).map_err(|error| format!("读取文件失败：{error}"))?;
    let content = String::from_utf8_lossy(&bytes).into_owned();
    Ok(content)
}

fn truncated(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn walk_bookmark_node(
    node: &serde_json::Value,
    parent_folder: &str,
    out: &mut Vec<BookmarkLink>,
    seen: &mut HashSet<String>,
) {
    if out.len() >= MAX_BOOKMARKS {
        return;
    }

    let node_type = node.get("type").and_then(serde_json::Value::as_str);
    if node_type == Some("url") {
        let url = node
            .get("url")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .trim();
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            return;
        }
        if !seen.insert(url.to_string()) {
            return;
        }
        let title = node
            .get("name")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(url);
        out.push(BookmarkLink {
            title: truncated(title, 200),
            url: url.to_string(),
            folder: parent_folder.to_string(),
        });
        return;
    }

    let next_folder = node
        .get("name")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(parent_folder);

    if let Some(children) = node.get("children").and_then(serde_json::Value::as_array) {
        for child in children {
            walk_bookmark_node(child, next_folder, out, seen);
            if out.len() >= MAX_BOOKMARKS {
                break;
            }
        }
    }
}

fn parse_bookmark_file(path: &Path) -> Result<Vec<BookmarkLink>, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("无法读取书签文件：{error}"))?;
    if metadata.len() > MAX_TEXT_BYTES {
        return Err("书签文件过大（超过 20 MB）".to_string());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取书签失败：{error}"))?;
    let text = String::from_utf8_lossy(&bytes);
    let text = text.trim_start_matches('\u{feff}');
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|error| format!("书签 JSON 解析失败：{error}"))?;
    let roots = value
        .get("roots")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "这不是有效的 Chromium 浏览器书签文件".to_string())?;

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for key in ["bookmark_bar", "other", "synced"] {
        if let Some(root) = roots.get(key) {
            walk_bookmark_node(root, "", &mut out, &mut seen);
        }
    }
    Ok(out)
}

#[tauri::command]
fn list_bookmark_sources() -> Vec<BookmarkSource> {
    let Some(local_data) = dirs::data_local_dir() else {
        return Vec::new();
    };

    let browsers = [
        (
            "Chrome",
            local_data.join("Google").join("Chrome").join("User Data"),
        ),
        (
            "Edge",
            local_data.join("Microsoft").join("Edge").join("User Data"),
        ),
        (
            "Brave",
            local_data
                .join("BraveSoftware")
                .join("Brave-Browser")
                .join("User Data"),
        ),
    ];

    let mut sources = Vec::new();
    for (browser, user_data) in browsers {
        let Ok(entries) = fs::read_dir(&user_data) else {
            continue;
        };
        let mut profiles: Vec<String> = entries
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                if !path.is_dir() {
                    return None;
                }
                entry.file_name().to_str().map(str::to_string)
            })
            .filter(|name| name != "Guest Profile" && !name.starts_with("System Profile"))
            .collect();
        profiles.sort_by(|a, b| {
            let rank = |name: &str| if name == "Default" { 0 } else { 1 };
            rank(a).cmp(&rank(b)).then_with(|| a.cmp(b))
        });

        for profile in profiles {
            let bookmark_path = user_data.join(&profile).join("Bookmarks");
            if !bookmark_path.is_file() {
                continue;
            }
            let count = parse_bookmark_file(&bookmark_path)
                .map(|bookmarks| bookmarks.len())
                .unwrap_or(0);
            if count == 0 {
                continue;
            }
            let profile_label = if profile == "Default" {
                "默认资料".to_string()
            } else {
                profile
            };
            sources.push(BookmarkSource {
                browser: browser.to_string(),
                profile: profile_label,
                path: bookmark_path.to_string_lossy().into_owned(),
                count,
            });
        }
    }
    sources
}

#[tauri::command]
fn read_browser_bookmarks(path: String) -> Result<Vec<BookmarkLink>, String> {
    let file = Path::new(path.trim());
    if !file.is_file() {
        return Err("书签文件不存在".to_string());
    }
    parse_bookmark_file(file)
}

#[cfg(target_os = "windows")]
#[derive(Clone, serde::Serialize)]
struct DragEventPosition {
    x: f64,
    y: f64,
}

#[cfg(target_os = "windows")]
#[derive(Clone, serde::Serialize)]
struct DragEventPayload {
    paths: Vec<String>,
    position: DragEventPosition,
}

#[cfg(target_os = "windows")]
fn drag_position(hwnd: isize, point: &POINTL) -> DragEventPosition {
    #[repr(C)]
    struct NativeRect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetWindowRect(window: isize, rect: *mut NativeRect) -> i32;
    }

    let mut rect = NativeRect {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    unsafe {
        let _ = GetWindowRect(hwnd, &mut rect);
    }
    DragEventPosition {
        x: (point.x - rect.left) as f64,
        y: (point.y - rect.top) as f64,
    }
}

#[cfg(target_os = "windows")]
fn hdrop_paths(data: &IDataObject) -> Vec<String> {
    let format = FORMATETC {
        cfFormat: CF_HDROP.0,
        ptd: std::ptr::null_mut(),
        dwAspect: DVASPECT_CONTENT.0,
        lindex: -1,
        tymed: TYMED_HGLOBAL.0 as u32,
    };

    unsafe {
        let mut paths = Vec::new();
        if let Ok(mut medium) = data.GetData(&format) {
            if medium.tymed == TYMED_HGLOBAL.0 as u32 {
                let drop = HDROP(medium.u.hGlobal.0);
                let count = DragQueryFileW(drop, u32::MAX, None);
                for index in 0..count {
                    let length = DragQueryFileW(drop, index, None);
                    if length == 0 {
                        continue;
                    }
                    let mut buffer = vec![0u16; length as usize + 1];
                    let copied = DragQueryFileW(drop, index, Some(&mut buffer));
                    if copied == 0 {
                        continue;
                    }
                    let path = String::from_utf16_lossy(&buffer[..copied as usize]);
                    if !path.is_empty() {
                        paths.push(path);
                    }
                }
            }
            ReleaseStgMedium(&mut medium);
        }

        // Explorer cannot build CF_HDROP for some very long paths; the shell
        // item array has no MAX_PATH restriction and is also used by some
        // virtual shell sources.
        if paths.is_empty() {
            if let Ok(items) =
                SHCreateShellItemArrayFromDataObject::<_, IShellItemArray>(data)
            {
                let count = items.GetCount().unwrap_or(0);
                for index in 0..count {
                    let Ok(item) = items.GetItemAt(index) else {
                        continue;
                    };
                    let Ok(name) = item.GetDisplayName(SIGDN_FILESYSPATH) else {
                        continue;
                    };
                    let path = String::from_utf16_lossy(name.as_wide());
                    CoTaskMemFree(Some(name.0 as _));
                    if !path.is_empty() {
                        paths.push(path);
                    }
                }
            }
        }

        paths
    }
}

#[cfg(target_os = "windows")]
#[windows::core::implement(IDropTarget)]
struct DeskDropTarget {
    app: tauri::AppHandle,
    hwnd: isize,
    paths: Mutex<Vec<String>>,
}

#[cfg(target_os = "windows")]
impl IDropTarget_Impl for DeskDropTarget_Impl {
    fn DragEnter(
        &self,
        data: Ref<'_, IDataObject>,
        _keys: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let paths = data
            .as_ref()
            .map(hdrop_paths)
            .unwrap_or_default();
        if paths.is_empty() {
            unsafe {
                *effect = DROPEFFECT_NONE;
            }
            return Ok(());
        }
        if let Ok(mut stored) = self.paths.lock() {
            *stored = paths.clone();
        }
        unsafe {
            *effect = DROPEFFECT_COPY;
        }
        let _ = self.app.emit_to(
            "main",
            "deskgrid://native-drag-enter",
            DragEventPayload {
                paths,
                position: drag_position(self.hwnd, point),
            },
        );
        Ok(())
    }

    fn DragOver(
        &self,
        _keys: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let accepted = self
            .paths
            .lock()
            .map(|stored| !stored.is_empty())
            .unwrap_or(false);
        if !accepted {
            unsafe {
                *effect = DROPEFFECT_NONE;
            }
            return Ok(());
        }
        unsafe {
            *effect = DROPEFFECT_COPY;
        }
        let _ = self.app.emit_to(
            "main",
            "deskgrid://native-drag-over",
            DragEventPayload {
                paths: Vec::new(),
                position: drag_position(self.hwnd, point),
            },
        );
        Ok(())
    }

    fn DragLeave(&self) -> windows::core::Result<()> {
        if let Ok(mut stored) = self.paths.lock() {
            stored.clear();
        }
        let _ = self.app.emit_to("main", "deskgrid://native-drag-leave", ());
        Ok(())
    }

    fn Drop(
        &self,
        data: Ref<'_, IDataObject>,
        _keys: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let extracted = data
            .as_ref()
            .map(hdrop_paths)
            .unwrap_or_default();
        let paths = if extracted.is_empty() {
            self.paths
                .lock()
                .map(|mut stored| std::mem::take(&mut *stored))
                .unwrap_or_default()
        } else {
            if let Ok(mut stored) = self.paths.lock() {
                stored.clear();
            }
            extracted
        };
        unsafe {
            *effect = DROPEFFECT_COPY;
        }
        let _ = self.app.emit_to(
            "main",
            "deskgrid://native-drag-drop",
            DragEventPayload {
                paths,
                position: drag_position(self.hwnd, point),
            },
        );
        Ok(())
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn collect_child_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let children = &mut *(lparam.0 as *mut Vec<HWND>);
    children.push(hwnd);
    true.into()
}

#[cfg(target_os = "windows")]
fn register_drop_on(native: HWND, app: &tauri::AppHandle, top_level: isize) -> bool {
    let target: IDropTarget = DeskDropTarget {
        app: app.clone(),
        hwnd: top_level,
        paths: Mutex::new(Vec::new()),
    }
    .into();

    // WebView2 creates several child HWNDs over the webview surface. OLE
    // targets the deepest window under the cursor, so each child needs its
    // own target (the same approach used by wry).
    unsafe {
        let _ = RevokeDragDrop(native);
    }
    let registered = unsafe { RegisterDragDrop(native, &target) }.is_ok();
    if registered {
        // OLE owns a COM reference for the lifetime of the window.
        std::mem::forget(target);
    }
    registered
}

#[cfg(target_os = "windows")]
fn register_native_drop_target(window: &tauri::WebviewWindow) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("无法获取窗口句柄：{error}"))?;
    unsafe {
        let _ = OleInitialize(None);
    }

    let top_level = hwnd.0 as isize;
    let mut targets: Vec<HWND> = vec![hwnd];
    let mut children: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(collect_child_window),
            LPARAM(&mut children as *mut Vec<HWND> as isize),
        );
    }
    targets.extend(children);

    let app = window.app_handle();
    let registered = targets
        .into_iter()
        .filter(|native| register_drop_on(*native, app, top_level))
        .count();
    if registered == 0 {
        Err("没有可用的拖放窗口".to_string())
    } else {
        Ok(())
    }
}

/// Windows sometimes leaves a caption bar / resize frame on a transparent
/// window. Remove the non-client styles explicitly so no close button or
/// border can peek through the clipped window region.
#[cfg(target_os = "windows")]
fn remove_native_frame(window: &tauri::WebviewWindow, force_refresh: bool) {
    #[link(name = "user32")]
    extern "system" {
        fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
        fn SetWindowPos(
            hwnd: isize,
            insert_after: isize,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
    }
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(hwnd: isize, attr: u32, value: *const u32, size: u32) -> i32;
    }

    const GWL_STYLE: i32 = -16;
    const GWL_EXSTYLE: i32 = -20;
    const WS_CAPTION: isize = 0x00C0_0000;
    const WS_THICKFRAME: isize = 0x0004_0000;
    const WS_SYSMENU: isize = 0x0008_0000;
    const WS_MINIMIZEBOX: isize = 0x0002_0000;
    const WS_MAXIMIZEBOX: isize = 0x0001_0000;
    const WS_POPUP: isize = 0x8000_0000u32 as isize;
    const WS_EX_APPWINDOW: isize = 0x0004_0000;
    const WS_EX_WINDOWEDGE: isize = 0x0000_0100;
    const WS_EX_CLIENTEDGE: isize = 0x0000_0200;
    const WS_EX_DLGMODALFRAME: isize = 0x0000_0001;
    const WS_EX_STATICEDGE: isize = 0x0002_0000;
    const WS_EX_TOOLWINDOW: isize = 0x0000_0080;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;

    unsafe {
        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let hwnd = hwnd.0 as isize;

        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let next_style = (style
            & !(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX))
            | WS_POPUP;

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let next_ex_style = (ex_style
            & !(WS_EX_APPWINDOW
                | WS_EX_WINDOWEDGE
                | WS_EX_CLIENTEDGE
                | WS_EX_DLGMODALFRAME
                | WS_EX_STATICEDGE))
            | WS_EX_TOOLWINDOW;

        if next_style == style && next_ex_style == ex_style && !force_refresh {
            return;
        }

        if next_style != style {
            SetWindowLongPtrW(hwnd, GWL_STYLE, next_style);
        }
        if next_ex_style != ex_style {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next_ex_style);
        }

        // Only ask DWM to recalculate the non-client area when a style actually
        // changed; doing this on every overlay toggle makes the edges flash.
        SetWindowPos(
            hwnd,
            0,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );

        // Ask DWM to stay out of the non-client area as well. This suppresses
        // residual caption/border painting and active-window edge flashes that
        // survive an otherwise borderless WS_POPUP window.
        let nc_rendering_disabled: u32 = 2; // DWMNCRP_DISABLED
        let _ = DwmSetWindowAttribute(hwnd, 2, &nc_rendering_disabled, 4);
        let transitions_disabled: u32 = 1;
        let _ = DwmSetWindowAttribute(hwnd, 3, &transitions_disabled, 4);
        let do_not_round: u32 = 1; // DWMWCP_DONOTROUND (Windows 11+)
        let _ = DwmSetWindowAttribute(hwnd, 33, &do_not_round, 4);
        let no_border: u32 = 0xFFFF_FFFE; // DWMWA_COLOR_NONE (Windows 11+)
        let _ = DwmSetWindowAttribute(hwnd, 34, &no_border, 4);
    }
}

#[cfg(target_os = "windows")]
fn apply_native_region(window: &tauri::WebviewWindow, overlay: bool, rects: &[WindowRect]) {
    #[link(name = "user32")]
    extern "system" {
        fn SetWindowRgn(hwnd: isize, hrgn: isize, redraw: i32) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateRectRgn(x1: i32, y1: i32, x2: i32, y2: i32) -> isize;
        fn CreateRoundRectRgn(x1: i32, y1: i32, x2: i32, y2: i32, w: i32, h: i32) -> isize;
        fn CombineRgn(dest: isize, src1: isize, src2: isize, mode: i32) -> i32;
        fn DeleteObject(object: isize) -> i32;
    }

    const RGN_OR: i32 = 2;

    unsafe {
        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let hwnd = hwnd.0 as isize;

        if overlay && rects.is_empty() {
            // Menus, onboarding and other full-surface overlays.
            SetWindowRgn(hwnd, 0, 1);
            return;
        }

        let mut combined = CreateRectRgn(0, 0, 0, 0);
        if combined == 0 {
            return;
        }

        for rect in rects {
            if rect.width <= 0 || rect.height <= 0 {
                continue;
            }
            let right = rect.x.saturating_add(rect.width);
            let bottom = rect.y.saturating_add(rect.height);
            let piece = if rect.radius > 0 {
                let max_radius = rect.width.min(rect.height) / 2;
                let radius = rect.radius.min(max_radius).max(0);
                CreateRoundRectRgn(rect.x, rect.y, right, bottom, radius * 2, radius * 2)
            } else {
                CreateRectRgn(rect.x, rect.y, right, bottom)
            };
            if piece == 0 {
                continue;
            }
            let next = CreateRectRgn(0, 0, 0, 0);
            if next != 0 {
                CombineRgn(next, combined, piece, RGN_OR);
                DeleteObject(combined);
                combined = next;
            }
            DeleteObject(piece);
        }

        if SetWindowRgn(hwnd, combined, 1) == 0 {
            DeleteObject(combined);
        }
    }
}

#[tauri::command]
fn set_window_layout(
    window: tauri::WebviewWindow,
    overlay: bool,
    rects: Vec<WindowRect>,
) -> Result<(), String> {
    OVERLAY_ACTIVE.store(overlay, Ordering::SeqCst);

    if overlay {
        let _ = window.set_always_on_bottom(false);
        window
            .set_always_on_top(true)
            .map_err(|error| format!("无法更新窗口层级：{error}"))?;
    } else {
        let _ = window.set_always_on_top(false);
        window
            .set_always_on_bottom(true)
            .map_err(|error| format!("无法更新窗口层级：{error}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        let region_window = window.clone();
        window
            .run_on_main_thread(move || {
                remove_native_frame(&region_window, false);
                apply_native_region(&region_window, overlay, &rects);
            })
            .map_err(|error| format!("无法更新窗口区域：{error}"))?;
    }

    if overlay {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.set_skip_taskbar(true);
    }

    Ok(())
}

fn normalize_settings_tab(tab: Option<String>) -> String {
    let value = tab.unwrap_or_else(|| "appearance".to_string());
    match value.as_str() {
        "security" | "data" | "about" => value,
        _ => "appearance".to_string(),
    }
}

/// The settings page lives in a regular taskbar window instead of an overlay
/// so it never covers the desktop cards and can be switched like any app.
#[tauri::command]
async fn open_settings_window(
    app: tauri::AppHandle,
    tab: Option<String>,
) -> Result<(), String> {
    let tab = normalize_settings_tab(tab);

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = app.emit_to("settings", "deskgrid://settings-tab", tab);
        return Ok(());
    }

    if let Ok(mut pending) = PENDING_SETTINGS_TAB.lock() {
        *pending = Some(tab);
    }

    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("RYJS DeskGrid 设置")
    .inner_size(1080.0, 760.0)
    .min_inner_size(840.0, 560.0)
    .center()
    .resizable(true)
    .minimizable(true)
    .maximizable(true)
    .closable(true)
    .decorations(true)
    .skip_taskbar(false)
    .always_on_top(false)
    .always_on_bottom(false)
    .shadow(true)
    .build()
    .map_err(|error| format!("无法打开设置窗口：{error}"))?;

    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn take_settings_entry_tab() -> Option<String> {
    PENDING_SETTINGS_TAB
        .lock()
        .ok()
        .and_then(|mut pending| pending.take())
}

#[tauri::command]
fn close_settings_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "settings" {
        window
            .close()
            .map_err(|error| format!("无法关闭设置窗口：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn request_onboarding(app: tauri::AppHandle) -> Result<(), String> {
    show_main_window(&app);
    app.emit_to("main", "deskgrid://onboarding", ())
        .map_err(|error| format!("无法打开新手引导：{error}"))
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        // Showing/activating a window can recreate its taskbar tab on Windows.
        let _ = window.set_skip_taskbar(true);
    }
}

fn fit_to_screen(window: &tauri::WebviewWindow) {
    // Keep the WebView's own edge off-screen so its compositor fringe never
    // reaches UI that sits at the display edge. Keep in sync with WINDOW_EDGE
    // in `src/lib/layout.ts`.
    const WINDOW_EDGE: f64 = 64.0;

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let position = monitor.position();
        let size = monitor.size();
        let edge = (WINDOW_EDGE * monitor.scale_factor()).round() as i32;
        let width = size.width.saturating_add((edge.max(0) * 2) as u32);
        let height = size.height.saturating_add((edge.max(0) * 2) as u32);
        let _ = window.set_position(PhysicalPosition::new(
            position.x.saturating_sub(edge),
            position.y.saturating_sub(edge),
        ));
        let _ = window.set_size(PhysicalSize::new(width, height));
    }
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show-window", "显示桌面", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide-window", "隐藏到托盘", true, None::<&str>)?;
    let privacy = MenuItem::with_id(app, "privacy-lock", "隐私锁…", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "open-settings", "设置…", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 DeskGrid", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &hide, &privacy, &settings, &separator, &quit])?;
    let Some(icon) = app.default_window_icon().cloned() else {
        return Ok(());
    };

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("RYJS DeskGrid")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-window" => show_main_window(app),
            "hide-window" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "privacy-lock" => {
                show_main_window(app);
                let _ = app.emit("deskgrid://privacy-lock", ());
            }
            "open-settings" => {
                // The command is async; awaiting it from a spawned task keeps
                // the tray callback off the main thread while WebView2 builds.
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_settings_window(handle, Some("appearance".to_string())).await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn flattens_chromium_bookmarks_and_skips_unsafe_or_duplicate_links() {
        let root = json!({
            "type": "folder",
            "name": "书签栏",
            "children": [
                {
                    "type": "url",
                    "name": "Tauri",
                    "url": "https://tauri.app/"
                },
                {
                    "type": "folder",
                    "name": "开发",
                    "children": [
                        {
                            "type": "url",
                            "name": "GitHub",
                            "url": "https://github.com/"
                        },
                        {
                            "type": "url",
                            "name": "重复项",
                            "url": "https://github.com/"
                        },
                        {
                            "type": "url",
                            "name": "不安全链接",
                            "url": "javascript:alert(1)"
                        }
                    ]
                }
            ]
        });

        let mut out = Vec::new();
        let mut seen = HashSet::new();
        walk_bookmark_node(&root, "", &mut out, &mut seen);

        assert_eq!(out.len(), 2);
        assert_eq!(out[0].title, "Tauri");
        assert_eq!(out[0].folder, "书签栏");
        assert_eq!(out[1].title, "GitHub");
        assert_eq!(out[1].folder, "开发");
    }

    #[test]
    fn truncates_long_titles_by_characters() {
        assert_eq!(truncated("桌面收纳", 2), "桌面");
        assert_eq!(truncated("short", 200), "short");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn extracts_the_shell_icon_for_notepad() {
        let path = Path::new(r"C:\Windows\System32\notepad.exe");
        if !path.is_file() {
            return;
        }
        let icon = icon_png_data_url(path).expect("notepad icon");
        assert!(icon.starts_with("data:image/png;base64,"));
        assert!(icon.len() > 1000);
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            system_paths,
            open_target,
            inspect_paths,
            app_icon_data_url,
            get_autostart_enabled,
            set_autostart_enabled,
            create_folder,
            create_file,
            read_text_file,
            list_bookmark_sources,
            read_browser_bookmarks,
            set_window_layout,
            open_settings_window,
            take_settings_entry_tab,
            close_settings_window,
            request_onboarding
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                fit_to_screen(&window);
                let _ = window.set_decorations(false);
                let _ = window.set_skip_taskbar(true);
                let _ = window.set_always_on_bottom(true);
                #[cfg(target_os = "windows")]
                remove_native_frame(&window, false);

                let event_window = window.clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = event_window.hide();
                    }
                    WindowEvent::Focused(false) => {
                        if !OVERLAY_ACTIVE.load(Ordering::SeqCst) {
                            let _ = event_window.set_always_on_bottom(true);
                        }
                    }
                    _ => {}
                });

                let _ = window.show();
                let _ = window.set_skip_taskbar(true);
                #[cfg(target_os = "windows")]
                {
                    remove_native_frame(&window, true);
                    if let Err(error) = register_native_drop_target(&window) {
                        eprintln!("[deskgrid] native drop target: {error}");
                    }
                    // WebView2 can finish creating its child HWNDs just after
                    // setup; register once more on the main thread.
                    let retry_window = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(1500));
                        let target = retry_window.clone();
                        let _ = retry_window.run_on_main_thread(move || {
                            let _ = register_native_drop_target(&target);
                        });
                    });
                }
            }

            build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running RYJS DeskGrid");
}
