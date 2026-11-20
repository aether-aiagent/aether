/**
 * AI Lab core — pure, dependency-free logic used by index.js (the Aether
 * extension factory) and by the smoke tests in `test/features.test.js`.
 *
 * Everything here is side-effect free: no storage, no timers, no host bridge.
 * That keeps the mission presets, bundle planning, per-run report formatting
 * and statistics aggregation verifiable without an LLM or a network.
 */

const MAX_BUNDLE_PARALLEL = 6;

// -------------------------------------------------------------- formatting

/** RU duration: 0с / 45с / 3м 07с / 1ч 12м. */
export function formatDuration(ms) {
  const total = Number(ms);
  if (!Number.isFinite(total) || total <= 0) return "0с";
  const seconds = Math.round(total / 1000);
  if (seconds < 60) return `${seconds}с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}м ${String(seconds % 60).padStart(2, "0")}с`;
  const hours = Math.floor(minutes / 60);
  return `${hours}ч ${String(minutes % 60).padStart(2, "0")}м`;
}

/** RU token count: 950 / 128.4k / 1.21M. */
export function formatTokens(value) {
  const tokens = Number(value);
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

export function pluralRuns(count) {
  const value = Math.abs(Number(count) || 0) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return "прогонов";
  if (last === 1) return "прогон";
  if (last >= 2 && last <= 4) return "прогона";
  return "прогонов";
}

/** Lowercases and collapses whitespace while remembering raw indices. */
function normalizeWithMap(value) {
  const raw = String(value ?? "");
  let text = "";
  const map = [];
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const isSpace = /\s/.test(char);
    if (isSpace && text.endsWith(" ")) continue;
    text += isSpace ? " " : char.toLowerCase();
    map.push(index);
  }
  map.push(raw.length);
  const leading = text.length - text.trimStart().length;
  const trimmed = text.trim();
  return { raw, text: trimmed, map: map.slice(leading, leading + trimmed.length + 1) };
}

function normalizeKey(value) {
  return normalizeWithMap(value).text;
}

/** Replaces the first `<placeholder>` in a goal with the user supplied target. */
export function applyTarget(text, target) {
  const body = String(text ?? "");
  const replacement = String(target ?? "").trim();
  if (!replacement) return body;
  if (/<[^>]+>/.test(body)) return body.replace(/<[^>]+>/, replacement);
  return `${body}\n\nОбласть: ${replacement}`;
}

// ------------------------------------------------------------ mission presets

/**
 * Mission presets: prewritten worker instructions plus reviewer acceptance
 * criteria, so one panel tap produces a mission a reviewer can actually judge.
 */
export const MISSION_PRESETS = [
  {
    id: "code-review",
    title: "Код-ревью",
    aliases: ["review", "code-review", "код-ревью", "код ревью", "ревью"],
    goal: "Провести код-ревью <путь/модуль>: баги, утечки, нарушения стиля, мёртвый код. Отчёт с file:line и топ-3 исправления.",
    workerBrief: [
      "Это ревью, а не рефакторинг: код не меняем.",
      "Каждое замечание — с точным file:line и коротким объяснением.",
      "Отсортируй находки по важности и выдели топ-3.",
    ],
    reviewerFocus: [
      "Ревью не должно менять код: любые правки — причина для reject.",
      "У каждого замечания есть file:line и объяснение.",
      "Топ-3 исправлений сформулирован явно.",
    ],
    variants: [{ label: "Ревьюер" }],
  },
  {
    id: "refactor",
    title: "Рефакторинг",
    aliases: ["refactor", "рефакторинг", "рефактор"],
    goal: "Безопасный рефакторинг <область>: убрать дубли и мёртвый код, поведение не меняется. Тесты зелёные, список всех изменённых файлов.",
    workerBrief: [
      "Поведение не меняется: только структура и читаемость.",
      "Сначала зафиксируй baseline тестов, после правок прогони их снова.",
      "В Evidence перечисли все изменённые файлы и вывод тестов.",
    ],
    reviewerFocus: [
      "Тесты зелёные и до, и после правок.",
      "Публичное поведение и API не изменились.",
      "Нет правок в несвязанных с целью файлах.",
    ],
    variants: [{ label: "Рефактор" }],
  },
  {
    id: "tests",
    title: "Покрытие тестами",
    aliases: ["tests", "coverage", "тесты", "покрытие", "покрытие тестами"],
    goal: "Покрыть тестами <область>: сначала карта непокрытых веток, затем тесты на топ-3 риска и прогон с отчётом покрытия.",
    workerBrief: [
      "Сначала найди реальные непокрытые ветки и краевые случаи, потом пиши тесты.",
      "Продовый код не меняем, чтобы «подогнать» тесты.",
      "Покажи вывод прогона тестов и сколько случаев добавлено.",
    ],
    reviewerFocus: [
      "Тесты проверяют поведение, а не реализацию.",
      "Продовый код не изменён под тесты.",
      "Есть вывод прогона и число новых тестов.",
    ],
    variants: [{ label: "Тесты" }],
  },
  {
    id: "docs",
    title: "Документация",
    aliases: ["docs", "documentation", "документация", "доки"],
    goal: "Обновить документацию по <область>: README, публичные API и примеры использования. Утверждения должны совпадать с кодом.",
    workerBrief: [
      "Пиши коротко, в стиле существующих документов проекта.",
      "Каждый пример должен запускаться — покажи его вывод.",
      "Не придумывай несуществующие флаги, функции и параметры.",
    ],
    reviewerFocus: [
      "Документация сверена с кодом: нет выдуманных API.",
      "Примеры запускаются или честно помечены как псевдокод.",
      "Структура совпадает с существующими доками.",
    ],
    variants: [{ label: "Документатор" }],
  },
];

/** Longest-alias-first resolver shared by presets and bundles. */
function resolveByAlias(items, value, extraAliases) {
  const query = normalizeKey(value);
  if (!query) return null;
  let match = null;
  let matchLength = 0;
  for (const item of items) {
    const aliases = [item.id, item.title, ...(item.aliases || []), ...(extraAliases?.(item) || [])];
    for (const alias of aliases) {
      const key = normalizeKey(alias);
      if (!key) continue;
      if (query === key && key.length > matchLength) {
        match = item;
        matchLength = key.length;
      }
    }
  }
  return match;
}

export function findPreset(value) {
  return resolveByAlias(MISSION_PRESETS, value);
}

export function listPresets() {
  return MISSION_PRESETS.map((preset) => ({
    id: preset.id,
    title: preset.title,
    goal: preset.goal,
    aliases: preset.aliases.slice(),
  }));
}

/**
 * Parses a preset invocation such as `"код-ревью extensions/aether-ai-lab"`.
 * The extension has no slash-command registry, so the same grammar is used for
 * action args, the composer entry and the panel buttons.
 */
export function parsePresetArgs(input) {
  const { raw, text, map } = normalizeWithMap(input);
  if (!text) return { preset: null, presetId: "", target: "" };
  let best = null;
  let bestLength = 0;
  for (const preset of MISSION_PRESETS) {
    const aliases = [preset.id, preset.title, ...(preset.aliases || [])];
    for (const alias of aliases) {
      const key = normalizeKey(alias);
      if (!key) continue;
      if ((text === key || text.startsWith(`${key} `)) && key.length > bestLength) {
        best = preset;
        bestLength = key.length;
      }
    }
  }
  if (!best) return { preset: null, presetId: "", target: "" };
  const target = raw.slice(map[bestLength] ?? raw.length).trim();
  return { preset: best, presetId: best.id, target };
}

function variantsToText(variants) {
  return (variants || [])
    .map((variant) => `${variant.label} | ${variant.modelKey || ""} | ${variant.agentType || ""}`.trim())
    .join("\n");
}

/** Builds a createExperiment payload for a preset (no storage access). */
export function presetExperimentPayload(preset, options = {}) {
  if (!preset) return null;
  const target = String(options.target ?? "").trim();
  const variants = Array.isArray(options.variants) && options.variants.length > 0
    ? options.variants
    : (preset.variants || [{ label: "Worker" }]).map((variant) => ({
      label: variant.label,
      modelKey: variant.modelKey || "",
      agentType: variant.agentType || "",
    }));
  return {
    title: String(options.title ?? "").trim() || `${preset.title}${target ? ` · ${target}` : ""}`,
    goal: applyTarget(options.goal ?? preset.goal, target),
    variants,
    variantsText: variantsToText(variants),
    workerBrief: (preset.workerBrief || []).slice(),
    reviewerFocus: (preset.reviewerFocus || []).join("\n"),
    presetId: preset.id,
    presetTitle: preset.title,
  };
}

// ------------------------------------------------------------ mission bundles

/**
 * Named bundles fan a mission out into several independent experiments with a
 * bounded number of in-flight workers (the AI Lab flavour of fan-out).
 */
export const MISSION_BUNDLES = [
  {
    id: "audit",
    title: "Аудит проекта",
    aliases: ["audit", "аудит", "аудит проекта"],
    parallel: 3,
    description: "Линт и мёртвый код, тесты и безопасность — параллельно.",
    tasks: [
      {
        title: "Линт и мёртвый код",
        goal: "Проверить <проект> статическими средствами: неиспользуемые экспорты, мёртвые ветки, дубли. Отчёт с file:line и топ-5.",
        workerBrief: ["Запусти линтер, покажи команду и вывод.", "Мёртвый код подтверждай поиском по репозиторию."],
        reviewerFocus: ["Каждая находка подтверждена командой или поиском.", "Есть топ-5 по важности."],
      },
      {
        title: "Тесты",
        goal: "Прогнать тесты <проект> и зафиксировать падения и флейки: команда, вывод, вероятная причина.",
        workerBrief: ["Покажи полную команду прогона и итоговые строки вывода.", "Флейки проверяй повтором."],
        reviewerFocus: ["Есть вывод прогона, а не пересказ.", "Причины падений не выдуманы."],
      },
      {
        title: "Безопасность",
        goal: "Проверить <проект> на типовые риски: секреты в репозитории, инъекции в shell/SQL, небезопасные зависимости. Отчёт с file:line.",
        workerBrief: ["Ищи секреты и опасные вызовы поиском, показывай совпадения.", "Ничего не эксплуатируй: только чтение."],
        reviewerFocus: ["Нет выдуманных уязвимостей без file:line.", "Репозиторий не изменён."],
      },
    ],
  },
  {
    id: "release",
    title: "Готовность к релизу",
    aliases: ["release", "релиз", "перед релизом"],
    parallel: 3,
    description: "Сборка, тесты и changelog перед выкладкой.",
    tasks: [
      {
        title: "Сборка",
        goal: "Собрать <проект> и доказать, что сборка проходит: команда и последние строки вывода.",
        workerBrief: ["Сборка должна пройти на чистом состоянии.", "Покажи время и итог сборки."],
        reviewerFocus: ["Есть вывод успешной сборки.", "Не осталось временных файлов."],
      },
      {
        title: "Тесты",
        goal: "Прогнать полный набор тестов <проект> и отчитаться о падениях.",
        workerBrief: ["Покажи команду и итоговые строки.", "Падения сгруппируй по модулям."],
        reviewerFocus: ["Вывод прогона приложен.", "Падения не скрыты."],
      },
      {
        title: "Changelog и доки",
        goal: "Сверить CHANGELOG и README <проект> с последними изменениями и дописать недостающее.",
        workerBrief: ["Опирайся на git log и diff, а не на догадки.", "Формат — как в существующих записях."],
        reviewerFocus: ["Записи соответствуют реальным изменениям.", "Формат сохранён."],
      },
    ],
  },
  {
    id: "coverage",
    title: "Тестовое покрытие",
    aliases: ["coverage", "покрытие", "тестовое покрытие"],
    parallel: 2,
    description: "Карта покрытия, тесты на риски и метрика после.",
    tasks: [
      {
        title: "Карта покрытия",
        goal: "Построить карту покрытия <область>: какие ветки и краевые случаи не покрыты.",
        workerBrief: ["Опирайся на отчёт покрытия или чтение тестов.", "Составь список пробелов с file:line."],
        reviewerFocus: ["Список пробелов конкретен.", "Покрытие подтверждено отчётом или чтением."],
      },
      {
        title: "Тесты на риски",
        goal: "Написать тесты на топ-3 непокрытых риска <область>, продовый код не меняя.",
        workerBrief: ["Покажи, что тест падает без исправления и проходит с ним.", "Не меняй продовый код."],
        reviewerFocus: ["Тесты проверяют поведение.", "Продовый код не изменён."],
      },
      {
        title: "Метрика после",
        goal: "Прогнать покрытие после добавления тестов и показать метрику до/после.",
        workerBrief: ["Покажи обе метрики и команду.", "Разница должна быть воспроизводимой."],
        reviewerFocus: ["Обе метрики приложены.", "Прирост объяснён."],
      },
    ],
  },
];

export function findBundle(value) {
  return resolveByAlias(MISSION_BUNDLES, value);
}

/** Clamps a requested parallelism into [1, min(MAX_BUNDLE_PARALLEL, tasks)]. */
export function resolveParallelism(requested, taskCount, fallback = 2) {
  const limit = Math.max(1, Math.min(MAX_BUNDLE_PARALLEL, Math.round(Number(taskCount) || 1)));
  const wanted = Number(requested);
  const base = Number.isFinite(wanted) && wanted > 0 ? wanted : Number(fallback);
  const chosen = Number.isFinite(base) && base > 0 ? base : 1;
  return Math.min(limit, Math.max(1, Math.round(chosen)));
}

/** Expands a bundle into experiment payloads plus the resolved parallelism. */
export function bundleExperimentPayloads(bundle, options = {}) {
  if (!bundle) return { parallel: 1, experiments: [] };
  const tasks = Array.isArray(bundle.tasks) ? bundle.tasks : [];
  const parallel = resolveParallelism(options.parallel, tasks.length, bundle.parallel ?? 2);
  const target = String(options.target ?? "").trim();
  const experiments = tasks.map((task) => {
    const variants = (task.variants || [{ label: task.title }]).map((variant) => ({
      label: variant.label,
      modelKey: variant.modelKey || "",
      agentType: variant.agentType || "",
    }));
    return {
      title: applyTarget(task.title, "") || task.title,
      goal: applyTarget(task.goal, target),
      variants,
      variantsText: variantsToText(variants),
      workerBrief: (task.workerBrief || []).slice(),
      reviewerFocus: (task.reviewerFocus || []).join("\n"),
      bundleId: bundle.id,
      bundleTitle: bundle.title,
    };
  });
  return { parallel, experiments, bundle: { id: bundle.id, title: bundle.title } };
}

// ---------------------------------------------------------------- statistics

/** Duration of a run in ms; running runs are measured against `now`. */
export function runDurationMs(run, now = Date.now()) {
  if (!run || typeof run !== "object") return 0;
  const started = Date.parse(run.startedAt || "");
  if (!Number.isFinite(started) || started <= 0) return 0;
  const finished = Date.parse(run.finishedAt || "");
  const end = Number.isFinite(finished) && finished > 0
    ? finished
    : (run.status === "running" ? Number(now) || Date.now() : 0);
  if (!end || end < started) return 0;
  return end - started;
}

function emptyBucket() {
  return {
    runs: 0,
    running: 0,
    queued: 0,
    done: 0,
    failed: 0,
    stopped: 0,
    accepted: 0,
    revised: 0,
    rejected: 0,
    undecided: 0,
    tokens: 0,
    toolUses: 0,
    durationMs: 0,
    measuredRuns: 0,
  };
}

function addRun(bucket, run, now) {
  bucket.runs += 1;
  const status = String(run?.status || "");
  if (status === "running") bucket.running += 1;
  else if (status === "queued") bucket.queued += 1;
  else if (status === "done") bucket.done += 1;
  else if (status === "failed") bucket.failed += 1;
  else if (status === "stopped") bucket.stopped += 1;
  const decision = String(run?.verdict?.decision || "");
  if (decision === "accept") bucket.accepted += 1;
  else if (decision === "revise") bucket.revised += 1;
  else if (decision === "reject") bucket.rejected += 1;
  else bucket.undecided += 1;
  bucket.tokens += Number(run?.tokens) || 0;
  bucket.toolUses += Number(run?.toolUses) || 0;
  const duration = runDurationMs(run, now);
  if (duration > 0) {
    bucket.durationMs += duration;
    bucket.measuredRuns += 1;
  }
  return bucket;
}

function finalizeBucket(bucket) {
  const decided = bucket.accepted + bucket.revised + bucket.rejected;
  return {
    ...bucket,
    decided,
    avgDurationMs: bucket.measuredRuns > 0 ? Math.round(bucket.durationMs / bucket.measuredRuns) : 0,
    acceptRate: decided > 0 ? bucket.accepted / decided : 0,
  };
}

/**
 * Aggregates stored runs per mission plus global totals.
 * Session stats come straight from stored run fields: tokens, tool call count
 * (`toolUses`) and started/finished timestamps.
 */
export function aggregateMissionStats(runs, experiments, options = {}) {
  const now = Number(options.now) || Date.now();
  const list = Array.isArray(runs) ? runs.filter((run) => run && typeof run === "object") : [];
  const known = Array.isArray(experiments) ? experiments.filter((item) => item && item.id) : [];
  const totals = emptyBucket();
  const buckets = new Map();
  const order = [];
  for (const experiment of known) {
    buckets.set(experiment.id, {
      experimentId: experiment.id,
      title: String(experiment.title || experiment.goal || experiment.id),
      goal: String(experiment.goal || ""),
      presetId: experiment.presetId || "",
      bundleId: experiment.bundleId || "",
      bucket: emptyBucket(),
    });
    order.push(experiment.id);
  }
  for (const run of list) {
    addRun(totals, run, now);
    const experimentId = String(run.experimentId || "unknown");
    if (!buckets.has(experimentId)) {
      buckets.set(experimentId, {
        experimentId,
        title: String(run.experimentTitle || experimentId),
        goal: "",
        presetId: "",
        bundleId: "",
        bucket: emptyBucket(),
      });
      order.push(experimentId);
    }
    addRun(buckets.get(experimentId).bucket, run, now);
  }
  const missions = order.map((id) => {
    const entry = buckets.get(id);
    return {
      experimentId: entry.experimentId,
      title: entry.title,
      goal: entry.goal,
      presetId: entry.presetId,
      bundleId: entry.bundleId,
      ...finalizeBucket(entry.bucket),
    };
  });
  return { totals: finalizeBucket(totals), missions, generatedAt: new Date(now).toISOString() };
}

function clockLabel(now) {
  const date = new Date(Number(now) || Date.now());
  return `${date.toISOString().slice(11, 16)} UTC`;
}

/** Compact RU status dashboard shared by `/lab status`-style actions and chat. */
export function buildStatusSummary({ runs, experiments, now, maxMissions = 6 } = {}) {
  const stamp = Number(now) || Date.now();
  const stats = aggregateMissionStats(runs, experiments, { now: stamp });
  const t = stats.totals;
  const lines = [
    `**AI Lab · статус на ${clockLabel(stamp)}**`,
    `В работе: ${t.running} · в очереди: ${t.queued} · завершено: ${t.done} · с ошибкой: ${t.failed}`,
    `Вердикты: принято ${t.accepted} · на доработку ${t.revised} · отклонено ${t.rejected}`,
    `Средняя длительность прогона: ${formatDuration(t.avgDurationMs)} · токенов ${formatTokens(t.tokens)} · вызовов инструментов ${t.toolUses}`,
  ];
  if (t.runs === 0) {
    lines.push("", "Прогонов пока нет: создайте миссию или запустите пресет.");
    return { text: lines.join("\n"), stats, generatedAt: stats.generatedAt };
  }
  const active = stats.missions.filter((mission) => mission.runs > 0);
  lines.push("", `Миссии (${active.length}):`);
  for (const mission of active.slice(-Math.max(1, maxMissions))) {
    const parts = [`${mission.runs} ${pluralRuns(mission.runs)}`];
    if (mission.accepted) parts.push(`принято ${mission.accepted}`);
    if (mission.revised) parts.push(`на доработку ${mission.revised}`);
    if (mission.rejected) parts.push(`отклонено ${mission.rejected}`);
    if (mission.running) parts.push(`в работе ${mission.running}`);
    if (mission.queued) parts.push(`в очереди ${mission.queued}`);
    parts.push(`ср. ${formatDuration(mission.avgDurationMs)}`);
    lines.push(`• ${mission.title} — ${parts.join(", ")}`);
  }
  if (active.length > maxMissions) {
    lines.push(`• …ещё ${active.length - maxMissions} мисс.`);
  }
  return { text: lines.join("\n"), stats, generatedAt: stats.generatedAt };
}

// -------------------------------------------------------------- run reports

const REPORT_SECTIONS = ["Result", "Evidence", "Verification", "Risks", "Sub-agents", "Open questions"];

/** Splits a worker report into its `## Section` parts (EN headers as written by the worker agent). */
export function splitReportSections(output) {
  const text = String(output ?? "");
  if (!text.trim()) return [];
  const sections = [];
  const pattern = /^##\s+([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/gm;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim();
    const body = match[2].trim();
    if (!body) continue;
    sections.push({ name, body });
  }
  if (sections.length === 0) return [];
  const known = sections.filter((section) => (
    REPORT_SECTIONS.some((name) => name.toLowerCase() === section.name.toLowerCase())
  ));
  return known.length > 0 ? known : sections;
}

function isoOrDash(value) {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return "—";
  return new Date(parsed).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * Markdown for a single finished run: goal, verdict, evidence and durations.
 * Used by the per-run export action; the workspace write itself stays in index.js.
 */
export function buildRunReportMarkdown({ run, experiment, siblings = [], generatedAt, now } = {}) {
  if (!run || typeof run !== "object") return "";
  const stamp = generatedAt || new Date(Number(now) || Date.now()).toISOString();
  const verdict = run.verdict || null;
  const duration = runDurationMs(run, Number(now) || Date.now());
  const goal = String(experiment?.goal || "").trim();
  const lines = [
    `# AI Lab · ${run.label || run.id}`,
    "",
    `Сгенерировано: ${stamp}`,
    "",
    "| поле | значение |",
    "| --- | --- |",
    `| Прогон | \`${run.id}\` |`,
    `| Миссия | ${experiment?.title || run.experimentTitle || "—"} |`,
    `| Статус | ${run.status || "—"} |`,
    `| Режим | ${run.mode || "—"} |`,
    `| Агент | ${run.agentId || "—"} |`,
    `| Токены | ${run.tokens || "—"} |`,
    `| Вызовов инструментов | ${run.toolUses ? run.toolUses : "—"} |`,
    `| Начало | ${isoOrDash(run.startedAt)} |`,
    `| Конец | ${isoOrDash(run.finishedAt)} |`,
    `| Длительность | ${formatDuration(duration)} |`,
    `| Вердикт | ${verdict ? `${verdict.decision} (${Math.round((Number(verdict.confidence) || 0) * 100)}%, ${verdict.source || "reviewer"})` : "ожидается"} |`,
    "",
  ];
  if (goal) lines.push("## Цель", "", goal, "");
  if (verdict) {
    lines.push("## Вердикт", "");
    if (verdict.summary) lines.push(`> ${verdict.summary}`, "");
    if (verdict.goalCoverage) lines.push(`Покрытие цели: ${verdict.goalCoverage}`, "");
    lines.push(`Доказательства в порядке: ${verdict.evidenceOk === false ? "нет" : "да"}`, "");
    if (Array.isArray(verdict.fixes) && verdict.fixes.length > 0) {
      lines.push("### Что исправить", "", ...verdict.fixes.map((fix) => `- ${fix}`), "");
    }
    if (Array.isArray(verdict.risks) && verdict.risks.length > 0) {
      lines.push("### Риски", "", ...verdict.risks.map((risk) => `- ${risk}`), "");
    }
  }
  if (run.error) lines.push("## Ошибка", "", "```", String(run.error), "```", "");
  const sections = splitReportSections(run.output);
  if (sections.length > 0) {
    lines.push("## Отчёт воркера", "");
    for (const section of sections) {
      lines.push(`### ${section.name}`, "", section.body, "");
    }
  } else if (String(run.output || "").trim()) {
    lines.push("## Сырой отчёт воркера", "", "```", String(run.output).trim(), "```", "");
  } else {
    lines.push("## Отчёт воркера", "", "_Пусто._", "");
  }
  const others = (Array.isArray(siblings) ? siblings : [])
    .filter((item) => item && item.id !== run.id);
  if (others.length > 0) {
    lines.push("## Другие прогоны миссии", "", "| прогон | статус | вердикт | уверенность | токены |", "| --- | --- | --- | --- | --- |");
    for (const item of others) {
      lines.push(`| ${item.label || item.id} | ${item.status || "—"} | ${item.verdict?.decision || "—"} | ${
        item.verdict ? `${Math.round((Number(item.verdict.confidence) || 0) * 100)}%` : "—"
      } | ${item.tokens || "—"} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export { MAX_BUNDLE_PARALLEL };