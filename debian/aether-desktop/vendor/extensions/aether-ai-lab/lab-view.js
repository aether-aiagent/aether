/**
 * AI Lab mission view.
 *
 * Rendered inside the Aether extension WebView (`ui.web({ html })`), so the whole
 * surface is real HTML/CSS/JS: SVG mission graph, live timers, keyboard
 * navigation. Every interaction is posted back as an `ai-lab` action.
 */

const ACCENTS = {
  violet: "#8B5CF6",
  azure: "#38BDF8",
  emerald: "#34D399",
  amber: "#FBBF24",
  rose: "#FB7185",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function safeJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const TEMPLATES = [
  {
    id: "audit",
    title: "Аудит модуля",
    goal: "Аудит <модуль/путь> на корректность, безопасность и мёртвый код. Отчёт с файл:строка и фикс топ-3.",
  },
  {
    id: "fix",
    title: "Починить падающий билд",
    goal: "Воспроизвести падение, найти корень, починить и доказать повторным запуском билда.",
  },
  {
    id: "feature",
    title: "Сделать маленькую фичу",
    goal: "Реализовать <фича> целиком с тестами, обновить доки и проверить на обеих платформах.",
  },
  {
    id: "research",
    title: "Исследовать и решить",
    goal: "Сравнить <вариант А> и <вариант Б> для <задачи>. Рекомендация с доказательствами и компромиссами.",
  },
  {
    id: "refactor",
    title: "Безопасный рефакторинг",
    goal: "Рефакторинг <область> без изменения поведения. Убрать дубли, тесты зелёные, список всех файлов.",
  },
  {
    id: "perf",
    title: "Прогон производительности",
    goal: "Профилировать <область>, найти главный тормоз, оптимизировать и показать замеры до/после.",
  },
];

const STYLES = `
:root {
  color-scheme: var(--scheme);
  --accent: var(--accent-color);
  --bg: #0e0f13;
  --bg-soft: #15171d;
  --card: rgba(255,255,255,.035);
  --card-solid: #191b22;
  --stroke: rgba(255,255,255,.09);
  --fg: #e8eaf0;
  --muted: #939aab;
  --ok: #34d399;
  --warn: #fbbf24;
  --err: #f87171;
  --run: #60a5fa;
  --idle: #8b93a7;
  --radius: 14px;
  --scheme: dark;
  --accent-color: ${ACCENTS.violet};
}
:root[data-theme="light"], body[data-theme="light"] {
  --scheme: light;
  --bg: #f6f7fb;
  --bg-soft: #ffffff;
  --card: rgba(15,18,30,.035);
  --card-solid: #ffffff;
  --stroke: rgba(15,18,30,.10);
  --fg: #131722;
  --muted: #5c6577;
  --idle: #8b93a7;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; padding: 0; }
body {
  background:
    radial-gradient(1200px 420px at 50% -160px, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%),
    var(--bg);
  color: var(--fg);
  font: 13px/1.5 ui-sans-serif, -apple-system, system-ui, "Segoe UI", sans-serif;
  padding: 10px 12px 22px;
  min-height: 100vh;
}
.hidden { display: none !important; }
.muted { color: var(--muted); }
.small { font-size: 11.5px; }
.tiny { font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; }
.err { color: var(--err); }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }

/* ---------- shell ---------- */
.top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
.logo {
  width: 26px; height: 26px; border-radius: 9px; flex: none;
  background: linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 35%, #0b0d12));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 6px 18px -6px var(--accent);
  display: grid; place-items: center; font-size: 13px;
}
.brand h1 { font-size: 14.5px; margin: 0; letter-spacing: .01em; white-space: nowrap; }
.brand .sub { font-size: 10.5px; color: var(--muted); }
.grow { flex: 1 1 auto; }
.iconbtn {
  background: var(--card); border: 1px solid var(--stroke); color: var(--fg);
  width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center;
  font-size: 14px; cursor: pointer; transition: transform .12s ease, border-color .12s;
}
.iconbtn:active { transform: scale(.94); }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
.stat {
  background: var(--card); border: 1px solid var(--stroke); border-radius: 11px;
  padding: 7px 8px; text-align: center; overflow: hidden;
}
.stat b { display: block; font-size: 15px; line-height: 1.15; font-variant-numeric: tabular-nums; }
.stat span { font-size: 9.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }

.tabs {
  display: flex; gap: 4px; padding: 3px; margin-bottom: 10px;
  background: var(--card); border: 1px solid var(--stroke); border-radius: 12px;
  overflow-x: auto; scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: 1 0 auto; border: 0; background: transparent; color: var(--muted);
  padding: 7px 11px; border-radius: 9px; font-size: 12px; font-weight: 550;
  cursor: pointer; white-space: nowrap; transition: background .15s, color .15s;
}
.tab.active { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--fg); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); }

/* ---------- cards / controls ---------- */
.card {
  background: var(--card); border: 1px solid var(--stroke); border-radius: var(--radius);
  padding: 11px; margin-bottom: 9px; backdrop-filter: blur(8px);
}
.card > header { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; flex-wrap: wrap; }
.card h3 { font-size: 13px; margin: 0; font-weight: 600; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; box-shadow: 0 0 8px currentColor; }
.pulse { animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

.pill {
  font-size: 10px; padding: 2px 8px; border-radius: 999px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .05em; border: 1px solid transparent;
}
.chip {
  display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px;
  padding: 2px 7px; border-radius: 7px; background: var(--card); border: 1px solid var(--stroke);
  color: var(--muted); white-space: nowrap;
}

.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
button {
  font: inherit; cursor: pointer; color: var(--fg); background: var(--card-solid);
  border: 1px solid var(--stroke); border-radius: 10px; padding: 6px 11px; font-size: 12px;
  transition: transform .1s ease, border-color .15s, background .15s;
}
button:active { transform: scale(.97); }
button.primary { background: var(--accent); border-color: transparent; color: #fff; font-weight: 600; }
button.danger { color: var(--err); border-color: color-mix(in srgb, var(--err) 40%, transparent); }
button.ghost { background: transparent; }
button:disabled { opacity: .4; cursor: default; }
input, select, textarea {
  font: inherit; width: 100%; background: var(--card-solid); color: var(--fg);
  border: 1px solid var(--stroke); border-radius: 10px; padding: 8px 10px; font-size: 12.5px;
  outline: none; transition: border-color .15s;
}
input:focus, textarea:focus { border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
textarea { min-height: 62px; resize: vertical; }
label { display: block; margin: 9px 0 4px; font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }

/* ---------- mission graph ---------- */
.graphwrap { position: relative; border-radius: var(--radius); overflow: hidden; background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent 60%); border: 1px solid var(--stroke); }
svg.mission { display: block; width: 100%; height: auto; touch-action: manipulation; }
.nodeshot { cursor: pointer; }
.flow { stroke-dasharray: 5 5; animation: flow 1.1s linear infinite; }
@keyframes flow { to { stroke-dashoffset: -20; } }
select.mini { width: auto; padding: 5px 8px; font-size: 11.5px; }

/* ---------- runs ---------- */
.run { border-left: 2px solid var(--idle); padding-left: 9px; }
.run[data-status="running"] { border-left-color: var(--run); }
.run[data-status="done"] { border-left-color: var(--ok); }
.run[data-status="failed"] { border-left-color: var(--err); }
.run[data-status="stopped"] { border-left-color: var(--warn); }
details { margin-top: 6px; }
summary { cursor: pointer; font-size: 11.5px; color: var(--muted); user-select: none; }
pre {
  white-space: pre-wrap; word-break: break-word; background: color-mix(in srgb, #000 30%, var(--bg-soft));
  border: 1px solid var(--stroke); padding: 8px; border-radius: 9px;
  font-size: 11px; max-height: 220px; overflow: auto; font-family: ui-monospace, monospace;
}
.seclist { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
.sec { background: var(--card); border: 1px solid var(--stroke); border-radius: 9px; padding: 7px 9px; }
.sec h4 { margin: 0 0 3px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--accent); }
.sec p { margin: 0; font-size: 11.5px; white-space: pre-wrap; }

/* ---------- stats ---------- */
.donut { display: grid; place-items: center; }
.bars { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
.bar { height: 7px; border-radius: 4px; background: var(--card); overflow: hidden; }
.bar > i { display: block; height: 100%; border-radius: 4px; }

/* ---------- misc ---------- */
.empty { text-align: center; padding: 26px 12px; color: var(--muted); font-size: 12px; }
.empty .big { font-size: 26px; margin-bottom: 6px; opacity: .5; }
.toast {
  position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%) translateY(20px);
  background: var(--card-solid); border: 1px solid var(--stroke); border-radius: 11px;
  padding: 8px 13px; font-size: 12px; opacity: 0; pointer-events: none;
  transition: opacity .2s, transform .2s; z-index: 50; box-shadow: 0 12px 30px -12px #000;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
kbd { background: var(--card); border: 1px solid var(--stroke); border-bottom-width: 2px; border-radius: 5px; padding: 0 4px; font-size: 10px; font-family: ui-monospace, monospace; }
`;

const SCRIPT = `
const S = window.__LAB__;
const bridge = (args) => { try { Aether.postMessage(JSON.stringify({ action: "ai-lab", args })); } catch (e) {} };
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STATUS = { queued: "#a78bfa", running: "#60a5fa", done: "#34d399", failed: "#f87171", stopped: "#fbbf24" };
const DECISION = { accept: "#34d399", reject: "#f87171", revise: "#fbbf24" };

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el.__t);
  el.__t = setTimeout(() => el.classList.remove("show"), 1900);
}

/* ---------- live timers ---------- */
function fmtElapsed(ms) {
  if (!ms || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m " + (s % 60) + "s";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}
function tick() {
  const now = Date.now();
  $$("[data-since]").forEach((el) => {
    const since = Number(el.dataset.since);
    if (!since) return;
    el.textContent = fmtElapsed(now - since);
  });
}
setInterval(tick, 1000);

/* ---------- views ---------- */
function renderGraph() {
  const runs = S.runs.filter((r) => !S.filters.experiment || r.experimentId === S.filters.experiment);
  const byExperiment = new Map();
  for (const run of runs) {
    if (!byExperiment.has(run.experimentId)) byExperiment.set(run.experimentId, []);
    byExperiment.get(run.experimentId).push(run);
  }
  const groups = Array.from(byExperiment.entries()).map(([id, list]) => ({
    id,
    title: S.experiments.find((e) => e.id === id)?.title || list[0]?.experimentTitle || "Миссия",
    runs: list,
  }));
  if (!groups.length) {
    return '<div class="empty"><div class="big">◎</div>Миссии ещё нет.<br/>Создайте эксперимент, чтобы увидеть граф.</div>';
  }

  const W = 720;
  const NODE_W = 132, NODE_H = 62, GOAL_W = 260, GOAL_H = 66;
  const GAP_X = 14, ROW_GAP = 96;
  const parts = [];
  let y = 16;

  for (const group of groups.slice(-4)) {
    const list = group.runs.slice(-6);
    const accepted = list.filter((r) => r.verdict && r.verdict.decision === "accept").length;
    const total = list.length || 1;
    const goalX = (W - GOAL_W) / 2;

    // workers row
    const n = Math.max(list.length, 1);
    const rowW = n * NODE_W + (n - 1) * GAP_X;
    const startX = Math.max(8, (W - rowW) / 2);
    const workerY = y + GOAL_H + ROW_GAP;

    // edges worker -> goal (arrows INTO the goal)
    list.forEach((run, i) => {
      const cx = startX + i * (NODE_W + GAP_X) + NODE_W / 2;
      const x1 = cx, y1 = workerY;
      const x2 = goalX + GOAL_W / 2 + (cx - (goalX + GOAL_W / 2)) * 0.18;
      const y2 = y + GOAL_H;
      const midY = y1 - ROW_GAP * 0.42;
      const color = STATUS[run.status] || "#8b93a7";
      const live = run.status === "running" || run.status === "queued";
      parts.push(
        '<path d="M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + midY + ' ' + x2 + ' ' + midY + ' ' + x2 + ' ' + (y2 + 6) + '" ' +
        'fill="none" stroke="' + color + '" stroke-width="' + (run.verdict && run.verdict.decision === "accept" ? 2.4 : 1.6) + '" ' +
        'opacity="' + (live ? 0.95 : 0.5) + '" ' + (live ? 'class="flow"' : "") +
        ' marker-end="url(#arrow-' + (run.status || "idle") + ')"/>'
      );
    });

    // goal node
    parts.push(
      '<g class="nodeshot" data-op="tab-runs">' +
      '<rect x="' + goalX + '" y="' + y + '" width="' + GOAL_W + '" height="' + GOAL_H + '" rx="14" fill="url(#goalgrad)" stroke="var(--accent)" stroke-opacity="0.55"/>' +
      '<text x="' + (W / 2) + '" y="' + (y + 20) + '" text-anchor="middle" fill="var(--muted)" font-size="9" letter-spacing="1.6">MISSION GOAL</text>' +
      '<text x="' + (W / 2) + '" y="' + (y + 38) + '" text-anchor="middle" fill="var(--fg)" font-size="12.5" font-weight="600">' + esc(cut(group.title, 34)) + '</text>' +
      '<text x="' + (W / 2) + '" y="' + (y + 54) + '" text-anchor="middle" fill="var(--muted)" font-size="10">' +
        accepted + '/' + list.length + ' accepted · ' + Math.round((accepted / total) * 100) + '%</text>' +
      '</g>'
    );

    // worker nodes
    list.forEach((run, i) => {
      const x = startX + i * (NODE_W + GAP_X);
      const color = STATUS[run.status] || "#8b93a7";
      const verdict = run.verdict;
      const ring = verdict ? DECISION[verdict.decision] : color;
      parts.push(
        '<g class="nodeshot" data-op="focus-run" data-run="' + run.id + '">' +
        '<rect x="' + x + '" y="' + workerY + '" width="' + NODE_W + '" height="' + NODE_H + '" rx="12" fill="var(--card-solid)" stroke="' + ring + '" stroke-opacity="' + (run.status === "running" ? 0.9 : 0.45) + '"/>' +
        '<circle cx="' + (x + 13) + '" cy="' + (workerY + 15) + '" r="4" fill="' + color + '"' + (run.status === "running" ? ' class="pulse"' : "") + '/>' +
        '<text x="' + (x + 23) + '" y="' + (workerY + 19) + '" fill="var(--fg)" font-size="11.5" font-weight="600">' + esc(cut(run.label, 14)) + '</text>' +
        '<text x="' + (x + 13) + '" y="' + (workerY + 36) + '" fill="var(--muted)" font-size="9.5">' + esc(cut(run.agentType || run.mode || "worker", 18)) + '</text>' +
        '<text x="' + (x + 13) + '" y="' + (workerY + 51) + '" fill="' + color + '" font-size="9.5" letter-spacing="0.6">' +
          esc((run.status || "").toUpperCase()) + (run.status === "running" ? ' · <tspan>' + '…' + '</tspan>' : "") + '</text>' +
        (verdict ? '<rect x="' + (x + NODE_W - 46) + '" y="' + (workerY + 44) + '" width="38" height="14" rx="7" fill="' + DECISION[verdict.decision] + '" fill-opacity="0.18"/>' +
          '<text x="' + (x + NODE_W - 27) + '" y="' + (workerY + 54) + '" text-anchor="middle" fill="' + DECISION[verdict.decision] + '" font-size="8.5" letter-spacing="0.6">' + esc(verdict.decision.toUpperCase()) + '</text>' : '') +
        '</g>'
      );
    });

    y = workerY + NODE_H + 26;
  }

  const defs =
    '<defs>' +
    '<linearGradient id="goalgrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.20"/>' +
    '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0.04"/>' +
    '</linearGradient>' +
    Object.keys(STATUS).concat(["idle"]).map((key) =>
      '<marker id="arrow-' + key + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="' + (STATUS[key] || "#8b93a7") + '"/></marker>'
    ).join("") +
    '</defs>';

  return '<div class="graphwrap"><svg class="mission" viewBox="0 0 ' + W + ' ' + Math.max(y + 8, 140) + '" preserveAspectRatio="xMidYMin meet">' +
    defs + parts.join("") + '</svg></div>' +
    '<div class="row small muted" style="margin-top:6px;gap:10px">' +
      '<span>↑ arrows converge on the goal</span><span>· tap a node to focus its run</span>' +
    '</div>';
}

function cut(value, n) {
  const text = String(value ?? "");
  return text.length > n ? text.slice(0, n - 1) + "…" : text;
}

function statusDot(status) {
  const color = STATUS[status] || "#8b93a7";
  return '<span class="dot ' + (status === "running" ? "pulse" : "") + '" style="background:' + color + ';color:' + color + '"></span>';
}

function gauge(verdict) {
  const pct = Math.round((verdict?.confidence ?? 0) * 100);
  const color = DECISION[verdict?.decision] || "#8b93a7";
  const r = 15, c = 2 * Math.PI * r;
  return '<svg width="38" height="38" viewBox="0 0 38 38" style="flex:none">' +
    '<circle cx="19" cy="19" r="' + r + '" fill="none" stroke="var(--card)" stroke-width="4"/>' +
    '<circle cx="19" cy="19" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round" ' +
      'stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - pct / 100)) + '" transform="rotate(-90 19 19)"/>' +
    '<text x="19" y="22" text-anchor="middle" fill="' + color + '" font-size="9" font-weight="700">' + pct + '</text></svg>';
}

function reportSections(output) {
  const text = String(output || "");
  const names = ["Результат", "Доказательства", "Проверка", "Риски", "Суб-агенты"];
  const out = [];
  for (const name of names) {
    const re = new RegExp("##\\\\s*" + name.replace("-", "\\\\-") + "\\\\s*\\\\n([\\\\s\\\\S]*?)(?=\\\\n##\\\\s|$)");
    const m = text.match(re);
    if (m && m[1].trim()) out.push({ name, body: m[1].trim() });
  }
  return out;
}

function runCard(run) {
  const verdict = run.verdict;
  const sections = reportSections(run.output);
  const started = run.startedAt ? Date.parse(run.startedAt) : 0;
  const live = run.status === "running";
  const tokens = Number(run.tokens) || 0;
  const tools = Number(run.toolUses) || 0;
  return '<article class="card run" data-status="' + esc(run.status) + '">' +
    '<header>' + statusDot(run.status) +
      '<strong>' + esc(run.label) + '</strong>' +
      '<span class="pill" style="background:' + (STATUS[run.status] || "#888") + '22;color:' + (STATUS[run.status] || "#888") + '">' + esc(run.status) + '</span>' +
      (verdict ? '<span class="pill" style="background:' + DECISION[verdict.decision] + '22;color:' + DECISION[verdict.decision] + '">' + esc(verdict.decision) + '</span>' : '') +
      '<span class="grow"></span>' +
      (verdict ? gauge(verdict) : '') +
    '</header>' +
    '<div class="row tiny muted" style="gap:8px">' +
      '<span>' + esc(run.experimentTitle || "") + '</span>' +
      (run.mode ? '<span class="chip">' + esc(run.mode) + '</span>' : '') +
      (tokens ? '<span class="chip">' + tokens + ' tok</span>' : '') +
      (tools ? '<span class="chip">' + tools + ' tools</span>' : '') +
      (started ? (live ? '<span class="chip">⏱ <span data-since="' + started + '">0s</span></span>'
        : (run.finishedAt ? '<span class="chip">' + fmtElapsed(Date.parse(run.finishedAt) - started) + '</span>' : '')) : '') +
    '</div>' +
    (verdict && verdict.summary ? '<p class="small" style="margin:6px 0 0">' + esc(verdict.summary) + '</p>' : '') +
    (verdict && verdict.fixes && verdict.fixes.length
      ? '<div class="seclist">' + verdict.fixes.slice(0, 4).map((f) => '<div class="sec"><h4>fix</h4><p>' + esc(f) + '</p></div>').join("") + '</div>'
      : '') +
    (run.error ? '<p class="small err" style="margin:6px 0 0">' + esc(run.error) + '</p>' : '') +
    (sections.length
      ? '<details><summary>Report · ' + sections.map((s) => s.name).join(" · ") + '</summary><div class="seclist">' +
        sections.map((s) => '<div class="sec"><h4>' + esc(s.name) + '</h4><p>' + esc(cut(s.body, 3000)) + '</p></div>').join("") + '</div></details>'
      : (run.output ? '<details><summary>Сырой вывод</summary><pre>' + esc(cut(run.output, 6000)) + '</pre></details>' : '')) +
    '<div class="row" style="margin-top:8px">' +
      '<button data-op="accept" data-run="' + run.id + '" class="primary">Accept</button>' +
      '<button data-op="reject" data-run="' + run.id + '" class="danger">Reject</button>' +
      '<button data-op="review" data-run="' + run.id + '">Re-review</button>' +
      '<button data-op="retry" data-run="' + run.id + '">Повторить с фиксами</button>' +
      (live ? '<button data-op="stop" data-run="' + run.id + '" class="danger">Стоп</button>' : '') +
      '<span class="grow"></span>' +
      '<button data-op="compare" data-run="' + run.id + '" class="ghost">A/B</button>' +
    '</div>' +
  '</article>';
}

function filteredRuns() {
  const q = S.filters.query.toLowerCase();
  return S.runs.filter((run) => {
    if (S.filters.status !== "all" && run.status !== S.filters.status) return false;
    if (S.filters.decision !== "all" && (run.verdict?.decision || "none") !== S.filters.decision) return false;
    if (!q) return true;
    return (run.label + " " + (run.experimentTitle || "") + " " + (run.output || "")).toLowerCase().includes(q);
  });
}

function renderRuns() {
  const runs = filteredRuns();
  if (!runs.length) return '<div class="empty"><div class="big">∅</div>Под этот фильтр нет запусков.</div>';
  return runs.map(runCard).join("");
}

function renderExperiments() {
  if (!S.experiments.length) return '<div class="empty"><div class="big">✦</div>Экспериментов пока нет.<br/>Создайте на вкладке «Новый».</div>';
  const sorted = S.experiments.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return sorted.map((exp) => {
    const runs = S.runs.filter((r) => r.experimentId === exp.id);
    const accepted = runs.filter((r) => r.verdict?.decision === "accept").length;
    return '<article class="card">' +
      '<header><strong>' + (exp.pinned ? "★ " : "") + esc(exp.title) + '</strong>' +
        '<span class="grow"></span><span class="chip">' + runs.length + ' runs</span>' +
        (runs.length ? '<span class="chip">' + Math.round((accepted / runs.length) * 100) + '% ok</span>' : '') +
      '</header>' +
      '<p class="small muted" style="margin:0 0 6px">' + esc(exp.goal) + '</p>' +
      '<div class="row tiny muted" style="gap:5px;margin-bottom:8px">' +
        exp.variants.map((v) => '<span class="chip">' + esc(v.label) + (v.modelKey ? ' · ' + esc(v.modelKey) : '') + '</span>').join("") +
      '</div>' +
      '<div class="row">' +
        '<button data-op="run" data-exp="' + exp.id + '" class="primary">Запустить</button>' +
        '<button data-op="pin-exp" data-exp="' + exp.id + '">' + (exp.pinned ? "Unpin" : "Pin") + '</button>' +
        '<button data-op="delete-exp" data-exp="' + exp.id + '" class="danger">Delete</button>' +
      '</div></article>';
  }).join("");
}

function renderStats() {
  const runs = S.runs;
  const total = runs.length;
  const by = (d) => runs.filter((r) => r.verdict?.decision === d).length;
  const accept = by("accept"), reject = by("reject"), revise = by("revise");
  const judged = accept + reject + revise;
  const rate = judged ? accept / judged : 0;
  const durations = runs.filter((r) => r.startedAt && r.finishedAt)
    .map((r) => Date.parse(r.finishedAt) - Date.parse(r.startedAt))
    .filter((n) => n > 0);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const tokens = runs.reduce((sum, r) => sum + (Number(r.tokens) || 0), 0);
  const tools = runs.reduce((sum, r) => sum + (Number(r.toolUses) || 0), 0);
  const cost = (tokens / 1_000_000) * 3;

  const r = 42, c = 2 * Math.PI * r;
  const donut = '<svg width="116" height="116" viewBox="0 0 116 116">' +
    '<circle cx="58" cy="58" r="' + r + '" fill="none" stroke="var(--card)" stroke-width="11"/>' +
    '<circle cx="58" cy="58" r="' + r + '" fill="none" stroke="#34d399" stroke-width="11" stroke-linecap="round" ' +
      'stroke-dasharray="' + (c * rate) + ' ' + c + '" transform="rotate(-90 58 58)"/>' +
    '<text x="58" y="55" text-anchor="middle" fill="var(--fg)" font-size="21" font-weight="700">' + Math.round(rate * 100) + '%</text>' +
    '<text x="58" y="71" text-anchor="middle" fill="var(--muted)" font-size="9" letter-spacing="1.2">ACCEPTED</text></svg>';

  const bar = (label, value, max, color) =>
    '<div><div class="row small muted" style="justify-content:space-between"><span>' + label + '</span><span>' + value + '</span></div>' +
    '<div class="bar"><i style="width:' + Math.min(100, max ? (value / max) * 100 : 0) + '%;background:' + color + '"></i></div></div>';

  return '<article class="card"><header><h3>Распределение вердиктов</h3></header>' +
      '<div class="donut">' + donut + '</div>' +
      '<div class="bars">' +
        bar("Принять", accept, judged, DECISION.accept) +
        bar("Доработать", revise, judged, DECISION.revise) +
        bar("Отклонить", reject, judged, DECISION.reject) +
      '</div></article>' +
    '<article class="card"><header><h3>Throughput</h3></header>' +
      '<div class="stats" style="grid-template-columns:repeat(2,1fr);margin:0">' +
        '<div class="stat"><b>' + total + '</b><span>runs</span></div>' +
        '<div class="stat"><b>' + fmtElapsed(avg) + '</b><span>avg time</span></div>' +
        '<div class="stat"><b>' + (tokens ? (tokens / 1000).toFixed(1) + "k" : "0") + '</b><span>tokens</span></div>' +
        '<div class="stat"><b>' + tools + '</b><span>tool calls</span></div>' +
      '</div>' +
      '<p class="tiny muted" style="margin:8px 0 0">≈ $' + cost.toFixed(3) + ' at $3 / 1M tokens</p></article>';
}

function renderNew() {
  return '<article class="card">' +
    '<header><h3>Новый эксперимент</h3></header>' +
    '<div class="row" style="gap:5px;margin-bottom:6px;flex-wrap:wrap">' +
      S.templates.map((t) => '<button class="ghost tiny" data-op="template" data-template="' + t.id + '">' + esc(t.title) + '</button>').join("") +
    '</div>' +
    '<label>Цель</label>' +
    '<textarea id="goal" placeholder="Чего должны достичь суб-агенты?">' + esc(S.draft?.goal || "") + '</textarea>' +
    '<label>Variants — one per line: label | model key | agent type</label>' +
    '<textarea id="variants" placeholder="fast | | aether-lab-worker&#10;deep | | general-purpose">' + esc(S.draft?.variants || "") + '</textarea>' +
    '<div class="row" style="margin-top:9px">' +
      '<button data-op="create" class="primary">Создать и запустить</button>' +
      '<button data-op="create-only">Только создать</button>' +
      '<span class="grow"></span>' +
      '<button data-op="export">Export .md</button>' +
      '<button data-op="export-json" class="ghost">.json</button>' +
    '</div>' +
    '<p class="tiny muted" style="margin:8px 0 0">' +
      (S.subagentsAvailable ? "Воркеры работают как настоящие фоновые pi-subagents." : "pi-subagents выключен — задачи уходят в отдельные чаты.") +
    '</p></article>' +
    '<article class="card"><header><h3>Shortcuts</h3></header>' +
      '<div class="row tiny muted" style="gap:8px">' +
        '<span><kbd>g</kbd> graph</span><span><kbd>r</kbd> runs</span><span><kbd>e</kbd> experiments</span>' +
        '<span><kbd>n</kbd> new</span><span><kbd>s</kbd> stats</span><span><kbd>/</kbd> search</span><span><kbd>Esc</kbd> close</span>' +
      '</div></article>';
}

function renderFilters() {
  const opt = (v, label, cur) => '<option value="' + v + '"' + (cur === v ? " selected" : "") + '>' + label + '</option>';
  return '<div class="row" style="margin-bottom:9px">' +
    '<input id="q" placeholder="Поиск по запускам…" value="' + esc(S.filters.query) + '" style="flex:1 1 120px"/>' +
    '<select class="mini" id="fstatus">' + ["all","queued","running","done","failed","stopped"].map((v) => opt(v, v, S.filters.status)).join("") + '</select>' +
    '<select class="mini" id="fdecision">' + ["all","accept","revise","reject","none"].map((v) => opt(v, v, S.filters.decision)).join("") + '</select>' +
    '</div>' +
    '<div class="row" style="margin-bottom:9px">' +
      '<button data-op="run-all" class="ghost tiny">Запустить все эксперименты</button>' +
      '<button data-op="stop-all" class="ghost tiny danger">Остановить всё</button>' +
      '<button data-op="accept-all" class="ghost tiny">Принять все ожидающие</button>' +
    '</div>';
}

/* ---------- boot ---------- */
function renderAll() {
  $("#view-graph").innerHTML = renderGraph();
  $("#view-runs").innerHTML = renderFilters() + renderRuns();
  $("#view-experiments").innerHTML = renderExperiments();
  $("#view-new").innerHTML = renderNew();
  $("#view-stats").innerHTML = renderStats();
  tick();
  bindFilters();
}

function bindFilters() {
  const q = $("#q");
  if (q) {
    q.addEventListener("input", () => {
      S.filters.query = q.value;
      $("#view-runs").innerHTML = renderFilters() + renderRuns();
      bindFilters();
    });
  }
  const fs = $("#fstatus");
  if (fs) fs.addEventListener("change", () => { S.filters.status = fs.value; renderAll(); });
  const fd = $("#fdecision");
  if (fd) fd.addEventListener("change", () => { S.filters.decision = fd.value; renderAll(); });
}

function showTab(tab) {
  $$(".tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  $$("[id^=view-]").forEach((el) => el.classList.toggle("hidden", el.id !== "view-" + tab));
}

$$(".tab").forEach((el) => el.addEventListener("click", () => { bridge({ op: "tab", tab: el.dataset.tab }); showTab(el.dataset.tab); }));

document.body.addEventListener("click", (event) => {
  const node = event.target.closest("[data-op]");
  if (!node) return;
  const op = node.dataset.op;
  const args = { op };
  if (node.dataset.run) args.run_id = node.dataset.run;
  if (node.dataset.exp) args.experiment_id = node.dataset.exp;
  if (node.dataset.template) args.template = node.dataset.template;
  if (op === "accept" || op === "reject") { args.decision = op; }
  if (op === "create" || op === "create-only") {
    args.goal = ($("#goal") || {}).value || "";
    args.variants = (($("#variants") || {}).value || "").split("\\n").map((line) => {
      const [label, modelKey, agentType] = line.split("|").map((p) => (p || "").trim());
      return { label, modelKey, agentType };
    }).filter((v) => v.label);
    args.runNow = op === "create";
  }
  if (op === "tab-runs") { bridge({ op: "tab", tab: "runs" }); showTab("runs"); return; }
  if (op === "compare") { bridge({ op: "compare", run_id: node.dataset.run }); return; }
  if (op === "template") {
    const t = S.templates.find((x) => x.id === node.dataset.template);
    if (t && $("#goal")) { $("#goal").value = t.goal; showTab("new"); }
    return;
  }
  bridge(args);
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) {
    if (event.key === "Escape") event.target.blur();
    return;
  }
  const map = { g: "graph", r: "runs", e: "experiments", n: "new", s: "stats" };
  const tab = map[event.key];
  if (tab) { bridge({ op: "tab", tab }); showTab(tab); }
  if (event.key === "/") { event.preventDefault(); const q = $("#q"); if (q) q.focus(); }
  if (event.key === "Escape") bridge({ op: "close" });
});

showTab(S.tab || "graph");
renderAll();
`;

export function renderLabHtml(state) {
  const settings = state.settings || {};
  const accent = ACCENTS[settings.accent] || ACCENTS.violet;
  const theme = settings.theme === "light" ? "light" : "dark";
  const tabs = [
    ["graph", "◆ Граф"],
    ["runs", "▤ Запуски"],
    ["experiments", "✦ Эксперименты"],
    ["new", "+ Новый"],
    ["stats", "◔ Статистика"],
  ];
  const payload = {
    settings,
    experiments: Array.isArray(state.experiments) ? state.experiments : [],
    runs: Array.isArray(state.runs) ? state.runs : [],
    types: Array.isArray(state.types) ? state.types : [],
    subagentsAvailable: Boolean(state.subagentsAvailable),
    tab: typeof state.tab === "string" ? state.tab : "graph",
    templates: TEMPLATES,
    draft: state.draft || {},
    filters: { query: "", status: "all", decision: "all" },
  };

  const body =
    '<div class="top">' +
      '<div class="brand">' +
        '<div class="logo">◎</div>' +
        '<div><h1>AI Lab</h1><div class="sub">sub-agent mission control</div></div>' +
      '</div>' +
      '<span class="grow"></span>' +
      '<button class="iconbtn" data-op="toggle-theme" title="Theme">◐</button>' +
      '<button class="iconbtn" data-op="cycle-accent" title="Accent">✧</button>' +
      '<button class="iconbtn" data-op="close" title="Close">✕</button>' +
    '</div>' +
    '<div class="stats">' +
      '<div class="stat"><b>' + payload.runs.filter((r) => r.status === "running").length + '</b><span>running</span></div>' +
      '<div class="stat"><b>' + payload.runs.filter((r) => r.verdict && r.verdict.decision === "revise").length + '</b><span>revise</span></div>' +
      '<div class="stat"><b>' + payload.runs.filter((r) => r.verdict && r.verdict.decision === "accept").length + '</b><span>accepted</span></div>' +
      '<div class="stat"><b>' + payload.experiments.length + '</b><span>missions</span></div>' +
    '</div>' +
    '<div class="tabs">' + tabs.map(([id, label]) =>
      '<button class="tab" data-tab="' + id + '">' + label + '</button>').join("") + '</div>' +
    '<div id="view-graph" class="hidden"></div>' +
    '<div id="view-runs" class="hidden"></div>' +
    '<div id="view-experiments" class="hidden"></div>' +
    '<div id="view-new" class="hidden"></div>' +
    '<div id="view-stats" class="hidden"></div>' +
    '<div class="toast" id="toast"></div>';

  return '<!doctype html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>' +
    '<style>:root{--accent-color:' + accent + ';}</style>' +
    '<style>' + STYLES + '</style></head>' +
    '<body data-theme="' + theme + '">' + body +
    '<script>window.__LAB__ = ' + safeJson(payload) + ';' + SCRIPT + '</script>' +
    '</body></html>';
}

export { TEMPLATES, ACCENTS };