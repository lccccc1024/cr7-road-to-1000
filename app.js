const STORAGE_KEY = "cr7_goals_data_v3";
const GOAL_TARGET = 1000;

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

let localMode = false;
let storageWarning = "";
let state = loadState();
let shownTotal = 0;
let numberAnimation = 0;

function validState(s) {
  return s && Number.isSafeInteger(s.total) && s.total >= 0 && s.total <= 10000 &&
    Array.isArray(s.breakdown) && s.breakdown.length > 0 && s.breakdown.every(b =>
      b && typeof b.team === "string" && typeof b.years === "string" && Number.isSafeInteger(b.goals) && b.goals >= 0) &&
    s.breakdown.reduce((sum, b) => sum + b.goals, 0) === s.total &&
    Array.isArray(s.recentGoals) && s.recentGoals.every(g => g && Number.isSafeInteger(g.no) && g.no > 0 && g.no <= s.total &&
      [g.date, g.match, g.type].every(v => typeof v === "string")) &&
    [s.updatedAt, s.etaNote].every(v => typeof v === "string") &&
    [s.appearances, s.assists, s.goalsPerGame].every(Number.isFinite);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.base === JSON.stringify(CR7_DATA) && validState(saved.data)) {
      localMode = true;
      return saved.data;
    }
  } catch (e) {
    storageWarning = "本地存储不可用或缓存损坏；已加载仓库数据。";
  }
  return structuredClone(CR7_DATA);
}

function saveState() {
  localMode = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ base: JSON.stringify(CR7_DATA), data: state }));
    storageWarning = "";
  } catch (e) {
    storageWarning = "无法保存到浏览器，当前记录刷新后将丢失。";
  }
}

function pct() {
  return Math.min(100, (state.total / GOAL_TARGET) * 100);
}

function toGo() {
  return Math.max(0, GOAL_TARGET - state.total);
}

function animateNum(el, from, to) {
  const generation = ++numberAnimation;
  const dur = 900;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to; return; }
  const start = performance.now();
  function step(now) {
    if (generation !== numberAnimation) return;
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function setProgress() {
  const fill = document.getElementById("progressFill");
  const mark = document.getElementById("progressMark");
  const p = pct();
  fill.style.width = p + "%";
  mark.style.left = "calc(" + p + "% - 1px)";
}

function renderBreakdown() {
  const wrap = document.getElementById("breakdown");
  wrap.innerHTML = "";
  state.breakdown.forEach(b => {
    const p = state.total ? (b.goals / state.total) * 100 : 0;
    const row = document.createElement("div");
    row.className = "bd-row";
    row.innerHTML = `
      <div class="bd-team">${esc(b.team)}<small>${esc(b.years)}</small></div>
      <div class="bd-bar"><i></i></div>
      <div class="bd-pct">${p.toFixed(1)}%</div>
      <div class="bd-pct">${b.goals}</div>`;
    wrap.appendChild(row);
  });
  requestAnimationFrame(() => {
    wrap.querySelectorAll(".bd-bar i").forEach((bar, i) => {
      bar.style.width = (state.total ? (state.breakdown[i].goals / state.total) * 100 : 0) + "%";
    });
  });
}

function renderLog(animate) {
  const list = document.getElementById("goalLog");
  list.innerHTML = "";
  state.recentGoals.slice(0, 8).forEach((g, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="gl-no">#${g.no}</span>
      <span class="gl-date">${esc(g.date)}</span>
      <span class="gl-match">${esc(g.match)}</span>
      <span class="gl-type">${esc(g.type)}</span>`;
    list.appendChild(li);
    if (animate) li.style.animationDelay = (i * 60) + "ms";
  });
}

function renderTexts() {
  document.getElementById("goalsToGo").textContent = toGo();
  document.getElementById("msToGo").textContent = toGo();
  document.getElementById("percent").textContent = pct().toFixed(1) + "%";
  document.getElementById("statGoals").textContent = state.total;
  document.getElementById("statApps").textContent = state.appearances;
  document.getElementById("statGpg").textContent = state.goalsPerGame;
  document.getElementById("statAssists").textContent = state.assists;
  document.getElementById("eta").textContent = state.etaNote;
  document.getElementById("updatedAt").textContent = state.updatedAt;

  const badge = document.getElementById("dataBadge");
  document.getElementById("storageStatus").textContent = storageWarning;
  document.getElementById("statsDate").textContent = CR7_DATA.statsUpdatedAt || "未知日期";
  const reached = state.total >= GOAL_TARGET;
  document.getElementById("etaText").hidden = reached;
  document.getElementById("milestoneStatus").textContent = reached ? "已达成" : "进行中";
  document.getElementById("thousandMilestone").className = "milestone " + (reached ? "done" : "next");
  document.getElementById("progressBar").setAttribute("aria-valuenow", Math.min(state.total, GOAL_TARGET));
  if (localMode) badge.classList.remove("hidden");
  else badge.classList.add("hidden");
}

function renderAll(animateLog) {
  const totalEl = document.getElementById("totalGoals");
  animateNum(totalEl, shownTotal, state.total);
  shownTotal = state.total;

  setProgress();
  renderBreakdown();
  renderLog(animateLog);
  renderTexts();
}

const TEAM_NAMES = {
  "Real Madrid": "皇家马德里",
  "Portugal": "葡萄牙",
  "Manchester United": "曼联",
  "Al-Nassr": "利雅得胜利",
  "Juventus": "尤文图斯",
  "Sporting CP": "葡萄牙体育"
};

function localDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function addGoal() {
  const teamCode = document.getElementById("teamSelect").value;
  const match = document.getElementById("matchInput").value.trim();
  const type = document.getElementById("typeSelect").value;
  const today = localDate();
  const teamName = TEAM_NAMES[teamCode] || teamCode;

  if (state.total >= 10000) return;
  state.total += 1;
  const b = state.breakdown.find(x => x.team === teamName);
  if (b) b.goals += 1;
  else state.breakdown.push({ team: teamName, goals: 1, years: "" });

  state.recentGoals.unshift({
    no: state.total,
    date: today,
    match: teamName + (match ? " vs " + match : ""),
    type
  });
  state.updatedAt = today;

  saveState();
  renderAll(true);
}

function resetData() {
  try { localStorage.removeItem(STORAGE_KEY); storageWarning = ""; }
  catch (e) { storageWarning = "无法清除本地存储；当前已恢复仓库数据。"; }
  localMode = false;
  state = structuredClone(CR7_DATA);
  shownTotal = 0;

  document.getElementById("progressFill").style.width = "0%";
  document.getElementById("progressMark").style.left = "0px";
  requestAnimationFrame(() => {
    renderAll(false);
    setProgress();
  });
}

document.getElementById("addBtn").addEventListener("click", addGoal);
document.getElementById("resetBtn").addEventListener("click", resetData);

const PROXIES = [
  { label: "直连", wrap: u => u },
  { label: "allorigins", wrap: u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u) },
  { label: "corsproxy.io", wrap: u => "https://corsproxy.io/?url=" + encodeURIComponent(u) }
];

const FETCH_SOURCES = [
  {
    name: "theroadto1000goals.com",
    url: "https://theroadto1000goals.com/",
    parse: html => {
      const m = html.match(/data-goal="total">\s*(\d{3,5})\s*</);
      return m ? parseInt(m[1]) : null;
    }
  },
  {
    name: "goalnigeria.com",
    url: "https://goalnigeria.com/ronaldo-total-goals-career/",
    parse: html => {
      const m = html.match(/(\d{3,5})\s*official senior career goals/i);
      return m ? parseInt(m[1]) : null;
    }
  }
];

function setFetchStatus(text, cls) {
  const el = document.getElementById("fetchStatus");
  el.textContent = text;
  el.className = "fetch-status" + (cls ? " " + cls : "");
}

function plausible(n) {
  return Number.isSafeInteger(n) && n >= 900 && n <= 10000;
}

let fetching = false;

async function fetchLatest() {
  if (fetching) return;
  fetching = true;
  const btn = document.getElementById("fetchBtn");
  btn.disabled = true;
  let staleStatus = "";
  try {
    sources: for (const src of FETCH_SOURCES) {
      for (const p of PROXIES) {
        setFetchStatus("正在尝试 " + src.name + "（" + p.label + "）…");
        let timer;
        try {
          const ctrl = new AbortController();
          timer = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(p.wrap(src.url), { signal: ctrl.signal });
          if (!res.ok) continue;
          const html = await res.text();
          const n = src.parse(html);
          if (plausible(n)) {
            if (n < state.total) {
              staleStatus = "来源数字偏旧（" + n + " 球，" + src.name + "）；当前展示 " + state.total + " 球。";
              continue sources;
            }
            setFetchStatus("来源校验：" + n + " 球（" + src.name + "）；当前展示 " + state.total + " 球。完整数据由仓库同步后更新。", n === state.total ? "ok" : "err");
            return;
          }
        } catch (e) {} finally { clearTimeout(timer); }
      }
    }
    setFetchStatus(staleStatus || "校验失败：所有来源均未返回可用总数（网络或页面格式异常）", "err");
  } finally {
    fetching = false;
    btn.disabled = false;
  }
}

document.getElementById("fetchBtn").addEventListener("click", fetchLatest);

renderAll(false);
setProgress();