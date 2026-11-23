/*
  render_check.js — render the home view (several builds), the selector (every tab, every pick, every level / shiny)
  and the detail view of every unit headlessly (Node vm, stub DOM) against the real data.js. Fails (exit 1) on a
  thrown error, a literal "undefined" / "null" / "NaN" in the visible text, or an <img> / url() pointing at a file
  that is not on disk.
  Usage: node tools/render_check.js     (after tools/build_data.py, before every push)
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const APP = path.join(__dirname, "..");
const el = () => ({ innerHTML: "", scrollTop: 0, value: "", classList: { add() {}, remove() {}, contains() { return false; } },
  style: {}, addEventListener() {}, querySelector() { return null; }, focus() {}, setSelectionRange() {} });
const els = {};
const store = {};
const ctx = { window: {}, console, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  history: { pushState() {}, back() {} }, addEventListener() {}, matchMedia: () => ({ matches: true }),
  document: { querySelector: (s) => els[s] || (els[s] = el()) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(APP, "data.js"), "utf8"), ctx);
ctx.BS_DATA = ctx.window.BS_DATA;
const src = fs.readFileSync(path.join(APP, "app.js"), "utf8").replace('"use strict";', "").replace("const D = window.BS_DATA;", "const D = BS_DATA;");
vm.runInContext(src + "\n;globalThis.__app = { state, renderApp, openSelector, renderSelector, openDetail, renderDetail, TABS, D, layers, detStack };", ctx);
const A = ctx.__app, D = A.D;

const problems = [];
let n = 0;
function scan(where, html) {
  n++;
  if (!html) return problems.push(`${where}: empty`);
  for (const m of html.matchAll(/(?:src="|url\()([^")?]+)/g)) {
    if (!m[1].startsWith("assets/")) continue;
    if (!fs.existsSync(path.join(APP, m[1]))) problems.push(`${where}: missing ${m[1]}`);
  }
  const bad = html.replace(/<[^>]*>/g, " ").match(/\b(undefined|null|NaN)\b/);
  if (bad) problems.push(`${where}: "${bad[0]}"`);
}
function tryRender(where, fn) {
  try { scan(where, fn()); } catch (e) { problems.push(`${where}: threw ${e.stack.split("\n").slice(0, 2).join(" ")}`); }
}
const reset = () => { A.layers.length = 0; A.detStack.length = 0; A.state.sel = null; A.state.det = null; };

// home: empty, then each set with a full team of that set, all trinkets of the set, a trainer
const builds = [{ set: "starter", trainer: null, team: [null, null, null, null, null, null], trinkets: [] }];
for (const s of D.sets) {
  const sp = D.species.filter((x) => x.set === s.id);
  for (let i = 0; i < sp.length; i += 6) builds.push({ set: s.id, trainer: D.trainers[i % D.trainers.length].id,
    team: [0, 1, 2, 3, 4, 5].map((k) => (sp[i + k] ? { id: sp[i + k].id, lv: (k % 4) + 1, shiny: k % 2 === 1 } : null)),
    trinkets: D.trinkets.filter((t) => !t.sets || t.sets.includes(s.id)).slice((i / 6) * 5 % 90, (i / 6) * 5 % 90 + 5).map((t) => t.id) });
}
for (const b of builds) {
  A.state.build = JSON.parse(JSON.stringify(b));
  tryRender(`home ${b.set} ${b.team.map((x) => x && x.id).join(",")}`, () => { A.renderApp(); return els["#app"].innerHTML; });
}
// selector: every tab, every pick, each level and shiny
A.state.build = JSON.parse(JSON.stringify(builds[1]));
for (const [tab] of A.TABS) {
  reset();
  A.openSelector("browse");
  A.state.sel.tab = tab;
  const list = tab === "species" ? D.species : tab === "trinket" ? D.trinkets : tab === "item" ? D.items : D.trainers;
  for (const r of list) for (const lv of tab === "species" ? [1, 2, 3, 4] : [1]) for (const shiny of tab === "species" && r.shiny ? [false, true] : [false]) {
    Object.assign(A.state.sel, { pick: tab + ":" + r.id, lv, shiny });
    tryRender(`selector ${tab}:${r.id} lv${lv}${shiny ? " shiny" : ""}`, () => { A.renderSelector(); return els["#overlay-root"].innerHTML; });
  }
}
// detail: every unit
for (const [tab] of A.TABS) {
  const list = tab === "species" ? D.species : tab === "trinket" ? D.trinkets : tab === "item" ? D.items : D.trainers;
  for (const r of list) {
    reset();
    tryRender(`detail ${tab}:${r.id}`, () => { A.openDetail(tab + ":" + r.id); return els["#detail-overlay-root"].innerHTML; });
  }
}
if (problems.length) {
  console.log(problems.slice(0, 40).join("\n"));
  console.log(`${problems.length} problems in ${n} renders`);
  process.exit(1);
}
console.log(`render_check: ${n} renders, 0 problems`);
