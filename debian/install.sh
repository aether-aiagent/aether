#!/usr/bin/env bash
# Установка «Aether Desktop» на Debian 13 из этого репозитория.
#
#   sudo ./debian/install.sh                 # собрать .deb и установить его
#   sudo ./debian/install.sh --portable DIR  # разложить в каталог и создать ярлык (без .deb)
#
# Требуется: Node.js >= 22.19, npm, сеть для npm install.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$here/aether-desktop"
mode="deb"
portable_dir=""

fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
info() { printf '\033[36m→ %s\033[0m\n' "$1"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --portable) mode="portable"; portable_dir="${2:-/opt/aether-desktop}"; shift 2 ;;
    -h|--help) sed -n '1,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) fail "Неизвестный аргумент: $1" ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] || fail "Запустите через sudo (нужна установка системных файлов)."
[[ -d "$app_dir" ]] || fail "Не найден каталог приложения: $app_dir"
command -v node >/dev/null || fail "Node.js не найден. Установите Node.js >= 22.19."

info "Node.js $(node -v)"

info "Собираю ядро агента (vendor/pi-bridge)"
( cd "$app_dir/vendor/pi-bridge" && npm install --no-audit --no-fund && npm run build )

info "Устанавливаю зависимости приложения"
( cd "$app_dir" && npm install --no-audit --no-fund )

if [[ "$mode" == "deb" ]]; then
  info "Собираю .deb"
  ( cd "$app_dir" && npx electron-builder --linux deb --publish never )
  deb_file="$(ls -1 "$app_dir"/dist-electron/*.deb 2>/dev/null | head -n1 || true)"
  [[ -n "$deb_file" ]] || fail "electron-builder не создал .deb (см. вывод выше)."
  info "Устанавливаю $deb_file"
  apt-get install -y "$deb_file"
  info "Готово. Запуск: aether-desktop"
  exit 0
fi

info "Portable-установка в $portable_dir"
mkdir -p "$portable_dir"
cp -a "$app_dir/main.js" "$app_dir/preload.js" "$app_dir/renderer.js" \
      "$app_dir/index.html" "$app_dir/styles.css" "$app_dir/package.json" \
      "$app_dir/src" "$app_dir/build" "$app_dir/vendor" "$portable_dir/"
ln -sfn "$portable_dir" /opt/aether-desktop
mkdir -p /usr/local/bin
cat > /usr/local/bin/aether-desktop <<EOF
#!/bin/sh
cd "$portable_dir" || exit 1
exec "$portable_dir/node_modules/.bin/electron" . "\$@"
EOF
chmod +x /usr/local/bin/aether-desktop

cat > /usr/share/applications/aether-desktop.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Aether
Comment=AI-агент Aether для Debian
Exec=aether-desktop
Terminal=false
Categories=Development;Utility;
EOF
info "Готово. Запуск: aether-desktop"