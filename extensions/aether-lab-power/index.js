/**
 * Aether Lab Power — three heavy tools pinned to the conversation drawer.
 *
 *   Mission Control  live fleet of every sub-agent, grouped by parent goal
 *   Fan-out          split one request into N independent angles, run them in
 *                    parallel, then merge the answers through a synthesis agent
 *   Memory Vault     key/value project memory that is matched by keyword and
 *                    injected into fan-out prompts and the chat on demand
 *
 * Everything runs on the pi-subagents bridge, so it degrades to a clear error
 * state (instead of a dead button) when pi-subagents is disabled.
 */

import { renderPowerHtml } from "./power-view.js";

const ACTION_ID = "lab-power";
const BRIDGE_KEY = Symbol.for("pi-subagents.aether-bridge");

const STORAGE_OPEN = "power.open";
const STORAGE_PANEL = "power.panel";
const STORAGE_MEMORY = "power.memory";
const STORAGE_JOBS = "power.jobs";
// Mirrors the host window flag read through app.getKeepScreenOn / app.setKeepScreenOn.
const STORAGE_AWAKE = "power.awake";

const POLL_MS = 2_000;
// Fan-out size and job timeout are user-configurable from the app settings page
// (registerSettings writes plain storage keys we read back here).
const SETTINGS_PAGE_ID = "lab-power-settings";
const PARALLEL_CEILING = 12;
const TIMEOUT_CEILING_MINUTES = 60;
const DEFAULT_PARALLEL = 3;
const DEFAULT_TIMEOUT_MINUTES = 20;
const TERMINAL = new Set(["completed", "failed", "error", "aborted", "stopped", "cancelled", "steered"]);

const ANGLES = [
  "Correctness and edge cases",
  "Existing code that already solves part of this",
  "Performance and resource cost",
  "Security, privacy and failure modes",
  "Tests, verification and reproducibility",
  "Simplest alternative design",
];

const asString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value);
  return text.length > 0 ? text : fallback;
};

const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function truncate(value, limit) {
  const text = asString(value);
  return text.length > limit ? `${text.slice(0, limit)}\n…(${text.length - limit} more chars)` : text;
}

export const activateAether = (aether) => {
  const ui = aether.ui;
  const timers = new Map();
  const disposers = [];

  // ----- bridge ------------------------------------------------------------

  function bridge() {
    try {
      const found = globalThis[BRIDGE_KEY];
      return found && typeof found.getSnapshot === "function" ? found : null;
    } catch {
      return null;
    }
  }

  function snapshot() {
    try {
      return bridge()?.getSnapshot() ?? null;
    } catch {
      return null;
    }
  }

  function agentResult(id) {
    try {
      return asString(bridge()?.getResult?.(id));
    } catch {
      return "";
    }
  }

  // ----- persisted state ---------------------------------------------------

  const readMemory = () => {
    const stored = aether.storage.get(STORAGE_MEMORY, []);
    return Array.isArray(stored) ? stored : [];
  };

  const writeMemory = (items) => {
    aether.storage.set(STORAGE_MEMORY, items.slice(-400));
  };

  const readJobs = () => {
    const stored = aether.storage.get(STORAGE_JOBS, []);
    return Array.isArray(stored) ? stored : [];
  };

  const writeJobs = (jobs) => {
    aether.storage.set(STORAGE_JOBS, jobs.slice(-60));
  };

  const isOpen = () => aether.storage.get(STORAGE_OPEN, false) === true;
  const readPanel = () => asString(aether.storage.get(STORAGE_PANEL, "mission"), "mission");

  // ----- user-configurable parallelism -------------------------------------

  const settingKey = (id) => `settings:${SETTINGS_PAGE_ID}:${id}`;
  const readParallel = () =>
    clamp(Number(aether.storage.get(settingKey("parallelRequests"), DEFAULT_PARALLEL)) || DEFAULT_PARALLEL, 1, PARALLEL_CEILING);
  const readAutoMerge = () => aether.storage.get(settingKey("autoMerge"), true) !== false;
  const readTimeoutMs = () => {
    const minutes = clamp(
      Number(aether.storage.get(settingKey("fanoutTimeout"), DEFAULT_TIMEOUT_MINUTES)) || DEFAULT_TIMEOUT_MINUTES,
      1,
      TIMEOUT_CEILING_MINUTES,
    );
    return minutes * 60 * 1000;
  };
  const setSetting = (id, value) => {
    aether.storage.set(settingKey(id), value);
    aether.storage.set(id, value);
  };

  function updateJob(jobId, patch) {
    let updated = null;
    writeJobs(readJobs().map((job) => {
      if (job.id !== jobId) return job;
      updated = { ...job, ...patch, updatedAt: nowIso() };
      return updated;
    }));
    return updated;
  }

  function getJob(jobId) {
    return readJobs().find((job) => job.id === jobId) ?? null;
  }

  function clearTimer(key) {
    const timer = timers.get(key);
    if (!timer) return;
    clearTimeout(timer);
    timers.delete(key);
  }

  function later(key, delay, callback) {
    clearTimer(key);
    const id = setTimeout(() => {
      timers.delete(key);
      try {
        callback();
      } catch {
        // a timer must never break the extension
      }
    }, delay);
    if (typeof id?.unref === "function") id.unref();
    timers.set(key, id);
  }

  // ----- memory matching ---------------------------------------------------

  const STOP_WORDS = new Set([
    "the", "and", "for", "with", "this", "that", "from", "into", "when", "what",
    "how", "why", "are", "was", "were", "you", "your", "our", "its", "use", "use",
    "but", "not", "all", "any", "can", "has", "have", "will", "should", "must",
  ]);

  function keywords(text) {
    return asString(text)
      .toLowerCase()
      .split(/[^a-z0-9_\u0400-\u04ff+#.-]+/i)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  }

  function matchMemory(query, limit = 6) {
    const words = keywords(query);
    if (words.length === 0) return [];
    return readMemory()
      .map((item) => {
        const haystack = `${item.key} ${item.value} ${(item.tags || []).join(" ")}`.toLowerCase();
        const hits = words.filter((word) => haystack.includes(word)).length;
        return { item, score: hits / words.length + (item.pinned ? 0.35 : 0) };
      })
      .filter((entry) => entry.score > 0.16)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  function memoryBlock(query) {
    const hits = matchMemory(query);
    if (hits.length === 0) return "";
    return [
      "Known project memory (carry these constraints forward):",
      ...hits.map((item) => `- ${item.key}: ${truncate(item.value, 900)}`),
    ].join("\n");
  }

  // ----- fan-out -----------------------------------------------------------

  function spawn(type, prompt) {
    const api = bridge();
    if (!api || typeof api.dispatchMention !== "function") return null;
    const before = new Set((snapshot()?.agents ?? []).map((agent) => agent.id));
    return api
      .dispatchMention(`@${type} ${prompt}`)
      .then((result) => (result && result.action === "handled" ? { before } : null))
      .catch(() => null);
  }

  async function startFanOut(payload) {
    const request = asString(payload?.request).trim();
    if (!request) return null;
    // Explicit tool calls win; otherwise fall back to the user's "how many
    // parallel requests" setting from the app settings page.
    const count = clamp(Number(payload?.count) || readParallel(), 1, PARALLEL_CEILING);
    const workerType = asString(payload?.workerType, "aether-lab-worker");
    const mergerType = asString(payload?.mergerType, "aether-lab-orchestrator");
    const adaptive = payload?.adaptive !== false;
    const memory = memoryBlock(request);
    const angles = (Array.isArray(payload?.angles) && payload.angles.length > 0
      ? payload.angles.map(asString).filter(Boolean)
      : ANGLES
    ).slice(0, count);

    const job = {
      id: newId("job"),
      request,
      count: angles.length,
      angles,
      workerType,
      mergerType,
      adaptive,
      memoryUsed: Boolean(memory),
      status: "running",
      createdAt: nowIso(),
      finishedAt: "",
      workers: angles.map((angle, index) => ({
        id: `${index}-${angle.slice(0, 12)}`,
        angle,
        agentId: "",
        status: "queued",
        output: "",
        error: "",
      })),
      merged: "",
      mergeError: "",
    };
    writeJobs([...readJobs(), job]);
    aether.invalidate();

    const prompt = (angle) => [
      `Fan-out angle: ${angle}`,
      "",
      `Original request:\n${request}`,
      memory ? `\n${memory}` : "",
      "",
      `Answer only the "${angle}" angle. Be concrete, cite files and commands,`,
      "and finish with `## Result` plus `## Evidence`. Do not repeat the other angles.",
    ].filter(Boolean).join("\n");

    for (let index = 0; index < job.angles.length; index += 1) {
      const angle = job.angles[index];
      const spawned = await spawn(workerType, prompt(angle));
      const workers = readJobs().find((item) => item.id === job.id)?.workers ?? job.workers;
      const next = workers.map((worker, i) => (
        i === index
          ? spawned
            ? { ...worker, status: "running" }
            : { ...worker, status: "failed", error: "pi-subagents is not available." }
          : worker
      ));
      updateJob(job.id, { workers: next });
      if (spawned) watchWorker(job.id, index, spawned.before, Date.now());
    }
    aether.invalidate();
    return job;
  }

  function watchWorker(jobId, index, beforeIds, startedAt) {
    const key = `${jobId}:${index}`;
    const poll = () => {
      const job = getJob(jobId);
      if (!job || job.status !== "running") return;
      const worker = job.workers[index];
      if (!worker || worker.status === "done" || worker.status === "failed") return;
      if (Date.now() - startedAt > readTimeoutMs()) {
        const workers = job.workers.map((item, i) => (
          i === index ? { ...item, status: "failed", error: "Timed out." } : item
        ));
        updateJob(jobId, { workers });
        aether.invalidate();
        maybeMerge(jobId);
        return;
      }
      const agents = Array.isArray(snapshot()?.agents) ? snapshot().agents : [];
      let agent = worker.agentId ? agents.find((item) => item.id === worker.agentId) : null;
      if (!agent) {
        const fresh = agents.filter((item) => !beforeIds.has(item.id));
        agent = fresh[fresh.length - 1];
        if (agent) {
          const workers = job.workers.map((item, i) => (
            i === index ? { ...item, agentId: agent.id } : item
          ));
          updateJob(jobId, { workers });
        }
      }
      if (!agent) {
        later(key, POLL_MS, poll);
        return;
      }
      const status = asString(agent.status).toLowerCase();
      if (!TERMINAL.has(status)) {
        later(key, POLL_MS, poll);
        return;
      }
      const failed = status !== "completed" && status !== "steered";
      const workers = job.workers.map((item, i) => (
        i === index
          ? {
            ...item,
            status: failed ? "failed" : "done",
            output: agentResult(agent.id) || asString(agent.resultPreview),
            error: failed ? asString(agent.error, `Agent ${status}.`) : "",
          }
          : item
      ));
      updateJob(jobId, { workers });
      aether.invalidate();
      maybeMerge(jobId);
    };
    later(key, 900, poll);
  }

  function maybeMerge(jobId) {
    const job = getJob(jobId);
    if (!job || job.status !== "running") return;
    if (job.workers.some((worker) => worker.status === "running" || worker.status === "queued")) return;
    mergeJob(jobId).catch(() => {});
  }

  async function mergeJob(jobId) {
    const job = getJob(jobId);
    if (!job) return;
    const usable = job.workers.filter((worker) => worker.status === "done" && worker.output.trim());
    if (usable.length === 0) {
      updateJob(jobId, {
        status: "failed",
        mergeError: "Every worker failed — nothing to merge.",
        finishedAt: nowIso(),
      });
      aether.invalidate();
      return;
    }
    updateJob(jobId, { status: "merging" });
    aether.invalidate();

    const prompt = [
      `Merge ${usable.length} parallel research result(s) for one request.`,
      "",
      `Request:\n${job.request}`,
      "",
      ...usable.map((worker, index) => [
        `### Result ${index + 1} — ${worker.angle}`,
        truncate(worker.output, 9_000),
        "",
      ].join("\n")),
      "Produce one answer: reconcile contradictions explicitly, drop duplicated points,",
      "and keep every concrete file:line or command that supports a claim.",
      "End with `## Result`, `## Evidence`, `## Verification`.",
    ].join("\n");

    const spawned = await spawn(job.mergerType, prompt);
    if (!spawned) {
      // No synthesis agent: concatenate deterministically so the job still lands.
      updateJob(jobId, {
        status: "merged",
        merged: usable.map((worker) => `## ${worker.angle}\n\n${worker.output}`).join("\n\n---\n\n"),
        finishedAt: nowIso(),
      });
      aether.invalidate();
      return;
    }
    const startedAt = Date.now();
    const poll = () => {
      const current = getJob(jobId);
      if (!current || current.status !== "merging") return;
      if (Date.now() - startedAt > readTimeoutMs()) {
        updateJob(jobId, { status: "merged", merged: usable.map((worker) => worker.output).join("\n\n---\n\n"), finishedAt: nowIso() });
        aether.invalidate();
        return;
      }
      const agents = Array.isArray(snapshot()?.agents) ? snapshot().agents : [];
      const fresh = agents.filter((agent) => !spawned.before.has(agent.id));
      const agent = fresh[fresh.length - 1];
      if (!agent || !TERMINAL.has(asString(agent.status).toLowerCase())) {
        later(`${jobId}:merge`, POLL_MS, poll);
        return;
      }
      updateJob(jobId, {
        status: "merged",
        merged: agentResult(agent.id) || usable.map((worker) => worker.output).join("\n\n---\n\n"),
        finishedAt: nowIso(),
      });
      aether.invalidate();
      aether.notify(`Fan-out завершён: слито ${usable.length} ответ(ов).`, "info");
    };
    later(`${jobId}:merge`, 900, poll);
  }

  // ----- actions -----------------------------------------------------------

  disposers.push(aether.registerAction(ACTION_ID, async (args) => {
    const op = asString(args?.op);
    switch (op) {
      case "open": {
        aether.storage.set(STORAGE_OPEN, true);
        if (args?.panel) aether.storage.set(STORAGE_PANEL, asString(args.panel));
        aether.invalidate();
        return { ok: true };
      }
      case "close":
        aether.storage.set(STORAGE_OPEN, false);
        aether.invalidate();
        return { ok: true };
      case "panel":
        aether.storage.set(STORAGE_OPEN, true);
        aether.storage.set(STORAGE_PANEL, asString(args?.panel, "mission"));
        aether.invalidate();
        return { ok: true };
      case "fanout": {
        const job = await startFanOut(args);
        if (!job) {
          aether.notify("Fan-out нужен текст задачи.", "warning");
          return { ok: false };
        }
        aether.notify(`Fan-out запущен: ${job.count} параллельных запросов.`, "info");
        return { ok: true, job_id: job.id };
      }
      case "stop-job": {
        const job = getJob(asString(args?.job_id));
        if (job) {
          for (const worker of job.workers) {
            if (!worker.agentId) continue;
            try {
              bridge()?.abort?.(worker.agentId);
            } catch {
              // agent may be gone already
            }
          }
          updateJob(job.id, { status: "stopped", finishedAt: nowIso() });
        }
        aether.invalidate();
        return { ok: true };
      }
      case "rerun": {
        const job = getJob(asString(args?.job_id));
        if (!job) return { ok: false };
        const next = await startFanOut({ request: job.request, count: job.count, workerType: job.workerType, mergerType: job.mergerType, angles: job.angles });
        return { ok: Boolean(next), job_id: next?.id };
      }
      case "publish": {
        const job = getJob(asString(args?.job_id));
        if (!job || !job.merged) return { ok: false };
        await aether.messages.append(
          "lab-power-merge",
          { job_id: job.id, angles: job.count, memory_used: job.memoryUsed },
          [
            `**Fan-out result — ${job.count} parallel request(s)**`,
            "",
            `> ${truncate(job.request, 400)}`,
            "",
            job.merged,
          ].join("\n"),
        );
        aether.notify("Результат fan-out опубликован в чат.", "info");
        return { ok: true };
      }
      case "keep-screen": {
        const current = aether.storage.get(STORAGE_AWAKE, false) === true;
        let next = !current;
        try {
          const reply = await aether.host.invoke("app.setKeepScreenOn", { enabled: next });
          next = reply?.keep_screen_on === true;
        } catch {
          // Older hosts without the method: keep the local preference only.
        }
        aether.storage.set(STORAGE_AWAKE, next);
        aether.invalidate();
        return { ok: true, keep_screen_on: next };
      }
      case "memory-save": {
        const key = asString(args?.key).trim();
        const value = asString(args?.value).trim();
        if (!key || !value) {
          aether.notify("Памяти нужны и ключ, и значение.", "warning");
          return { ok: false };
        }
        const items = readMemory().filter((item) => item.key.toLowerCase() !== key.toLowerCase());
        items.push({
          id: newId("mem"),
          key,
          value,
          tags: asString(args?.tags).split(/[,\s]+/).filter(Boolean),
          pinned: args?.pinned === true,
          updatedAt: nowIso(),
        });
        writeMemory(items);
        aether.invalidate();
        return { ok: true };
      }
      case "memory-delete": {
        const id = asString(args?.id);
        writeMemory(readMemory().filter((item) => item.id !== id));
        aether.invalidate();
        return { ok: true };
      }
      case "memory-pin": {
        const id = asString(args?.id);
        writeMemory(readMemory().map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item)));
        aether.invalidate();
        return { ok: true };
      }
      case "memory-inject": {
        const items = matchMemory(asString(args?.query), 8);
        if (items.length === 0) {
          aether.notify("Под этот запрос ничего не нашлось в памяти.", "warning");
          return { ok: false };
        }
        await aether.messages.append(
          "lab-power-memory",
          { count: items.length },
          [
            "**Memory Vault recall**",
            "",
            ...items.map((item) => `- **${item.key}** — ${truncate(item.value, 600)}`),
          ].join("\n"),
        );
        return { ok: true, count: items.length };
      }
      default:
        return { ok: false, error: `Unknown Lab Power operation: ${op}` };
    }
  }));

  // ----- settings page (visible inside the app Settings screen) ------------

  // The app renders registerSettings pages generically. Values arrive through
  // the "settings:<page>:<id>" actions and are persisted into plain storage
  // keys, which startFanOut / readTimeoutMs read back at run time.
  disposers.push(aether.registerSettings?.({
    id: SETTINGS_PAGE_ID,
    title: "Lab Power",
    subtitle: "Параллельные запросы, слияние fan-out и таймауты",
    icon: "auto",
    order: 31,
    sections: [
      {
        id: "parallel",
        title: "Параллельная работа",
        settings: [
          {
            id: "parallelRequests",
            label: "Параллельных запросов",
            description: `Сколько одновременных запросов fan-out отправляет с одного API-ключа (1–${PARALLEL_CEILING}). Больше — быстрее, но выше расход квоты.`,
            type: "slider",
            min: 1,
            max: PARALLEL_CEILING,
            step: 1,
            default: DEFAULT_PARALLEL,
          },
          {
            id: "fanoutTimeout",
            label: "Таймаут задачи, минут",
            description: `Через сколько минут неотвеченный воркер fan-out считается упавшим (1–${TIMEOUT_CEILING_MINUTES}).`,
            type: "slider",
            min: 1,
            max: TIMEOUT_CEILING_MINUTES,
            step: 1,
            default: DEFAULT_TIMEOUT_MINUTES,
          },
          {
            id: "autoMerge",
            label: "Авто-слияние ответов",
            description: "Когда все воркеры закончили, автоматически запускать synthesis-агента и склеивать ответы в один результат.",
            type: "toggle",
            default: true,
          },
        ],
      },
    ],
  }));

  for (const settingId of ["parallelRequests", "fanoutTimeout", "autoMerge"]) {
    disposers.push(aether.registerAction(`settings:${SETTINGS_PAGE_ID}:${settingId}`, async (payload) => {
      const raw = payload?.value !== undefined ? payload.value : payload?.checked;
      let value = raw;
      if (settingId === "autoMerge") value = raw === true || raw === "true";
      else value = clamp(Math.round(Number(raw) || 0), settingId === "parallelRequests" ? 1 : 1, settingId === "parallelRequests" ? PARALLEL_CEILING : TIMEOUT_CEILING_MINUTES);
      setSetting(settingId, value);
      aether.invalidate?.();
      aether.notify?.("Настройка Lab Power сохранена.", "info");
      return { setting: settingId, value };
    }));
  }

  // ----- surfaces ----------------------------------------------------------

  disposers.push(aether.registerSurface("app.overlay", {
    id: "lab-power-overlay",
    order: 45,
    render: () => {
      if (!isOpen()) return null;
      return ui.web({
        height: 640,
        html: renderPowerHtml({
          panel: readPanel(),
          jobs: readJobs().slice().reverse(),
          memory: readMemory(),
          agents: Array.isArray(snapshot()?.agents) ? snapshot().agents : [],
          subagentsAvailable: Boolean(bridge()),
          keepScreenOn: aether.storage.get(STORAGE_AWAKE, false) === true,
          parallel: readParallel(),
        }),
      });
    },
  }));

  // The three power tools, pinned to the drawer header.
  disposers.push(aether.registerSurface("drawer.header", {
    id: "lab-power-tools",
    order: 20,
    render: () => {
      const running = readJobs().filter((job) => job.status === "running" || job.status === "merging").length;
      const live = (snapshot()?.agents ?? []).filter((agent) => (
        !TERMINAL.has(asString(agent.status).toLowerCase())
      )).length;
      return ui.card([
        ui.row([
          ui.text("Lab Power", { weight: "semibold" }),
          ui.text(live > 0 ? `живых: ${live}` : "простой", { style: "caption" }),
          ui.text(running > 0 ? `fan-out: ${running}` : "", { style: "caption" }),
        ]),
        ui.row([
          ui.button("Центр управления", ACTION_ID, { args: { op: "panel", panel: "mission" } }),
          ui.button("Fan-out", ACTION_ID, { args: { op: "panel", panel: "fanout" } }),
          ui.button("Память", ACTION_ID, { args: { op: "panel", panel: "memory" } }),
        ]),
        ui.row([
          ui.text(
            `Экран: ${aether.storage.get(STORAGE_AWAKE, false) === true ? "не гаснет" : "может гаснуть"}`,
            { style: "caption" },
          ),
          ui.button("Экран включённым", ACTION_ID, { args: { op: "keep-screen" } }),
        ]),
      ]);
    },
  }));

  disposers.push(aether.registerSurface("chat.composer.top", {
    id: "lab-power-banner",
    order: 28,
    render: () => {
      const live = (snapshot()?.agents ?? []).filter((agent) => (
        !TERMINAL.has(asString(agent.status).toLowerCase())
      ));
      const running = readJobs().filter((job) => job.status === "running" || job.status === "merging");
      if (live.length === 0 && running.length === 0) return null;
      return ui.row([
        ui.text(
          running.length > 0
            ? `Fan-out · ${running.length} job(s) merging`
            : `Lab Power · ${live.length} agent(s) live`,
          { style: "caption" },
        ),
        ui.button("Open", ACTION_ID, { args: { op: "panel", panel: "mission" } }),
      ]);
    },
  }));

  disposers.push(aether.registerComposerMenuItem({
    id: "lab-power-composer",
    title: "Fan-out этого запроса",
    subtitle: "Разбить на параллельные углы и слить",
    icon: "auto",
    order: 45,
    action: ACTION_ID,
    args: { op: "panel", panel: "fanout" },
  }));

  disposers.push(aether.registerMessageType({
    type: "lab-power-merge",
    title: "Результат fan-out",
    icon: "auto",
    render: ({ message }) => ui.card([
      ui.row([
        ui.text("Fan-out", { weight: "semibold" }),
        ui.text(`${asString(message?.angles, "?")} угл(ов)`, { style: "caption" }),
      ]),
      ui.text(truncate(asString(message?.text), 1_200), { style: "caption" }),
    ]),
  }));

  disposers.push(aether.registerMessageType({
    type: "lab-power-memory",
    title: "Recall from Memory Vault",
    icon: "auto",
    render: ({ message }) => ui.card([
      ui.row([
        ui.text("Memory Vault", { weight: "semibold" }),
        ui.text(`${asString(message?.count, "?")} зап.`, { style: "caption" }),
      ]),
      ui.text(truncate(asString(message?.text), 1_000), { style: "caption" }),
    ]),
  }));

  // Adopt the host's real window-flag state once, so a restart shows the truth.
  aether.host.invoke("app.getKeepScreenOn", {})
    .then((reply) => {
      if (reply && typeof reply.keep_screen_on === "boolean") {
        aether.storage.set(STORAGE_AWAKE, reply.keep_screen_on);
        aether.invalidate();
      }
    })
    .catch(() => {});

  return () => {
    for (const key of [...timers.keys()]) clearTimer(key);
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
        // ignore cleanup failures
      }
    }
  };
};

export default activateAether;