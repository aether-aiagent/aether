/**
 * Lab Power panels — rendered in the extension WebView.
 *
 * Three panels share one shell so the drawer feels like a single tool:
 *   mission · live fleet and fan-out progress
 *   fanout  · split a request into parallel angles and merge the answers
 *   memory  · key/value project memory matched by keyword
 */

const ACCENT = "#38BDF8";

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

const STYLES = `
:root {
  color-scheme: dark;
  --accent: ${ACCENT};
  --bg: #0b0d12;
  --card: rgba(255,255,255,.04);
  --solid: #171a22;
  --stroke: rgba(255,255,255,.09);
  --fg: #e9ebf2;
  --muted: #8f97a9;
  --ok: #34d399; --run: #60a5fa; --warn: #fbbf24; --err: #f87171; --idle: #8b93a7;
  --radius: 14px;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; }
body {
  background:
    radial-gradient(900px 340px at 20% -140px, color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%),
    var(--bg);
  color: var(--fg); font: 13px/1.5 ui-sans-serif, -apple-system, system-ui, sans-serif;
  padding: 10px 12px 24px; min-height: 100vh;
}
.hidden { display: none !important; }
.muted { color: var(--muted); }
.small { font-size: 11.5px; }
.tiny { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
.grow { flex: 1 1 auto; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }

.top { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
.logo {
  width: 26px; height: 26px; border-radius: 9px; flex: none; display: grid; place-items: center;
  background: linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 30%, #0b0d12));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 6px 18px -8px var(--accent);
  font-size: 13px;
}
.top h1 { font-size: 14px; margin: 0; white-space: nowrap; }
.top .sub { font-size: 10px; color: var(--muted); }
.iconbtn { background: var(--card); border: 1px solid var(--stroke); color: var(--fg); width: 31px; height: 31px; border-radius: 10px; display: grid; place-items: center; cursor: pointer; font-size: 13px; }
.iconbtn:active { transform: scale(.94); }

.tabs { display: flex; gap: 4px; padding: 3px; margin-bottom: 10px; background: var(--card); border: 1px solid var(--stroke); border-radius: 12px; }
.tab { flex: 1; border: 0; background: transparent; color: var(--muted); padding: 7px 6px; border-radius: 9px; font-size: 11.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.tab.active { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--fg); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); }

.card { background: var(--card); border: 1px solid var(--stroke); border-radius: var(--radius); padding: 11px; margin-bottom: 9px; }
.card > header { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; flex-wrap: wrap; }
.card h3 { margin: 0; font-size: 12.5px; font-weight: 600; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; box-shadow: 0 0 8px currentColor; }
.pulse { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

.pill { font-size: 9.5px; padding: 2px 7px; border-radius: 999px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.chip { display: inline-flex; gap: 4px; align-items: center; font-size: 10.5px; padding: 2px 7px; border-radius: 7px; background: var(--solid); border: 1px solid var(--stroke); color: var(--muted); white-space: nowrap; }

.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
button { font: inherit; cursor: pointer; color: var(--fg); background: var(--solid); border: 1px solid var(--stroke); border-radius: 10px; padding: 6px 11px; font-size: 12px; }
button:active { transform: scale(.97); }
button.primary { background: var(--accent); border-color: transparent; color: #04121c; font-weight: 700; }
button.danger { color: var(--err); border-color: color-mix(in srgb, var(--err) 40%, transparent); }
button.ghost { background: transparent; }
input, select, textarea { font: inherit; width: 100%; background: var(--solid); color: var(--fg); border: 1px solid var(--stroke); border-radius: 10px; padding: 8px 10px; font-size: 12.5px; outline: none; }
input:focus, textarea:focus { border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
textarea { min-height: 74px; resize: vertical; }
label { display: block; margin: 9px 0 4px; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.worker { display: flex; gap: 8px; align-items: flex-start; padding: 7px 0; border-bottom: 1px solid var(--stroke); }
.worker:last-child { border-bottom: 0; }
.worker .angle { font-size: 11.5px; }
.bar { height: 5px; border-radius: 3px; background: var(--solid); overflow: hidden; margin-top: 4px; }
.bar > i { display: block; height: 100%; border-radius: 3px; transition: width .3s; }
pre { white-space: pre-wrap; word-break: break-word; background: color-mix(in srgb, #000 32%, var(--solid)); border: 1px solid var(--stroke); border-radius: 9px; padding: 8px; font-size: 11px; max-height: 240px; overflow: auto; font-family: ui-monospace, monospace; }
details { margin-top: 6px; }
summary { cursor: pointer; font-size: 11.5px; color: var(--muted); }
.mem { border-left: 2px solid var(--accent); padding-left: 9px; margin-bottom: 8px; }
.mem.pinned { border-left-color: var(--warn); }
.mem h4 { margin: 0 0 2px; font-size: 12px; }
.mem p { margin: 0; font-size: 11.5px; white-space: pre-wrap; }
.empty { text-align: center; padding: 24px 10px; color: var(--muted); font-size: 12px; }
.empty .big { font-size: 24px; opacity: .5; margin-bottom: 6px; }
.toast { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%) translateY(16px); background: var(--solid); border: 1px solid var(--stroke); border-radius: 11px; padding: 8px 13px; font-size: 12px; opacity: 0; transition: opacity .2s, transform .2s; z-index: 40; }
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

const SCRIPT = `
const S = window.__POWER__;
const send = (args) => { try { Aether.postMessage(JSON.stringify({ action: "lab-power", args })); } catch (e) {} };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TERMINAL = ["completed", "failed", "error", "aborted", "stopped", "cancelled", "steered"];

const COLORS = { queued: "#a78bfa", running: "#60a5fa", done: "#34d399", failed: "#f87171", stopped: "#fbbf24", merging: "#60a5fa", merged: "#34d399" };

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg; el.classList.add("show");
  clearTimeout(el.__t); el.__t = setTimeout(() => el.classList.remove("show"), 1800);
}

function ago(iso) {
  const ms = Date.now() - Date.parse(iso || 0);
  if (!isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  return Math.floor(m / 60) + "h ago";
}

function isLive(status) { return !TERMINAL.includes(status); }

/* ---------- mission ---------- */
function renderAgents() {
  const agents = S.agents;
  if (!agents.length) {
    return '<div class="empty"><div class="big">◎</div>Нет живых агентов.<br/>Запустите fan-out или миссию AI Lab.</div>';
  }
  return agents.map((agent) => {
    const status = String(agent.status || "unknown").toLowerCase();
    const color = COLORS[status] || "#8b93a7";
    return '<div class="worker">' +
      '<span class="dot ' + (isLive(status) ? "pulse" : "") + '" style="background:' + color + ';color:' + color + ';margin-top:5px"></span>' +
      '<div class="grow">' +
        '<div class="angle"><strong>' + esc(agent.name || agent.type || "agent") + '</strong> ' +
          '<span class="chip">' + esc(agent.type || "?") + '</span> ' +
          '<span class="pill" style="background:' + color + '22;color:' + color + '">' + esc(status) + '</span></div>' +
        '<div class="tiny muted">' + esc(agent.description || "") + (agent.id ? ' · ' + esc(String(agent.id).slice(0, 12)) : "") + '</div>' +
      '</div></div>';
  }).join("");
}

function renderJobs(list) {
  if (!list.length) return '';
  return list.map((job) => {
    const done = job.workers.filter((w) => w.status === "done").length;
    const failed = job.workers.filter((w) => w.status === "failed").length;
    const pct = Math.round(((done + failed) / job.workers.length) * 100);
    const color = COLORS[job.status] || "#8b93a7";
    return '<article class="card"><header>' +
      '<span class="dot ' + (job.status === "running" || job.status === "merging" ? "pulse" : "") + '" style="background:' + color + ';color:' + color + '"></span>' +
      '<h3>' + esc(job.request.slice(0, 46)) + '</h3>' +
      '<span class="grow"></span>' +
      '<span class="pill" style="background:' + color + '22;color:' + color + '">' + esc(job.status) + '</span>' +
      '</header>' +
      '<div class="bar"><i style="width:' + pct + '%;background:' + color + '"></i></div>' +
      '<div class="tiny muted" style="margin-top:5px">' + done + '/' + job.workers.length + ' углов готово' +
        (failed ? ' · ' + failed + ' failed' : '') +
        (job.memoryUsed ? ' · memory used' : '') + ' · ' + ago(job.createdAt) + '</div>' +
      '<details><summary>Angles</summary>' +
        job.workers.map((w) => {
          const wc = COLORS[w.status] || "#8b93a7";
          return '<div class="worker"><span class="dot" style="background:' + wc + ';color:' + wc + ';margin-top:5px"></span>' +
            '<div class="grow"><div class="angle">' + esc(w.angle) + '</div>' +
            '<div class="tiny" style="color:' + wc + '">' + esc(w.status) + '</div>' +
            (w.error ? '<div class="tiny" style="color:var(--err)">' + esc(w.error) + '</div>' : '') +
            (w.output ? '<details><summary>output</summary><pre>' + esc(w.output.slice(0, 4000)) + '</pre></details>' : '') +
            '</div></div>';
        }).join('') +
      '</details>' +
      (job.merged ? '<details><summary>Merged answer</summary><pre>' + esc(job.merged.slice(0, 8000)) + '</pre></details>' : '') +
      '<div class="row" style="margin-top:8px">' +
        (job.merged ? '<button data-op="publish" data-job="' + job.id + '" class="primary">В чат</button>' : '') +
        '<button data-op="rerun" data-job="' + job.id + '">Повторить</button>' +
        (job.status === "running" || job.status === "merging" ? '<button data-op="stop-job" data-job="' + job.id + '" class="danger">Стоп</button>' : '') +
      '</div></article>';
  }).join("");
}

function renderMission() {
  const active = S.jobs.filter((j) => j.status === "running" || j.status === "merging");
  const awake = S.keepScreenOn === true;
  return '<article class="card"><header><h3>Экран</h3><span class="grow"></span>' +
      '<span class="pill" style="background:' + (awake ? '#34d39922;color:#34d399' : 'rgba(255,255,255,.06);color:#8f97a9') + '">' +
      (awake ? 'не гаснет' : 'может гаснуть') + '</span></header>' +
      '<div class="tiny muted">Только флаг окна — без root и wake lock; снимается, когда приложение уходит с экрана.</div>' +
      '<div class="row" style="margin-top:8px"><button data-op="keep-screen">' +
      (awake ? 'Разрешить сон' : 'Держать включённым') + '</button></div></article>' +
    '<article class="card"><header><h3>Живой флот</h3><span class="grow"></span>' +
      '<span class="chip">' + S.agents.length + ' агентов</span></header>' +
      renderAgents() + '</article>' +
    (active.length ? renderJobs(active) : '') +
    (S.jobs.filter((j) => !active.includes(j)).length
      ? '<h3 class="tiny muted" style="margin:14px 0 6px">Недавние</h3>' + renderJobs(S.jobs.filter((j) => !active.includes(j)).slice(0, 4))
      : '');
}

/* ---------- fanout ---------- */
function renderFanOut() {
  const angles = ["Корректность и крайние случаи", "Существующий код, который уже решает часть задачи", "Производительность и стоимость ресурсов", "Безопасность, приватность и режимы отказа", "Тесты, проверка и воспроизводимость", "Самое простое альтернативное решение"];
  const parallel = Math.min(12, Math.max(1, Number(S.parallel) || 3));
  const options = [];
  for (let n = 1; n <= parallel; n += 1) options.push(n);
  return '<article class="card"><header><h3>Разделить и слить</h3></header>' +
    '<label>Запрос</label>' +
    '<textarea id="frequest" placeholder="Что разобрать сразу с нескольких сторон?"></textarea>' +
    '<div class="grid2" style="margin-top:8px">' +
      '<div><label>Параллельных углов</label><select id="fcount">' +
        options.map((n) => '<option value="' + n + '"' + (n === parallel ? ' selected' : '') + '>' + n + ' шт.</option>').join('') +
      '</select></div>' +
      '<div><label>Агент-воркер</label><input id="fworker" value="aether-lab-worker"/></div>' +
    '</div>' +
    '<label>Агент-слияние</label><input id="fmerger" value="aether-lab-orchestrator"/>' +
    '<label>Углы (необязательно, по одному в строке — пусто = умные значения)</label>' +
    '<textarea id="fangles" placeholder="' + angles.slice(0, 2).join("\\n") + '"></textarea>' +
    '<div class="row" style="margin-top:9px">' +
      '<button id="go" class="primary">Запустить fan-out</button>' +
      '<span class="grow"></span><span class="tiny muted">' + (S.subagentsAvailable ? 'pi-subagents готов' : 'pi-subagents недоступен') + '</span>' +
    '</div></article>' +
    (S.jobs.length ? renderJobs(S.jobs.slice(0, 6)) : '<div class="empty"><div class="big">⇉</div>Fan-out-ов пока не было.</div>');
}

/* ---------- memory ---------- */
function renderMemory() {
  return '<article class="card"><header><h3>Память</h3><span class="grow"></span>' +
      '<span class="chip">' + S.memory.length + ' записей</span></header>' +
    '<label>Ключ</label><input id="mkey" placeholder="ключ"/>' +
    '<label>Значение</label><textarea id="mvalue" placeholder="Факты, которые агенты не должны искать заново."></textarea>' +
    '<label>Теги (через пробел)</label><input id="mtags" placeholder="infra ci"/>' +
    '<div class="row" style="margin-top:9px"><button id="msave" class="primary">Сохранить</button>' +
      '<button id="mrecall" class="ghost">Вспомнить в чат</button></div></article>' +
    '<div class="row" style="margin-bottom:9px"><input id="msearch" placeholder="Поиск по памяти…"/></div>' +
    '<div id="mlist"></div>';
}

function memoryList() {
  const q = ($("#msearch") || {}).value || "";
  const words = q.toLowerCase().split(/\\s+/).filter(Boolean);
  const items = S.memory.filter((item) => {
    if (!words.length) return true;
    const hay = (item.key + " " + item.value + " " + (item.tags || []).join(" ")).toLowerCase();
    return words.some((w) => hay.includes(w));
  });
  if (!items.length) return '<div class="empty"><div class="big">◇</div>Память пуста.</div>';
  return items.map((item) => '<div class="mem' + (item.pinned ? " pinned" : "") + '">' +
    '<h4>' + esc(item.key) + (item.pinned ? ' ★' : '') + '</h4>' +
    '<p>' + esc(item.value.slice(0, 700)) + '</p>' +
    '<div class="row tiny" style="margin-top:4px">' +
      (item.tags || []).map((t) => '<span class="chip">' + esc(t) + '</span>').join('') +
      '<span class="grow"></span>' +
      '<button class="ghost tiny" data-op="memory-pin" data-id="' + item.id + '">' + (item.pinned ? "Открепить" : "Закрепить") + '</button>' +
      '<button class="ghost tiny danger" data-op="memory-delete" data-id="' + item.id + '">Удалить</button>' +
    '</div></div>').join("");
}

function renderAll() {
  $("#view-mission").innerHTML = renderMission();
  $("#view-fanout").innerHTML = renderFanOut();
  $("#view-memory").innerHTML = renderMemory();
  $("#mlist").innerHTML = memoryList();
  const search = $("#msearch");
  if (search) search.addEventListener("input", () => { $("#mlist").innerHTML = memoryList(); });
  const go = $("#go");
  if (go) go.addEventListener("click", () => {
    const request = ($("#frequest") || {}).value || "";
    if (!request.trim()) { toast("Сначала напишите запрос."); return; }
    send({ op: "fanout", request, count: Number(($("#fcount") || {}).value) || S.parallel || 3,
      workerType: ($("#fworker") || {}).value || "aether-lab-worker",
      mergerType: ($("#fmerger") || {}).value || "aether-lab-orchestrator",
      angles: (($("#fangles") || {}).value || "").split("\\n").map((s) => s.trim()).filter(Boolean) });
    toast("Fan-out запущен.");
  });
  const save = $("#msave");
  if (save) save.addEventListener("click", () => {
    send({ op: "memory-save", key: ($("#mkey") || {}).value || "", value: ($("#mvalue") || {}).value || "", tags: ($("#mtags") || {}).value || "" });
    toast("Сохранено.");
  });
  const recall = $("#mrecall");
  if (recall) recall.addEventListener("click", () => {
    send({ op: "memory-inject", query: (($("#msearch") || {}).value || "") || (($("#frequest") || {}).value || "") });
  });
}

function showPanel(panel) {
  $$(".tab").forEach((el) => el.classList.toggle("active", el.dataset.panel === panel));
  $$("[id^=view-]").forEach((el) => el.classList.toggle("hidden", el.id !== "view-" + panel));
}

$$(".tab").forEach((el) => el.addEventListener("click", () => { send({ op: "panel", panel: el.dataset.panel }); showPanel(el.dataset.panel); }));

document.body.addEventListener("click", (event) => {
  const node = event.target.closest("[data-op]");
  if (!node) return;
  const args = { op: node.dataset.op };
  if (node.dataset.job) args.job_id = node.dataset.job;
  if (node.dataset.id) args.id = node.dataset.id;
  send(args);
});

showPanel(S.panel || "mission");
renderAll();
`;

export function renderPowerHtml(state) {
  const panel = typeof state.panel === "string" ? state.panel : "mission";
  const payload = {
    panel,
    jobs: Array.isArray(state.jobs) ? state.jobs : [],
    memory: Array.isArray(state.memory) ? state.memory : [],
    agents: Array.isArray(state.agents) ? state.agents : [],
    subagentsAvailable: Boolean(state.subagentsAvailable),
    keepScreenOn: state.keepScreenOn === true,
    parallel: Number(state.parallel) || 3,
  };
  const tabs = [["mission", "◉ Центр управления"], ["fanout", "⇉ Fan-out"], ["memory", "◇ Память"]];

  return '<!doctype html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>' +
    '<style>' + STYLES + '</style></head><body>' +
    '<div class="top"><div class="logo">⇉</div>' +
      '<div><h1>Lab Power</h1><div class="sub">миссии · fan-out · память</div></div>' +
      '<span class="grow"></span>' +
      '<button class="iconbtn" data-op="close">✕</button></div>' +
    '<div class="tabs">' + tabs.map(([id, label]) =>
      '<button class="tab" data-panel="' + id + '">' + label + '</button>').join('') + '</div>' +
    '<div id="view-mission" class="hidden"></div>' +
    '<div id="view-fanout" class="hidden"></div>' +
    '<div id="view-memory" class="hidden"></div>' +
    '<div class="toast" id="toast"></div>' +
    '<script>window.__POWER__ = ' + safeJson(payload) + ';' + SCRIPT + '</script>' +
    '</body></html>';
}

export { escapeHtml };