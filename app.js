"use strict";
/* Batomon Showdown Planner. Home = the build (trainer, 6-slot team board, trinkets) and the links it makes;
   selector overlay on #overlay-root, detail overlay on #detail-overlay-root. Vanilla, explicit re-render,
   one delegated click handler per root. Data: data.js (tools/build_data.py <- _bs_extract/data/entities.json). */

const D = window.BS_DATA;
const FEATURES = { suggestions: true };

// ---------- indexes
const H = {
  species: new Map(D.species.map((s) => [s.id, s])),
  trinket: new Map(D.trinkets.map((t) => [t.id, t])),
  item: new Map(D.items.map((t) => [t.id, t])),
  trainer: new Map(D.trainers.map((t) => [t.id, t])),
  type: new Map(D.types.map((t) => [t.id, t])),
  set: new Map(D.sets.map((s) => [s.id, s])),
};
const RARITY = ["Common", "Uncommon", "Rare", "Super Rare", "Legendary", "Mythical"];
const RKEY = ["common", "uncommon", "rare", "super_rare", "legendary", "mythic"];
const SLOT_MARK = { 4: "crown_marker", 2: "flag_marker", 5: "flag_marker", 0: "crest_marker", 3: "crest_marker" };
const linksFrom = new Map(), linksTo = new Map();
const L = D.links.map(([kind, ch, from, pf, to, cf, pos, posOf, gate, shiny, via]) =>
  ({ kind, ch, from, pf, to, cf, pos, posOf, gate, shiny, via, pu: D.effects[from][0], cu: D.effects[to][0] }));
for (const l of L) {
  (linksFrom.get(l.pu) || linksFrom.set(l.pu, []).get(l.pu)).push(l);
  (linksTo.get(l.cu) || linksTo.set(l.cu, []).get(l.cu)).push(l);
}
const edgesOf = new Map();
for (const [a, b, score, channels, shinyOnly] of D.edges) {
  if (shinyOnly) continue;
  for (const [x, y] of [[a, b], [b, a]]) (edgesOf.get(x) || edgesOf.set(x, []).get(x)).push({ other: y, score, channels });
}

function unitOf(key) {
  const [kind, id] = key.split(":");
  if (kind === "event") return null;
  return { kind, id, rec: H[kind] && H[kind].get(id) };
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const img = (src, cls = "", alt = "") => (src ? `<img class="${cls}" src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async">` : "");
const nameOf = (key) => {
  const u = unitOf(key);
  if (u && u.rec) return u.rec.name;
  if (key.startsWith("event:")) {
    const [ev, ix] = key.slice(6).split(".");
    const e = D.events.find((x) => x.id === ev);
    return e ? e.options[+ix].text : key;
  }
  return key;
};
const tierOf = (key) => { const u = unitOf(key); return u && u.rec && u.rec.tier; };
const iconOf = (key, shiny) => {
  const u = unitOf(key);
  if (!u || !u.rec) return "";
  if (u.kind === "species") return shiny && u.rec.shiny && u.rec.shiny.img ? u.rec.shiny.img : u.rec.img;
  return u.rec.img;
};

// channel display names: the shared-type layer reads as the gate ("Toxic allies")
const GATE = (g) => (g || []).map((x) => H.type.get(x)?.name || ({ t1: "Common", t2: "Uncommon", t3: "Rare", t4: "Super Rare",
  t5: "Legendary", t6: "Mythical", noability: "No-ability", cd5: "Slow (5 s+)", lv3: "Level 3+" })[x] || x).join(" / ");
const chLabel = (l) => (l.kind === "type" ? `${GATE(l.gate)} ally` : l.ch);
// item families (build_data.py: the shared effect class the item script extends)
const FAM = [["potion", "Potion"], ["ticket", "Ticket"], ["gift", "Gift"], ["type_boost", "Type boost"], ["berry", "Berry"]];
const POS = { adj: "adjacent", above: "above", behind: "behind", front: "in front", row: "same row" };
const posLabel = (p) => (!p ? "" : p.startsWith("slot:") ? "slot " + p.slice(5).replace(/,/g, " / ") : POS[p] || p);
const STATC = { Damage: "damage", Heal: "heal", Shield: "shield", Burn: "burn", Poison: "poison", Shock: "shock",
  "Inflict Burn": "burn", "Inflict Poison": "poison", "Inflict Shock": "shock", "Apply Shield": "shield",
  "Cooldown Speed": "cd", Charge: "cd", Multicast: "cast", Cast: "cast", Trigger: "cast", "Knock Out": "ko" };
const chHtml = (l) => {
  const c = STATC[l.ch];
  if (l.kind === "type" && l.gate && l.gate.length === 1 && H.type.get(l.gate[0]))
    return `<span class="ch" style="color:${H.type.get(l.gate[0]).color}">${esc(chLabel(l))}</span>`;
  return `<span class="ch"${c ? ` style="color:var(--s-${c})"` : ""}>${esc(chLabel(l))}</span>`;
};

// ---------- search terms per unit: the effect types its effects carry (channel, and verb + channel: "emits Burn") and
// the interactions it takes part in (link label + position, either side); TERMS feeds the search box's suggestions
const SEARCH = new Map(), TERMS = new Set();
const addS = (k, t) => SEARCH.set(k, (SEARCH.get(k) || "") + " | " + t.toLowerCase());
for (const [unit, , fs] of Object.values(D.effects)) for (const [fa, ch] of fs) { addS(unit, `${ch} ${fa} ${ch}`); TERMS.add(ch); }
for (const l of L) {
  const t = chLabel(l) + (l.pos ? " " + posLabel(l.pos) : "");
  addS(l.pu, t); addS(l.cu, t); TERMS.add(chLabel(l));
}
document.querySelector("#terms").innerHTML = [...TERMS].sort().map((t) => `<option value="${esc(t)}">`).join("");

// ---------- state (saved build)
const SAVE = "bs.build.v1";
function makeBuild() {
  return { set: "starter", trainer: null, team: [null, null, null, null, null, null], trinkets: [], items: [] };
}
const state = {
  build: Object.assign(makeBuild(), JSON.parse(localStorage.getItem(SAVE) || "null") || {}),
  sel: null,   // selector: {target: "slot"|"trinket"|"item"|"trainer", slot, tab, q, tiers:Set, types:Set, pick}
  det: null,   // detail: {key, lv, shiny, shelf: [list, index] when opened from a shelf}
};
const save = () => localStorage.setItem(SAVE, JSON.stringify(state.build));

// ---------- board geometry (res://utils/utils.gd:4-10, 63-106): col = i % 3, row = floor(i / 3), row 1 on top;
// "behind" = i + 1 and "in front" = i - 1 in the same row, "above" = i + 3; adjacent = grid distance 1
const col = (i) => i % 3, row = (i) => Math.floor(i / 3);
function rel(owner, other, scope, cable) {
  if (owner == null || other == null) return false;
  if (scope === "adj") return cable || Math.abs(col(owner) - col(other)) + Math.abs(row(owner) - row(other)) === 1;
  if (scope === "above") return other === owner + 3;
  if (scope === "behind") return other === owner + 1 && row(other) === row(owner);
  if (scope === "front") return other === owner - 1 && row(other) === row(owner);
  if (scope === "row") return row(other) === row(owner) && other !== owner;
  return false;
}

// units in the build: key -> [{slot, shiny}]
function buildUnits() {
  const b = state.build, m = new Map();
  const add = (k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  b.team.forEach((s, i) => s && add("species:" + s.id, { slot: i, shiny: !!s.shiny, lv: s.lv || 1 }));
  b.trinkets.forEach((id) => add("trinket:" + id, {}));
  b.items.forEach((id) => add("item:" + id, {}));
  if (b.trainer) add("trainer:" + b.trainer, {});
  return m;
}
// a species' normal ability is replaced by its shiny one when the shiny has its own tags
function effectLive(eid, inst) {
  if (eid.startsWith("shiny:")) return !!inst.shiny;
  if (eid.startsWith("ability:") && D.effects["shiny:" + eid.slice(8)]) return !inst.shiny;
  return true;
}
// links among the build: [{l, ok, pi, ci}] ok = position satisfied (or none needed)
function buildLinks() {
  const units = buildUnits(), cable = state.build.trinkets.includes("link_cable"), out = [], seen = new Set();
  for (const [pk, pis] of units) for (const l of linksFrom.get(pk) || []) {
    const cis = units.get(l.cu);
    if (!cis) continue;
    for (const pi of pis) for (const ci of cis) {
      if (pk === l.cu && pi === ci) continue;
      if (!effectLive(l.from, pi) || !effectLive(l.to, ci)) continue;
      let ok = true;
      if (l.pos) {
        if (l.pos.startsWith("slot:")) {
          const slots = l.pos.slice(5).split(",").map(Number), who = l.posOf === "from" ? ci : pi;
          ok = who.slot != null && slots.includes(who.slot);
        } else ok = l.posOf === "from" ? rel(pi.slot, ci.slot, l.pos, cable) : rel(ci.slot, pi.slot, l.pos, cable);
      }
      const k = [l.from, l.to, l.ch, l.kind, pi.slot, ci.slot].join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ l, ok, pi, ci });
    }
  }
  return out;
}

// ---------- level text: the game prints only the current level's number (get_description uses *_per_level[level-1])
function levelText(text, lv) {
  if (!text) return "";
  return esc(text).replace(/([+-]?)(\d[\d.,]*[x%]?)\/(\d[\d.,]*[x%]?)\/(\d[\d.,]*[x%]?)\/(\d[\d.,]*[x%]?)(%?)/g,
    (m, sign, a, b, c, d, pct) => {
      // "100/200/300/1200%" and "1x/2x/3x/12x": the unit written once at the end belongs to every value
      let v = [a, b, c, d][lv - 1];
      const unit = (d.match(/[x%]$/) || [""])[0];
      if (unit && !v.endsWith(unit)) v += unit;
      return `<span class="v">${sign}${v}${pct}</span>`;
    });
}

// sell value (monster_instance.gd:221-283): ceil(cost x level multiplier / 2); multiplier 1 / 3 / 6, level capped at 3
// (SELL_VALUE_MAX_LEVEL); unlimited-level monsters use 2^(level-1)
function sellValue(sp, lv) {
  const l = Math.min(Math.max(lv, 1), 3);
  const mult = sp.unl ? 1 << (l - 1) : l === 2 ? 3 : l >= 3 ? 6 : 1;
  return Math.ceil((sp.cost * mult) / 2);
}

// ---------- the game's tooltip (description_box.tscn): frame tinted by rarity, header, sprite + types, cast stats, text
function tooltip(key, lv = 1, shiny = false) {
  const u = unitOf(key), r = u.rec, t = r.tier || 1;
  const frame = `style="border-image-source:url(${D.ui["frame_r" + t]})"`;
  let gfx = "", cast = "", text;
  if (u.kind === "species") {
    const v = shiny && r.shiny && r.shiny.stats[0] ? r.shiny : r; // NULL-00's shiny has no stat block of its own
    const st = v.stats[lv - 1] || v.stats[0];
    const types = r.types.map((ty) => { const T = H.type.get(ty); return `<span class="tlabel" style="background-image:url(${T.bg})">${esc(T.name)}</span>`; }).join("");
    gfx = `<div class="tip-gfx section"><div class="spr inner">${img(iconOf(key, shiny), "", r.name)}</div><div class="types">${types}</div></div>`;
    const lines = [["damage", "Deal", "Damage"], ["shield", "Shield", ""], ["heal", "Heal", ""], ["burn", "Burn", ""],
      ["poison", "Poison", ""], ["shock", "Shock", ""]].filter(([k]) => st[k])
      .map(([k, a, b]) => `<span style="color:var(--s-${k === "damage" ? "damage" : k})">${a} ${st[k]}${b ? " " + b : ""}</span>`);
    if (st.cast_ct > 1) lines.push(`<span style="color:var(--s-cast)">Casts: ${st.cast_ct}</span>`);
    cast = `<div class="cast section"><div class="cd inner">${st.cooldown.toFixed(1)}<br>s</div><div class="stl">${lines.join("")}</div></div>`;
    text = (shiny && r.shiny ? r.shiny.ab.text : null) || r.ab.text;
    if (shiny && r.shiny && r.shiny.ab.text && /^(Same|Also|Does it|Every adjacent|Only|On Battle|Rarity)/.test(r.shiny.ab.text))
      text = r.ab.text + " " + (r.shiny.ab.text.startsWith("Same") ? "" : r.shiny.ab.text);
  } else {
    const label = u.kind === "trainer" ? "" : `<span class="tlabel" style="background-image:url(${D.ui["type_" + u.kind] || D.ui.type_trinket})">${u.kind}</span>`;
    gfx = u.kind === "trainer" ? `<div class="tip-gfx art section"><div class="spr">${img(r.img, "", r.name)}</div></div>`
      : `<div class="tip-gfx section"><div class="spr inner">${img(r.img, "", r.name)}</div><div class="types">${label}</div></div>`;
    text = r.text;
  }
  const sell = u.kind === "species" ? `<span class="sv">$${sellValue(r, lv)}</span>` : u.kind === "item" && r.cost ? `<span class="sv">$${r.cost}</span>` : "";
  const rar = u.kind === "trainer" ? "" : `<span>${RARITY[t - 1]}</span>`;
  return `<div class="tip panel"><div class="tip-frame" ${frame}><div class="tip-head"><span class="grow">${esc(r.name)}</span>${sell}${rar}</div>
    <div class="tip-body">${gfx}${cast}<div class="desc section">${text ? levelText(text, lv) : "&nbsp;"}</div></div></div></div>`;
}

// ---------- link lists for one unit (detail page): producers that feed it, consumers it feeds
function linkLists(key, shiny) {
  const live = (eid) => effectLive(eid, { shiny });
  const group = (arr, side) => {
    const by = new Map();
    for (const l of arr) {
      if (side === "in" ? !live(l.to) : !live(l.from)) continue;
      if (l.pu === l.cu) continue;
      const other = side === "in" ? l.pu : l.cu;
      const k = chLabel(l) + "|" + (l.pos || "");
      const g = by.get(k) || by.set(k, { l, keys: new Set() }).get(k);
      g.keys.add(other);
    }
    return [...by.values()].sort((a, b) => b.keys.size - a.keys.size);
  };
  const row = (g) => `<div class="row">${chHtml(g.l)}${g.l.pos ? `<span class="pos">${esc(posLabel(g.l.pos))}</span>` : ""}
    ${[...g.keys].sort((a, b) => (tierOf(a) || 0) - (tierOf(b) || 0)).map(chip).join("")}</div>`;
  const ins = group(linksTo.get(key) || [], "in"), outs = group(linksFrom.get(key) || [], "out");
  const graph = D.graph.filter(([, a, b]) => a === key || b === key).map(([k, a, b]) =>
    `<div class="row"><span class="ch">${k === "evolves" ? (a === key ? "Evolves into" : "Evolves from") : a === key ? "Grants" : "Granted by"}</span>${chip(a === key ? b : a)}</div>`);
  return `<div class="links">${outs.length ? `<h3>Feeds</h3>${outs.map(row).join("")}` : ""}
    ${ins.length ? `<h3>Fed by</h3>${ins.map(row).join("")}` : ""}${graph.length ? `<h3>Line</h3>${graph.join("")}` : ""}</div>`;
}
function chip(key) {
  const t = tierOf(key);
  return `<button class="chip" data-open="${esc(key)}">${img(iconOf(key), "", "")}<span class="${t ? "r" + t : ""}">${esc(nameOf(key))}</span></button>`;
}

// ---------- home
const app = document.querySelector("#app");
function renderApp() {
  const b = state.build, tr = b.trainer && H.trainer.get(b.trainer);
  const bl = buildLinks();
  const hl = new Set();
  const face = tr ? `<span class="face">${img(tr.img, "", tr.name)}</span>` : `<span class="face empty">+</span>`;
  const sets = D.sets.filter((s) => !s.hidden).map((s) =>
    `<button class="tog ${b.set === s.id ? "on" : ""}" data-act="set" data-id="${s.id}">${esc(s.name)}</button>`).join("");
  const order = [5, 4, 3, 2, 1, 0]; // top row then bottom row, front (slot 0 / 3) on the right
  const markers = new Set();
  for (const l of bl) if (l.l.pos && l.l.pos.startsWith("slot:")) l.l.pos.slice(5).split(",").forEach((s) => markers.add(+s));
  const slots = order.map((i) => {
    const s = b.team[i];
    if (!s) return `<button class="slot empty" data-act="slot" data-slot="${i}" aria-label="Slot ${i}"></button>`;
    const sp = H.species.get(s.id);
    const mk = markers.has(i) && SLOT_MARK[i] ? img(D.ui[SLOT_MARK[i]], "mk") : "";
    return `<button class="slot" data-act="slot" data-slot="${i}">${img(iconOf("species:" + s.id, s.shiny), "mon", sp.name)}<span class="lvb">${s.lv || 1}</span>${mk}</button>`;
  }).join("");
  // shelves (trinkets owned, items used): one tile per copy, + opens the selector on that tab
  const shelf = (list, kind) => b[list].map((id, i) => `<button class="tk inner" data-act="tk" data-list="${list}" data-i="${i}">${img(H[kind].get(id).img, "", H[kind].get(id).name)}</button>`).join("") +
    `<button class="tk add inner" data-act="tk-add" data-kind="${kind}" aria-label="Add ${kind}">+</button>`;
  const on = bl.filter((x) => x.ok), off = bl.filter((x) => !x.ok);
  // grouped by the unit that receives: consumer <- channel (position): providers
  const grouped = (arr) => {
    const by = new Map();
    for (const x of arr) {
      const k = x.l.cu + "|" + chLabel(x.l) + "|" + (x.l.pos || "");
      const g = by.get(k) || by.set(k, { l: x.l, from: new Set() }).get(k);
      g.from.add(x.l.pu);
    }
    return [...by.values()].map((g) => `<div class="lk">${chip(g.l.cu)}<span class="arr">◂</span>${chHtml(g.l)}${g.l.pos ? `<span class="pos">${esc(posLabel(g.l.pos))}</span>` : ""}
      <span class="from">${[...g.from].map(chip).join("")}</span></div>`).join("");
  };
  let fits = "";
  if (FEATURES.suggestions) {
    const units = buildUnits(), score = new Map();
    for (const k of units.keys()) for (const e of edgesOf.get(k) || []) {
      if (units.has(e.other) || !inSet(e.other)) continue;
      score.set(e.other, (score.get(e.other) || 0) + e.score);
    }
    const top = (kind, n) => [...score].filter(([k]) => k.startsWith(kind + ":")).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => chip(k)).join("");
    if (score.size) fits = `<section class="section o-links"><div class="lk-group"><h3>Fits this build</h3><div class="fits">${top("species", 10)}</div><div class="fits">${top("trinket", 6)}</div><div class="fits">${top("item", 6)}</div></div></section>`;
  }
  app.innerHTML = `<header class="top"><h1>Batomon Showdown</h1><div class="setsw">${sets}</div></header>
  <div class="wrap">
    <div class="col col-side">
      <section class="panel"><button data-act="trainer" class="facebtn hpanel"><div class="hdr yellow tall">${tr ? esc(tr.name) : "Trainer"}</div>
        <div class="trainer-body"><span class="portrait">${face}</span>${tr ? `<div class="desc section">${esc(tr.text || "")}</div>` : ""}</div></button></section>
      <section class="panel hpanel o-shelf"><div class="hdr yellow">Trinkets</div><div class="shelf">${shelf("trinkets", "trinket")}</div></section>
      <section class="panel hpanel o-shelf"><div class="hdr">Items</div><div class="shelf">${shelf("items", "item")}</div></section>
    </div>
    <div class="col col-team"><section class="panel hpanel o-team"><div class="hdr">Team</div><div class="board">${slots}</div></section></div>
    <div class="col col-links">
      ${bl.length ? `<section class="section o-links">${on.length ? `<div class="lk-group"><h3>Linked</h3>${grouped(on)}</div>` : ""}
        ${off.length ? `<div class="lk-group off"><h3>Move to link</h3>${grouped(off)}</div>` : ""}</section>` : ""}
      ${fits}
    </div>
  </div>`;
  // trainer mugshot: the game's 120x80 crop region (tr.crop), sprite drawn at 1 sprite px = 1 game px = --u
  const f = app.querySelector(".face img");
  if (f && tr) {
    f.style.left = `calc(${-tr.crop[0]} * var(--u))`; f.style.top = `calc(${-tr.crop[1]} * var(--u))`;
    f.style.width = `calc(${tr.size[0]} * var(--u))`;
  }
}
function inSet(key, s = state.build.set) {
  const u = unitOf(key);
  if (!u || !u.rec) return false;
  const r = u.rec;
  // "common" species (all Mythicals, some shared rares) belong to every region
  if (u.kind === "species") return (r.set === s || r.set === "common") && (r.pool.length ? r.pool.includes(s) : true) && r.dex;
  if (u.kind === "trinket" || u.kind === "trainer") return !r.sets || !r.sets.length || r.sets.includes(s);
  return true;
}

// ---------- selector overlay
const ovl = document.querySelector("#overlay-root"), det = document.querySelector("#detail-overlay-root");
const TABS = [["species", "Monsters"], ["trinket", "Trinkets"], ["item", "Items"], ["trainer", "Trainers"]];
function openSelector(target, slot) {
  const tab = target === "trinket" || target === "item" || target === "trainer" ? target : "species";
  const cur = target === "slot" && state.build.team[slot] ? "species:" + state.build.team[slot].id : target === "trainer" && state.build.trainer ? "trainer:" + state.build.trainer : null;
  state.sel = { target, slot, tab, q: "", tiers: new Set(), types: new Set(), fams: new Set(), mono: false, pick: cur, lv: (target === "slot" && state.build.team[slot]?.lv) || 1,
    shiny: !!(target === "slot" && state.build.team[slot]?.shiny), region: state.build.set };
  pushLayer("sel");
  renderSelector(true);
}
function selList() {
  const s = state.sel, terms = s.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const src = s.tab === "species" ? D.species : s.tab === "trinket" ? D.trinkets : s.tab === "item" ? D.items : D.trainers;
  return src.filter((r) => {
    const key = s.tab + ":" + r.id;
    if (!inSet(key, s.tab === "species" ? s.region : undefined)) return false;
    if (s.tab === "trainer" && !r.pool) return false;
    if (terms.length) {
      // every word must hit the name, the text (shiny's too), an effect type or an interaction
      const hay = [r.name, r.text, r.ab?.text, r.shiny?.ab?.text, SEARCH.get(key)].filter(Boolean).join(" | ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    if (s.tiers.size && !s.tiers.has(r.tier)) return false;
    if (s.types.size && !(r.types || []).some((t) => s.types.has(t))) return false;
    if (s.mono && (r.types || []).length !== 1) return false;
    if (s.tab === "item" && s.fams.size && !s.fams.has(r.fam)) return false;
    return true;
  }).sort((a, b) => (a.tier || 0) - (b.tier || 0) || a.name.localeCompare(b.name));
}
function renderSelector(fresh, bodyOnly) {
  const s = state.sel;
  const scrollers = [".ovl-scroll", ".ovl-info"].map((q) => ovl.querySelector(q)?.scrollTop || 0);
  const inBuild = buildUnits();
  const tabs = TABS.filter(([k]) => s.target === "browse" || k === s.tab || (s.target === "slot" && k === "species"))
    .map(([k, n]) => `<button class="tog ${s.tab === k ? "on" : ""}" data-act="tab" data-id="${k}">${n}</button>`).join("");
  const tiers = s.tab === "trainer" ? "" : RKEY.map((r, i) => `<button class="fchip ${s.tiers.has(i + 1) ? "on" : ""}" data-act="tier" data-id="${i + 1}" style="background-image:url(${D.ui["rarity_" + r]})">${RARITY[i]}</button>`).join("");
  const regions = s.tab !== "species" ? "" : D.sets.filter((x) => !x.hidden).map((x) =>
    `<button class="tog ${s.region === x.id ? "on" : ""}" data-act="region" data-id="${x.id}">${esc(x.name)}</button>`).join("");
  const fams = s.tab !== "item" ? "" : FAM.map(([id, n]) => `<button class="tog fmono ${s.fams.has(id) ? "on" : ""}" data-act="fam" data-id="${id}">${n}</button>`).join("");
  const types = s.tab !== "species" ? "" : `<button class="tog fmono ${s.mono ? "on" : ""}" data-act="mono">Mono</button>` + D.types.filter((t) => t.id !== "all" && t.id !== "null").map((t) =>
    `<button class="fchip ${s.types.has(t.id) ? "on" : ""}" data-act="type" data-id="${t.id}" style="background-image:url(${t.bg})">${esc(t.name)}</button>`).join("");
  const cells = selList().map((r) => {
    const key = s.tab + ":" + r.id;
    return `<button class="cell inner ${s.pick === key ? "sel" : ""} ${inBuild.has(key) ? "inb" : ""}" data-act="pick" data-key="${key}">
      ${img(r.img, "", r.name)}<span class="nm r${r.tier || 1}">${esc(r.name)}</span></button>`;
  }).join("");
  let info = "", foot = "";
  if (s.pick) {
    const isSp = s.pick.startsWith("species:");
    const lvbar = isSp ? `<div class="lvbar">${[1, 2, 3, 4].map((n) => `<button class="tog lv ${s.lv === n ? "on" : ""}" data-act="lv" data-id="${n}">Lv ${n}</button>`).join("")}
      ${H.species.get(s.pick.slice(8)).shiny ? `<button class="tog lv ${s.shiny ? "on" : ""}" data-act="shiny">Shiny</button>` : ""}</div>` : "";
    info = `<div class="ovl-info">${tooltip(s.pick, s.lv, s.shiny)}${lvbar}${linkLists(s.pick, s.shiny)}</div>`;
    const placeable = s.target !== "browse";
    foot = `<div class="ovl-foot">${s.target === "slot" && state.build.team[s.slot] ? `<button class="btn red" data-act="remove">Remove</button>` : ""}
      ${placeable ? `<button class="btn" data-act="place">${s.target === "trinket" || s.target === "item" ? "Add" : "Place"}</button>` : ""}</div>`;
  }
  const body = `<div class="ovl-body ${s.pick ? "picked" : ""}"><div class="ovl-scroll"><div class="grid">${cells}</div></div>${info}</div>${foot}`;
  if (bodyOnly && ovl.querySelector(".ovl-head")) {
    // typing: refresh results only, so the search field (and its suggestion list) stays put
    ovl.querySelectorAll(".ovl-body, .ovl-foot").forEach((el) => el.remove());
    ovl.querySelector(".ovl").insertAdjacentHTML("beforeend", body);
    return;
  }
  ovl.innerHTML = `<div class="ovl" role="dialog" aria-modal="true">
    <div class="ovl-head"><button class="btn red" data-act="close">Back</button>${tabs}${regions ? `<div class="setsw">${regions}</div>` : ""}
      <input class="search" type="search" list="terms" placeholder="Search" value="${esc(s.q)}">
      <div class="filters">${tiers}</div>${types || fams ? `<div class="filters">${types || fams}</div>` : ""}</div>
    ${body}</div>`;
  ovl.classList.remove("hidden");
  [".ovl-scroll", ".ovl-info"].forEach((q, i) => { const el = ovl.querySelector(q); if (el) el.scrollTop = scrollers[i]; });
  const input = ovl.querySelector(".search");
  const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (fresh && input && !isTouch) input.focus();
}
function place() {
  const s = state.sel, b = state.build;
  if (!s.pick) return;
  const [kind, id] = s.pick.split(":");
  if (s.target === "slot" && kind === "species") b.team[s.slot] = { id, lv: s.lv, shiny: s.shiny };
  else if (s.target === "trinket" && kind === "trinket") b.trinkets.push(id);
  else if (s.target === "item" && kind === "item") b.items.push(id);
  else if (s.target === "trainer" && kind === "trainer") b.trainer = id;
  save();
  closeTop();
  renderApp();
}

// ---------- detail overlay
const detStack = []; // detail pages opened from one another: Back walks back through them
function openDetail(key, shelf) {
  if (state.det) detStack.push(state.det);
  state.det = { key, lv: 1, shiny: false, shelf, scroll: 0 };
  pushLayer("det");
  renderDetail(true);
}
function renderDetail(fresh) {
  const d = state.det, keep = fresh ? d.scroll : det.querySelector(".detail-main")?.scrollTop || 0;
  const sp = d.key.startsWith("species:") && H.species.get(d.key.slice(8));
  const lvbar = sp ? `<div class="lvbar">${[1, 2, 3, 4].map((n) => `<button class="tog lv ${d.lv === n ? "on" : ""}" data-act="dlv" data-id="${n}">Lv ${n}</button>`).join("")}
    ${sp.shiny ? `<button class="tog lv ${d.shiny ? "on" : ""}" data-act="dshiny">Shiny</button>` : ""}</div>` : "";
  det.innerHTML = `<div class="ovl" role="dialog" aria-modal="true"><div class="ovl-head"><button class="btn red" data-act="close">Back</button><span class="grow"></span>${d.shelf != null ? `<button class="btn yellow" data-act="tk-remove">Remove</button>` : ""}</div>
    <div class="ovl-body"><div class="detail-main ovl-scroll">${tooltip(d.key, d.lv, d.shiny)}${lvbar}${linkLists(d.key, d.shiny)}</div></div></div>`;
  det.classList.remove("hidden");
  const main = det.querySelector(".detail-main");
  if (main) main.scrollTop = keep;
}

// ---------- layer-aware Back: one history entry per open layer; Back closes the top one
const layers = [];
function pushLayer(name) { layers.push(name); history.pushState({ layer: layers.length }, ""); }
function closeLayer() {
  const top = layers.pop();
  if (top === "det") {
    state.det = detStack.pop() || null;
    if (state.det) return renderDetail(true);
    det.classList.add("hidden"); det.innerHTML = "";
  }
  else if (top === "sel") { ovl.classList.add("hidden"); ovl.innerHTML = ""; state.sel = null; }
}
function closeTop() { if (layers.length) history.back(); }
addEventListener("popstate", () => { if (layers.length) closeLayer(); });
addEventListener("keydown", (e) => { if (e.key === "Escape") closeTop(); });

// ---------- events (one delegated handler per root)
app.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act],[data-open]");
  if (!t) return;
  if (t.dataset.open) return openDetail(t.dataset.open);
  const a = t.dataset.act, b = state.build;
  if (a === "set") { b.set = t.dataset.id; save(); renderApp(); }
  else if (a === "slot") openSelector("slot", +t.dataset.slot);
  else if (a === "trainer") openSelector("trainer");
  else if (a === "tk-add") openSelector(t.dataset.kind);
  else if (a === "tk") { const list = t.dataset.list, i = +t.dataset.i; openDetail((list === "items" ? "item:" : "trinket:") + b[list][i], [list, i]); }
});
ovl.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act],[data-open]");
  if (!t) return;
  if (t.dataset.open) return openDetail(t.dataset.open);
  const s = state.sel, a = t.dataset.act;
  if (a === "close") return closeTop();
  if (a === "tab") { s.tab = t.dataset.id; s.pick = null; s.types.clear(); s.fams.clear(); s.mono = false; }
  else if (a === "tier") { const n = +t.dataset.id; s.tiers.has(n) ? s.tiers.delete(n) : s.tiers.add(n); }
  else if (a === "type") { const n = t.dataset.id; s.types.has(n) ? s.types.delete(n) : s.types.add(n); }
  else if (a === "fam") { const n = t.dataset.id; s.fams.has(n) ? s.fams.delete(n) : s.fams.add(n); }
  else if (a === "mono") s.mono = !s.mono;
  else if (a === "pick") { s.pick = s.pick === t.dataset.key ? null : t.dataset.key; }
  else if (a === "region") { s.region = t.dataset.id; s.pick = null; }
  else if (a === "lv") s.lv = +t.dataset.id;
  else if (a === "shiny") s.shiny = !s.shiny;
  else if (a === "place") return place();
  else if (a === "remove") { state.build.team[s.slot] = null; save(); closeTop(); return renderApp(); }
  renderSelector();
});
ovl.addEventListener("input", (e) => {
  if (!e.target.classList.contains("search")) return;
  state.sel.q = e.target.value;
  renderSelector(false, true);
});
det.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act],[data-open]");
  if (!t) return;
  if (t.dataset.open) { state.det.scroll = det.querySelector(".detail-main").scrollTop; return openDetail(t.dataset.open); }
  const d = state.det, a = t.dataset.act;
  if (a === "close") return closeTop();
  if (a === "tk-remove") { state.build[d.shelf[0]].splice(d.shelf[1], 1); save(); renderApp(); detStack.length = 0; return closeTop(); }
  if (a === "dlv") d.lv = +t.dataset.id;
  else if (a === "dshiny") d.shiny = !d.shiny;
  renderDetail();
});
renderApp();
