# Как попасть в GitHub Trending

## Как это работает на самом деле

Trending — не рейтинг по абсолютным звёздам. Он считается по **скорости**: сколько звёзд
репозиторий набрал за последние часы/сутки относительно своей базы. Практический порог для
ленты «Today» на языке **Kotlin** — примерно 20–60 звёзд за сутки; в общем списке без фильтра
языка — от 150–250 за сутки. Поэтому цель не «набрать 800 звёзд», а «собрать 50 звёзд за один день».

Ещё три условия: репозиторий публичный, не архив, и звёзды должны быть от разных аккаунтов с
историей. Накрутка ботов вычисляется и приводит к исключению из Trending, а при жалобах — к
ограничению аккаунта.

Проверять: `https://github.com/trending/kotlin?since=daily` и
`https://github.com/trending?since=daily`. Сторонние трекеры: `github-trending-api`, OSS Insight.

## Что должно быть в репозитории до запуска

1. **Гифка на 15–30 секунд в первом экране README.** Это главный фактор конверсии
   «зашёл → поставил звезду». Без неё всё остальное работает втрое хуже.
2. Скриншоты трёх экранов: чат с вызовом инструмента, список чатов, настройки.
3. One-liner в описании, который понятен без контекста: «AI agent for Android that actually
   runs tools».
4. Релиз с APK, скачивающийся в один клик, и LICENSE.
5. Раздел «Установка» из трёх шагов.

## Запуск: окно 24 часа

Звёзды должны прийти кучно. Один пост в день по одному каналу — не работает.

**Порядок и время (МСК):**

| Когда | Куда | Что даёт |
|---|---|---|
| Вт–Чт, 10:00 | Habr, статья «как я сделал агента на Android» | 30–150 звёзд, русская аудитория |
| Вт–Чт, 15:00 | свой Telegram-канал + 2–3 тематических чата | 10–40 |
| Вт–Чт, 19:00 | Reddit r/androidapps и r/LocalLLaMA | 20–80 |
| Ср, 16:00 (09:00 PT) | Hacker News, Show HN | 0 или 300, лотерея |
| Чт | X/Twitter тред с гифкой | 5–20 |
| Пт | vc.ru / Pikabu пересказ статьи | 10–30 |

После первой волны обязательно **продолжение**: ответы в комментариях в первые 3 часа решают
больше, чем сам пост. Отвечать по делу, признавать ограничения, не спорить.

## Готовые тексты

**Hacker News (Show HN):**
> Show HN: Aether – an AI agent for Android that actually runs tools
>
> I wanted a coding agent on my phone, not a chat wrapper. Aether runs a local Alpine
> (proot) runtime, so the model can run bash, read and patch files, grep a repo and call
> MCP servers — each call shown with arguments and gated behind approval. Kotlin + Compose,
> GPL-3.0, signed APK. Works with any OpenAI-compatible endpoint or a model served on the
> device itself. Would love feedback on the tool-approval UX.

**Reddit r/LocalLLaMA:**
> Title: Open-source Android agent that gives a local LLM real tools (bash, files, MCP)
>
> Body: Built this because every Android "AI app" I tried was a chat window. Aether runs the
> model with a real tool loop inside a local Alpine runtime: read/write/edit, grep, find, bash,
> MCP servers over stdio, subagents. Point it at llama.cpp/Ollama on your LAN, or any
> OpenAI-compatible endpoint. APK in releases, GPL-3.0, Kotlin/Compose.
> Happy to answer anything about the proot runtime or the approval gate.

**r/androidapps:**
> Title: Aether — open-source AI agent for Android with real file and shell tools
>
> Body: Not another chat client: the model can actually run commands in a local Alpine
> environment, edit files, search a project and call MCP servers, with approval before
> anything destructive. Free, no account, chats stay on the device. APK: <link>.

**Telegram (RU):**
> Сделал Aether — ИИ-агент для Android, который реально работает, а не только отвечает.
> Модель запускает команды в локальной Alpine, читает и правит файлы, ищет по проекту,
> подключает MCP-серверы. Каждый вызов видно в чате, опасные — с подтверждением.
> APK: <ссылка>. Код открыт, GPL-3.0. Что сломается — пишите в issues.

## Дальше удерживать

Trending даёт всплеск на 1–2 дня. Чтобы звёзды не кончились:

- релиз раз в неделю с внятным changelog (каждый релиз — повод для поста);
- отвечать на все issues за сутки;
- попасть в awesome-списки (`awesome-android`, `awesome-ai-agents`, `awesome-mcp-servers`) —
  это постоянный ручеёк;
- добавить гифку и «работает с <провайдер>» в README после первого всплеска.

## Чего не делать

- Покупать звёзды, обмениваться «стар в стар», просить ботов — исключение из Trending.
- Постить один и тот же текст в пять сабреддитов за час — бан аккаунта.
- Обещать в посте то, чего в APK нет: первые комментарии это вскроют.
