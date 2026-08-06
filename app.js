const STORAGE_KEY = "cr7_goals_data_v3";
const GOAL_TARGET = 1000;

let state = loadState();
let shownTotal = 0;

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (typeof s.total === "number" && s.recentGoals && s.breakdown && s.total >= 0 && s.total <= 1000) return s;
    } catch (e) {}
  }
  return structuredClone(CR7_DATA);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pct() {
  return Math.min(100, (state.total / GOAL_TARGET) * 100);
}

function toGo() {
  return Math.max(0, GOAL_TARGET - state.total);
}

function animateNum(el, from, to) {
  const dur = 900;
  const start = performance.now();
  function step(now) {
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
    const p = (b.goals / state.total) * 100;
    const row = document.createElement("div");
    row.className = "bd-row";
    row.innerHTML = `
      <div class="bd-team">${b.team}<small>${b.years}</small></div>
      <div class="bd-bar"><i></i></div>
      <div class="bd-pct">${p.toFixed(1)}%</div>
      <div class="bd-pct">${b.goals}</div>`;
    wrap.appendChild(row);
  });
  requestAnimationFrame(() => {
    wrap.querySelectorAll(".bd-bar i").forEach((bar, i) => {
      bar.style.width = ((state.breakdown[i].goals / state.total) * 100) + "%";
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
      <span class="gl-date">${g.date}</span>
      <span class="gl-match">${g.match}</span>
      <span class="gl-type">${g.type}</span>`;
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
  if (localStorage.getItem(STORAGE_KEY)) badge.classList.remove("hidden");
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

function addGoal() {
  const teamCode = document.getElementById("teamSelect").value;
  const match = document.getElementById("matchInput").value.trim();
  const type = document.getElementById("typeSelect").value;
  const today = new Date().toISOString().slice(0, 10);
  const teamName = TEAM_NAMES[teamCode] || teamCode;

  state.total += 1;
  const b = state.breakdown.find(x => x.team === teamName);
  if (b) b.goals += 1;

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
  localStorage.removeItem(STORAGE_KEY);
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
      const m = html.match(/data-goal="total">\s*(\d{3,4})\s*</);
      return m ? parseInt(m[1]) : null;
    }
  },
  {
    name: "goalnigeria.com",
    url: "https://goalnigeria.com/ronaldo-total-goals-career/",
    parse: html => {
      const m = html.match(/(\d{3,4})\s*official senior career goals/i);
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
  return typeof n === "number" && n >= 900 && n < GOAL_TARGET;
}

let fetching = false;

async function fetchLatest() {
  if (fetching) return;
  fetching = true;
  const btn = document.getElementById("fetchBtn");
  btn.disabled = true;
  try {
    for (const src of FETCH_SOURCES) {
      for (const p of PROXIES) {
        setFetchStatus("正在尝试 " + src.name + "（" + p.label + "）…");
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(p.wrap(src.url), { signal: ctrl.signal });
          clearTimeout(timer);
          if (!res.ok) continue;
          const html = await res.text();
          const n = src.parse(html);
          if (plausible(n)) {
            if (n > state.total) {
              state.total = n;
              state.updatedAt = new Date().toISOString().slice(0, 10);
              saveState();
              renderAll(true);
              setFetchStatus("已自动更新：" + n + " 球（来源 " + src.name + "）", "ok");
            } else if (n >= state.total) {
              setFetchStatus("与当前一致（" + n + " 球，" + src.name + "）", "ok");
            }
            return;
          }
        } catch (e) {}
      }
    }
    setFetchStatus("抓取失败：所有来源均不可达（网络/反爬限制）", "err");
  } finally {
    fetching = false;
    btn.disabled = false;
  }
}

document.getElementById("fetchBtn").addEventListener("click", fetchLatest);

renderAll(false);
setProgress();