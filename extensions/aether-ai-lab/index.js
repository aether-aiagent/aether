/**
 * Aether AI Lab
 *
 * An autonomous review loop on top of Aether's sub-agents:
 *
 * 1. An *experiment* is a goal plus one or more variants (agent type + model).
 * 2. Every variant is dispatched as a real, goal-scoped sub-agent through
 *    pi-subagents (`@handle <prompt>` mention dispatch) so it runs in its own
 *    session, without stealing the user's chat.
 * 3. When a worker finishes, a *reviewer* agent receives the goal and the
 *    worker output and returns a strict JSON verdict: accept / revise / reject,
 *    with confidence, risks and required fixes.
 * 4. The user reads the transcript and the verdict in the Lab overlay and can
 *    override the reviewer at any time. Accepted results are reported back into
 *    the main conversation so the main agent can act on them.
 *
 * When pi-subagents is unavailable the Lab falls back to driving dedicated
 * chats through the Aether host bridge, so the feature never dead-ends.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { renderLabHtml, ACCENTS, TEMPLATES } from "./lab-view.js";
import {
  MISSION_PRESETS,
  MISSION_BUNDLES,
  MAX_BUNDLE_PARALLEL,
  aggregateMissionStats,
  buildRunReportMarkdown,
  buildStatusSummary,
  bundleExperimentPayloads,
  findBundle,
  findPreset,
  parsePresetArgs,
  parseVariantsText,
  presetExperimentPayload,
  resolveParallelism,
} from "./lab-core.js";

const SUBAGENTS_BRIDGE_KEY = Symbol.for("pi-subagents.aether-bridge");

const STORAGE_EXPERIMENTS = "lab.experiments";
const STORAGE_RUNS = "lab.runs";
const STORAGE_SETTINGS = "lab.settings";
const STORAGE_OPEN = "lab.open";
const STORAGE_TAB = "lab.tab";
const STORAGE_BUNDLES = "lab.bundles";

const ACTION_ID = "ai-lab";
const MAX_STORED_RUNS = 120;
const POLL_INTERVAL_MS = 2_500;
const SPAWN_LOOKUP_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const REVIEW_TIMEOUT_MS = 10 * 60 * 1000;

const WORKER_AGENT_TYPE = "aether-lab-worker";
const REVIEWER_AGENT_TYPE = "aether-lab-reviewer";

const TERMINAL_AGENT_STATUSES = new Set([
  "completed",
  "steered",
  "error",
  "aborted",
  "stopped",
]);

const WORKER_AGENT_DEFINITION = `---
name: ${WORKER_AGENT_TYPE}
description: AI Lab worker. Executes exactly one goal, verifies its own work, and reports evidence (commands run, files touched, test output) so a reviewer can accept or reject it.
thinking: medium
---

You are an AI Lab worker. You receive ONE goal and you own it end to end.

Rules:
- Restate the goal in one line, then execute it. Do not ask for confirmation.
- Prefer concrete verification: run the code, run the tests, read the file back, compare the output.
- Keep every claim checkable. No "should work" — show the command and its output.
- Stay inside the goal. Do not refactor unrelated code, do not reformat files you did not need to touch.
- Never leave the workspace broken: if an experiment must fail, restore the files you changed.

Finish with this report, and nothing else after it:

## Result
<what was actually achieved, 1-5 bullet points>

## Evidence
<commands executed + key output lines, file paths changed>

## Verification
PASS | FAIL | PARTIAL — plus one line explaining how you verified it.

## Open questions
<anything a reviewer must know to judge this work, or "none">
`;

const REVIEWER_AGENT_DEFINITION = `---
name: ${REVIEWER_AGENT_TYPE}
description: AI Lab reviewer. Audits another agent's work against the original goal and returns a strict JSON verdict. Read-only.
tools: read, grep, find, bash
thinking: high
---

You are the AI Lab reviewer. You never implement anything. You audit one worker
result against the goal it was given and you decide whether it may be accepted.

Be adversarial but fair:
- Verify claims against the workspace when you can (read the files, run read-only commands).
- Reject work that reports success without evidence, that touches unrelated files,
  or that leaves the workspace broken.
- "revise" is for work that is on the right track but incomplete or unverified.

Answer with a single JSON object, no markdown fence, no prose:

{
  "decision": "accept" | "revise" | "reject",
  "confidence": 0.0-1.0,
  "summary": "one sentence a human can read",
  "goal_coverage": "how much of the goal is really done",
  "evidence_ok": true | false,
  "risks": ["..."],
  "fixes": ["concrete next step, one line each"]
}
`;

// ---------------------------------------------------------------- utilities

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function asString(value, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function truncate(value, limit) {
  const text = asString(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… (truncated, ${text.length - limit} more characters)`;
}

function escapeHtml(value) {
  return asString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Extracts the first JSON object from a model reply. */
function extractJsonObject(text) {
  const raw = asString(text);
  if (!raw) return null;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenceMatch ? fenceMatch[1] : "", raw];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    if (start < 0) continue;
    for (let end = candidate.length; end > start; end -= 1) {
      const slice = candidate.slice(start, end);
      try {
        const parsed = JSON.parse(slice);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        // keep shrinking
      }
    }
  }
  return null;
}

function normalizeVerdict(parsed, source) {
  if (!parsed || typeof parsed !== "object") return null;
  const rawDecision = asString(parsed.decision).toLowerCase();
  const decision = rawDecision === "accept" || rawDecision === "reject" || rawDecision === "revise"
    ? rawDecision
    : "";
  if (!decision) return null;
  return {
    decision,
    confidence: clampNumber(parsed.confidence ?? 0.5, 0, 1),
    summary: truncate(parsed.summary ?? "", 400),
    goalCoverage: truncate(parsed.goal_coverage ?? "", 400),
    evidenceOk: parsed.evidence_ok !== false,
    risks: Array.isArray(parsed.risks) ? parsed.risks.map((item) => truncate(item, 240)).filter(Boolean) : [],
    fixes: Array.isArray(parsed.fixes) ? parsed.fixes.map((item) => truncate(item, 240)).filter(Boolean) : [],
    source: source || "reviewer",
    reviewedAt: nowIso(),
  };
}

/** Deterministic fallback review so the Lab still triages without an LLM. */
function heuristicVerdict(run) {
  const output = asString(run.output);
  const problems = [];
  if (run.status === "failed") problems.push("The worker did not finish successfully.");
  if (!output) problems.push("The worker produced no report.");
  if (output && !/##\s*Result/i.test(output)) problems.push("The report has no structured Result section.");
  if (output && !/##\s*Evidence/i.test(output)) problems.push("No evidence section was reported.");
  if (output && /(?:^|\n)\s*(?:Traceback|Error:|FAILED|fatal:)/i.test(output)) {
    problems.push("The report contains error output.");
  }
  const decision = problems.length === 0
    ? (output.length > 400 ? "accept" : "revise")
    : (run.status === "failed" ? "reject" : "revise");
  return {
    decision,
    confidence: decision === "accept" ? 0.55 : 0.4,
    summary: problems[0] ?? "Structured report with evidence looks complete.",
    goalCoverage: decision === "accept" ? "Report present" : "Needs a closer look",
    evidenceOk: problems.length === 0,
    risks: problems,
    fixes: problems.slice(0, 3),
    source: "heuristic",
    reviewedAt: nowIso(),
  };
}

// ------------------------------------------------------------------- module

export const activateAether = (aether) => {
  const ui = aether.ui;

  const runTimers = new Map();
  const pendingReviews = new Map();

  // ----- persisted state ----------------------------------------------------

  function readExperiments() {
    const stored = aether.storage.get(STORAGE_EXPERIMENTS, []);
    return Array.isArray(stored) ? stored : [];
  }

  function writeExperiments(experiments) {
    aether.storage.set(STORAGE_EXPERIMENTS, experiments);
  }

  function readRuns() {
    const stored = aether.storage.get(STORAGE_RUNS, []);
    return Array.isArray(stored) ? stored : [];
  }

  function writeRuns(runs) {
    aether.storage.set(STORAGE_RUNS, runs.slice(-MAX_STORED_RUNS));
  }

  function readSettings() {
    const stored = aether.storage.get(STORAGE_SETTINGS, {});
    const source = stored && typeof stored === "object" ? stored : {};
    return {
      autoReview: source.autoReview !== false,
      reviewerModelKey: asString(source.reviewerModelKey),
      workerAgentType: asString(source.workerAgentType, WORKER_AGENT_TYPE),
      reviewerAgentType: asString(source.reviewerAgentType, REVIEWER_AGENT_TYPE),
      reportToChat: source.reportToChat !== false,
      bundleParallel: clampNumber(source.bundleParallel, 0, MAX_BUNDLE_PARALLEL),
      theme: source.theme === "light" ? "light" : "dark",
      accent: ACCENTS[asString(source.accent)] ? asString(source.accent) : "violet",
    };
  }

  function isOpen() {
    return aether.storage.get(STORAGE_OPEN, false) === true;
  }

  function readTab() {
    return asString(aether.storage.get(STORAGE_TAB, "graph"), "graph");
  }

  function getRun(runId) {
    return readRuns().find((run) => run.id === runId) ?? null;
  }

  function updateRun(runId, patch) {
    let updated = null;
    const runs = readRuns().map((run) => {
      if (run.id !== runId) return run;
      updated = { ...run, ...patch, updatedAt: nowIso() };
      return updated;
    });
    writeRuns(runs);
    return updated;
  }

  function upsertExperiment(experiment) {
    const experiments = readExperiments();
    const index = experiments.findIndex((item) => item.id === experiment.id);
    if (index < 0) experiments.push(experiment);
    else experiments[index] = experiment;
    writeExperiments(experiments);
    return experiment;
  }

  // ----- sub-agent bridge ---------------------------------------------------

  function readBridge() {
    try {
      const bridge = globalThis[SUBAGENTS_BRIDGE_KEY];
      return bridge && typeof bridge.getSnapshot === "function" ? bridge : null;
    } catch {
      return null;
    }
  }

  function bridgeSnapshot() {
    const bridge = readBridge();
    if (!bridge) return null;
    try {
      return bridge.getSnapshot() ?? null;
    } catch {
      return null;
    }
  }

  function agentTypes() {
    const snapshot = bridgeSnapshot();
    const types = snapshot?.types;
    if (!Array.isArray(types)) return [];
    return types
      .filter((type) => type && type.enabled !== false)
      .map((type) => ({
        name: asString(type.name, WORKER_AGENT_TYPE),
        displayName: asString(type.displayName, asString(type.name)),
        description: asString(type.description),
      }));
  }

  function ensureAgentDefinitions() {
    const dir = join(homedir(), ".pi", "agent", "agents");
    const definitions = [
      { file: `${WORKER_AGENT_TYPE}.md`, body: WORKER_AGENT_DEFINITION },
      { file: `${REVIEWER_AGENT_TYPE}.md`, body: REVIEWER_AGENT_DEFINITION },
    ];
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    } catch {
      return;
    }
    for (const definition of definitions) {
      const target = join(dir, definition.file);
      if (existsSync(target)) continue;
      try {
        writeFileSync(target, definition.body, "utf8");
      } catch {
        // Read-only home; the built-in agent types still work.
      }
    }
  }

  function clearRunTimer(runId) {
    const timer = runTimers.get(runId);
    if (!timer) return;
    clearTimeout(timer.id);
    runTimers.delete(runId);
  }

  function schedule(runId, delayMs, callback) {
    clearRunTimer(runId);
    const id = setTimeout(() => {
      runTimers.delete(runId);
      try {
        callback();
      } catch {
        // never let a timer kill the Lab
      }
    }, delayMs);
    if (typeof id?.unref === "function") id.unref();
    runTimers.set(runId, { id });
  }

  // ----- prompts ------------------------------------------------------------

  function experimentBrief(experiment) {
    const brief = experiment?.workerBrief;
    if (Array.isArray(brief)) return brief.map((line) => asString(line)).filter(Boolean);
    return asString(brief) ? [asString(brief)] : [];
  }

  function workerPrompt(experiment, variant) {
    const brief = experimentBrief(experiment);
    return [
      `AI Lab goal: ${experiment.goal}`,
      "",
      `Variant: ${variant.label}${variant.modelKey ? ` (model ${variant.modelKey})` : ""}`,
      brief.length ? `Mission rules:\n${brief.map((line) => `- ${line}`).join("\n")}` : "",
      existingWorkspaceHint(),
      "Execute the goal now and finish with the four-section report.",
    ].filter(Boolean).join("\n");
  }

  function reviewerPrompt(run, experiment) {
    return [
      `AI Lab review request.`,
      "",
      `Goal:\n${experiment.goal}`,
      "",
      `Variant under review: ${run.label}`,
      `Worker status: ${run.status}`,
      "",
      `Worker report:\n${truncate(run.output, 12_000) || "(empty report)"}`,
      run.error ? `\nWorker error:\n${truncate(run.error, 2_000)}` : "",
      asString(experiment.reviewerFocus)
        ? `\nMission acceptance criteria:\n${truncate(experiment.reviewerFocus, 2_000)}`
        : "",
      "",
      "Audit the work against the goal. Verify what you can in the workspace,",
      "then answer with the single JSON verdict object described in your instructions.",
    ].filter(Boolean).join("\n");
  }

  function existingWorkspaceHint() {
    const workspace = asString(process.env.AETHER_WORKSPACE || process.env.PWD || "");
    return workspace ? `Workspace: ${workspace}` : "";
  }

  // ----- run orchestration --------------------------------------------------

  async function spawnSubagent(type, prompt) {
    const bridge = readBridge();
    if (!bridge || typeof bridge.dispatchMention !== "function") return null;
    const before = new Set((bridgeSnapshot()?.agents ?? []).map((agent) => agent.id));
    let result = null;
    try {
      result = await bridge.dispatchMention(`@${type} ${prompt}`);
    } catch {
      return null;
    }
    if (!result || result.action !== "handled") return null;
    return { before };
  }

  function watchSubagent(runId, beforeIds, startedAt) {
    const poll = () => {
      const run = getRun(runId);
      if (!run || run.status !== "running") return;
      if (Date.now() - startedAt > RUN_TIMEOUT_MS) {
        finishRun(runId, {
          status: "failed",
          error: "The worker exceeded the Lab timeout.",
        });
        return;
      }
      const snapshot = bridgeSnapshot();
      if (!snapshot) {
        schedule(runId, POLL_INTERVAL_MS, poll);
        return;
      }
      const agents = Array.isArray(snapshot.agents) ? snapshot.agents : [];
      let agent = run.agentId ? agents.find((item) => item.id === run.agentId) : null;
      if (!agent) {
        const fresh = agents.filter((item) => !beforeIds.has(item.id));
        if (fresh.length > 0) {
          agent = fresh[fresh.length - 1];
          updateRun(runId, { agentId: agent.id, agentType: agent.type ?? run.agentType });
        }
      }
      if (!agent) {
        if (Date.now() - startedAt > SPAWN_LOOKUP_TIMEOUT_MS) {
          finishRun(runId, {
            status: "failed",
            error: "The sub-agent never appeared in the fleet.",
          });
          return;
        }
        schedule(runId, POLL_INTERVAL_MS, poll);
        return;
      }
      const status = asString(agent.status).toLowerCase();
      if (!TERMINAL_AGENT_STATUSES.has(status)) {
        schedule(runId, POLL_INTERVAL_MS, poll);
        return;
      }
      const bridge = readBridge();
      const output = asString(
        (() => {
          try {
            return bridge?.getResult?.(agent.id) ?? "";
          } catch {
            return "";
          }
        })(),
      ) || asString(agent.result) || asString(agent.resultPreview);
      const failed = status !== "completed" && status !== "steered";
      finishRun(runId, {
        status: failed ? "failed" : "done",
        output,
        error: failed ? asString(agent.error, `Sub-agent ${status}.`) : "",
        tokens: asString(agent.tokens),
        toolUses: Number(agent.toolUses) || 0,
      });
    };
    schedule(runId, 1_200, poll);
  }

  async function spawnInChat(run) {
    await aether.host.invoke("app.newChat", {});
    if (run.modelKey) {
      try {
        await aether.host.invoke("app.setModel", { model_key: run.modelKey });
      } catch {
        // model key may be stale; the chat keeps its default
      }
    }
    await aether.host.invoke("app.sendMessage", { text: run.prompt, mode: "submit" });
    const startedAt = Date.now();
    const poll = () => {
      const current = getRun(run.id);
      if (!current || current.status !== "running") return;
      if (Date.now() - startedAt > RUN_TIMEOUT_MS) {
        finishRun(run.id, { status: "failed", error: "The Lab chat run timed out." });
        return;
      }
      aether.host.invoke("app.getState", {}).then((state) => {
        const isRunning = state?.is_running === true;
        if (isRunning) {
          schedule(run.id, POLL_INTERVAL_MS, poll);
          return;
        }
        const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
        const session = sessions.find((item) => item.id === state?.session_id) ?? sessions[0];
        const messages = Array.isArray(session?.messages) ? session.messages : [];
        const lastAgentMessage = [...messages].reverse().find((message) => {
          const text = asString(message?.text);
          return text && asString(message?.author).toLowerCase().includes("agent");
        });
        finishRun(run.id, {
          status: "done",
          output: asString(lastAgentMessage?.text),
        });
      }).catch(() => {
        schedule(run.id, POLL_INTERVAL_MS, poll);
      });
    };
    schedule(run.id, 1_500, poll);
  }

  async function dispatchRun(runId) {
    const run = getRun(runId);
    if (!run) return;
    const settings = readSettings();
    const experiment = readExperiments().find((item) => item.id === run.experimentId);
    if (!experiment) {
      updateRun(runId, { status: "failed", error: "The experiment was deleted." });
      return;
    }
    const prompt = run.prompt || workerPrompt(experiment, {
      label: run.label,
      modelKey: run.modelKey,
    });
    updateRun(runId, {
      status: "running",
      startedAt: nowIso(),
      prompt,
      mode: "pending",
    });
    aether.invalidate();

    const workerType = run.agentType || settings.workerAgentType;
    const spawned = await spawnSubagent(workerType, prompt);
    if (spawned) {
      updateRun(runId, { mode: "subagent" });
      watchSubagent(runId, spawned.before, Date.now());
      aether.invalidate();
      return;
    }
    updateRun(runId, { mode: "chat" });
    try {
      await spawnInChat(getRun(runId));
    } catch (error) {
      finishRun(runId, {
        status: "failed",
        error: `Could not start a Lab chat: ${asString(error?.message || error)}`,
      });
    }
    aether.invalidate();
  }

  function finishRun(runId, patch) {
    clearRunTimer(runId);
    const run = updateRun(runId, { ...patch, finishedAt: nowIso() });
    aether.invalidate();
    pumpBundles();
    if (!run) return;
    const settings = readSettings();
    if (settings.autoReview) {
      reviewRun(runId).catch(() => {
        updateRun(runId, {
          verdict: heuristicVerdict(getRun(runId) ?? run),
        });
        aether.invalidate();
      });
    }
  }

  // ----- review -------------------------------------------------------------

  async function reviewRun(runId) {
    const run = getRun(runId);
    if (!run) return null;
    if (run.status === "running" || run.status === "queued") return null;
    const experiment = readExperiments().find((item) => item.id === run.experimentId);
    if (!experiment) return null;
    const settings = readSettings();
    const prompt = reviewerPrompt(run, experiment);
    updateRun(runId, { reviewStatus: "running" });
    aether.invalidate();

    const reviewerType = settings.reviewerAgentType;
    const spawned = await spawnSubagent(reviewerType, prompt);
    if (!spawned) {
      if (settings.reviewerModelKey) {
        const chatVerdict = await reviewInChat(runId, prompt, settings.reviewerModelKey);
        updateRun(runId, { reviewStatus: "done" });
        aether.invalidate();
        return chatVerdict;
      }
      const fallback = heuristicVerdict(run);
      updateRun(runId, { verdict: fallback, reviewStatus: "heuristic" });
      aether.invalidate();
      return fallback;
    }

    pendingReviews.set(runId, { beforeIds: spawned.before, startedAt: Date.now() });
    const poll = () => {
      const current = getRun(runId);
      const pending = pendingReviews.get(runId);
      if (!current || !pending) {
        pendingReviews.delete(runId);
        return;
      }
      if (Date.now() - pending.startedAt > REVIEW_TIMEOUT_MS) {
        pendingReviews.delete(runId);
        updateRun(runId, {
          reviewStatus: "timeout",
          verdict: heuristicVerdict(current),
        });
        aether.invalidate();
        return;
      }
      const snapshot = bridgeSnapshot();
      if (!snapshot) {
        schedule(runId, POLL_INTERVAL_MS, poll);
        return;
      }
      const agents = Array.isArray(snapshot.agents) ? snapshot.agents : [];
      const fresh = agents.filter((agent) => !pending.beforeIds.has(agent.id));
      const reviewer = fresh[fresh.length - 1];
      if (!reviewer) {
        schedule(runId, POLL_INTERVAL_MS, poll);
        return;
      }
      const status = asString(reviewer.status).toLowerCase();
      if (!TERMINAL_AGENT_STATUSES.has(status)) {
        schedule(runId, POLL_INTERVAL_MS, poll);
        return;
      }
      pendingReviews.delete(runId);
      let raw = "";
      try {
        raw = asString(readBridge()?.getResult?.(reviewer.id));
      } catch {
        raw = "";
      }
      const verdict = normalizeVerdict(extractJsonObject(raw), reviewerType)
        ?? { ...heuristicVerdict(getRun(runId) ?? current), source: `${reviewerType} (unparsed)` };
      updateRun(runId, { verdict, reviewStatus: "done" });
      aether.invalidate();
      reportVerdictToChat(runId).catch(() => {});
    };
    schedule(runId, 1_200, poll);
    return null;
  }

  async function reviewInChat(runId, prompt, modelKey) {
    try {
      await aether.host.invoke("app.newChat", {});
      await aether.host.invoke("app.setModel", { model_key: modelKey });
      await aether.host.invoke("app.sendMessage", { text: prompt, mode: "submit" });
    } catch (error) {
      const fallback = heuristicVerdict(getRun(runId));
      updateRun(runId, { verdict: fallback });
      return fallback;
    }
    const startedAt = Date.now();
    return await new Promise((resolve) => {
      const poll = () => {
        if (Date.now() - startedAt > REVIEW_TIMEOUT_MS) {
          const fallback = heuristicVerdict(getRun(runId));
          updateRun(runId, { verdict: fallback, reviewStatus: "timeout" });
          aether.invalidate();
          resolve(fallback);
          return;
        }
        aether.host.invoke("app.getState", {}).then((state) => {
          if (state?.is_running === true) {
            schedule(runId, POLL_INTERVAL_MS, poll);
            return;
          }
          const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
          const session = sessions.find((item) => item.id === state?.session_id) ?? sessions[0];
          const messages = Array.isArray(session?.messages) ? session.messages : [];
          const lastAgentMessage = [...messages].reverse().find((message) => {
            const text = asString(message?.text);
            return text && asString(message?.author).toLowerCase().includes("agent");
          });
          const verdict = normalizeVerdict(
            extractJsonObject(asString(lastAgentMessage?.text)),
            "review-chat",
          ) ?? { ...heuristicVerdict(getRun(runId)), source: "review-chat (unparsed)" };
          updateRun(runId, { verdict });
          aether.invalidate();
          reportVerdictToChat(runId).catch(() => {});
          resolve(verdict);
        }).catch(() => schedule(runId, POLL_INTERVAL_MS, poll));
      };
      schedule(runId, 2_000, poll);
    });
  }

  async function reportVerdictToChat(runId) {
    const settings = readSettings();
    if (!settings.reportToChat) return;
    const run = getRun(runId);
    if (!run || !run.verdict) return;
    const experiment = readExperiments().find((item) => item.id === run.experimentId);
    const verdict = run.verdict;
    const lines = [
      `**AI Lab verdict — ${verdict.decision.toUpperCase()}** (${Math.round(verdict.confidence * 100)}% confidence)`,
      experiment ? `Goal: ${experiment.goal}` : "",
      `Variant: ${run.label}`,
      verdict.summary ? `Summary: ${verdict.summary}` : "",
      verdict.fixes.length ? `Fixes:\n${verdict.fixes.map((fix) => `- ${fix}`).join("\n")}` : "",
      verdict.risks.length ? `Risks:\n${verdict.risks.map((risk) => `- ${risk}`).join("\n")}` : "",
      `Reviewer: ${verdict.source}`,
    ].filter(Boolean);
    await aether.messages.append(
      "ai-lab-verdict",
      {
        run_id: run.id,
        experiment_id: run.experimentId,
        decision: verdict.decision,
        confidence: verdict.confidence,
        summary: verdict.summary,
      },
      lines.join("\n"),
    );
  }

  // ----- experiments --------------------------------------------------------

  /**
   * Variants may arrive as objects (panel) or as the textarea string
   * `label | model key | agent type` (scripts using the action args).
   */
  function variantsFromArgs(value) {
    if (typeof value === "string") return normalizeVariants(parseVariantsText(value));
    if (Array.isArray(value) && value.length > 0) return normalizeVariants(value);
    return undefined;
  }

  function normalizeVariants(rawVariants) {
    const list = Array.isArray(rawVariants) ? rawVariants : [];
    return list
      .map((variant, index) => ({
        id: asString(variant?.id) || newId("variant"),
        label: asString(variant?.label) || `Variant ${index + 1}`,
        modelKey: asString(variant?.modelKey),
        agentType: asString(variant?.agentType),
      }))
      .filter((variant) => variant.label);
  }

  function createExperiment(payload) {
    const goal = asString(payload?.goal);
    if (!goal) return null;
    const variants = normalizeVariants(payload?.variants);
    const workerBrief = Array.isArray(payload?.workerBrief)
      ? payload.workerBrief.map((line) => asString(line)).filter(Boolean)
      : (asString(payload?.workerBrief) ? [asString(payload?.workerBrief)] : []);
    const reviewerFocus = asString(payload?.reviewerFocus);
    const experiment = {
      id: newId("exp"),
      title: asString(payload?.title) || goal.slice(0, 60),
      goal,
      variants: variants.length > 0
        ? variants
        : [{ id: newId("variant"), label: "Worker", modelKey: "", agentType: "" }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...(workerBrief.length > 0 ? { workerBrief } : {}),
      ...(reviewerFocus ? { reviewerFocus } : {}),
      ...(asString(payload?.presetId) ? { presetId: asString(payload.presetId) } : {}),
      ...(asString(payload?.bundleId) ? { bundleId: asString(payload.bundleId) } : {}),
    };
    ensureAgentDefinitions();
    upsertExperiment(experiment);
    aether.invalidate();
    return experiment;
  }

  function startExperiment(experimentId, options = {}) {
    const settings = readSettings();
    const experiment = readExperiments().find((item) => item.id === experimentId);
    if (!experiment) return [];
    ensureAgentDefinitions();
    const created = experiment.variants.map((variant) => ({
      id: newId("run"),
      experimentId: experiment.id,
      experimentTitle: experiment.title,
      variantId: variant.id,
      label: variant.label,
      modelKey: variant.modelKey,
      agentType: variant.agentType || settings.workerAgentType,
      status: "queued",
      createdAt: nowIso(),
      startedAt: "",
      finishedAt: "",
      prompt: workerPrompt(experiment, variant),
      output: "",
      error: "",
      agentId: "",
      mode: "pending",
      verdict: null,
      reviewStatus: "",
    }));
    writeRuns([...readRuns(), ...created]);
    aether.invalidate();
    if (options.deferred === true) return created;
    created.forEach((run, index) => {
      schedule(run.id, 400 * index, () => {
        dispatchRun(run.id).catch((error) => {
          finishRun(run.id, {
            status: "failed",
            error: asString(error?.message || error, "Dispatch failed."),
          });
        });
      });
    });
    return created;
  }

  function stopRun(runId) {
    const run = getRun(runId);
    if (!run) return;
    if (run.agentId) {
      try {
        readBridge()?.abort?.(run.agentId);
      } catch {
        // agent may already be gone
      }
    }
    clearRunTimer(runId);
    pendingReviews.delete(runId);
    updateRun(runId, {
      status: "stopped",
      error: "Stopped by the user.",
      finishedAt: nowIso(),
    });
    aether.invalidate();
    pumpBundles();
  }

  // ----- mission bundles ----------------------------------------------------

  function readBundles() {
    const stored = aether.storage.get(STORAGE_BUNDLES, []);
    return Array.isArray(stored) ? stored.filter((job) => job && job.id) : [];
  }

  function writeBundles(jobs) {
    aether.storage.set(STORAGE_BUNDLES, jobs.slice(-20));
  }

  function runsInFlight(runIds) {
    const runs = readRuns();
    return (Array.isArray(runIds) ? runIds : []).filter((runId) => {
      const run = runs.find((item) => item.id === runId);
      return run && (run.status === "running" || run.status === "queued");
    });
  }

  /** Starts queued bundle experiments while each bundle is below its limit. */
  function pumpBundles() {
    const jobs = readBundles();
    if (jobs.length === 0) return;
    let changed = false;
    const next = [];
    for (const job of jobs) {
      const parallel = clampNumber(job.parallel, 1, MAX_BUNDLE_PARALLEL);
      const inflight = runsInFlight(job.inflight);
      const pending = Array.isArray(job.pending) ? job.pending.slice() : [];
      if (inflight.length !== (job.inflight || []).length) changed = true;
      let launched = 0;
      while (inflight.length + launched < parallel && pending.length > 0) {
        const experimentId = pending.shift();
        const created = startExperiment(experimentId, { deferred: true });
        if (created.length === 0) continue;
        changed = true;
        launched += created.length;
        for (const run of created) {
          schedule(run.id, 400, () => {
            dispatchRun(run.id).catch((error) => {
              finishRun(run.id, {
                status: "failed",
                error: asString(error?.message || error, "Dispatch failed."),
              });
            });
          });
        }
        inflight.push(...created.map((run) => run.id));
      }
      const nextJob = {
        ...job,
        parallel,
        pending,
        inflight: [...inflight],
        updatedAt: nowIso(),
      };
      if (pending.length === 0 && inflight.length === 0) {
        changed = true;
        aether.notify(`Пакет «${asString(job.title, job.bundleId)}» завершён.`, "info");
        continue;
      }
      next.push(nextJob);
    }
    if (changed) {
      writeBundles(next);
      aether.invalidate();
    }
  }

  /**
   * Creates the bundle's experiments and queues them with a bounded number of
   * in-flight workers. Progress lives in `lab.bundles` so a reload resumes it.
   */
  function startBundle(bundle, options = {}) {
    const plan = bundleExperimentPayloads(bundle, {
      parallel: options.parallel,
      target: options.target,
    });
    const experimentIds = [];
    for (const payload of plan.experiments) {
      const experiment = createExperiment(payload);
      if (experiment) experimentIds.push(experiment.id);
    }
    if (experimentIds.length === 0) return { job: null, experiments: [] };
    const job = {
      id: newId("bundle"),
      bundleId: bundle.id,
      title: bundle.title,
      parallel: resolveParallelism(options.parallel, experimentIds.length, plan.parallel),
      pending: experimentIds.slice(),
      inflight: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    writeBundles([...readBundles(), job]);
    pumpBundles();
    return { job, experiments: experimentIds };
  }

  function setVerdict(runId, decision, reason) {
    const run = getRun(runId);
    if (!run) return;
    const base = run.verdict ?? heuristicVerdict(run);
    updateRun(runId, {
      verdict: {
        ...base,
        decision,
        summary: asString(reason) || base.summary,
        source: "user",
        reviewedAt: nowIso(),
        confidence: 1,
      },
      reviewStatus: "user",
    });
    aether.invalidate();
    reportVerdictToChat(runId).catch(() => {});
  }

  async function exportReport() {
    const runs = readRuns().slice(-40);
    const experiments = readExperiments();
    const lines = [
      "# Aether AI Lab report",
      "",
      `Generated: ${nowIso()}`,
      `Experiments: ${experiments.length} · Runs: ${runs.length}`,
      "",
    ];
    for (const experiment of experiments) {
      lines.push(`## ${experiment.title}`, "", `Goal: ${experiment.goal}`, "");
      const experimentRuns = runs.filter((run) => run.experimentId === experiment.id);
      if (experimentRuns.length === 0) {
        lines.push("_No runs yet._", "");
        continue;
      }
      for (const run of experimentRuns) {
        const verdict = run.verdict;
        lines.push(
          `### ${run.label} — ${run.status}${verdict ? ` → ${verdict.decision}` : ""}`,
          "",
          verdict ? `Verdict: ${verdict.decision} (${Math.round(verdict.confidence * 100)}%) — ${verdict.summary}` : "Verdict: pending",
          verdict && verdict.fixes.length ? `Fixes: ${verdict.fixes.join("; ")}` : "",
          verdict && verdict.risks.length ? `Risks: ${verdict.risks.join("; ")}` : "",
          "",
          "<details><summary>Worker report</summary>",
          "",
          "```",
          truncate(run.output, 8_000) || "(empty)",
          "```",
          "",
          "</details>",
          "",
        );
      }
    }
    const markdown = lines.filter((line) => line !== undefined).join("\n");
    const base64 = Buffer.from(markdown, "utf8").toString("base64");
    const target = `/workspace/ai-lab-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
    try {
      await aether.host.invoke("runtime.execute", {
        command: `mkdir -p /workspace && printf '%s' '${base64}' | base64 -d > '${target}'`,
        working_directory: "/workspace",
        timeout_ms: 20_000,
      });
      aether.notify(`Отчёт AI Lab сохранён в ${target}`, "info");
      return target;
    } catch (error) {
      aether.notify(`Экспорт не удался: ${asString(error?.message || error)}`, "error");
      return "";
    }
  }

  // ----- extra operations ---------------------------------------------------

  /** Writes markdown to the workspace through the host runtime bridge. */
  async function writeWorkspaceFile(markdown, target) {
    const base64 = Buffer.from(markdown, "utf8").toString("base64");
    await aether.host.invoke("runtime.execute", {
      command: `mkdir -p /workspace && printf '%s' '${base64}' | base64 -d > '${target}'`,
      working_directory: "/workspace",
      timeout_ms: 20_000,
    });
    return target;
  }

  /** Resolves a run id from args, or the most recent finished run. */
  function resolveReportRun(value) {
    const runs = readRuns();
    const runId = asString(value);
    if (runId) return runs.find((run) => run.id === runId) ?? null;
    return [...runs].reverse().find((run) => run.status !== "queued") ?? null;
  }

  /**
   * Report export for a single mission run: goal, verdict, evidence and timings.
   * Returns `{ ok, path }`; the path is also shown as a toast.
   */
  async function exportRunReport(runInput) {
    const run = typeof runInput === "string" || runInput === undefined
      ? resolveReportRun(runInput)
      : runInput;
    if (!run) {
      aether.notify("Нет прогонов для экспорта.", "warning");
      return { ok: false, path: "" };
    }
    const experiment = readExperiments().find((item) => item.id === run.experimentId) ?? null;
    const siblings = readRuns().filter((item) => item.experimentId === run.experimentId);
    const markdown = buildRunReportMarkdown({
      run,
      experiment,
      siblings,
      generatedAt: nowIso(),
    });
    if (!markdown) {
      aether.notify("Отчёт пустой, экспортировать нечего.", "warning");
      return { ok: false, path: "" };
    }
    const target = `/workspace/ai-lab-run-${run.id}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
    try {
      await writeWorkspaceFile(markdown, target);
      aether.notify(`Отчёт прогона сохранён: ${target}`, "info");
      return { ok: true, path: target };
    } catch (error) {
      aether.notify(`Экспорт не удался: ${asString(error?.message || error)}`, "error");
      return { ok: false, path: "" };
    }
  }

  /** Publishes the compact RU status dashboard into the chat. */
  async function publishStatus(quiet = false) {
    const summary = buildStatusSummary({
      runs: readRuns(),
      experiments: readExperiments(),
      now: Date.now(),
    });
    if (!quiet) {
      try {
        await aether.messages.append(
          "ai-lab-status",
          {
            runs: summary.stats.totals.runs,
            running: summary.stats.totals.running,
            accepted: summary.stats.totals.accepted,
            rejected: summary.stats.totals.rejected,
          },
          summary.text,
        );
      } catch {
        // chat may be unavailable; the action result still carries the text
      }
      aether.notify("Статус AI Lab опубликован в чат.", "info");
    }
    return summary;
  }

  /**
   * Launches a mission preset. Without `options.launch` the preset is only put
   * into the panel draft so the user can edit the goal first.
   */
  function launchPreset(preset, options = {}) {
    const payload = presetExperimentPayload(preset, {
      target: options.target,
      goal: options.goal,
      variants: options.variants,
      title: options.title,
    });
    if (!payload) return { ok: false };
    if (options.launch !== true) {
      aether.storage.set("lab.draft", {
        goal: payload.goal,
        variants: payload.variantsText,
        preset: preset.id,
        title: payload.title,
        reviewerFocus: payload.reviewerFocus,
      });
      aether.storage.set(STORAGE_TAB, "new");
      aether.storage.set(STORAGE_OPEN, true);
      aether.invalidate();
      aether.notify(
        `Пресет «${preset.title}» подставлен в черновик: проверьте цель и запустите.`,
        "info",
      );
      return { ok: true, preset: preset.id, draft: true };
    }
    const experiment = createExperiment(payload);
    if (!experiment) {
      aether.notify("Пресету нужна цель.", "warning");
      return { ok: false };
    }
    const created = options.runNow === false ? [] : startExperiment(experiment.id);
    aether.storage.set(STORAGE_TAB, created.length > 0 ? "runs" : "experiments");
    aether.notify(
      `Пресет «${preset.title}»: миссия создана${created.length > 0 ? `, запусков: ${created.length}` : ""}.`,
      "info",
    );
    return { ok: true, preset: preset.id, experiment_id: experiment.id, runs: created.length };
  }

  function bundleStatus() {
    return readBundles().map((job) => ({
      id: job.id,
      bundleId: job.bundleId,
      title: job.title,
      parallel: job.parallel,
      pending: (job.pending || []).length,
      inflight: runsInFlight(job.inflight).length,
      createdAt: job.createdAt,
    }));
  }

  function buildComparison(run) {
    const experiment = readExperiments().find((item) => item.id === run.experimentId);
    const siblings = readRuns().filter((item) => item.experimentId === run.experimentId);
    const lines = [
      `**AI Lab · A/B for ${run.label}**`,
      experiment ? `Goal: ${experiment.goal}` : "",
      "",
      "| variant | status | verdict | confidence | tokens |",
      "| --- | --- | --- | --- | --- |",
      ...siblings.map((item) => `| ${item.label} | ${item.status} | ${item.verdict?.decision ?? "-"} | ${
        item.verdict ? Math.round((item.verdict.confidence || 0) * 100) + "%" : "-"
      } | ${item.tokens || "-"} |`),
      "",
    ];
    const best = [...siblings]
      .filter((item) => item.verdict)
      .sort((a, b) => {
        const rank = { accept: 3, revise: 2, reject: 1 };
        const byDecision = (rank[b.verdict.decision] || 0) - (rank[a.verdict.decision] || 0);
        return byDecision || (b.verdict.confidence || 0) - (a.verdict.confidence || 0);
      })[0];
    if (best) lines.push(`Recommended: **${best.label}** (${best.verdict.decision}).`);
    return lines.filter(Boolean).join("\n");
  }

  function retryRunWithFixes(run) {
    const experiment = readExperiments().find((item) => item.id === run.experimentId);
    if (!experiment) return false;
    const fixes = run.verdict?.fixes ?? [];
    const risks = run.verdict?.risks ?? [];
    const retry = {
      id: newId("run"),
      experimentId: run.experimentId,
      experimentTitle: run.experimentTitle,
      variantId: run.variantId,
      label: `${run.label} · retry`,
      modelKey: run.modelKey,
      agentType: run.agentType,
      status: "queued",
      createdAt: nowIso(),
      startedAt: "",
      finishedAt: "",
      prompt: [
        workerPrompt(experiment, { label: run.label, modelKey: run.modelKey }),
        "",
        "A previous attempt was reviewed and needs another pass.",
        fixes.length ? `Required fixes:\n${fixes.map((fix) => `- ${fix}`).join("\n")}` : "",
        risks.length ? `Known risks:\n${risks.map((risk) => `- ${risk}`).join("\n")}` : "",
        run.output ? `Previous report:\n${truncate(run.output, 6_000)}` : "",
        "",
        "Fix every item above and end with the four-section report.",
      ].filter(Boolean).join("\n"),
      output: "",
      error: "",
      agentId: "",
      mode: "pending",
      verdict: null,
      reviewStatus: "",
    };
    writeRuns([...readRuns(), retry]);
    aether.invalidate();
    dispatchRun(retry.id).catch((error) => {
      finishRun(retry.id, {
        status: "failed",
        error: asString(error?.message || error, "Dispatch failed."),
      });
    });
    return true;
  }

  async function exportJson() {
    const payload = {
      generatedAt: nowIso(),
      settings: readSettings(),
      experiments: readExperiments(),
      runs: readRuns(),
    };
    const base64 = Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64");
    const target = `/workspace/ai-lab-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    try {
      await aether.host.invoke("runtime.execute", {
        command: `mkdir -p /workspace && printf '%s' '${base64}' | base64 -d > '${target}'`,
        working_directory: "/workspace",
        timeout_ms: 20_000,
      });
      aether.notify(`JSON AI Lab сохранён в ${target}`, "info");
      return target;
    } catch (error) {
      aether.notify(`Экспорт не удался: ${asString(error?.message || error)}`, "error");
      return "";
    }
  }

  // ----- UI -----------------------------------------------------------------

  function statusColor(status) {
    switch (status) {
      case "done": return "#34d399";
      case "running": return "#60a5fa";
      case "queued": return "#a78bfa";
      case "failed": return "#f87171";
      default: return "#9ca3af";
    }
  }

  function verdictColor(decision) {
    switch (decision) {
      case "accept": return "#34d399";
      case "reject": return "#f87171";
      case "revise": return "#fbbf24";
      default: return "#9ca3af";
    }
  }

  function labHtml() {
    const runs = readRuns();
    const experiments = readExperiments();
    return renderLabHtml({
      settings: readSettings(),
      experiments,
      runs: runs.slice().reverse(),
      missionStats: aggregateMissionStats(runs, experiments, { now: Date.now() }).missions,
      presets: MISSION_PRESETS.map((preset) => ({
        id: preset.id,
        title: preset.title,
        goal: preset.goal,
      })),
      bundles: MISSION_BUNDLES.map((bundle) => ({
        id: bundle.id,
        title: bundle.title,
        description: bundle.description,
        parallel: bundle.parallel,
        tasks: bundle.tasks.length,
      })),
      bundleJobs: bundleStatus(),
      types: agentTypes(),
      subagentsAvailable: Boolean(readBridge()),
      draft: aether.storage.get("lab.draft", {}) || {},
      open: isOpen(),
      tab: readTab(),
    });
  }

  // ----- registrations ------------------------------------------------------

  const disposers = [];

  disposers.push(aether.registerAction(ACTION_ID, async (args) => {
    const op = asString(args?.op);
    const settings = readSettings();
    switch (op) {
      case "open":
        ensureAgentDefinitions();
        aether.storage.set(STORAGE_OPEN, true);
        aether.invalidate();
        return { ok: true };
      case "close":
        aether.storage.set(STORAGE_OPEN, false);
        aether.invalidate();
        return { ok: true };
      case "tab":
        aether.storage.set(STORAGE_TAB, asString(args?.tab, "experiments"));
        aether.invalidate();
        return { ok: true };
      case "create": {
        const preset = findPreset(asString(args?.preset));
        const payload = {
          ...args,
          variants: variantsFromArgs(args?.variants),
          ...(preset
            ? {
              presetId: preset.id,
              workerBrief: preset.workerBrief,
              reviewerFocus: (preset.reviewerFocus || []).join("\n"),
            }
            : {}),
        };
        const experiment = createExperiment(payload);
        if (!experiment) {
          aether.notify("Эксперименту AI Lab нужна цель.", "warning");
          return { ok: false };
        }
        if (args?.runNow !== false) startExperiment(experiment.id);
        aether.storage.set(STORAGE_TAB, "runs");
        return { ok: true, experiment_id: experiment.id, preset: preset?.id ?? "" };
      }
      case "preset": {
        const raw = asString(args?.preset);
        const parsed = parsePresetArgs(raw);
        const preset = parsed.preset ?? findPreset(raw);
        if (!preset) {
          aether.notify(`Неизвестный пресет: «${raw}».`, "warning");
          return { ok: false, presets: MISSION_PRESETS.map((item) => item.id) };
        }
        const variants = variantsFromArgs(args?.variants);
        const result = launchPreset(preset, {
          target: asString(args?.target) || parsed.target,
          goal: asString(args?.goal),
          title: asString(args?.title),
          variants,
          launch: args?.draft === true ? false : true,
          runNow: args?.runNow,
        });
        return { ...result, preset: preset.id, target: asString(args?.target) || parsed.target };
      }
      case "presets":
        return {
          ok: true,
          presets: MISSION_PRESETS.map((preset) => ({
            id: preset.id,
            title: preset.title,
            goal: preset.goal,
            aliases: preset.aliases.slice(),
          })),
        };
      case "bundle": {
        const raw = asString(args?.bundle);
        const bundle = findBundle(raw);
        if (!bundle) {
          aether.notify(`Неизвестный пакет: «${raw}».`, "warning");
          return { ok: false, bundles: MISSION_BUNDLES.map((item) => item.id) };
        }
        const requested = args?.parallel !== undefined && args?.parallel !== null && args?.parallel !== ""
          ? Number(args.parallel)
          : (settings.bundleParallel > 0 ? settings.bundleParallel : undefined);
        const started = startBundle(bundle, {
          parallel: requested,
          target: asString(args?.target),
        });
        if (!started.job) {
          aether.notify("Пакет не создал ни одной миссии.", "warning");
          return { ok: false };
        }
        aether.storage.set(STORAGE_TAB, "runs");
        aether.notify(
          `Пакет «${bundle.title}»: миссий ${started.experiments.length}, параллельно ${started.job.parallel}.`,
          "info",
        );
        return {
          ok: true,
          bundle: bundle.id,
          jobs: 1,
          parallel: started.job.parallel,
          experiments: started.experiments.length,
        };
      }
      case "bundles":
        return {
          ok: true,
          bundles: MISSION_BUNDLES.map((bundle) => ({
            id: bundle.id,
            title: bundle.title,
            description: bundle.description,
            parallel: bundle.parallel,
            tasks: bundle.tasks.length,
          })),
          active: bundleStatus(),
        };
      case "bundle-status":
        return { ok: true, active: bundleStatus() };
      case "export-run": {
        const result = await exportRunReport(asString(args?.run_id) || undefined);
        return result;
      }
      case "status": {
        const summary = await publishStatus(args?.quiet === true);
        return { ok: true, text: summary.text, totals: summary.stats.totals };
      }
      case "open-tab":
        aether.storage.set(STORAGE_OPEN, true);
        aether.storage.set(STORAGE_TAB, asString(args?.tab, "graph"));
        aether.invalidate();
        return { ok: true };
      case "run": {
        const created = startExperiment(asString(args?.experiment_id));
        aether.notify(
          created.length > 0
            ? `AI Lab запустил ${created.length} запуск(ов).`
            : "Такой эксперимент больше не существует.",
          created.length > 0 ? "info" : "warning",
        );
        aether.storage.set(STORAGE_TAB, "runs");
        return { ok: created.length > 0, runs: created.length };
      }
      case "delete-exp": {
        const targetId = asString(args?.experiment_id);
        writeExperiments(readExperiments().filter((item) => item.id !== targetId));
        aether.invalidate();
        return { ok: true };
      }
      case "stop": {
        stopRun(asString(args?.run_id));
        return { ok: true };
      }
      case "review": {
        const runId = asString(args?.run_id);
        reviewRun(runId).catch(() => {
          updateRun(runId, { verdict: heuristicVerdict(getRun(runId) ?? {}) });
          aether.invalidate();
        });
        return { ok: true };
      }
      case "accept":
      case "reject":
      case "revise": {
        setVerdict(asString(args?.run_id), op, asString(args?.reason));
        return { ok: true };
      }
      case "export": {
        const path = await exportReport();
        return { ok: Boolean(path), path };
      }
      case "clear-runs": {
        writeRuns([]);
        aether.invalidate();
        return { ok: true };
      }
      case "toggle-theme": {
        const next = settings.theme === "light" ? "dark" : "light";
        aether.storage.set(STORAGE_SETTINGS, { ...settings, theme: next });
        aether.invalidate();
        return { ok: true, theme: next };
      }
      case "cycle-accent": {
        const keys = Object.keys(ACCENTS);
        const index = keys.indexOf(settings.accent);
        const next = keys[(index + 1) % keys.length];
        aether.storage.set(STORAGE_SETTINGS, { ...settings, accent: next });
        aether.invalidate();
        return { ok: true, accent: next };
      }
      case "pin-exp": {
        const targetId = asString(args?.experiment_id);
        writeExperiments(readExperiments().map((item) => (
          item.id === targetId ? { ...item, pinned: !item.pinned } : item
        )));
        aether.invalidate();
        return { ok: true };
      }
      case "template": {
        const template = TEMPLATES.find((item) => item.id === asString(args?.template));
        if (!template) return { ok: false };
        aether.storage.set("lab.draft", { goal: template.goal });
        aether.storage.set(STORAGE_TAB, "new");
        aether.invalidate();
        return { ok: true };
      }
      case "retry": {
        const source = getRun(asString(args?.run_id));
        if (!source) return { ok: false };
        const retried = retryRunWithFixes(source);
        aether.notify(
          retried ? "AI Lab перезапустил задачу с фиксами ревьюера." : "Повторять нечего.",
          retried ? "info" : "warning",
        );
        aether.storage.set(STORAGE_TAB, "runs");
        return { ok: Boolean(retried) };
      }
      case "run-all": {
        let started = 0;
        for (const experiment of readExperiments()) {
          started += startExperiment(experiment.id).length;
        }
        aether.notify(started ? `AI Lab поставил в очередь ${started} запуск(ов).` : "Нет экспериментов для запуска.", started ? "info" : "warning");
        aether.storage.set(STORAGE_TAB, "runs");
        return { ok: true, runs: started };
      }
      case "stop-all": {
        const active = readRuns().filter((run) => run.status === "running" || run.status === "queued");
        for (const run of active) stopRun(run.id);
        aether.notify(active.length ? `Остановлено запусков: ${active.length}.` : "Ничего и не выполнялось.", "info");
        return { ok: true, stopped: active.length };
      }
      case "accept-all": {
        const pending = readRuns().filter((run) => (
          run.status !== "running"
          && run.status !== "queued"
          && (!run.verdict || run.verdict.decision !== "accept")
        ));
        for (const run of pending) setVerdict(run.id, "accept", "Bulk-accepted by the user.");
        aether.notify(pending.length ? `Принято запусков: ${pending.length}.` : "Нет ожидающих.", "info");
        return { ok: true, accepted: pending.length };
      }
      case "export-json": {
        const path = await exportJson();
        return { ok: Boolean(path), path };
      }
      case "compare": {
        const run = getRun(asString(args?.run_id));
        if (!run) return { ok: false };
        await aether.messages.append(
          "ai-lab-verdict",
          {
            run_id: run.id,
            decision: run.verdict?.decision ?? "pending",
            confidence: run.verdict?.confidence ?? 0,
          },
          buildComparison(run),
        );
        return { ok: true };
      }
      case "toggle-auto-review": {
        aether.storage.set(STORAGE_SETTINGS, {
          ...settings,
          autoReview: !settings.autoReview,
        });
        aether.invalidate();
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown AI Lab operation: ${op}` };
    }
  }));

  disposers.push(aether.registerSurface("app.overlay", {
    id: "ai-lab-overlay",
    order: 40,
    render: () => {
      if (!isOpen()) return null;
      return ui.web({ height: 520, html: labHtml() });
    },
  }));

  disposers.push(aether.registerSurface("chat.composer.top", {
    id: "ai-lab-review-banner",
    order: 30,
    render: () => {
      const runs = readRuns();
      const waiting = runs.filter((run) => run.verdict
        && run.verdict.source !== "user"
        && run.verdict.decision !== "accept");
      const pending = runs.filter((run) => run.status === "running").length;
      if (waiting.length === 0 && pending === 0) return null;
      return ui.row([
        ui.text(`AI Lab · ${pending} running · ${waiting.length} awaiting review`, { style: "caption" }),
        ui.button("Open", ACTION_ID, { args: { op: "open" } }),
      ]);
    },
  }));

  disposers.push(aether.registerComposerMenuItem({
    id: "ai-lab-composer",
    title: "AI Lab",
    subtitle: "Суб-агенты под цель и проверка их работы",
    icon: "auto",
    order: 40,
    action: ACTION_ID,
    args: { op: "open" },
  }));

  disposers.push(aether.registerComposerMenuItem({
    id: "ai-lab-presets",
    title: "AI Lab · пресеты миссий",
    subtitle: "Код-ревью, рефакторинг, тесты, документация, пакеты",
    icon: "auto",
    order: 41,
    action: ACTION_ID,
    args: { op: "open-tab", tab: "new" },
  }));

  const storedSettings = readSettings();
  disposers.push(aether.registerSettings({
    id: "ai-lab",
    title: "AI Lab",
    subtitle: "Автономный цикл проверки суб-агентов",
    icon: "auto",
    sections: [
      {
        title: "Лаборатория",
        description: "Каждый эксперимент порождает суб-агентов под цель, а ревьюер решает, можно ли принять их работу.",
        settings: [
          {
            id: "open-lab",
            type: "button",
            label: "Открыть AI Lab",
            description: "Конструктор экспериментов, живые запуски и вердикты",
            action: ACTION_ID,
            args: { op: "open" },
            tone: "primary",
          },
          {
            id: "auto-review",
            type: "toggle",
            label: "Авто-проверка",
            description: "Каждый завершённый запуск отправляется агенту-ревьюеру",
            default: storedSettings.autoReview,
          },
          {
            id: "reviewer-agent",
            type: "text",
            label: "Тип агента-ревьюера",
            description: "Тип pi-subagents, выступающий судьёй",
            default: storedSettings.reviewerAgentType,
          },
          {
            id: "worker-agent",
            type: "text",
            label: "Тип агента-воркера",
            description: "Тип pi-subagents по умолчанию для запусков",
            default: storedSettings.workerAgentType,
          },
          {
            id: "reviewer-model",
            type: "text",
            label: "Модель ревьюера (фолбэк)",
            description: "Ключ модели, когда ревьюер работает в чате",
            default: storedSettings.reviewerModelKey,
          },
          {
            id: "export",
            type: "button",
            label: "Экспортировать отчёт",
            description: "Записать /workspace/ai-lab-report-*.md",
            action: ACTION_ID,
            args: { op: "export" },
          },
        ],
      },
      {
        title: "Политика проверки",
        description: "Как вердикты возвращаются в чат",
        settings: [
          {
            id: "report-to-chat",
            type: "toggle",
            label: "Публиковать вердикты в чат",
            description: "Главный агент видит принятую или отклонённую работу",
            default: storedSettings.reportToChat,
          },
          {
            id: "clear-runs",
            type: "button",
            label: "Очистить историю запусков",
            description: "Удаляет сохранённые запуски, эксперименты остаются",
            action: ACTION_ID,
            args: { op: "clear-runs" },
            tone: "danger",
          },
        ],
      },
      {
        title: "Пресеты миссий",
        description: "Готовые миссии с инструкциями воркеру и критериями приёмки для ревьюера. Нажатие подставляет пресет в черновик на вкладке «Новый».",
        settings: [
          ...MISSION_PRESETS.map((preset) => ({
            id: `preset-${preset.id}`,
            type: "button",
            label: `Пресет: ${preset.title}`,
            description: preset.goal,
            action: ACTION_ID,
            args: { op: "preset", preset: preset.id, draft: true },
          })),
          {
            id: "status",
            type: "button",
            label: "Статус лаборатории в чат",
            description: "Сводка: в работе, вердикты, длительности и статистика по миссиям",
            action: ACTION_ID,
            args: { op: "status" },
          },
        ],
      },
      {
        title: "Пакеты миссий",
        description: "Несколько независимых миссий запускаются одновременно, с ограничением числа работающих воркеров.",
        settings: [
          ...MISSION_BUNDLES.map((bundle) => ({
            id: `bundle-${bundle.id}`,
            type: "button",
            label: `Пакет: ${bundle.title}`,
            description: `${bundle.description} Задач: ${bundle.tasks.length}, параллельно: ${bundle.parallel}.`,
            action: ACTION_ID,
            args: { op: "bundle", bundle: bundle.id },
          })),
          {
            id: "bundle-parallel",
            type: "number",
            label: "Параллелизм пакета",
            description: `Сколько воркеров пакета запускается одновременно (1–${MAX_BUNDLE_PARALLEL}, 0 — по умолчанию пакета)`,
            default: storedSettings.bundleParallel,
          },
        ],
      },
    ],
  }));

  disposers.push(aether.registerMessageType({
    type: "ai-lab-verdict",
    title: "Вердикт AI Lab",
    icon: "auto",
    render: ({ message }) => {
      // The runtime spreads the payload into the message object.
      const decision = asString(message?.decision ?? message?.payload?.decision, "verdict");
      return ui.card([
        ui.row([
          ui.text("AI Lab", { weight: "semibold" }),
          ui.text(decision.toUpperCase(), { style: "caption", color: decision === "accept" ? "#34d399" : decision === "reject" ? "#f87171" : "#fbbf24" }),
        ]),
        ui.text(asString(message?.text), { style: "caption" }),
      ]);
    },
  }));

  disposers.push(aether.registerMessageType({
    type: "ai-lab-status",
    title: "Статус AI Lab",
    icon: "auto",
    render: ({ message }) => ui.card([
      ui.row([
        ui.text("AI Lab · статус", { weight: "semibold" }),
        ui.text(`runs ${message?.runs ?? message?.payload?.runs ?? 0}`, { style: "caption" }),
      ]),
      ui.text(asString(message?.text), { style: "caption" }),
    ]),
  }));

  // Settings rows are declarative; each row's value is persisted by us.
  const SETTINGS_ACTIONS = {
    "auto-review": (raw) => ({ autoReview: raw === true || raw === "true" }),
    "report-to-chat": (raw) => ({ reportToChat: raw === true || raw === "true" }),
    "reviewer-agent": (raw) => ({ reviewerAgentType: asString(raw) || REVIEWER_AGENT_TYPE }),
    "worker-agent": (raw) => ({ workerAgentType: asString(raw) || WORKER_AGENT_TYPE }),
    "reviewer-model": (raw) => ({ reviewerModelKey: asString(raw) }),
    "bundle-parallel": (raw) => ({ bundleParallel: clampNumber(raw, 0, MAX_BUNDLE_PARALLEL) }),
  };
  for (const [settingId, patch] of Object.entries(SETTINGS_ACTIONS)) {
    disposers.push(aether.registerAction(`settings:ai-lab:${settingId}`, (payload) => {
      const raw = payload?.value !== undefined ? payload.value : payload?.checked;
      const next = { ...readSettings(), ...patch(raw) };
      aether.storage.set(STORAGE_SETTINGS, next);
      aether.invalidate();
      return { setting: settingId, value: raw };
    }));
  }

  ensureAgentDefinitions();

  // Resume mission bundles that survived a reload of the extension runtime.
  if (readBundles().length > 0) {
    try {
      pumpBundles();
    } catch {
      // a broken bundle must never block activation
    }
  }
  if (aether.storage.get("lab.announced", false) !== true) {
    aether.storage.set("lab.announced", true);
    aether.notify(
      readBridge()
        ? "AI Lab готов: цикл проверки суб-агентов доступен."
        : "AI Lab готов. Включите pi-subagents для фоновых суб-агентов.",
      "info",
    );
  }

  return () => {
    for (const runId of runTimers.keys()) clearRunTimer(runId);
    pendingReviews.clear();
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