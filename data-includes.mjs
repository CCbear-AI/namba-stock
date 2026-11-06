// 部署時每支 API 只打包自己會讀到的 data/ 檔案（以前全部 /api/** 都帶整包 data，每版約 75MB，
// 一天部署十幾次把 Vercel Function Storage 10GB 塞滿）。
// 做法：從每個 app/api/**/route.ts 沿著 import 往下找，用到下面 DATA 表裡的檔案就帶對應的資料。
// 新的程式要讀 data/ 時，記得把它加進 DATA 表；沒加的話 build 會直接報錯提醒（避免上線後讀不到檔）。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** 會讀 data/ 的程式 → 它需要的資料 */
const DATA = {
  "lib/adjust.ts": ["data/exright.json"],
  "lib/bars.ts": ["data/daily/**/*", "data/sector-otc.json"],
  "lib/brokerCls.ts": ["data/broker-class.json"],
  "lib/brokerFlow.ts": ["data/universe.json"],
  "lib/brokerScore.ts": ["data/universe.json"],
  "lib/brokers.ts": ["data/brokers/**/*", "data/universe.json"],
  "lib/checkupStore.ts": ["data/checkup/**/*"],
  "lib/history.ts": ["data/daily/**/*", "data/chips/**/*", "data/ath.json", "data/tdcc/**/*", "data/futures.json"],
  "lib/misStats.ts": ["data/volcurve.json"],
  "lib/news.ts": ["data/news/**/*"],
  "lib/sector.ts": ["data/sector-*.json", "data/taiex-vol.json"],
  "lib/stockNews.ts": ["data/stocknews/**/*"],
  "lib/store.ts": ["data/flow/**/*"],
  "lib/surgeSigs.ts": ["data/surge/**/*"],
  "lib/universe.ts": ["data/universe.json"],
  "app/api/summary/route.ts": ["data/summary/**/*", "data/report/**/*", "data/world/**/*", "data/weekly/**/*"],
  "app/api/surge/route.ts": ["data/surge/**/*"],
};

// 看起來有讀 data/ 的程式（用來抓漏加進 DATA 表的）
const READS_DATA = /["'`]data["'`]|["'`]data\//;

/** @returns {Record<string, string[]>} */
export function dataIncludes(root = process.cwd()) {
  const rel = (f) => path.relative(root, f).split(path.sep).join("/");
  const resolve = (from, spec) => {
    const p = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!p) return null;
    for (const c of [p, `${p}.ts`, `${p}.tsx`, path.join(p, "index.ts"), path.join(p, "index.tsx")]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  };
  const walk = (f, seen) => {
    if (seen.has(f)) return;
    seen.add(f);
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const r = resolve(f, m[1]);
      if (r) walk(r, seen);
    }
  };
  const routes = [];
  const find = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) find(p);
      else if (e.name === "route.ts") routes.push(p);
    }
  };
  find(path.join(root, "app", "api"));

  /** @type {Record<string, string[]>} */
  const out = {};
  const missing = new Set();
  for (const r of routes) {
    const seen = new Set();
    walk(r, seen);
    const files = [...seen].map(rel);
    for (const f of files) {
      if (!DATA[f] && !/\.tsx$/.test(f) && READS_DATA.test(fs.readFileSync(path.join(root, f), "utf8"))) missing.add(f);
    }
    const globs = [...new Set(files.flatMap((f) => DATA[f] ?? []))].sort();
    if (globs.length) out[`/${rel(path.dirname(r)).replace(/^app\//, "")}`] = globs.map((g) => `./${g}`);
  }
  if (missing.size) {
    throw new Error(`這些程式好像會讀 data/，但沒寫進 data-includes.mjs 的 DATA 表：${[...missing].join("、")}`);
  }
  return out;
}

/**
 * Next 會自己追蹤 path.join(process.cwd(), "data") 這種寫法，把整個 data/ 都打包進去，
 * 所以光寫 includes 不夠，還要把「這支 API 用不到的」data 項目排除（Next 先加 includes、最後才套 excludes）。
 * @returns {{ includes: Record<string, string[]>, excludes: Record<string, string[]> }}
 */
export function dataTracing(root = process.cwd()) {
  const includes = dataIncludes(root);
  const routes = routeList(root);
  const entries = fs.readdirSync(path.join(root, "data"), { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }));
  // data/ 底下某一項（檔案或資料夾）有沒有被這組 glob 用到
  const used = (globs, e) => globs.some((g) => {
    const top = g.replace(/^\.\//, "").split("/")[1];
    if (!top.includes("*")) return top === e.name;
    const [pre, post] = top.split("*"); // 只會有一個 *，例如 sector-*.json
    return e.name.startsWith(pre) && e.name.endsWith(post ?? "");
  });
  /** @type {Record<string, string[]>} */
  const excludes = {};
  for (const key of routes) {
    // Next 比對 key 用「包含」：/api/flowlive 也會套到 /api/flowlive/days，所以要所有被套到的 API 都用不到才排除
    const hit = routes.filter((r) => r.includes(key));
    const ex = entries.filter((e) => hit.every((r) => !used(includes[r] ?? [], e)));
    if (ex.length) excludes[key] = ex.map((e) => (e.dir ? `./data/${e.name}/**` : `./data/${e.name}`));
  }
  return { includes, excludes };
}

function routeList(root) {
  const out = [];
  const find = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) find(p);
      else if (e.name === "route.ts") out.push(`/${path.relative(path.join(root, "app"), d).split(path.sep).join("/")}`);
    }
  };
  find(path.join(root, "app", "api"));
  return out;
}

// 直接執行：印出每支 API 會帶哪些資料（node data-includes.mjs）
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(dataTracing(), null, 1));
}
