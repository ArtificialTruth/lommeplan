"use strict";
const DAYS = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];
const DATES = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
const MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const HOME = "DDS Høbjerghus, Høbjerg Hegn 5, 3200 Helsinge";
const ALIEN = '<svg class="alien" viewBox="-18 -18 36 36"><path d="M0 -14 C14 -14 16 4 7 12 C3 16 -3 16 -7 12 C-16 4 -14 -14 0 -14Z" fill="currentColor"/><path d="M-10 -3 Q-4 -1 -3 5 Q-9 5 -11 -1Z" fill="var(--bg)"/><path d="M10 -3 Q4 -1 3 5 Q9 5 11 -1Z" fill="var(--bg)"/></svg>';
const $app = document.getElementById("app");

// ---------- lager ----------
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const S = {
  env: null, data: null, me: null,
  aud: ls.get("lp_aud", "begge"), mine: ls.get("lp_mine") === "1", demo: ls.get("lp_demo") || null,
  over: (() => { try { return JSON.parse(ls.get("lp_over", "{}")); } catch { return {}; } })(),
  claim: (() => { try { return JSON.parse(ls.get("lp_claim", "{}")); } catch { return {}; } })(),
  showPast: false, expand: false, loginErr: "", onb: 0, pw: "", installEv: null, todoTab: "idag",
  todo: (() => { try { return { done: {}, hidden: {}, own: [], ...JSON.parse(ls.get("lp_todo", "{}")) }; } catch { return { done: {}, hidden: {}, own: [] }; } })(),
  cal: { aud: "begge", mine: false, days: [0, 1, 2, 3, 4, 5], skip: [], alarm: 0 },
};
const saveOver = () => ls.set("lp_over", JSON.stringify(S.over));
function applyTheme() {
  const pref = ls.get("lp_theme", "light");
  const dark = pref === "dark" || (pref === "system" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? "#000000" : "#f2f3f5";
}
applyTheme();
const saveClaim = () => ls.set("lp_claim", JSON.stringify(S.claim));
const saveTodo = () => ls.set("lp_todo", JSON.stringify(S.todo));
const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

// ---------- krypto (WebCrypto) ----------
const enc = new TextEncoder(), dec = new TextDecoder();
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const normPw = s => s.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
async function deriveKeyB64(env, pw) {
  const km = await crypto.subtle.importKey("raw", enc.encode(normPw(pw)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64d(env.salt), iterations: env.iter }, km, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
async function decryptData(env, kB64) {
  const key = await crypto.subtle.importKey("raw", b64d(kB64), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(env.iv), additionalData: enc.encode("lommeplan2") }, key, b64d(env.ct));
  return JSON.parse(dec.decode(pt));
}

// ---------- hjælpere ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtD = d => { const [, m, dd] = d.split("-"); return `${+dd}. ${MON[+m - 1]}`; };
const now = () => (S.demo ? new Date(S.demo) : new Date());
const at = (date, hm) => new Date(`${date}T${hm}:00`);
const paras = t => String(t || "").split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("");
const dayIdx = date => DATES.indexOf(date);

function evFull(e) {
  const o = S.over["e:" + e.id] || {};
  return { ...e, start: o.start || e.start, slut: o.slut || e.slut, titel: o.titel || e.titel, note: o.note || "", rettet: !!(o.start || o.slut || o.titel) };
}
const PALIAS = { bondo: "Marie", "mathilde m": "Mathilde", "marie e": "Marie", alsa: "Asla" };
function whoIs(n) { const b = n.replace(/\(.*?\)/g, "").trim(); return PALIAS[b.toLowerCase()] || b; }
function actFull(id) {
  const a = S.data.aktiviteter[id];
  if (!a) return null;
  const o = S.over["a:" + id] || {};
  return { ...a, sted: o.sted || a.sted, ansvarlig: o.ansvarlig || a.ansvarlig, note: o.note || "", rettet: !!(o.sted || o.ansvarlig) };
}
const allEvents = () => S.data.events.map(evFull);
function mineAct(id) {
  const a = S.data.aktiviteter[id]; if (!a) return false;
  const c = S.claim[id]; if (c === 1) return true; if (c === -1) return false;
  return !!(S.me && (a.bemanding.includes(S.me) || a.ansvarligNavne.includes(S.me)));
}
const isMine = e => !!(e.aktivitet && mineAct(e.aktivitet));
function visible(e) {
  if (S.aud === "kursist" && e.maalgruppe !== "kursist") return false;
  if (S.aud === "team" && e.maalgruppe !== "team") return false;
  if (S.mine && e.aktivitet && S.data.aktiviteter[e.aktivitet] && !isMine(e)) return false;
  return true;
}
const dayEvents = date => allEvents().filter(e => e.dato === date && visible(e)).sort((a, b) => a.start.localeCompare(b.start) || a.maalgruppe.localeCompare(b.maalgruppe));
function status(e) {
  const n = now();
  if (at(e.dato, e.slut) <= n) return "past";
  if (at(e.dato, e.start) <= n) return "now";
  return "future";
}
function mapsUrl(sted) {
  const q = /hillerød|helsinge|gribsø|gribskov/i.test(sted || "") ? sted : HOME;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

// ---------- komponenter ----------
function evCard(e, o = {}) {
  const st = o.status || status(e), a = actFull(e.aktivitet), mine = isMine(e);
  const href = e.aktivitet ? `#/a/${e.aktivitet}` : `#/e/${e.id}`;
  const tags = (st === "now" ? '<span class="rec"><i></i>NU</span>' : "") + (mine ? '<span class="chip">★ mine</span>' : "") + (e.maalgruppe === "team" && S.aud === "begge" && !o.lane ? '<span class="chip team">T</span>' : "") + (e.rettet ? '<span class="chip edit">rettet</span>' : "");
  let extra = "";
  if (o.bar && st === "now") {
    const n = now(), s = at(e.dato, e.start), en = at(e.dato, e.slut);
    const pct = Math.min(100, Math.max(0, ((n - s) / (en - s)) * 100)), rem = Math.max(0, Math.round((en - n) / 60000));
    extra = `<div class="bar"><i style="width:${pct}%"></i></div><div class="p">${Math.round(pct)} % · ${Math.floor(rem / 60)} t ${rem % 60} min tilbage</div>`;
  }
  return `<a class="card ${e.maalgruppe === "team" ? "team" : ""} ${st} ${o.big ? "big" : ""}" href="${href}">
    <div class="t">${e.start} – ${e.slut}</div><div class="n">${esc(e.titel.split(" (")[0])}</div>${e.titel.includes(" (") ? `<div class="p">${esc(e.titel.slice(e.titel.indexOf(" (") + 2).replace(/\)$/, ""))}</div>` : ""}
    ${a && a.sted && !/^startsted/i.test(a.sted) ? `<div class="p">📍 ${esc(a.sted)}</div>` : ""}${extra}
    ${tags ? `<div class="tags">${tags}</div>` : ""}${e.aktivitet ? `<button class="star ${mine ? "on" : ""}" data-act="claim:${e.aktivitet}" aria-label="${mine ? "Fjern fra mine" : "Det er min"}">${mine ? "★" : "☆"}</button>` : ""}</a>`;
}
const audSeg = () => `<div class="seg">${[["kursist", "Kursist"], ["begge", "Begge"], ["team", "Team"]].map(([k, l]) => `<button data-act="aud:${k}" class="${S.aud === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
const minePill = () => `<div class="chips"><button class="pill ${S.mine ? "on" : ""}" data-act="mine">★ Kun mine${S.me ? ": " + esc(S.me) : ""}</button>${S.demo ? '<span class="pill">Demo-tid ' + esc(S.demo.replace("T", " ")) + "</span>" : ""}</div>`;
const nav = r => `<nav class="bar2"><div class="in">${[["uge", "▤", "Uge"], ["husk", "☑", "Huskeliste"], ["mine", "★", "Mig"]].map(([k, i, l]) => `<a href="#/${k}" class="${r === k ? "on" : ""}"><i>${i}</i>${l}</a>`).join("")}</div></nav>`;

// ---------- skærme ----------
function weekOverview(sel) {
  const n = now(), today = ymd(n), W = 358, gx = 30, top = 44, ph = 17.5, T0 = 420, T1 = 1380, colw = (W - gx - 8) / 6, H = top + ((T1 - T0) / 60) * ph + 30;
  const yy = m => top + ((m - T0) / 60) * ph, tm = t => +t.slice(0, 2) * 60 + +t.slice(3), nowm = n.getHours() * 60 + n.getMinutes();
  const short = s => s.split(" (")[0].replace("Morgenvæk + Morgenmad", "Vækning").replace("Patruljens halve time", "Pat. ½ time").replace("Patruljens time", "Pat. time").replace("Lang madaktivitet", "Madaktivitet").replace("Afslutning på Høbjerghus", "Afslutning");
  let s = `<svg class="ov" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ugeoverblik">`;
  DAYS.forEach((d, i) => {
    const x = gx + i * colw, on = i === sel;
    s += `<rect class="dayhit" data-act="day:${i}" x="${x - 1}" y="${top - 4}" width="${colw}" height="${H - top - 20}" rx="8" fill="${on ? "none" : "transparent"}" ${on ? 'stroke="var(--act)" stroke-width="2"' : ""}/>`;
    s += `<text class="ov-mu" data-act="day:${i}" x="${x + colw / 2 - 1}" y="${top - 18}" text-anchor="middle" font-size="10" font-weight="800" style="${on ? "fill:var(--act)" : ""}">${d.slice(0, 3)}</text><text class="ov-mu" data-act="day:${i}" x="${x + colw / 2 - 1}" y="${top - 7}" text-anchor="middle" font-size="9">${+DATES[i].slice(8)}</text>`;
  });
  for (let h = 7; h <= 23; h += 2) s += `<line x1="${gx - 2}" x2="${gx + 6 * colw}" y1="${yy(h * 60)}" y2="${yy(h * 60)}" class="ov-grid"/><text class="ov-mu" x="${gx - 6}" y="${yy(h * 60) + 3}" font-size="8" text-anchor="end">${String(h).padStart(2, "0")}</text>`;
  for (const e of allEvents().filter(visible)) {
    const di = dayIdx(e.dato), st = tm(e.start), en = Math.min(tm(e.slut), T1);
    if (di < 0 || en <= st || st < T0) continue;
    const x = gx + di * colw, y = yy(st) + .5, hh = ((en - st) / 60) * ph - 1.5, href = e.aktivitet ? `#/a/${e.aktivitet}` : `#/e/${e.id}`;
    const past = at(e.dato, e.slut) <= n, isNow = at(e.dato, e.start) <= n && n < at(e.dato, e.slut);
    if (e.maalgruppe === "team") { s += `<a href="${href}"><rect class="ov-t ${past ? "ov-past" : ""}" x="${x + colw - 9}" y="${y}" width="7" height="${Math.max(hh, 3)}" rx="2"/></a>`; continue; }
    const wide = S.aud === "kursist" || S.aud === "begge" ? colw - 12 : colw - 4;
    s += `<a href="${href}"><rect class="ov-k ${past ? "ov-past" : ""} ${isNow ? "ov-now" : ""}" x="${x + 1}" y="${y}" width="${wide}" height="${Math.max(hh, 3)}" rx="4"/>`;
    if (hh >= 26) s += `<text class="ov-tx ${past ? "ov-past" : ""}" x="${x + 3.5}" y="${y + 10}" font-size="7" font-weight="700">${esc(short(e.titel).slice(0, 9))}</text>`;
    if (isMine(e) && !past && hh >= 14) s += `<circle cx="${x + colw - 17}" cy="${y + hh - 5}" r="3" class="ov-mine"/>`;
    s += `</a>`;
  }
  if (DATES.includes(today)) {
    const ny = Math.min(Math.max(yy(nowm), top), yy(T1)), hm = String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0");
    s += `<line x1="${gx - 26}" x2="${gx + 6 * colw + 4}" y1="${ny}" y2="${ny}" class="ov-now-line"/><rect x="0" y="${ny - 7}" width="28" height="14" rx="7" class="ov-now-pill"/><text x="14" y="${ny + 3}" font-size="8" font-weight="800" text-anchor="middle" fill="#fff">${hm}</text>`;
  }
  return s + `</svg><div class="ovleg"><span><i class="k"></i>Kursist</span><span><i class="t"></i>Team</span><span><i class="m"></i>Mine</span><span><i class="n"></i>Nu</span><span><i class="p"></i>Færdig</span></div>`;
}
function scrollToDays() { const el = document.querySelector(".days"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
function viewUge(arg) {
  const today = ymd(now());
  let i = arg !== undefined && arg !== "" ? +arg : today > DATES[5] ? 5 : Math.max(0, dayIdx(today));
  if (!(i >= 0 && i < 6)) i = 0;
  const date = DATES[i], ev = dayEvents(date), two = S.aud === "begge" && ev.some(e => e.maalgruppe === "team");
  let h = `<div class="top"><div><h1>Ugen</h1><div class="sub">${fmtD(DATES[0])}–${fmtD(DATES[5])} 2026</div></div>${ALIEN}</div>`;
  h += `<div class="box ovbox"><div class="line" style="padding:0 0 4px"><h2 style="margin:0">Hele ugen</h2><span class="muted" style="font-size:11px">tryk på en dag</span></div>${weekOverview(i)}<button class="fold" data-act="todays" style="margin-top:6px">↓ Dagens program</button></div>`;
  h += `<div class="days">${DAYS.map((d, k) => `<button data-act="day:${k}" class="${k === i ? "on" : ""} ${DATES[k] === today ? "today" : ""} ${DATES[k] < today ? "gone" : ""}">${d.slice(0, 3)}<b>${+DATES[k].slice(8)}</b></button>`).join("")}</div>` + audSeg() + minePill();
  if (two) h += `<div class="lanehead"><span></span><span class="lh" style="color:var(--act)">KURSIST</span><span class="lh" style="color:var(--teamt)">TEAM<button data-act="aud:kursist" style="color:var(--mu)">✕</button></span></div>`;
  const starts = [...new Set(ev.map(e => e.start))].sort();
  h += `<div class="grid ${two ? "two" : ""}">`;
  for (const s of starts) {
    const rowEv = ev.filter(e => e.start === s), past = rowEv.every(e => status(e) === "past");
    h += `<div class="tl ${past ? "past" : ""}" data-s="${s}" data-e="${rowEv.reduce((m, e) => (e.slut > m ? e.slut : m), s)}">${s}</div>`;
    if (two) h += `<div>${rowEv.filter(e => e.maalgruppe === "kursist").map(e => evCard(e, { lane: 1 })).join("")}</div><div>${rowEv.filter(e => e.maalgruppe === "team").map(e => evCard(e, { lane: 1 })).join("")}</div>`;
    else h += `<div>${rowEv.map(e => evCard(e)).join("")}</div>`;
  }
  if (date === today && ev.length) h += `<div class="nowline" id="nowline"><b></b></div>`;
  h += `</div>`;
  if (!ev.length) h += `<div class="box muted">Ingen punkter med disse filtre.</div>`;
  const loose = Object.values(S.data.aktiviteter).filter(a => !S.data.events.some(e => e.aktivitet === a.id));
  if (loose.length && S.aud !== "team") h += `<h2>Uden fast tid</h2>` + loose.map(a => `<a class="card" href="#/a/${a.id}"><div class="t">Hele ugen / løbende</div><div class="n">${esc(a.titel)}</div></a>`).join("");
  return h;
}

function viewAct(id, tab) {
  const a = actFull(id);
  if (!a) return `<a href="#/uge">‹ Tilbage</a><p>Aktiviteten findes ikke.</p>`;
  tab = tab || "resume";
  const evs = allEvents().filter(e => e.aktivitet === id);
  const doc = S.data.events.find(e => e.aktivitet === id && e.docUrl);
  const when = evs.length ? evs.map(e => `${DAYS[dayIdx(e.dato)]} ${e.start}–${e.slut}`).join(" · ") : a.tidTekst;
  const place = a.sted && !/^startsted/i.test(a.sted) ? a.sted : "";
  let h = `<div class="top"><a href="javascript:history.back()" style="text-decoration:none">‹ Tilbage</a><button class="pill on" data-act="edit:a:${id}" style="color:var(--tx);border-color:var(--line)">✎ Ret</button></div>
    <h1 style="margin-top:14px">${esc(a.id)} · ${esc(a.titel)} ${a.rettet ? '<span class="chip edit">rettet</span>' : ""}</h1>
    <div class="meta"><div>🕒 ${esc(when)}</div>${a.ansvarlig ? `<div>👤 ${esc(a.ansvarlig)}</div>` : ""}${place ? `<div>📍 ${esc(place)} · <a href="${mapsUrl(place)}" target="_blank" rel="noopener">Åbn i Maps ›</a></div>` : ""}</div>
    <div class="tabs">${[["resume", "Resumé"], ["tid", "Tidsplan"], ["fantasi", "Fantasi"], ["bem", "Bemanding"]].map(([k, l]) => `<a href="#/a/${id}/${k}" class="${tab === k ? "on" : ""}">${l}</a>`).join("")}</div>`;
  h += `<button class="btn ${mineAct(id) ? "alt" : ""}" data-act="claim:${id}">${mineAct(id) ? "★ Det er min – tryk for at fjerne" : "☆ Det er min"}</button>`;
  if (a.note) h += `<div class="box" style="border:1.5px solid var(--mine)"><h2 style="margin:0 0 6px">Min note</h2>${paras(a.note)}</div>`;
  if (tab === "resume") {
    h += `<h2>Formål</h2><div class="prose">${paras(a.formaal) || '<p class="muted">Ikke beskrevet.</p>'}</div>`;
    if (a.koncept) h += `<h2>Koncept</h2><div class="prose ${S.expand ? "" : "clamp"}">${paras(a.koncept)}</div><button class="fold" data-act="expand">${S.expand ? "Vis mindre" : "Læs hele konceptet ▾"}</button>`;
    if (a.godEnergi || a.spraengRammerne) h += `<h2>God energi / Spræng rammerne</h2><div class="prose">${paras(a.godEnergi)}${paras(a.spraengRammerne)}</div>`;
  } else if (tab === "tid") {
    h += a.tidsplan.length ? `<div class="tline">${a.tidsplan.map(r => `<div class="it"><div class="tm">${esc(r.tid)}</div><div class="tx">${esc(r.tekst)}</div></div>`).join("")}</div>` : `<div class="box muted">Beskrivelsen har ingen tidsplan som liste.</div>`;
  } else if (tab === "fantasi") {
    h += `<div class="prose">${paras(a.fantasi) || '<p class="muted">Ingen fantasiramme i beskrivelsen.</p>'}</div>`;
  } else {
    h += `<h2>Ansvarlig</h2><div class="prose"><p>${esc(a.ansvarlig) || "–"}</p></div>`;
    if (a.roller && a.roller.length) {
      if (a.bemandingTitel) h += `<h2>${esc(a.bemandingTitel)}</h2>`;
      const mineR = a.roller.filter(r => r.navne.some(n => whoIs(n) === S.me));
      if (mineR.length) h += `<div class="box" style="border:1.5px solid var(--mine)"><div class="muted">Din rolle</div><b>${mineR.map(r => esc(r.rolle) + (r.post ? " · " + esc(r.post) : "")).join("<br>")}</b></div>`;
      let last = "";
      for (const r of a.roller) {
        if (r.post !== last) { if (r.post) h += `<h2>${esc(r.post)}</h2>`; last = r.post; }
        h += `<div class="box"><div class="line" style="padding:0;align-items:flex-start"><b>${esc(r.rolle)}</b><span class="muted" style="text-align:right;flex:none">${r.tid ? esc(r.tid) + "<br>" : ""}${r.antal ? esc(r.antal) + " pers." : ""}</span></div>${r.navne.length ? `<div class="names" style="margin-top:8px">${r.navne.map(n => `<span class="${whoIs(n) === S.me ? "me" : ""}">${esc(n)}</span>`).join("")}</div>` : '<div class="muted" style="margin-top:6px">Ingen navne endnu</div>'}${r.note ? `<div class="muted" style="margin-top:8px">📝 ${esc(r.note)}</div>` : ""}</div>`;
      }
      for (const n of a.bemandingNoter || []) h += `<div class="box muted">📝 ${esc(n)}</div>`;
    } else h += `<h2>Teamere</h2>`;
    if (!(a.roller && a.roller.length)) h += a.bemanding.length ? `<div class="names">${a.bemanding.map(n => `<span class="${n === S.me ? "me" : ""}">${esc(n)}</span>`).join("")}</div>` : `<p class="muted">Ingen bemanding fundet i beskrivelsen.</p>`;
    if (a.bemandingRaa) h += `<details class="box"><summary>Original tekst</summary><div class="prose" style="margin-top:8px">${paras(a.bemandingRaa)}</div></details>`;
  }
  if (doc) h += `<a class="btn ghost" href="${esc(doc.docUrl)}" target="_blank" rel="noopener">🔗 Åbn original i Google Docs</a>`;
  return h;
}

function viewEvent(id) {
  const e = allEvents().find(x => x.id === id);
  if (!e) return `<a href="#/uge">‹ Tilbage</a><p>Ikke fundet.</p>`;
  return `<div class="top"><a href="javascript:history.back()" style="text-decoration:none">‹ Tilbage</a><button class="pill on" data-act="edit:e:${id}" style="color:var(--tx);border-color:var(--line)">✎ Ret</button></div>
    <h1 style="margin-top:14px">${esc(e.titel)} ${e.rettet ? '<span class="chip edit">rettet</span>' : ""}</h1>
    <div class="meta"><div>🕒 ${DAYS[dayIdx(e.dato)]} ${fmtD(e.dato)} · ${e.start}–${e.slut}</div><div>👥 ${e.maalgruppe === "team" ? "Team" : "Kursister"}</div></div>
    ${e.note ? `<div class="box" style="border:1.5px solid var(--mine)"><h2 style="margin:0 0 6px">Min note</h2>${paras(e.note)}</div>` : ""}
    <p class="muted">Ingen beskrivelse for dette punkt. Brug “Ret” til at tilføje en note.</p>`;
}

function viewMine() {
  const calEv = calSelect(), keys = [...new Map(allEvents().map(e => [actKey(e), e.aktivitet ? (S.data.aktiviteter[e.aktivitet] || {}).titel || e.titel : e.titel])).entries()];
  const nOver = Object.keys(S.over).length;
  const orphans = Object.keys(S.over).filter(k => (k.startsWith("e:") ? !S.data.events.some(e => e.id === k.slice(2)) : !S.data.aktiviteter[k.slice(2)])).length;
  let h = `<div class="top"><div><h1>Mig</h1><div class="sub">${S.me ? "Hej " + esc(S.me) : "Vælg dit navn"}</div></div>${ALIEN}</div>
    <h2>Udseende</h2><div class="seg">${[["light", "Lys"], ["dark", "Mørk"], ["system", "System"]].map(([k, l]) => `<button data-act="theme:${k}" class="${ls.get("lp_theme", "light") === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <h2>Jeg er</h2><select data-act="me">${["", ...S.data.personer].map(n => `<option ${n === (S.me || "") ? "selected" : ""} value="${esc(n)}">${n ? esc(n) : "– vælg navn –"}</option>`).join("")}</select>
    <h2>Føj til kalender</h2><div class="box">
    <div class="field"><label>Målgruppe</label><div class="seg" style="margin:0">${[["kursist", "Kursist"], ["begge", "Begge"], ["team", "Team"]].map(([k, l]) => `<button data-act="cal:aud:${k}" class="${S.cal.aud === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <div class="line"><span>Kun mine aktiviteter</span><button class="toggle ${S.cal.mine ? "on" : ""}" data-act="cal:mine" aria-label="Kun mine"></button></div>
    <div class="field"><label>Dage</label><div class="days" style="margin:0">${DAYS.map((d, k) => `<button data-act="cal:day:${k}" class="${S.cal.days.includes(k) ? "on" : ""}">${d.slice(0, 3)}<b>${+DATES[k].slice(8)}</b></button>`).join("")}</div></div>
    <details><summary class="muted">Vælg enkelte aktiviteter</summary>${keys.map(([k, t]) => `<label class="chk"><input type="checkbox" data-act="cal:skip:${esc(k)}" ${S.cal.skip.includes(k) ? "" : "checked"}> ${esc(String(t).split(" (")[0])}</label>`).join("")}</details>
    <div class="field"><label>Påmindelse</label><div class="seg" style="margin:0">${[[0, "Fra"], [15, "15 min"], [60, "1 time"]].map(([m, l]) => `<button data-act="cal:alarm:${m}" class="${S.cal.alarm === m ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <div class="hint">${calEv.length} begivenheder · bruger dine egne rettede tider</div>
    <button class="btn" data-act="ics" ${calEv.length ? "" : "disabled"}>⤓ Download .ics</button>
    ${navigator.canShare ? '<button class="btn alt" data-act="icsshare">Del fil …</button>' : ""}
    <div class="hint">Tip: vælg en ny kalender, fx “PLanstar 2026”, så du kan slette alt samlet bagefter.</div></div>
    <h2>Mine data</h2><div class="box"><div class="muted">Dine rettelser, huskeliste og valg gemmes kun på denne telefon, og opdateringer af appen sletter dem ikke. Tag en sikkerhedskopi, hvis du skifter telefon eller rydder browserdata.</div>${nOver ? `<div class="hint">${nOver} rettede felter.${orphans ? ` ${orphans} hører til punkter, der er ændret i planen, og vises ikke længere.` : ""}</div>` : ""}
    <div class="row2"><button class="btn alt" data-act="exp">Sikkerhedskopi</button><label class="btn alt" style="margin:10px 0">Indlæs kopi<input type="file" accept="application/json,.json" data-act="imp" hidden></label></div>
    ${nOver ? '<button class="btn ghost" data-act="resetall">Nulstil alle rettelser</button>' : ""}</div>
    <h2>Avanceret</h2><div class="box"><button class="btn alt" data-act="guide">Vis installationsguide</button><div class="field"><label>Demo-tid (test af “Nu”)</label><input type="datetime-local" data-act="demo" value="${esc(S.demo || "")}"></div>
    ${S.demo ? '<button class="btn alt" data-act="demooff">Brug rigtig tid</button>' : ""}
    <div class="hint">Plan genereret ${esc(S.data.genereret)} · adgang udløber ${esc(String(S.exp || "").slice(0, 10))}</div>
    <button class="btn ghost" data-act="logout">Glem nøgle på denne telefon</button></div>`;
  return h;
}

function myActivity(a) { return mineAct(a.id); }
const hashStr = t => Math.abs([...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);
function todoItems() {
  const evs = allEvents().filter(e => e.aktivitet).sort((x, y) => x.dato.localeCompare(y.dato) || x.start.localeCompare(y.start));
  const first = {}; for (const e of evs) if (!first[e.aktivitet]) first[e.aktivitet] = e;
  const out = [];
  for (const [id, a] of Object.entries(S.data.aktiviteter)) {
    const f = first[id];
    (a.huskepunkter || []).forEach((t, i) => out.push({ id: `d${id}-${hashStr(t)}`, txt: t, src: "doc", akt: id, dato: f && f.dato, start: f && f.start }));
    if (f && myActivity(a)) out.push({ id: `r${id}`, txt: "Læs beskrivelsen igennem", src: "auto", akt: id, dato: f.dato, start: f.start });
  }
  for (const o of S.todo.own) { const f = o.akt && first[o.akt]; out.push({ id: o.id, txt: o.txt, src: "egen", akt: o.akt || "", dato: f ? f.dato : null, start: f ? f.start : null }); }
  return out;
}
function viewHusk() {
  const today = ymd(now()), all = todoItems(), hiddenN = all.filter(i => S.todo.hidden[i.id]).length;
  let base = all;
  if (S.todoTab === "idag") base = base.filter(i => !i.dato || i.dato === today);
  if (S.todoTab === "egne") base = base.filter(i => i.src === "egen");
  const items = base.filter(i => !S.todo.hidden[i.id]);
  const done = items.filter(i => S.todo.done[i.id]).length, pct = items.length ? (done / items.length) * 100 : 0;
  const groups = new Map();
  for (const i of base) { const k = i.akt ? `${i.dato || ""} ${i.start || ""} ${i.akt}` : "~"; (groups.get(k) || groups.set(k, []).get(k)).push(i); }
  let h = `<div class="top"><div><h1>Huskeliste</h1><div class="sub">${done} af ${items.length} klaret</div></div>${ALIEN}</div>
    <div class="seg">${[["idag", "I dag"], ["uge", "Hele ugen"], ["egne", "Mine egne"]].map(([k, l]) => `<button data-act="ht:${k}" class="${S.todoTab === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="bar"><i style="width:${pct}%;background:var(--ac)"></i></div>`;
  for (const k of [...groups.keys()].sort()) {
    const g0 = groups.get(k), g = g0.filter(i => !S.todo.hidden[i.id]), a = g0[0].akt && S.data.aktiviteter[g0[0].akt];
    const fin = g.length > 0 && g.every(i => S.todo.done[i.id]);
    h += `<div class="${fin ? "fin" : ""}"><h2 style="display:flex;gap:8px;align-items:center">${g0[0].dato ? `<span style="color:var(--nowt)">${DAYS[dayIdx(g0[0].dato)].slice(0, 3)} ${g0[0].start}</span>` : ""}${a ? `<a href="#/a/${a.id}" style="color:var(--tx);text-decoration:none">${esc(a.titel)}</a>` : "Generelt"}${a ? `<button class="plus" data-act="tadd:${a.id}" aria-label="Tilføj punkt">+</button>` : ""}</h2>${g.length ? "" : '<div class="muted" style="margin:0 0 8px">Ingen punkter. Tryk + for at tilføje.</div>'}`;
    for (const i of g) h += `<div class="card" style="padding-left:12px;display:flex;align-items:center;gap:10px"><button data-act="td:${i.id}" aria-label="Afkryds" class="cb ${S.todo.done[i.id] ? "on" : ""}">${S.todo.done[i.id] ? "✓" : ""}</button>
      <div style="flex:1;${S.todo.done[i.id] ? "opacity:.5;text-decoration:line-through" : ""}">${esc(i.txt)} ${i.src === "egen" ? '<span class="chip">egen</span>' : i.src === "doc" ? '<span class="chip dim">fra beskrivelsen</span>' : ""}</div>
      <button data-act="tdel:${i.id}" aria-label="Slet" style="color:var(--mu);padding:6px 8px;font-size:16px">✕</button></div>`;
    h += "</div>";
  }
  if (!items.length) h += `<div class="box muted">Ingen punkter her endnu.</div>`;
  h += `<button class="btn" data-act="tadd">+ Tilføj punkt</button>`;
  if (hiddenN) h += `<button class="fold" data-act="trestore" style="border-style:solid">Gendan slettede (${hiddenN})</button>`;
  return h;
}
function openAddTodo(pre) {
  const acts = Object.values(S.data.aktiviteter).sort((x, y) => parseFloat(x.id) - parseFloat(y.id));
  const bg = document.createElement("div"); bg.className = "sheetbg";
  bg.innerHTML = `<div class="sheet"><h1 style="font-size:20px">Nyt punkt</h1><div class="field"><label>Hvad skal du huske?</label><textarea id="tt" autofocus></textarea></div>
    <div class="field"><label>Hører til</label><select id="ta"><option value="">Generelt</option>${acts.map(a => `<option value="${a.id}" ${a.id === pre ? "selected" : ""}>${esc(a.id + " · " + a.titel.split(" (")[0])}</option>`).join("")}</select></div>
    <div class="row2"><button class="btn alt" data-x="close">Annullér</button><button class="btn" data-x="save">Tilføj</button></div></div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", ev => {
    const x = ev.target.dataset.x;
    if (ev.target === bg || x === "close") return bg.remove();
    if (x === "save") {
      const txt = bg.querySelector("#tt").value.trim(); if (!txt) return;
      S.todo.own.push({ id: "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), txt, akt: bg.querySelector("#ta").value });
      saveTodo(); bg.remove(); S.todoTab = S.todoTab === "egne" ? "egne" : S.todoTab; render();
    }
  });
}
function viewOnb() {
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
  const alienBig = ALIEN.replace('class="alien"', 'class="alien" style="width:70px;height:70px"');
  if (S.onb === 1) {
    const code = S.pw ? S.pw.replace(/(.{4})/g, "$1-").replace(/-$/, "") : "";
    const how = ios ? `<ol><li>Åbn denne side i <b>Safari</b> (ikke i en chat-app).</li><li>Tryk på <b>Del</b>-ikonet (firkant med pil op).</li><li>Vælg <b>Føj til hjemmeskærm</b>, og tryk <b>Tilføj</b>.</li><li>Åbn <b>Lommeplan</b> fra hjemmeskærmen.</li></ol>`
      : android ? `${S.installEv ? '<button class="btn" data-act="install">Installér Lommeplan</button>' : ""}<ol><li>Tryk på <b>⋮</b> øverst i Chrome.</li><li>Vælg <b>Installer app</b> eller <b>Føj til startskærm</b>.</li><li>Åbn <b>Lommeplan</b> fra startskærmen.</li></ol>`
      : `<ol><li>Åbn linket på din telefon.</li><li>Brug browserens menu til at føje siden til hjemmeskærmen.</li></ol>`;
    return `<div class="login" style="padding-top:6vh">${alienBig}<h1>Velkommen til Lommeplan</h1><div class="sub">Trin 1 af 2 · Føj til hjemmeskærm</div>
      <div class="box prose" style="text-align:left;margin-top:22px">${how}${code ? `<p class="muted">Første gang du åbner fra hjemmeskærmen, skal du skrive koden igen:</p><div class="box" style="text-align:center;font-weight:800;font-size:20px;letter-spacing:.08em">${esc(code)}</div><button class="btn alt" data-act="copy">Kopiér koden</button>` : ""}</div>
      <button class="btn" data-act="onb:2">Næste</button><button class="btn ghost" data-act="onb:2">Spring over</button></div>`;
  }
  return `<div class="login" style="padding-top:6vh">${alienBig}<h1>Hvem er du?</h1><div class="sub">Trin 2 af 2 · Så kan appen vise dine aktiviteter</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:22px">${S.data.personer.map(n => `<button class="pill" style="padding:12px;font-size:15px;color:var(--tx)" data-act="pick:${esc(n)}">${esc(n)}</button>`).join("")}</div></div>`;
}

function viewLogin() {
  return `<div class="login">${ALIEN.replace('class="alien"', 'class="alien" style="width:90px;height:90px"')}<h1 style="font-size:30px">Lommeplan</h1><div class="sub">PLanstar 2026 · for teamere</div>
    <form id="lf"><div class="field" style="margin-top:40px;text-align:left"><label>Din kode</label><input id="code" value="${esc(S.loginDraft || "")}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"></div>
    <div class="err" role="alert">${esc(S.loginErr)}</div><button class="btn" type="submit">Åbn</button></form>
    <p class="muted">Brug linket eller koden, du har fået af teamet. Koden gemmes kun på din telefon.</p></div>`;
}

// ---------- rediger ----------
function openEdit(kind, id) {
  const isA = kind === "a", key = (isA ? "a:" : "e:") + id, o = S.over[key] || {};
  const base = isA ? S.data.aktiviteter[id] : S.data.events.find(e => e.id === id);
  const fields = isA ? [["sted", "Sted", "input"], ["ansvarlig", "Ansvarlig", "input"]] : [["titel", "Titel", "input"], ["start", "Start", "time"], ["slut", "Slut", "time"]];
  const f = (name, label, type, val, orig, k) => `<div class="field"><label>${label}</label>${type === "area" ? `<textarea data-k="${k}" class="${val !== orig && val ? "ed" : ""}">${esc(val)}</textarea>` : `<input data-k="${k}" type="${type === "input" ? "text" : "time"}" value="${esc(val)}" class="${val !== orig ? "ed" : ""}">`}${val !== orig && orig !== undefined ? `<div class="orig">Original: ${esc(orig)}</div>` : ""}</div>`;
  let body = fields.map(([n, l, t]) => f(n, l, t, o[n] ?? base[n], base[n], key + "|" + n)).join("");
  if (isA) for (const e of S.data.events.filter(x => x.aktivitet === id)) {
    const eo = S.over["e:" + e.id] || {};
    body += `<div class="field"><label>${DAYS[dayIdx(e.dato)]} · tid</label><div class="row2"><input data-k="e:${e.id}|start" type="time" value="${eo.start || e.start}" class="${eo.start ? "ed" : ""}"><input data-k="e:${e.id}|slut" type="time" value="${eo.slut || e.slut}" class="${eo.slut ? "ed" : ""}"></div>${eo.start || eo.slut ? `<div class="orig">Original: ${e.start}–${e.slut}</div>` : ""}</div>`;
  }
  body += f("note", "Min note (kun på din telefon)", "area", o.note || "", "", key + "|note");
  const bg = document.createElement("div");
  bg.className = "sheetbg";
  bg.innerHTML = `<div class="sheet"><h1 style="font-size:20px">Ret</h1><div class="sub">Kun på din telefon. Originalen gemmes.</div>${body}<div class="row2"><button class="btn alt" data-x="reset">Nulstil</button><button class="btn" data-x="save">Gem</button></div><button class="btn ghost" data-x="close">Annullér</button></div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", ev => {
    const x = ev.target.dataset.x;
    if (ev.target === bg || x === "close") return bg.remove();
    if (x === "reset") {
      delete S.over[key];
      if (isA) S.data.events.filter(e => e.aktivitet === id).forEach(e => delete S.over["e:" + e.id]);
      saveOver(); bg.remove(); render();
    }
    if (x === "save") {
      const orig = {};
      for (const el of bg.querySelectorAll("[data-k]")) {
        const [k, field] = el.dataset.k.split("|"), v = el.value.trim();
        const b = k.startsWith("a:") ? S.data.aktiviteter[k.slice(2)] : S.data.events.find(e => e.id === k.slice(2));
        const bo = (S.over[k] = S.over[k] || {});
        if (field === "note") { v ? (bo.note = v) : delete bo.note; }
        else if (v && v !== b[field]) bo[field] = v; else delete bo[field];
        if (!Object.keys(bo).length) delete S.over[k];
      }
      saveOver(); bg.remove(); render();
    }
  });
}

// ---------- kalender (.ics) ----------
const actKey = e => e.aktivitet ? "a" + e.aktivitet : "t" + e.titel;
function calSelect() {
  const c = S.cal;
  let ev = allEvents().filter(e => (c.aud === "begge" || e.maalgruppe === c.aud) && c.days.includes(dayIdx(e.dato)) && !c.skip.includes(actKey(e)));
  if (c.mine) ev = ev.filter(e => isMine(e));
  ev.sort((a, b) => a.dato.localeCompare(b.dato) || a.start.localeCompare(b.start));
  // flerdags-aktivitet (fx patruljens halve døgn): slå sammen når første slutter sent og næste starter tidligt næste dag
  const out = [];
  for (const e of ev) {
    const p = out.find(x => x.aktivitet && x.aktivitet === e.aktivitet && x.slutDato === undefined && dayIdx(e.dato) === dayIdx(x.dato) + 1 && x.slut >= "21:00" && e.start <= "08:00");
    if (p) { p.slutDato = e.dato; p.slut = e.slut; } else out.push({ ...e });
  }
  return out;
}
const icsEsc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  const b = enc.encode(line); if (b.length <= 74) return line;
  let out = "", cur = "", len = 0;
  for (const ch of line) { const l = enc.encode(ch).length; if (len + l > (out ? 73 : 74)) { out += (out ? "\r\n " : "") + cur; cur = ""; len = 0; } cur += ch; len += l; }
  return out + "\r\n " + cur;
}
function buildIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lommeplan//PLanstar 2026//DA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:PLanstar 2026", "X-WR-TIMEZONE:Europe/Copenhagen",
    "BEGIN:VTIMEZONE", "TZID:Europe/Copenhagen", "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"];
  const tz = (d, hm) => d.replace(/-/g, "") + "T" + hm.replace(":", "") + "00";
  for (const e of calSelect()) {
    const a = actFull(e.aktivitet), doc = S.data.events.find(x => x.aktivitet === e.aktivitet && x.docUrl);
    const desc = [a && a.formaal, a && a.note && "Min note: " + a.note, e.note && "Min note: " + e.note, doc && doc.docUrl && "Original: " + doc.docUrl].filter(Boolean).join("\n\n");
    L.push("BEGIN:VEVENT", `UID:${e.id}@lommeplan`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Copenhagen:${tz(e.dato, e.start)}`, `DTEND;TZID=Europe/Copenhagen:${tz(e.slutDato || e.dato, e.slut)}`,
      `SUMMARY:${icsEsc(e.titel)}`, `LOCATION:${icsEsc((a && a.sted && !/^startsted/i.test(a.sted)) ? a.sted : e.maalgruppe === "team" ? "" : HOME)}`, `DESCRIPTION:${icsEsc(desc)}`, `CATEGORIES:${e.maalgruppe === "team" ? "Team" : "Kursist"}`);
    if (S.cal.alarm) L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(e.titel)}`, `TRIGGER:-PT${S.cal.alarm}M`, "END:VALARM");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
function saveFile(name, text, type, share) {
  const file = new File([text], name, { type });
  if (share && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => {});
  const url = URL.createObjectURL(file), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function updateNowLine() {
  const ln = document.getElementById("nowline"); if (!ln) return;
  const grid = ln.parentElement, tls = [...grid.querySelectorAll(".tl")]; if (!tls.length) return;
  const n = now(), mins = n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60, sm = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const pos = tls.map(el => ({ m: sm(el.dataset.s), e: sm(el.dataset.e), y: el.offsetTop }));
  let y;
  if (mins <= pos[0].m) y = pos[0].y - 4;
  else {
    let i = pos.length - 1; for (let k = 0; k < pos.length - 1; k++) if (mins < pos[k + 1].m) { i = k; break; }
    const nextY = pos[i + 1] ? pos[i + 1].y : grid.offsetHeight, span = (pos[i + 1] ? pos[i + 1].m : pos[i].e) - pos[i].m;
    y = pos[i].y + Math.min(1, Math.max(0, (mins - pos[i].m) / (span || 1))) * (nextY - pos[i].y - 6);
  }
  ln.style.top = Math.round(y) + "px";
  ln.firstElementChild.textContent = String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0");
}
window.addEventListener("resize", updateNowLine);
// ---------- router + events ----------
function render() {
  if (S.data && S.onb) { $app.innerHTML = viewOnb(); return; }
  if (!S.data) { $app.innerHTML = S.loading ? '<p class="muted" style="padding-top:30vh;text-align:center">Henter plan …</p>' : viewLogin(); bindLogin(); return; }
  const [r = "uge", a, b] = location.hash.replace(/^#\/?/, "").split("/");
  let h, tab = r;
  if (r === "a") { h = viewAct(a, b); tab = "uge"; }
  else if (r === "e") { h = viewEvent(a); tab = "uge"; }
  else if (r === "uge") h = viewUge(a);
  else if (r === "mine") h = viewMine();
  else if (r === "husk") { h = viewHusk(); tab = "husk"; }
  else { h = viewUge(a); tab = "uge"; }
  $app.innerHTML = h + nav(tab);
  updateNowLine();
}
function bindLogin() {
  const f = document.getElementById("lf"); if (!f) return;
  f.onsubmit = async ev => {
    ev.preventDefault(); S.loginErr = "";
    const inp = document.getElementById("code"), btn = f.querySelector("button[type=submit]");
    S.loginDraft = inp.value; btn.disabled = true; btn.textContent = "Tjekker koden …"; inp.readOnly = true;
    await new Promise(r => setTimeout(r, 30));   // lad skærmen opdatere før den tunge udregning
    await tryUnlock(inp.value);
  };
}
async function tryUnlock(pw) {
  if (normPw(pw).length < 8) { S.loginErr = "Koden er for kort."; render(); return false; }
  let k, d = null;
  try { k = await deriveKeyB64(S.env, pw); d = await decryptData(S.env, k); } catch {}
  if (!d) { S.loginErr = "Forkert kode. Tjek, at den er skrevet rigtigt."; render(); return false; }
  if (Date.now() > Date.parse(d.exp)) { S.loginErr = "Adgangen er udløbet."; render(); return false; }
  ls.set("lp_key", k); ls.set("lp_exp", d.exp);
  S.data = d; S.exp = d.exp; S.pw = normPw(pw); S.me = ls.get("lp_name") || null;
  S.onb = ls.get("lp_onb") === "1" ? 0 : standalone() ? 2 : 1;
  if (S.onb === 2 && S.me) { S.onb = 0; ls.set("lp_onb", "1"); }
  location.hash = "#/uge"; render(); return true;
}
document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]"); if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
  const [act, ...p] = el.dataset.act.split(":");
  if (el.closest("a")) ev.preventDefault();
  if (act === "claim") { const id = p.join(":"), doc = !!(S.me && S.data.aktiviteter[id] && (S.data.aktiviteter[id].bemanding.includes(S.me) || S.data.aktiviteter[id].ansvarligNavne.includes(S.me))); const now1 = mineAct(id); if (now1) { doc ? (S.claim[id] = -1) : delete S.claim[id]; } else { doc ? delete S.claim[id] : (S.claim[id] = 1); } saveClaim(); }
  else if (act === "aud") { S.aud = p[0]; ls.set("lp_aud", S.aud); }
  else if (act === "mine") { S.mine = !S.mine; ls.set("lp_mine", S.mine ? "1" : "0"); }
  else if (act === "expand") S.expand = !S.expand;
  else if (act === "theme") { ls.set("lp_theme", p[0]); applyTheme(); }
  else if (act === "ht") S.todoTab = p[0];
  else if (act === "td") { const id = p.join(":"); S.todo.done[id] ? delete S.todo.done[id] : (S.todo.done[id] = 1); saveTodo(); }
  else if (act === "tdel") { const id = p.join(":"), i = S.todo.own.findIndex(o => o.id === id); if (i >= 0) S.todo.own.splice(i, 1); else S.todo.hidden[id] = 1; delete S.todo.done[id]; saveTodo(); }
  else if (act === "trestore") { S.todo.hidden = {}; saveTodo(); }
  else if (act === "tadd") return openAddTodo(p[0]);
  else if (act === "guide") { S.onb = standalone() ? 2 : 1; }
  else if (act === "onb") { S.onb = +p[0]; if (S.onb === 2 && S.me) { S.onb = 0; ls.set("lp_onb", "1"); location.hash = "#/uge"; } }
  else if (act === "pick") { S.me = p.join(":"); ls.set("lp_name", S.me); S.onb = 0; ls.set("lp_onb", "1"); location.hash = "#/uge"; }
  else if (act === "install") { if (S.installEv) { S.installEv.prompt(); S.installEv = null; } }
  else if (act === "copy") { try { navigator.clipboard.writeText(S.pw); el.textContent = "Kopieret ✓"; } catch {} return; }
  else if (act === "day") { location.hash = "#/uge/" + p[0]; setTimeout(scrollToDays, 60); return; }
  else if (act === "todays") { scrollToDays(); return; }
  else if (act === "edit") return openEdit(p[0], p.slice(1).join(":"));
  else if (act === "cal") {
    const [k, v] = [p[0], p.slice(1).join(":")];
    if (k === "aud") S.cal.aud = v; else if (k === "mine") S.cal.mine = !S.cal.mine; else if (k === "alarm") S.cal.alarm = +v;
    else if (k === "day") { const d = +v; S.cal.days = S.cal.days.includes(d) ? S.cal.days.filter(x => x !== d) : [...S.cal.days, d]; }
  }
  else if (act === "ics") return saveFile("lommeplan.ics", buildIcs(), "text/calendar", false);
  else if (act === "icsshare") return saveFile("lommeplan.ics", buildIcs(), "text/calendar", true);
  else if (act === "exp") return saveFile("lommeplan-sikkerhedskopi.json", JSON.stringify({ v: 1, navn: S.me, rettelser: S.over, huskeliste: S.todo }, null, 1), "application/json", true);
  else if (act === "resetall") { if (confirm("Nulstil alle dine rettelser?")) { S.over = {}; saveOver(); } }
  else if (act === "demooff") { S.demo = null; ls.del("lp_demo"); }
  else if (act === "logout") { if (confirm("Glem nøglen? Du skal bruge dit link eller din kode igen.")) { ["lp_key", "lp_name", "lp_exp", "lp_onb"].forEach(ls.del); S.data = null; S.me = null; S.onb = 0; } }
  render();
});
document.addEventListener("change", ev => {
  const el = ev.target; if (!el.dataset || !el.dataset.act) return;
  const [act, ...p] = el.dataset.act.split(":");
  if (act === "me") { S.me = el.value || null; ls.set("lp_name", el.value); }
  else if (act === "demo") { S.demo = el.value || null; el.value ? ls.set("lp_demo", el.value) : ls.del("lp_demo"); }
  else if (act === "cal" && p[0] === "skip") { const k = p.slice(1).join(":"); S.cal.skip = el.checked ? S.cal.skip.filter(x => x !== k) : [...S.cal.skip, k]; }
  else if (act === "imp") {
    const f = el.files[0]; if (!f) return;
    f.text().then(t => {
      try {
        const o = JSON.parse(t); if (typeof o !== "object" || Array.isArray(o)) throw 0;
        if (o.v && (o.rettelser || o.huskeliste)) {
          S.over = { ...S.over, ...(o.rettelser || {}) }; saveOver();
          const h = o.huskeliste || {}; S.todo.done = { ...S.todo.done, ...(h.done || {}) }; S.todo.hidden = { ...S.todo.hidden, ...(h.hidden || {}) };
          for (const x of h.own || []) if (!S.todo.own.some(y => y.id === x.id)) S.todo.own.push(x);
          saveTodo(); if (o.navn && !S.me) { S.me = o.navn; ls.set("lp_name", S.me); }
        } else { S.over = { ...S.over, ...o }; saveOver(); }
        alert("Sikkerhedskopi indlæst.");
      } catch { alert("Filen kunne ikke læses."); }
      render();
    });
    return;
  }
  render();
});
window.addEventListener("hashchange", () => {
  const m = location.hash.match(/^#u=([^&]+)/);   // link åbnet mens appen allerede er åben (kun #-delen skifter)
  if (m) {
    history.replaceState(null, "", location.pathname + location.search + "#/uge");
    if (S.data) { render(); window.scrollTo(0, 0); } else if (S.env) { S.loginErr = ""; tryUnlock(m[1]); }
    return;
  }
  S.expand = false; render(); window.scrollTo(0, 0); });
setInterval(() => { if (S.data && !document.querySelector(".sheetbg") && !S.demo && /^#\/?(uge(\/\d)?)?$/.test(location.hash)) render(); }, 30000);

// ---------- start ----------
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); S.installEv = e; if (S.onb === 1) render(); });
(async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  const qd = new URLSearchParams(location.search).get("demo"); if (qd) S.demo = qd;
  S.loading = true; render();
  try { S.env = await (await fetch("data.enc.json", { cache: "no-cache" })).json(); }
  catch { S.loading = false; $app.innerHTML = '<p class="muted" style="padding-top:30vh;text-align:center">Kan ikke hente planen. Åbn appen én gang med net.</p>'; return; }
  S.loading = false;
  const m = location.hash.match(/^#u=([^&]+)/);
  if (m) {
    history.replaceState(null, "", location.pathname + location.search + "#/uge");
    if (await tryUnlock(m[1])) return;
  }
  const key = ls.get("lp_key"), exp = ls.get("lp_exp");
  if (key && (!exp || Date.now() < Date.parse(exp))) {
    try { S.data = await decryptData(S.env, key); S.me = ls.get("lp_name") || null; S.exp = exp; S.onb = ls.get("lp_onb") === "1" ? 0 : (S.me || standalone() ? (S.me ? 0 : 2) : 1); }
    catch { ls.del("lp_key"); S.loginErr = "Planen er låst med en ny kode. Skriv den nye kode."; }
  } else if (key) { ["lp_key", "lp_name", "lp_exp"].forEach(ls.del); S.loginErr = "Adgangen er udløbet."; }
  if (S.data && !location.hash) location.hash = "#/uge";
  render();
})();
