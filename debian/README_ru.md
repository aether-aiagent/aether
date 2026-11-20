# Aether Desktop для Debian 13 (GUI-приложение)

Это **настольное приложение с окном** (Electron), а не терминальный CLI. Внутри — тот же AI-агент
Aether (ядро `pi-bridge`), интерфейс на русском: чат со стримингом, инструменты агента, интерактивные
опросы, настройки провайдера и **sudo-пароль один раз за сессию**.

## Что умеет

- **Чат с агентом** в отдельном окне 1200×800, markdown-рендер ответов, стриминг по мере генерации,
  история сообщений, копирование кода, статус инструментов.
- **Опросы** — блоки ` ```poll ` в ответах агента превращаются в карточки: варианты, мультивыбор
  и кнопка «Написать свой ответ», которая раскрывает поле ввода **внутри карточки** под кнопкой
  (как в Android-версии), ответ сразу уходит в чат.
- **sudo один раз за сессию** — приложение спрашивает пароль через GUI-диалог, проверяет его
  `sudo -S -v`, держит timestamp живым (`sudo -n -v`) и дальше выполняет root-команды через
  `sudo -n` без повторного ввода пароля. Пароль **не сохраняется** на диск.
- **Настройки** — провайдер (OpenAI-совместимый / Anthropic / Google), base URL, API-ключ, модель,
  рабочая директория, включение sudo. Хранятся локально в `~/.config/aether-desktop/settings.json`
  с правами `0600`.
- **Расширения** — вендорная копия `aether-ai-lab`, `aether-lab-power`, `pi-subagents`,
  `pi-mcp-adapter`, `pi-web-access` в `vendor/extensions/`.
- **Безопасность** — `contextIsolation: true`, минимальный preload-мост, никаких секретов в репозитории.

## Установка (Debian 13)

Нужен Node.js **>= 22.19** и npm:

```bash
# пример через NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3
```

### Вариант 1 — собрать .deb и установить

```bash
git clone https://github.com/aether-aiagent/aether-lab.git
cd aether-lab
./debian/build-deb.sh                      # .deb + AppImage в debian/aether-desktop/dist-electron/
sudo apt install ./debian/aether-desktop/dist-electron/Aether-*.deb
aether-desktop
```

Или одной командой (сборка + установка):

```bash
sudo ./debian/install.sh
```

### Вариант 2 — AppImage (без установки)

```bash
chmod +x debian/aether-desktop/dist-electron/Aether-*.AppImage
./debian/aether-desktop/dist-electron/Aether-*.AppImage
```

### Вариант 3 — запуск из исходников

```bash
cd debian/aether-desktop
npm install
npm start
```

### Готовый .deb из GitHub Actions

Любой push в `debian/**` запускает workflow **Build Aether Desktop (Debian 13)**:
артефакт `aether-desktop-deb` содержит `.deb` и `.AppImage`, скачивается со страницы
Actions → нужный запуск → Artifacts. Локальная сборка не нужна.

## Первый запуск

1. Откройте **Настройки** (⚙ в окне).
2. Укажите провайдера, base URL и API-ключ, выберите модель, задайте рабочую директорию.
3. При необходимости включите **sudo** — пароль спросят один раз за сессию.
4. Пишите задачу в чат: агент читает/правит файлы, запускает команды, спрашивает подтверждения.

## Где что лежит

| Путь | Назначение |
| --- | --- |
| `main.js` | Главный процесс Electron, окно, меню, IPC |
| `preload.js` | Безопасный мост API |
| `renderer.js`, `index.html`, `styles.css` | Интерфейс |
| `src/pi-runtime.js` | Запуск и JSONL-протокол `pi-bridge` |
| `src/sudo.js`, `src/sudo-runtime.js` | Логика sudo-once-per-session |
| `src/settings.js` | `~/.config/aether-desktop/settings.json` (0600) |
| `src/poll.js`, `src/stream.js` | Опросы и сборка стрима |
| `vendor/pi-bridge/` | Ядро агента (собирается в `dist/bridge.mjs`) |
| `vendor/extensions/` | Расширения Pi/Aether |
| `test/smoke.js` | Smoke-тесты (`node --test`) |

## Тесты

```bash
cd debian/aether-desktop && npm test     # 19 тестов: poll, sudo, settings, stream, синтаксис
```

## Отличия от Android-версии

- Нет Android-специфичных вещей: Termux, Shizuku, Agent Mode (виртуальный дисплей), установки APK.
- Root-доступ через системный `sudo` (пароль один раз за сессию) вместо Termux/Shizuku.
- Обновления — вручную: ставится новый `.deb` из артефактов CI (встроенного автообновления нет).

## Диагностика

- **Приложение не стартует** — проверьте `libgtk-3-0`, `libnss3`, `libgbm1`, `libasound2t64`.
- **Агент не отвечает** — убедитесь, что собран `vendor/pi-bridge/dist/bridge.mjs`
  (`cd vendor/pi-bridge && npm install && npm run build`).
- **sudo не работает** — нужен установленный `sudo` и права в sudoers у пользователя.
- **Логи** — запустите `aether-desktop` из терминала, вывод ядра агента идёт в stderr.