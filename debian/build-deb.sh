#!/usr/bin/env bash
# Собирает .deb (и AppImage) «Aether Desktop» для Debian 13.
#
#   ./debian/build-deb.sh            # собрать .deb + AppImage
#   ./debian/build-deb.sh deb        # только .deb
#
# Требуется: Node.js >= 22.19, npm, сеть для npm install (Electron, electron-builder).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$here/aether-desktop"
target="${1:-deb AppImage}"

fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
info() { printf '\033[36m→ %s\033[0m\n' "$1"; }

command -v node >/dev/null || fail "Node.js не найден. Установите Node.js >= 22.19."
command -v npm >/dev/null || fail "npm не найден."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" -ge 20 ]] || fail "Нужен Node.js >= 20 (сейчас $(node -v))."
info "Node.js $(node -v)"

if [[ ! -d "$app_dir/vendor/pi-bridge/node_modules" ]]; then
  info "Устанавливаю зависимости ядра агента (vendor/pi-bridge)"
  ( cd "$app_dir/vendor/pi-bridge" && npm install --no-audit --no-fund )
fi
if [[ ! -f "$app_dir/vendor/pi-bridge/dist/bridge.mjs" ]]; then
  info "Собираю ядро агента (vendor/pi-bridge: npm run build)"
  ( cd "$app_dir/vendor/pi-bridge" && npm run build )
fi

if [[ ! -d "$app_dir/node_modules" ]]; then
  info "Устанавливаю зависимости приложения (electron, electron-builder)"
  ( cd "$app_dir" && npm install --no-audit --no-fund )
fi

info "Запускаю electron-builder: --linux $target"
( cd "$app_dir" && npx electron-builder --linux $target --publish never )

info "Готово. Артефакты:"
ls -lh "$app_dir/dist-electron"/*.deb "$app_dir/dist-electron"/*.AppImage 2>/dev/null || ls -lh "$app_dir/dist-electron"

cat <<'EOF'

Установка на Debian 13:
  sudo apt install ./debian/aether-desktop/dist-electron/Aether-*.deb
  aether-desktop

Либо AppImage:
  chmod +x debian/aether-desktop/dist-electron/Aether-*.AppImage
  ./debian/aether-desktop/dist-electron/Aether-*.AppImage
EOF