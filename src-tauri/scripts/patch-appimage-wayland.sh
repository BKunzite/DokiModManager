#!/usr/bin/env bash

# provided by https://girishjoshi.io/post/tauri-2.0-appimage-egl-issue-on-wayland/

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
src_tauri_dir="$repo_root/src-tauri"
hook_src="$src_tauri_dir/appimage/apprun-wayland-compat.sh"

if [ ! -f "$hook_src" ]; then
    echo "can't find hook script: $hook_src" >&2
    exit 1
fi

appdir="$(find "$src_tauri_dir/target/release" -type d -name '*.AppDir' -print -quit)"

if [ -z "$appdir" ]; then
    echo "no *.AppDir under $src_tauri_dir/target - did you run tauri build yet?" >&2
    exit 1
fi

echo "found AppDir: $appdir"

hooks_dir="$appdir/apprun-hooks"
mkdir -p "$hooks_dir"
cp "$hook_src" "$hooks_dir/wayland-compat.sh"
chmod +x "$hooks_dir/wayland-compat.sh"
echo "hook installed -> $hooks_dir/wayland-compat.sh"

apprun="$appdir/AppRun"
wrapped="$appdir/AppRun.wrapped"

if [ ! -f "$apprun" ]; then
    echo "expected AppRun at $apprun but it's missing" >&2
    exit 1
fi

if [ ! -f "$wrapped" ] && [ ! -L "$apprun" ]; then
    mv "$apprun" "$wrapped"
    chmod +x "$wrapped"
fi

cat > "$apprun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

HERE="$(dirname "$(readlink -f "${0}")")"

if [ -f "$HERE/apprun-hooks/wayland-compat.sh" ]; then
    # shellcheck disable=SC1091
    source "$HERE/apprun-hooks/wayland-compat.sh"
fi

exec "$HERE/AppRun.wrapped" "$@"
EOF

chmod +x "$apprun"
echo "AppRun patched, now sources wayland-compat.sh before AppRun.wrapped"

linuxdeploy_bin="$HOME/.cache/tauri/linuxdeploy-x86_64.AppImage"

if [ ! -f "$linuxdeploy_bin" ]; then
    echo "warning: linuxdeploy-x86_64.AppImage not found under ~/.cache/tauri" >&2
    echo "download it from:" >&2
    echo "  wget https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage -O $linuxdeploy_bin" >&2
    exit 1
fi

chmod +x "$linuxdeploy_bin"

out_dir="$(dirname "$appdir")"
echo "repacking with $linuxdeploy_bin ..."
APPIMAGE_EXTRACT_AND_RUN=1 ARCH="${ARCH:-x86_64}" "$linuxdeploy_bin" --appdir "$appdir" --output appimage

new_appimage="$(find . -maxdepth 1 -type f -iname '*.AppImage' -newer "$appdir/AppRun" -print -quit)"
if [ -n "$new_appimage" ]; then
    mv "$new_appimage" "$out_dir/"
    echo "patched AppImage ready: $out_dir/$(basename "$new_appimage")"
fi

echo "done."