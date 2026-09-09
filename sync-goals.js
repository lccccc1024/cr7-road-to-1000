const fs = require("fs");
const path = require("path");

const TARGET = 1000;
const FILE = path.join(__dirname, "data.js");
const CSV_URL = "https://theroadto1000goals.com/ronaldo_goals.csv";
const TOTAL_URL = "https://theroadto1000goals.com/";

const CLUB_MAP = {
  "Sporting CP": "葡萄牙体育",
  "Manchester United": "曼联",
  "Real Madrid": "皇家马德里",
  "Juventus": "尤文图斯",
  "Al Nassr": "利雅得胜利",
  "Portugal": "葡萄牙"
};

const TYPE_MAP = {
  "open play": "进球",
  "header": "头球",
  "penalty": "点球",
  "free kick": "任意球"
};

function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { fields.push(cur); cur = ""; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

function plausible(n) {
  return typeof n === "number" && n >= 900 && n < TARGET;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "github-action-goal-sync/1.0 (+https://github.com)" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getLatestTotal() {
  try {
    const html = await fetchText(TOTAL_URL);
    const m = html.match(/data-goal="total">\s*(\d{3,4})\s*</);
    if (m) {
      const n = parseInt(m[1]);
      console.log(`[sync] total from theroadto1000goals.com -> ${n}`);
      if (plausible(n)) return n;
    }
  } catch (e) {
    console.log(`[sync] total fetch failed: ${e.message}`);
  }
  try {
    const html = await fetchText("https://goalnigeria.com/ronaldo-total-goals-career/");
    const m = html.match(/(\d{3,4})\s*official senior career goals/i);
    if (m) {
      const n = parseInt(m[1]);
      console.log(`[sync] total from goalnigeria.com -> ${n}`);
      if (plausible(n)) return n;
    }
  } catch (e) {
    console.log(`[sync] goalnigeria failed: ${e.message}`);
  }
  return null;
}

async function getGoalDetails() {
  try {
    const csv = await fetchText(CSV_URL);
    const goals = parseCsv(csv);
    console.log(`[sync] CSV loaded: ${goals.length} goals`);
    return goals
      .filter(g => g.goal_number && g.club)
      .map(g => ({
        no: parseInt(g.goal_number),
        date: g.date || "",
        club: g.club,
        opponent: g.opponent || "",
        goal_type: g.goal_type || "open play",
        venue: g.venue || ""
      }))
      .sort((a, b) => a.no - b.no);
  } catch (e) {
    console.log(`[sync] CSV fetch failed: ${e.message}`);
    return null;
  }
}

function loadData() {
  const code = fs.readFileSync(FILE, "utf8");
  const m = code.match(/CR7_DATA\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) throw new Error("cannot find CR7_DATA in data.js");
  return new Function("return " + m[1])();
}

function writeData(obj) {
  const out = "const CR7_DATA = " + JSON.stringify(obj, null, 2) + ";\n";
  fs.writeFileSync(FILE, out, "utf8");
  try {
    new Function(fs.readFileSync(FILE, "utf8"));
  } catch (e) {
    throw new Error("written data.js is not valid JS: " + e.message);
  }
  console.log("[sync] data.js written & validated");
}

function buildBreakdown(goals) {
  const counts = {};
  for (const g of goals) {
    const cn = CLUB_MAP[g.club] || g.club;
    counts[cn] = (counts[cn] || 0) + 1;
  }
  const YEARS = {
    "葡萄牙体育": "2002–2003",
    "曼联": "2003–2009 / 2021–2022",
    "皇家马德里": "2009–2018",
    "尤文图斯": "2018–2021",
    "利雅得胜利": "2023–至今",
    "葡萄牙": "2003–至今"
  };
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([team, g]) => ({
      team,
      goals: g,
      years: YEARS[team] || ""
    }));
}

function buildRecentGoals(goals, count) {
  return goals.slice(-count).reverse().map(g => ({
    no: g.no,
    date: g.date,
    match: `${CLUB_MAP[g.club] || g.club} vs ${g.opponent}`,
    type: TYPE_MAP[g.goal_type] || "进球"
  }));
}

async function main() {
  const [latest, allGoals] = await Promise.all([getLatestTotal(), getGoalDetails()]);
  if (latest === null) {
    console.log("[sync] no usable total -> no change");
    process.exit(0);
  }
  const data = loadData();
  if (latest <= data.total) {
    console.log(`[sync] already at ${data.total}, no change`);
    process.exit(0);
  }

  const old = data.total;
  data.total = latest;
  data.updatedAt = today();

  if (allGoals && allGoals.length >= latest) {
    data.breakdown = buildBreakdown(allGoals);
    data.recentGoals = buildRecentGoals(allGoals, 9);
    console.log(`[sync] breakdown & recentGoals rebuilt from CSV (${allGoals.length} goals)`);
  } else {
    console.log("[sync] CSV unavailable, only total updated");
  }

  writeData(data);
  console.log(`[sync] goals updated: ${old} -> ${latest}`);
}

main().catch(e => {
  console.error("[sync] error:", e);
  process.exit(1);
});
