# Заявки в awesome-списки

Это главный бесплатный источник звёзд для проектов такого рода. Ниже — целевые списки,
готовые строки-записи и шаблон тела PR. Отправлять только после явного согласия владельца:
PR пойдёт с его аккаунта.

## Правила подачи (общие)

1. Прочитать `CONTRIBUTING.md` и `README.md` списка: формат записи, алфавитный порядок,
   запрет на дубликаты, требование «one entry per PR».
2. Сделать форк, ветку `add-aether`, один коммит, PR с коротким описанием.
3. Не спамить: один PR в один список, между подачами — дни, а не минуты.
4. Если запись отклонили — не спорить, поправить формулировку и вернуться позже.

## Целевые списки и строки записи

| Список | Куда писать | Строка записи |
|---|---|---|
| `pcqpcq/open-source-android-apps` | таблица приложений | `[Aether](https://github.com/aether-aiagent/aether)` в секцию AI/Assistant |
| `JStumpp/awesome-android` | секция Apps/Tools | `- [Aether](https://github.com/aether-aiagent/aether) - On-device AI agent with local Alpine runtime, MCP servers and subagents.` |
| `KotlinBy/awesome-kotlin` | секция Android | `- [aether-aiagent/aether](https://github.com/aether-aiagent/aether) - On-device AI agent: Kotlin, Jetpack Compose, local runtime, MCP.` |
| `e2b-dev/awesome-ai-agents` | секция Open-source agents | `- [Aether](https://github.com/aether-aiagent/aether) - Android AI agent with local runtime, tools, MCP servers and subagents.` |
| `Shubhamsaboo/awesome-llm-apps` | секция Apps | `- [Aether](https://github.com/aether-aiagent/aether) - On-device LLM agent app for Android with tools and MCP support.` |
| `wong2/awesome-mcp-clients` | секция Clients (Mobile) | `- [Aether](https://github.com/aether-aiagent/aether) - Android MCP client and agent with local runtime.` |

Перед подачей проверить, что список живой (коммиты за последний год) и что такой записи
там ещё нет: поиск по README репозитория на «aether».

## Шаблон тела PR (EN)

```
Add Aether — on-device AI agent for Android

- What: open-source (GPL-3.0) Android app, Kotlin + Jetpack Compose.
- Why it fits: it is a self-contained AI agent with a local runtime (Alpine proot /
  Termux), shell and file tools, MCP server support and background subagents.
- Notable: works with any OpenAI-compatible endpoint, Anthropic, Gemini or local Ollama;
  Shizuku/Agent Mode for device control without root; signed APK releases with
  over-the-top updates.
- Repo: https://github.com/aether-aiagent/aether
- License: GPL-3.0

One entry, alphabetical order kept, no duplicates found.
```

## Шаблон тела PR (RU, если список русскоязычный)

```
Добавляю Aether — AI-агент для Android с локальной средой выполнения.

- Что: приложение с открытым кодом (GPL-3.0), Kotlin + Jetpack Compose.
- Почему подходит: полноценный агент на устройстве — Alpine proot / Termux, bash и
  файловые инструменты, MCP-серверы, фоновые суб-агенты.
- Репозиторий: https://github.com/aether-aiagent/aether
```

## Куда ещё можно записаться без спама

- GitHub Topics уже проставлены (20 штук) — проект ищется по `ai-agent`, `mcp`, `local-ai`.
- Discussions включены: завести закрепённый анонс релиза и отвечать там на вопросы.
- Releases: держать понятные release notes — их цитируют в подборках «что нового».
- Сайт проекта: https://aether-aiagent.github.io/aether/ — ссылка для всех постов.
