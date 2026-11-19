# Aether Desktop (Electron, Debian 13 deliverable)

«Aether Desktop» — настольное GUI-приложение (Electron) с AI-агентом Aether/Pi: чат со стримингом, инструменты агента (через `pi-bridge`), интерактивные опросы ` ```poll``` `, экран настроек и опциональный **sudo один раз за сессию**.

## Что внутри

- `main.js` — главный процесс Electron, IPC, меню, жизненный цикл.
- `preload.js` — безопасный мост API (`contextIsolation: true`).
- `index.html`, `styles.css`, `renderer.js` — UI (чат, настройки, опросы, индикатор sudo).
- `src/` — модули логики: `pi-runtime.js` (запуск/протокол pi-bridge), `sudo.js` + `sudo-runtime.js` (валидация/рефреш sudo, spawn), `settings.js` (чтение/запись `~/.config/aether-desktop/settings.json`), `poll.js` (парсинг/состояние опросов), `stream.js` (сборка событий стрима).
- `vendor/pi-bridge/` — **vendored** копия `pi-bridge` (источники/скрипты сборки) из этого репозитория. Для работы агента нужен собранный `dist/bridge.mjs` (`npm install && npm run build` внутри `vendor/pi-bridge`).
- `vendor/extensions/` — vendored расширения Pi/Aether (`aether-ai-lab`, `aether-lab-power`, `pi-subagents`, `pi-mcp-adapter`, `pi-web-access`).
- `build/` — иконки и hook’и пакета; `test/smoke.js` — smoke-тесты (`node --test`).

## Требования

- Debian 13 (x86_64/arm64 в зависимости от сборки Electron).
- Node.js **>= 22.19.0** и npm (для установки зависимостей, сборки bridge и упаковки).
- Для упаковки/запуска Electron: стандартные библиотеки GTK/NSS/ALSA/GBM (обычно подтягиваются зависимостями `.deb`).
- Опционально: `sudo` в системе и права пользователя в sudoers (для функции sudo-once-per-session).

## Установка зависимостей и запуск (из исходников)

```bash
# 1) Собрать vendored pi-bridge (нужен доступ к npm registry)
cd vendor/pi-bridge
npm install
npm run build
cd ../..

# 2) Установить зависимости Electron-приложения
npm install

# 3) Запуск
npm start
```

> В репозитории-заготовке `node_modules/` и `dist/` отсутствуют — `npm install` обязателен перед запуском/сборкой.

## Тесты

```bash
npm test
# эквивалентно: node --test test/smoke.js
```

Тесты проверяют: парсинг/сегментацию ` ```poll``` `, состояния карточек опросов (в т.ч. свой ответ), аргументы/машину состояний sudo (с моками `child_process`), roundtrip настроек во временной директории, сборку стрим-событий, синтаксис JS и загрузку main/preload/модулей со стабом Electron.

## Сборка пакетов (.deb / AppImage)

```bash
# в этом каталоге, после npm install и сборки vendor/pi-bridge
npm run dist          # deb + AppImage -> dist-electron/
npm run dist:deb
npm run dist:appimage
```

## Настройки и данные

- Конфиг: `~/.config/aether-desktop/settings.json` (права 0600, каталог 0700). Поля: `provider`, `baseUrl`, `apiKey`, `model`, `sudoEnabled`, `extensionPaths`, `workspaceDirectory`, `thinkingLevel`.
- Секреты (API ключи) **не** сохраняются в репозитории.

## Ограничения текущей сборки

- Полноценный прогон агента требует **собранного** `vendor/pi-bridge/dist/bridge.mjs` и Node.js в окружении; без этого UI запустится, но отправка сообщений вернёт понятную ошибку о недоступном bridge.
- Часть vendored расширений — TypeScript/пакеты с собственным циклом сборки и завязками на оригинальный runtime; их включение в desktop-сессии зависит от совместимости bridge и готовности артефактов расширений.
- Функция sudo работает только при наличии `sudo` и корректных правах пользователя в Debian; пароль запрашивается в GUI, не хранится и используется только для `sudo -S -v` в рамках сессии.

## Лицензия

См. `LICENSE` и `THIRD_PARTY_NOTICES.md` в корне исходного репозитория (компоненты и vendored зависимости подчиняются их лицензиям).
