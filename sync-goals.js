const fs = require("fs");
const path = require("path");

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

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  const pushField = () => { row.push(field); field = ""; closed = false; };
  const pushRow = () => { pushField(); if (row.some(v => v.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',') pushField();
    else if (c === '\n' || c === '\r') { pushRow(); if (c === '\r' && text[i + 1] === '\n') i++; }
    else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Malformed CSV quoting");
      field += c;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (field || row.length || closed) pushRow();
  if (rows.length < 2) throw new Error("CSV has no goal records");
  const headers = rows.shift().map(h => h.trim());
  if (new Set(headers).size !== headers.length) throw new Error("Duplicate CSV headers");
  for (const key of ["goal_number", "date", "club", "opponent", "goal_type"]) {
    if (!headers.includes(key)) throw new Error("Missing CSV column: " + key);
  }
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error("CSV column count mismatch");
    return Object.fromEntries(headers.map((key, i) => [key, values[i].trim()]));
  });
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function plausible(n) {
  return Number.isSafeInteger(n) && n >= 900 && n <= 10000;
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

async function getLatestTotal(minimum = 900, expected, read = fetchText) {
  const acceptable = n => plausible(n) && n >= minimum && (expected === undefined || n === expected);
  try {
    const html = await read(TOTAL_URL);
    const m = html.match(/data-goal="total">\s*(\d{3,5})\s*</);
    if (m) {
      const n = parseInt(m[1]);
      console.log(`[sync] total from theroadto1000goals.com -> ${n}`);
      if (acceptable(n)) return n;
    }
  } catch (e) {
    console.log(`[sync] total fetch failed: ${e.message}`);
  }
  try {
    const html = await read("https://goalnigeria.com/ronaldo-total-goals-career/");
    const m = html.match(/(\d{3,5})\s*official senior career goals/i);
    if (m) {
      const n = parseInt(m[1]);
      console.log(`[sync] total from goalnigeria.com -> ${n}`);
      if (acceptable(n)) return n;
    }
  } catch (e) {
    console.log(`[sync] goalnigeria failed: ${e.message}`);
  }
  return null;
}

async function getGoalDetails(read = fetchText) {
  try {
    const csv = await read(CSV_URL);
    const goals = parseCsv(csv);
    console.log(`[sync] CSV loaded: ${goals.length} goals`);
    return goals
      .map(g => ({
        no: Number(g.goal_number),
        date: g.date,
        club: g.club,
        opponent: g.opponent,
        goal_type: g.goal_type,
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
  return JSON.parse(m[1]);
}

function writeData(obj) {
  const out = "const CR7_DATA = " + JSON.stringify(obj, null, 2) + ";\n";
  const temporary = FILE + ".tmp";
  try {
    fs.writeFileSync(temporary, out, "utf8");
    fs.renameSync(temporary, FILE);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log("[sync] data.js written");
}

function buildBreakdown(goals) {
  const counts = Object.create(null);
  for (const g of goals) {
    const cn = Object.hasOwn(CLUB_MAP, g.club) ? CLUB_MAP[g.club] : g.club;
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
      years: Object.hasOwn(YEARS, team) ? YEARS[team] : ""
    }));
}

function buildRecentGoals(goals, count) {
  return goals.slice(-count).reverse().map(g => ({
    no: g.no,
    date: g.date,
    match: `${Object.hasOwn(CLUB_MAP, g.club) ? CLUB_MAP[g.club] : g.club} vs ${g.opponent}`,
    type: Object.hasOwn(TYPE_MAP, g.goal_type) ? TYPE_MAP[g.goal_type] : g.goal_type
  }));
}

function reconcile(data, latest, allGoals) {
  if (!plausible(latest)) throw new Error("No usable total from any source");
  if (latest < data.total) throw new Error("Source total is older than repository data");
  if (!Array.isArray(allGoals) || allGoals.length !== latest ||
      allGoals.some((g, i) => !g || g.no !== i + 1 || typeof g.club !== "string" || !g.club.trim() ||
        !validDate(g.date) || typeof g.opponent !== "string" || !g.opponent.trim() ||
        typeof g.goal_type !== "string" || !g.goal_type.trim())) {
    throw new Error("CSV must contain complete, valid details and one ordered record per goal; data unchanged");
  }
  const next = { ...data, total: latest, breakdown: buildBreakdown(allGoals), recentGoals: buildRecentGoals(allGoals, 9) };
  if (JSON.stringify(next) === JSON.stringify(data)) return null;
  next.updatedAt = today();
  return next;
}

async function main() {
  const data = loadData();
  const allGoals = await getGoalDetails();
  if (!allGoals) throw new Error("No usable goal details; data unchanged");
  const latest = await getLatestTotal(data.total, allGoals.length);
  const next = reconcile(data, latest, allGoals);
  if (next && process.argv.includes("--dry-run")) console.log("[sync] dry run: valid update available, no files written");
  else if (next) writeData(next);
  else console.log("[sync] data unchanged");
}

if (require.main === module) main().catch(e => {
  console.error("[sync] error:", e);
  process.exitCode = 1;
});
module.exports = { plausible, reconcile, parseCsv, getLatestTotal, getGoalDetails, validDate };
