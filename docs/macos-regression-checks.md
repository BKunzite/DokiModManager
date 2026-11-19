# macOS regression checks

These changes keep the upstream application identity, release channel, version,
settings panel, license and credits. Cover framing is metadata: it never rewrites
the source image. Home thumbnail and window background frames are independent.
Mod descriptions, cover filenames and frames are stored in the existing mod JSON
alongside its other fields; relative executable paths are retained.

## Automated checks

With Node.js and Rust available:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run test:launch
npm run build
```

`npm test` runs 23 checks using synthetic data. These exercise image import,
exclusive creation and collisions, cancellation, stable cover identities,
metadata preservation and rollback, HTML escaping, framing geometry, the actual
frontend launch handler's preflight/error/concurrency behavior, and bounded
version checks with explicit offline errors.

`npm run test:launch` runs seven Unix Rust checks without launching the manager.
They cover Mach-O byte orders and universal binaries, missing Rosetta versus
unsupported 32-bit engines, read-only preflight, narrowly scoped execute
permissions, and real synthetic shell commands in paths containing spaces. Both
successful and unsuccessful process exit statuses are checked. Game/save
sentinels retain their bytes and permissions.

For the WebKit checks, install Playwright and its WebKit browser in a separate
test environment. It is intentionally not a production dependency. Start Vite
with `npm run dev -- --host 127.0.0.1`, then run:

```sh
PLAYWRIGHT_MODULE=file:///absolute/path/to/playwright/index.mjs npm run test:ui
```

Optional variables: `UI_BASE_URL` (default `http://127.0.0.1:1420`) and
`UI_OUTPUT_DIR` (default `ui-results`). The fixture mounts the production Vue
views and exercises production editor, import, Home and description event
bindings. Tauri file/dialog IPC is replaced with synthetic in-memory data; it
does not initialize the installed manager or open real mods.

The checks run at 1200×600, 1000×600 and 1440×900. They exercise both Home crop
entrypoints, independent thumbnail/background frames, legacy background offset
migration, save/reload, cancellation and failed writes, drag/reset/fit controls,
PNG/JPEG/WebP/SVG decoding, stable image selection, editable descriptions and
escaped text. Updates checks include long release notes, panel boundaries,
offline recovery, and the requirement that checking alone never installs an
update. A mocked install is invoked only through its explicit button.
The real upstream Settings panel opens with its three toggles and closes without
changing preferences; the Discord action uses a mocked URL opener.

## Native dry run

Build a debug app with a distinct test bundle identifier/name. The existing
upstream debug path uses the working directory's `.dokimodmanager`; launch it
from a fresh temporary directory containing synthetic config and mod fixtures.
For additional isolation, deny the test process access to the installed data and
save directories with a test-only process sandbox. Never point a debug fixture
at a real mod directory.

On Apple silicon macOS, the native dry run verified complete application startup
with three synthetic mods, Home background/thumbnail framing saved to JSON and
restored after process restart, the separate Updates/log panels, a real upstream
version check, return to Home, the upstream Settings panel with all three toggles,
and normal Quit. Compare fixture hashes before and
after; only explicitly saved settings and normal temporary startup artifacts
should change. Compare the installed data separately to confirm isolation.

Build the final release executable without installing it:

```sh
npm run tauri -- build --no-bundle --ci \
  --config '{"build":{"beforeBuildCommand":"npm run build"}}' -- --locked
```

The release executable and native debug app were built on Apple silicon macOS.
The native automation could not reliably target legacy mouse-only controls, so
mod-description write failures and launch UI recovery were verified by the
automated production-handler/IPC fixtures, not by claiming a complete native
click-through. No full mod story playthrough, Windows/Linux runtime validation,
release installation, or live updater installation is part of these checks.
