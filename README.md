<p align="center">
  <img src="assets/aether-banner.svg" alt="Aether — локальный AI-агент для Android" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/jcufyr6d5djj-beep/aether/releases"><img src="https://img.shields.io/github/v/release/jcufyr6d5djj-beep/aether?style=flat-square&amp;color=7C3AED&amp;label=APK" alt="Последний релиз" /></a>
  <img src="https://img.shields.io/badge/Android-8.0%2B-3DDC84?style=flat-square&amp;logo=android&amp;logoColor=white" alt="Android 8.0+" />
  <img src="https://img.shields.io/badge/Kotlin-7F52FF?style=flat-square&amp;logo=kotlin&amp;logoColor=white" alt="Kotlin" />
  <img src="https://img.shields.io/badge/Jetpack_Compose-4285F4?style=flat-square&amp;logo=jetpackcompose&amp;logoColor=white" alt="Jetpack Compose" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-22D3EE?style=flat-square" alt="GPL 3.0" /></a>
  <a href="https://github.com/jcufyr6d5djj-beep/aether/actions/workflows/build-nightly-apk.yml"><img src="https://img.shields.io/github/actions/workflow/status/jcufyr6d5djj-beep/aether/build-nightly-apk.yml?style=flat-square&amp;label=build" alt="Сборка" /></a>
  <a href="https://github.com/jcufyr6d5djj-beep/aether/releases"><img src="https://img.shields.io/github/downloads/jcufyr6d5djj-beep/aether/total?style=flat-square&amp;label=Downloads&amp;color=22D3EE" alt="Загрузки" /></a>
  <img src="https://img.shields.io/github/stars/jcufyr6d5djj-beep/aether?style=flat-square&amp;label=Stars&amp;color=7C3AED" alt="Звёзды" />
</p>

<p align="center"><b>AI-агент на Android с русским интерфейсом.</b><br/>Чат, инструменты, расширения и локальная среда выполнения — на вашем устройстве.</p>

<p align="center"><a href="https://github.com/jcufyr6d5djj-beep/aether/releases/latest"><b>Скачать APK</b></a> · <a href="https://jcufyr6d5djj-beep.github.io/aether/"><b>Сайт проекта</b></a> · <a href="https://t.me/AetherAIAgent"><b>Telegram владельца</b></a> · <a href="CHANGELOG.md">Изменения</a> · <a href="docs/AETHER_EXTENSIONS.md">Расширения</a> · <a href="https://github.com/jcufyr6d5djj-beep/aether/issues">Сообщить об ошибке</a></p>

<p align="center">Владелец проекта — <b>Aether AI Agent</b> · <a href="https://t.me/AetherAIAgent">t.me/AetherAIAgent</a></p>

---

## О проекте

**Aether** — AI-агент, который работает прямо на телефоне: читает и правит файлы, запускает команды,
держит локальную среду (Alpine), подключает расширения и общается с любой моделью через
OpenAI-совместимый API. Интерфейс и настройки — на русском.

Запросы к моделям и веб-сервисам требуют сети и настроенного провайдера; всё остальное
(инструменты, файлы, среда, история) остаётся на устройстве.

## Возможности

| Возможность | Что доступно |
|---|---|
| Русский интерфейс | Настройки, чат, файловый менеджер, расширения, документация |
| Чат | Стриминг ответов, markdown, инструменты с подтверждением, история и поиск |
| Интерактивные опросы | Карточки ` ```poll ` в чате: варианты, мультивыбор и свой ответ прямо в карточке |
| Графики в ответах | Карточки ` ```chart ` (линия, столбцы, круговая) с легендой и сворачиванием — агент рисует их вместо таблиц |
| Понятный список чатов | У каждого чата своя цветная плашка и форма, превью последнего сообщения, время и группировка «Сегодня / Вчера / Раньше» |
| Поиск по всему тексту | Ищет по названиям и по тексту сообщений, показывает найденный фрагмент с подсветкой |
| Действия с ответом | Копировать, повторить, удалить, статистика, **прочитать вслух** (TTS) и **поделиться** в любое приложение |
| Копирование кода | У каждого блока кода — метка языка и кнопка «копировать» с подтверждением |
| Инструменты | bash, read, write, edit, grep, find, ls + инструменты расширений |
| Среда выполнения | Alpine proot, интеграция с Termux |
| Shizuku | Root-операции через Shizuku и Agent Mode (виртуальный дисплей) без root-прав |
| Расширения | Web Access, MCP Servers, Subagents, AI Lab, Lab Power |
| Стабильная подпись | Все APK подписаны одним ключом — обновления ставятся поверх без потери данных |
| Автообновление | Проверка новых версий в этом репозитории и установка APK прямо из приложения |
| Debian 13 | Aether Desktop — GUI-приложение с окном (Electron) и sudo-паролем один раз за сессию |
| Подстановки в промпте | `{{current_date}}`, `{{current_time}}`, `{{weekday}}`, `{{timezone}}`, `{{device}}`, `{{android}}`, `{{locale}}`, `{{unix_timestamp}}` |

Почему это работает иначе, чем облачные чаты:

- **Всё локально.** Нет аккаунта, нет бэкенда, нет телеметрии. История чатов, файлы и
  настройки живут на телефоне, ключи провайдеров лежат в Android Keystore.
- **Не только разговор.** Агент правит файлы, запускает команды, держит среду, ставит пакеты,
  подключает расширения и MCP-серверы, управляет устройством через Shizuku.
- **Провайдер — ваш.** OpenAI-совместимый API, Anthropic, Gemini или локальная модель:
  свой базовый URL, свои заголовки, своя цена.
- **Стабильные обновления.** Все APK подписаны одним ключом, версия монотонно растёт и
  ставится поверх старой — данные и чаты сохраняются.

## Агент и инструменты

Каждый запуск агента получает описание среды, стиль ответа и набор инструментов. Базовые:

<details>
<summary>Полный список базовых инструментов</summary>

| Инструмент | Что делает |
|---|---|
| `bash` | Команда в активной среде (Alpine proot или Termux) |
| `read` | Чтение файла; изображения отдаются модели как картинки |
| `write` | Создание или перезапись файла |
| `edit` | Точечная правка по точному совпадению |
| `grep` | Поиск по содержимому с контекстом |
| `find` / `ls` | Поиск файлов по маске и листинг каталога |
| `Agent` | Фоновые суб-агенты: свой чат, свои инструменты, результат кратким отчётом |
| `aether_*` | Среда, расширения, Skill, Agent Mode, расписания, диагностика — только через эти инструменты |

</details>

Расширения добавляют свои инструменты: веб-доступ, MCP-серверы, AI Lab, Lab Power и
фоновые суб-агенты — они подключаются в настройках и не требуют пересборки приложения.

## Приватность

Aether не отправляет данные на наши серверы: их нет. Всё, что уходит наружу — это ваши
запросы к выбранному вами провайдеру модели и те сетевые вызовы, которые вы разрешили
инструментам. Экспорт чата, история, файлы и настройки остаются на устройстве; при удалении
приложения они удаляются вместе с ним.

## Частые вопросы

<details>
<summary>Обновление не ставится поверх старой версии</summary>

Android ставит APK поверх только при том же пакете, той же подписи и versionCode не ниже
установленного. Все релизы Aether собираются одним ключом и с растущим versionCode, так что
обновление ставится поверх без удаления приложения.

</details>

<details>
<summary>Нужен ли root?</summary>

Нет. Базово приложение работает в изолированной Alpine-среде без root. Root или Shizuku
нужны только для операций с другими приложениями и системными разделами (Agent Mode).

</details>

<details>
<summary>Можно ли пользоваться своей моделью?</summary>

Да: в настройках указывается провайдер, базовый URL, ключ и модель. Подходит любой сервер,
совместимый с OpenAI Chat Completions, включая локальные Ollama и LM Studio.

</details>

## Установка

1. Скачайте APK со страницы [релизов](https://github.com/jcufyr6d5djj-beep/aether/releases/latest)
   или из [сборок Actions](https://github.com/jcufyr6d5djj-beep/aether/actions/workflows/build-nightly-apk.yml)
   (артефакт **Aether-nightly**).
2. Установите на Android **8.0+**, устройство **ARM64**.
3. Настройте провайдера модели в настройках и выберите русский язык.

Дальше обновления приходят сами: приложение проверяет новые релизы в этом репозитории и
предлагает скачать и установить APK. Ставятся поверх старой версии — данные сохраняются.

## Сборка из исходников

Нужны **JDK 17**, **Node.js 22.19+** и Android SDK с платформой **36**. Укажите путь к SDK
в `local.properties` (`sdk.dir=...`) или через `ANDROID_HOME`.

```bash
./gradlew :shared:testDebugUnitTest :app:testDebugUnitTest :app:assembleDebug \
  --no-daemon --max-workers=2 -Paether.versionName=2.2.0
```

APK: `app/build/outputs/apk/debug/app-debug.apk`. Подписанная ночная сборка:

```bash
./gradlew :app:assembleNightly -PNIGHTLY_KEYSTORE_FILE=signing/aether-nightly.keystore \
  -PNIGHTLY_KEYSTORE_PASSWORD=... -PNIGHTLY_KEY_ALIAS=aether-nightly -PNIGHTLY_KEY_PASSWORD=...
```

В Windows используйте `gradlew.bat`. Для Termux задайте `android.aapt2FromMavenOverride`
в `~/.gradle/gradle.properties`.

## Aether Desktop (Debian 13)

Каталог `debian/aether-desktop` — отдельное GUI-приложение с окном (Electron): чат, опросы,
настройки провайдера и sudo-пароль, который вводится **один раз за сессию**.

```bash
./debian/build-deb.sh                     # .deb + AppImage в debian/aether-desktop/dist-electron/
sudo apt install ./debian/aether-desktop/dist-electron/Aether-*.deb
aether-desktop
```

Готовые пакеты собираются workflow **Build Aether Desktop (Debian 13)**. Подробности — в
[debian/README_ru.md](debian/README_ru.md).

## Звёзды во времени

<p align="center">
  <a href="https://star-history.com/#jcufyr6d5djj-beep/aether&Date">
    <img src="https://api.star-history.com/svg?repos=jcufyr6d5djj-beep/aether&type=Date" alt="История звёзд Aether" width="460" />
  </a>
</p>

## Лицензия

[GNU GPL v3](LICENSE). Сведения о сторонних компонентах — в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).