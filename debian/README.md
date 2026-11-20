# Aether Desktop — Debian deliverable

This directory contains a self-contained **Electron desktop application** deliverable for **Debian 13**: `debian/aether-desktop/` (app sources, vendored `pi-bridge`/extensions snapshot, packaging config, smoke tests) plus a launcher `.desktop` template.

> **Important:** `debian/aether-desktop/` does **not** include `node_modules/`, Electron binaries, or built `pi-bridge` `dist/` artifacts. You must run `npm install` (and build the bridge) in the indicated directories before running or packaging on a Debian 13 machine with network access.

## Layout

- `aether-desktop/` — Electron app (main/preload/renderer, UI, runtime adapters, settings, sudo-once-per-session, poll rendering), `vendor/pi-bridge/` (copy of `pi-bridge/` sources), `vendor/extensions/` (relevant extensions), `test/smoke.js`, `build/` assets.
- `aether-desktop.desktop` — freedesktop launcher template (also generated/installed by `.deb` packaging via electron-builder metadata).

## Prerequisites (Debian 13)

- **Node.js >= 22.19.0** and **npm** (required by pi-bridge/tooling). Install via NodeSource, `nvm`, or distro packages that meet the version requirement.
- **Build tools** for native deps/electron-builder: `build-essential`, `python3`, `git` (optional), and standard Electron runtime libs (usually pulled by `.deb` deps): `libgtk-3-0`, `libnss3`, `libasound2t64|libasound2`, `libnotify4`, `xdg-utils`, `libxtst6`, `libxss1`, `libgbm1`, `libdrm2`, `libxcb-dri3-0`.
- **sudo** (optional, for the app’s “sudo once per session” feature).

Example base packages:
```bash
sudo apt update
sudo apt install -y build-essential python3 ca-certificates curl
# + install Node.js >= 22.19 (e.g. NodeSource) before continuing
node -v   # must be >= v22.19.0
npm -v
```

## 1) Prepare the vendored pi-bridge (agent runtime)

The desktop app spawns the Pi bridge process (`vendor/pi-bridge/dist/bridge.mjs`) to run the agent with tools (bash/read/write/edit/grep/find/ls, host/runtime integration hooks). Build it once:

```bash
cd debian/aether-desktop/vendor/pi-bridge
npm install
npm run build
# optional: npm test   # bridge’s own tests (may require its dev deps/runtime expectations)
```

## 2) Run the desktop app from source (dev)

```bash
cd debian/aether-desktop
npm install
npm start
```

Notes:
- If launched from a full repo checkout, the runtime also auto-detects `../../pi-bridge/dist/bridge.mjs`. In a standalone copy of this deliverable, it uses `vendor/pi-bridge/dist/bridge.mjs`.
- Configure provider/base URL/API key/model in **Настройки** (saved to `~/.config/aether-desktop/settings.json`, mode 0600).

## 3) Run smoke tests (no npm install required)

The smoke tests use Node’s built-in test runner and mock/stub Electron & child_process where needed:

```bash
cd debian/aether-desktop
npm test
# or: node --test test/smoke.js
```

## 4) Build `.deb` and/or AppImage packages

```bash
cd debian/aether-desktop
npm install          # installs electron + electron-builder locally
# ensure vendor/pi-bridge is built (step 1) so dist/bridge.mjs is included
npm run dist         # builds .deb and .AppImage into dist-electron/
# or: npm run dist:deb / npm run dist:appimage
```

Artifacts: `dist-electron/Aether-<version>-<arch>.deb`, `dist-electron/Aether-<version>-<arch>.AppImage` (names depend on builder config/arch).

Install the generated package on Debian 13:
```bash
sudo apt install ./dist-electron/Aether-*.deb
# or run the AppImage after chmod +x
```

## Sudo-once-per-session

- The app can validate sudo **once per session** via a GUI password prompt (uses `sudo -S -v`) and keep the timestamp alive with `sudo -n -v` while the session is active.
- The password is **not stored**; it is passed to `sudo` stdin for validation only. Privileged commands run as `sudo -n bash -lc ...` after a successful grant.
- Requires system `sudo` and user sudo privileges. Enable in **Настройки → Разрешить sudo**.

## Pi reuse/extension strategy (summary)

- **Reused:** `pi-bridge` (TypeScript bridge over `@earendil-works/pi-coding-agent` / `pi-agent-core` / `pi-ai`) vendored in `vendor/pi-bridge/` and executed as a Node subprocess speaking JSONL protocol; agent tools come from the Pi runtime (bash/read/write/edit/grep/find/ls, extension tools when wired).
- **Vendored extensions:** `vendor/extensions/` contains `aether-ai-lab`, `aether-lab-power`, `pi-subagents`, `pi-mcp-adapter`, `pi-web-access` sources from this repo for parity. Practical enablement in the desktop app depends on bridge/extension runtime compatibility and per-extension build steps (some are TS and expect the original app runtime/tooling).
- **UI parity:** chat + streaming assembly, settings screen (provider/base URL/key/model/sudo/workspace), interactive poll cards from ` ```poll``` ` fences (options/multi-select/custom answer submitted into chat), sudo session UX. Not all Android-specific host integrations are available on plain Debian; gaps are reported honestly in the app README/runtime info.

## Security notes

- No secrets are stored in the repository. API keys are saved only in the user’s local config file (`~/.config/aether-desktop/settings.json`, chmod 600).
- Electron renderer runs with `contextIsolation: true` and a minimal preload bridge.
- Review extension code before enabling third-party extensions with tool access.
