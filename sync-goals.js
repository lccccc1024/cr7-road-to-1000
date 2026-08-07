const fs = require("fs");
const path = require("path");

const TARGET = 1000;
const FILE = path.join(__dirname, "data.js");

const SOURCES = [
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

function plausible(n) {
  return typeof n === "number" && n >= 900 && n < TARGET;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
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

async function getLatest() {
  for (const src of SOURCES) {
    try {
      const html = await fetchText(src.url);
      const n = src.parse(html);
      console.log(`[sync] ${src.name} -> ${n}`);
      if (plausible(n)) return n;
    } catch (e) {
      console.log(`[sync] ${src.name} failed: ${e.message}`);
    }
  }
  return null;
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
  console.log("[sync] data.js updated");
}

async function main() {
  const latest = await getLatest();
  if (latest === null) {
    console.log("all sources reachable, none usable -> no change");
    process.exit(0);
  }
  const data = loadData();
  if (latest > data.total) {
    const old = data.total;
    data.total = latest;
    data.updatedAt = today();
    writeData(data);
    console.log(`[sync] goals updated: ${old} -> ${latest}`);
  } else {
    console.log(`[sync] already at ${data.total}, no change`);
  }
}

main().catch(e => {
  console.error("[sync] error:", e);
  process.exit(1);
});