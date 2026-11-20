/**
 * AI Lab feature smoke test.
 *
 * Run with: node extensions/aether-ai-lab/test/features.test.js
 *
 * Two layers, no network and no LLM:
 *  - pure logic from lab-core.js (presets, bundles, report markdown, stats);
 *  - the extension factory driven through a mocked Aether API object, which
 *    exercises the new action ops end to end (mocked storage/host/messages).
 */

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Keep ensureAgentDefinitions() out of the real home directory.
process.env.HOME = mkdtempSync(join(tmpdir(), "ai-lab-test-"));

const {
  MAX_BUNDLE_PARALLEL,
  MISSION_BUNDLES,
  MISSION_PRESETS,
  aggregateMissionStats,
  buildRunReportMarkdown,
  buildStatusSummary,
  bundleExperimentPayloads,
  findBundle,
  findPreset,
  formatDuration,
  formatTokens,
  parsePresetArgs,
  parseVariantsText,
  presetExperimentPayload,
  resolveParallelism,
  runDurationMs,
  splitReportSections,
} = await import("../lab-core.js");
const { activateAether } = await import("../index.js");

// ---------------------------------------------------------------------------
// pure logic
// ---------------------------------------------------------------------------

test("formatDuration and formatTokens use compact RU units", () => {
  assert.equal(formatDuration(0), "0с");
  assert.equal(formatDuration(45_000), "45с");
  assert.equal(formatDuration(187_000), "3м 07с");
  assert.equal(formatDuration(4_320_000), "1ч 12м");
  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(128_400), "128.4k");
  assert.equal(formatTokens(1_210_000), "1.21M");
});

test("preset parsing resolves ids, RU aliases and an inline target", () => {
  assert.equal(MISSION_PRESETS.length, 4);
  const ids = MISSION_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids, ["code-review", "refactor", "tests", "docs"]);

  const byId = parsePresetArgs("code-review");
  assert.equal(byId.presetId, "code-review");
  assert.equal(byId.target, "");

  const byAlias = parsePresetArgs("Код-ревью extensions/aether-ai-lab");
  assert.equal(byAlias.presetId, "code-review");
  assert.equal(byAlias.target, "extensions/aether-ai-lab");

  const multiWord = parsePresetArgs("  покрытие   тестами  app/src  ");
  assert.equal(multiWord.presetId, "tests");
  assert.equal(multiWord.target, "app/src");

  const unknown = parsePresetArgs("deploy to prod");
  assert.equal(unknown.preset, null);

  assert.equal(findPreset("доки")?.id, "docs");
  assert.equal(findPreset("nope"), null);
});

test("preset payload carries worker instructions and reviewer criteria", () => {
  const preset = findPreset("code-review");
  const payload = presetExperimentPayload(preset, { target: "extensions/aether-ai-lab" });

  assert.equal(payload.presetId, "code-review");
  assert.equal(payload.title, "Код-ревью · extensions/aether-ai-lab");
  assert.match(payload.goal, /extensions\/aether-ai-lab/);
  assert.ok(!payload.goal.includes("<путь/модуль>"), "goal placeholder is substituted");
  assert.equal(payload.variants.length, 1);
  assert.equal(payload.variantsText, "Ревьюер |  |");
  assert.ok(payload.workerBrief.length >= 2);
  assert.match(payload.reviewerFocus, /file:line/);

  const bare = presetExperimentPayload(findPreset("docs"));
  assert.equal(bare.title, "Документация");
  assert.ok(bare.goal.includes("<область>"), "placeholder stays when no target given");
  assert.equal(presetExperimentPayload(null), null);
});

test("variants text parsing matches the panel textarea format", () => {
  assert.deepEqual(parseVariantsText("fast | | aether-lab-worker\ndeep|m-2|general-purpose\n\n   \n"), [
    { label: "fast", modelKey: "", agentType: "aether-lab-worker" },
    { label: "deep", modelKey: "m-2", agentType: "general-purpose" },
  ]);
  assert.deepEqual(parseVariantsText("solo"), [{ label: "solo", modelKey: "", agentType: "" }]);
  assert.deepEqual(parseVariantsText(null), []);
  assert.deepEqual(parseVariantsText(undefined), []);
});

test("bundle planning resolves aliases and clamps parallelism", () => {
  assert.equal(MISSION_BUNDLES.length, 3);
  assert.equal(findBundle("аудит")?.id, "audit");
  assert.equal(findBundle("release")?.id, "release");

  assert.equal(resolveParallelism(0, 3, 3), 3);
  assert.equal(resolveParallelism(9, 3, 2), 3);
  assert.equal(resolveParallelism("junk", 3, 2), 2);
  assert.equal(resolveParallelism(4, 1, 3), 1);
  assert.equal(resolveParallelism(2, 10, 3), 2);
  assert.equal(resolveParallelism(99, 10, 2), MAX_BUNDLE_PARALLEL);

  const planned = bundleExperimentPayloads(findBundle("audit"), { parallel: 1, target: "extensions" });
  assert.equal(planned.parallel, 1);
  assert.equal(planned.experiments.length, 3);
  assert.equal(planned.bundle.id, "audit");
  assert.deepEqual(
    planned.experiments.map((item) => item.title),
    ["Линт и мёртвый код", "Тесты", "Безопасность"],
  );
  assert.match(planned.experiments[0].goal, /extensions/);
  assert.equal(planned.experiments[0].bundleId, "audit");
  assert.ok(planned.experiments[0].reviewerFocus.length > 0);
});

const RUN_REPORT = [
  "## Result",
  "Added a retry helper and two tests.",
  "",
  "## Evidence",
  "- node --test extensions/aether-ai-lab/test/features.test.js → 12 passed",
  "- files: extensions/aether-ai-lab/index.js",
  "",
  "## Verification",
  "PASS — ran the tests twice.",
  "",
  "## Open questions",
  "none",
].join("\n");

test("worker report sections and per-run markdown export", () => {
  const sections = splitReportSections(RUN_REPORT);
  assert.deepEqual(sections.map((section) => section.name), [
    "Result",
    "Evidence",
    "Verification",
    "Open questions",
  ]);
  assert.deepEqual(splitReportSections(""), []);

  const run = {
    id: "run-1",
    label: "Ревьюер",
    status: "done",
    mode: "subagent",
    agentId: "agent-7",
    startedAt: "2024-01-01T10:00:00.000Z",
    finishedAt: "2024-01-01T10:02:30.000Z",
    tokens: "1234",
    toolUses: 5,
    output: RUN_REPORT,
    verdict: {
      decision: "revise",
      confidence: 0.62,
      summary: "Evidence is thin.",
      goalCoverage: "2 of 3 items",
      evidenceOk: false,
      risks: ["No test output for the second case."],
      fixes: ["Add the missing test output."],
      source: "aether-lab-reviewer",
    },
  };
  const markdown = buildRunReportMarkdown({
    run,
    experiment: { title: "Код-ревью", goal: "Review the lab extension." },
    siblings: [{ id: "run-2", label: "Рефактор", status: "done", tokens: "99", verdict: { decision: "accept", confidence: 0.9 } }],
    generatedAt: "2024-01-01T10:03:00.000Z",
  });

  assert.match(markdown, /^# AI Lab · Ревьюер/);
  assert.match(markdown, /\| Миссия \| Код-ревью \|/);
  assert.match(markdown, /\| Длительность \| 2м 30с \|/);
  assert.match(markdown, /## Цель\n\nReview the lab extension\./);
  assert.match(markdown, /## Вердикт/);
  assert.match(markdown, /revise \(62%, aether-lab-reviewer\)/);
  assert.match(markdown, /### Что исправить\n\n- Add the missing test output\./);
  assert.match(markdown, /### Риски\n\n- No test output for the second case\./);
  assert.match(markdown, /### Evidence/);
  assert.match(markdown, /node --test extensions\/aether-ai-lab\/test\/features\.test\.js/);
  assert.match(markdown, /## Другие прогоны миссии/);
  assert.match(markdown, /\| Рефактор \| done \| accept \| 90% \| 99 \|/);
  assert.equal(buildRunReportMarkdown({}), "");
  assert.equal(buildRunReportMarkdown({ run: null }), "");
  assert.match(buildRunReportMarkdown({ run: { id: "x", status: "queued" } }), /_Пусто\._/);
});

test("mission stats aggregate tokens, tool calls and durations", () => {
  const now = Date.parse("2024-01-01T10:10:00.000Z");
  const runs = [
    {
      id: "a",
      experimentId: "exp-1",
      status: "done",
      startedAt: "2024-01-01T10:00:00.000Z",
      finishedAt: "2024-01-01T10:01:00.000Z",
      tokens: "1000",
      toolUses: 2,
      verdict: { decision: "accept", confidence: 0.9 },
    },
    {
      id: "b",
      experimentId: "exp-1",
      status: "failed",
      startedAt: "2024-01-01T10:00:00.000Z",
      finishedAt: "2024-01-01T10:03:00.000Z",
      tokens: 500,
      toolUses: 1,
      verdict: { decision: "reject", confidence: 0.4 },
    },
    {
      id: "c",
      experimentId: "exp-2",
      status: "running",
      startedAt: "2024-01-01T10:05:00.000Z",
      tokens: 250,
      toolUses: 3,
      verdict: null,
    },
  ];
  const experiments = [
    { id: "exp-1", title: "Аудит модуля", goal: "audit" },
    { id: "exp-2", title: "Рефакторинг" },
    { id: "exp-3", title: "Без прогонов" },
  ];

  assert.equal(runDurationMs(runs[2], now), 5 * 60 * 1000);
  assert.equal(runDurationMs({}, now), 0);

  const stats = aggregateMissionStats(runs, experiments, { now });
  assert.equal(stats.totals.runs, 3);
  assert.equal(stats.totals.done, 1);
  assert.equal(stats.totals.failed, 1);
  assert.equal(stats.totals.running, 1);
  assert.equal(stats.totals.accepted, 1);
  assert.equal(stats.totals.rejected, 1);
  assert.equal(stats.totals.undecided, 1);
  assert.equal(stats.totals.tokens, 1750);
  assert.equal(stats.totals.toolUses, 6);
  assert.equal(stats.totals.avgDurationMs, Math.round((60_000 + 180_000 + 300_000) / 3));

  const byId = new Map(stats.missions.map((mission) => [mission.experimentId, mission]));
  assert.equal(byId.get("exp-1").title, "Аудит модуля");
  assert.equal(byId.get("exp-1").accepted, 1);
  assert.equal(byId.get("exp-1").avgDurationMs, 120_000);
  assert.equal(byId.get("exp-1").tokens, 1500);
  assert.equal(byId.get("exp-2").running, 1);
  assert.equal(byId.get("exp-2").avgDurationMs, 300_000);
  assert.equal(byId.get("exp-3").runs, 0);
  assert.equal(byId.get("exp-2").acceptRate, 0);
  assert.equal(byId.get("exp-1").acceptRate, 0.5);
});

test("status dashboard is compact RU text with accept/reject counts", () => {
  const now = Date.parse("2024-01-01T10:10:00.000Z");
  const runs = [
    {
      id: "a",
      experimentId: "exp-1",
      status: "done",
      startedAt: "2024-01-01T10:00:00.000Z",
      finishedAt: "2024-01-01T10:02:00.000Z",
      tokens: 2000,
      toolUses: 4,
      verdict: { decision: "accept", confidence: 0.9 },
    },
    {
      id: "b",
      experimentId: "exp-1",
      status: "running",
      startedAt: "2024-01-01T10:09:00.000Z",
      tokens: 100,
      toolUses: 1,
    },
  ];
  const summary = buildStatusSummary({
    runs,
    experiments: [{ id: "exp-1", title: "Аудит модуля" }],
    now,
  });

  assert.match(summary.text, /^\*\*AI Lab · статус на 10:10 UTC\*\*$/m);
  assert.match(summary.text, /В работе: 1 · в очереди: 0 · завершено: 1 · с ошибкой: 0/);
  assert.match(summary.text, /принято 1 · на доработку 0 · отклонено 0/);
  // A running run is measured against `now`, so both runs contribute a duration.
  assert.match(summary.text, /Средняя длительность прогона: 1м 30с/);
  assert.match(summary.text, /токенов 2\.1k/);
  assert.match(summary.text, /вызовов инструментов 5/);
  assert.match(summary.text, /• Аудит модуля — 2 прогона, принято 1, в работе 1, ср\. 1м 30с/);
  assert.equal(summary.stats.totals.runs, 2);

  const empty = buildStatusSummary({ runs: [], experiments: [], now });
  assert.match(empty.text, /Прогонов пока нет/);
});

// ---------------------------------------------------------------------------
// extension factory against a mocked Aether API
// ---------------------------------------------------------------------------

function createMockAether() {
  const storage = new Map();
  const actions = new Map();
  const surfaces = [];
  const messageTypes = [];
  const calls = { host: [], notify: [], messages: [], settings: [], menu: [] };
  const aether = {
    apiVersion: 2,
    extension: { id: "aether-ai-lab", name: "AI Lab", path: "/tmp/ai-lab" },
    ui: {
      web: (options) => ({ type: "web", ...options }),
      row: (children) => ({ type: "row", children }),
      column: (children) => ({ type: "column", children }),
      text: (value) => ({ type: "text", value }),
      button: (label, action, options = {}) => ({ type: "button", label, action, ...options }),
      card: (children) => ({ type: "card", children }),
    },
    storage: {
      get: (key, fallback) => (storage.has(key) ? storage.get(key) : fallback),
      set: (key, value) => storage.set(key, value),
      delete: (key) => storage.delete(key),
      clear: () => storage.clear(),
      snapshot: () => Object.fromEntries(storage),
    },
    host: {
      invoke: async (method, args) => {
        calls.host.push({ method, args });
        if (method === "app.getState") return { is_running: false, sessions: [] };
        return {};
      },
    },
    services: { list: async () => [], describe: async () => ({}), invoke: async () => ({}) },
    state: { get: async () => ({}), patch: async () => ({}), transaction: async () => ({}) },
    messages: {
      append: async (type, payload, text) => {
        calls.messages.push({ type, payload, text });
        return {};
      },
    },
    registerAction: (id, handler) => {
      actions.set(id, handler);
      return () => actions.delete(id);
    },
    registerSurface: (slot, definition) => {
      surfaces.push({ slot, definition });
      return () => {};
    },
    registerComponent: () => () => {},
    registerSettings: (definition) => {
      calls.settings.push(definition);
      return () => {};
    },
    registerComposerMenuItem: (definition) => {
      calls.menu.push(definition);
      return () => {};
    },
    registerMessageType: (definition) => {
      messageTypes.push(definition);
      return () => {};
    },
    registerToolTitle: () => () => {},
    on: () => () => {},
    intercept: () => () => {},
    invalidate: () => {},
    notify: (message, level) => calls.notify.push({ message, level }),
  };
  return {
    aether,
    storage,
    actions,
    surfaces,
    messageTypes,
    calls,
    run: (args) => actions.get("ai-lab")(args),
    settingsAction: (settingId, payload) => actions.get(`settings:ai-lab:${settingId}`)(payload),
  };
}

const mock = createMockAether();
const dispose = activateAether(mock.aether);
// `mock.storage` is the raw Map behind the mocked Aether storage API.
const EXPERIMENTS = () => mock.storage.get("lab.experiments") ?? [];
const RUNS = () => mock.storage.get("lab.runs") ?? [];
const BUNDLES = () => mock.storage.get("lab.bundles") ?? [];

test("registration keeps the legacy surface plus new ops", () => {
  assert.ok(mock.actions.has("ai-lab"), "ai-lab action registered");
  assert.ok(mock.storage.has("lab.experiments") === false);
  assert.equal(mock.surfaces.filter((item) => item.slot === "app.overlay").length, 1);
  assert.ok(mock.calls.menu.some((item) => item.id === "ai-lab-presets"), "preset composer entry");
  assert.ok(mock.calls.menu.some((item) => item.id === "ai-lab-composer"), "legacy composer entry kept");
  assert.ok(mock.messageTypes.some((item) => item.type === "ai-lab-verdict"), "legacy verdict message type");
  assert.ok(mock.messageTypes.some((item) => item.type === "ai-lab-status"), "status message type");
  const settingsPage = mock.calls.settings[0];
  const titles = settingsPage.sections.map((section) => section.title);
  assert.deepEqual(titles, ["Лаборатория", "Политика проверки", "Пресеты миссий", "Пакеты миссий"]);
});

test("preset op fills the draft, then creates and runs a real experiment", async () => {
  const drafted = await mock.run({ op: "preset", preset: "Код-ревью extensions/aether-ai-lab", draft: true });
  assert.equal(drafted.ok, true);
  assert.equal(drafted.preset, "code-review");
  assert.equal(drafted.target, "extensions/aether-ai-lab");
  const draft = mock.storage.get("lab.draft");
  assert.equal(draft.preset, "code-review");
  assert.match(draft.goal, /^Провести код-ревью extensions\/aether-ai-lab: баги/);
  assert.ok(!draft.goal.includes("<путь/модуль>"), "goal placeholder is substituted");
  assert.match(draft.reviewerFocus, /file:line/);
  assert.equal(mock.storage.get("lab.tab"), "new");
  assert.equal(mock.storage.get("lab.open"), true);
  assert.equal(EXPERIMENTS().length, 0);

  const launched = await mock.run({ op: "preset", preset: "тесты app/src" });
  assert.equal(launched.ok, true);
  assert.equal(launched.runs, 1);
  const experiment = EXPERIMENTS().find((item) => item.id === launched.experiment_id);
  assert.equal(experiment.presetId, "tests");
  assert.match(experiment.goal, /^Покрыть тестами app\/src: сначала карта/);
  assert.ok(experiment.workerBrief.length > 0);
  assert.match(experiment.reviewerFocus, /Продовый код/);

  const run = RUNS().find((item) => item.experimentId === experiment.id);
  assert.ok(run, "a queued run was created");
  assert.match(run.prompt, /AI Lab goal: Покрыть тестами app\/src: сначала карта/);
  assert.match(run.prompt, /Mission rules:\n- /);

  const unknown = await mock.run({ op: "preset", preset: "deploy" });
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown.presets, ["code-review", "refactor", "tests", "docs"]);

  const listed = await mock.run({ op: "presets" });
  assert.equal(listed.ok, true);
  assert.equal(listed.presets.length, 4);

  // Scripts may pass the panel's textarea format as a plain string.
  await mock.run({
    op: "preset",
    preset: "доки",
    draft: true,
    variants: "Писатель | m-x | aether-lab-worker\n Второй | | ",
  });
  assert.equal(mock.storage.get("lab.draft").variants, "Писатель | m-x | aether-lab-worker\nВторой |  |");
});

test("manual create with a preset id inherits the reviewer criteria", async () => {
  const created = await mock.run({
    op: "create",
    goal: "Переписать модуль логов без изменения поведения.",
    variants: [{ label: "Рефактор", modelKey: "", agentType: "" }],
    preset: "refactor",
    runNow: false,
  });
  assert.equal(created.ok, true);
  const experiment = EXPERIMENTS().find((item) => item.id === created.experiment_id);
  assert.equal(experiment.presetId, "refactor");
  assert.match(experiment.reviewerFocus, /Тесты зелёные/);
  assert.equal(RUNS().some((run) => run.experimentId === experiment.id), false, "runNow:false creates no run");
});

test("per-run report export writes decoded markdown through the host", async () => {
  const run = RUNS()[0];
  await mock.run({ op: "accept", run_id: run.id });

  const before = mock.calls.host.length;
  const result = await mock.run({ op: "export-run", run_id: run.id });
  assert.equal(result.ok, true);
  assert.match(result.path, /^\/workspace\/ai-lab-run-run-.*\.md$/);

  const call = mock.calls.host.slice(before).find((item) => item.method === "runtime.execute");
  assert.ok(call, "runtime.execute was invoked");
  assert.equal(call.args.working_directory, "/workspace");
  const base64 = call.args.command.match(/printf '%s' '([^']+)' \| base64 -d/)[1];
  const markdown = Buffer.from(base64, "base64").toString("utf8");
  assert.match(markdown, /^# AI Lab · Тесты/);
  assert.match(markdown, /## Цель\n\nПокрыть тестами app\/src: сначала карта/);
  assert.match(markdown, /accept \(100%, user\)/);
  assert.match(markdown, /\| Длительность \|/);

  const missing = await mock.run({ op: "export-run", run_id: "run-that-does-not-exist" });
  assert.equal(missing.ok, false);
});

test("status op posts the RU dashboard into the chat", async () => {
  const before = mock.calls.messages.length;
  const result = await mock.run({ op: "status" });
  assert.equal(result.ok, true);
  assert.match(result.text, /AI Lab · статус на \d\d:\d\d UTC/);
  assert.match(result.text, /Вердикты: принято 1/);
  assert.equal(result.totals.runs, RUNS().length);

  const posted = mock.calls.messages.slice(before).find((item) => item.type === "ai-lab-status");
  assert.ok(posted, "ai-lab-status message appended");
  assert.equal(posted.text, result.text);
  assert.equal(posted.payload.runs, RUNS().length);
  assert.equal(posted.payload.accepted, 1);

  const quiet = await mock.run({ op: "status", quiet: true });
  assert.equal(quiet.ok, true);
  assert.equal(mock.calls.messages.filter((item) => item.type === "ai-lab-status").length, 1, "quiet mode posts nothing");
});

test("bundle op queues missions with bounded parallelism and resumes on stop", async () => {
  const started = await mock.run({ op: "bundle", bundle: "аудит", parallel: 1 });
  assert.equal(started.ok, true);
  assert.equal(started.bundle, "audit");
  assert.equal(started.experiments, 3);
  assert.equal(started.parallel, 1);

  const auditExperiments = EXPERIMENTS().filter((item) => item.bundleId === "audit");
  assert.deepEqual(
    auditExperiments.map((item) => item.title),
    ["Линт и мёртвый код", "Тесты", "Безопасность"],
  );

  let jobs = BUNDLES();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].parallel, 1);
  assert.equal(jobs[0].pending.length, 2, "two missions wait in the queue");
  assert.equal(jobs[0].inflight.length, 1, "only one mission runs");

  const listed = await mock.run({ op: "bundles" });
  assert.equal(listed.ok, true);
  assert.equal(listed.bundles.length, 3);
  assert.equal(listed.active[0].pending, 2);
  assert.equal(listed.active[0].inflight, 1);

  const activeRun = RUNS().find((item) => item.id === jobs[0].inflight[0]);
  assert.ok(activeRun, "the in-flight run exists");
  await mock.run({ op: "stop", run_id: activeRun.id });

  jobs = BUNDLES();
  assert.equal(jobs[0].pending.length, 1, "stop pump started the next mission");
  assert.equal(jobs[0].inflight.length, 1);
  assert.notEqual(jobs[0].inflight[0], activeRun.id);

  const parallelTwo = await mock.run({ op: "bundle", bundle: "release", parallel: 3 });
  assert.equal(parallelTwo.parallel, 3);
  assert.equal(BUNDLES().length, 2);

  // The settings override feeds the default parallelism.
  mock.settingsAction("bundle-parallel", { value: "2" });
  assert.equal(mock.storage.get("lab.settings").bundleParallel, 2);
});

test("overlay renders the new payload without throwing", async () => {
  await mock.run({ op: "open-tab", tab: "new" });
  const overlay = mock.surfaces.find((item) => item.slot === "app.overlay");
  const node = overlay.definition.render();
  assert.equal(node.type, "web");
  assert.ok(node.html.includes("window.__LAB__"));

  const start = node.html.indexOf("window.__LAB__ = ") + "window.__LAB__ = ".length;
  const end = node.html.indexOf("};\n", start) + 1;
  const payload = JSON.parse(node.html.slice(start, end));
  assert.equal(payload.presets.length, 4);
  assert.equal(payload.bundles.length, 3);
  assert.ok(Array.isArray(payload.missionStats));
  assert.ok(payload.missionStats.some((mission) => mission.runs > 0));
  assert.equal(payload.tab, "new");
  assert.equal(payload.draft.preset, "docs");
  assert.match(payload.draft.variants, /^Писатель \| m-x \| aether-lab-worker/);
});

test("legacy ops still work and bundles are cleared by nothing else", async () => {
  const status = await mock.run({ op: "status", quiet: true });
  assert.ok(status.totals.runs > 0);

  const cleared = await mock.run({ op: "clear-runs" });
  assert.equal(cleared.ok, true);
  assert.equal(RUNS().length, 0);

  const unknown = await mock.run({ op: "definitely-not-an-op" });
  assert.equal(unknown.ok, false);

  const render = mock.surfaces.find((item) => item.slot === "app.overlay").definition.render();
  assert.ok(render.html.includes("window.__LAB__"));
});

test("dispose cleans up registered handlers", () => {
  dispose();
  assert.equal(mock.actions.has("ai-lab"), false);
});