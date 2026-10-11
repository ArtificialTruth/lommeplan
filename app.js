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
  pl: (() => { try { return { n: 6, names: [], ready: false, tpl: {}, done: {}, ...JSON.parse(ls.get("lp_pl", "{}")) }; } catch { return { n: 6, names: [], ready: false, tpl: {}, done: {} }; } })(),
  plView: "liste", plEdit: false,
  hide: (() => { try { return JSON.parse(ls.get("lp_hide", "{}")); } catch { return {}; } })(), hideMode: false,
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
const savePl = () => ls.set("lp_pl", JSON.stringify(S.pl));
const saveHide = () => ls.set("lp_hide", JSON.stringify(S.hide));
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
const PALIAS = { bondo: "Marie", "mathilde m": "Mathilde", "marie e": "Marie", "marie b": "Marie", alsa: "Asla", havbro: "Mads" };
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
function mineOn(id, dag) {   // dagsspecifik bemanding: Thorvald er kun "mine" de dage, han står på
  const a = S.data.aktiviteter[id]; if (!a) return false;
  const c = S.claim[id]; if (c === 1) return true; if (c === -1) return false;
  if (!S.me) return false;
  if (a.ansvarligNavne.includes(S.me)) return true;
  const bd = a.bemandingDage || {};
  if (Object.keys(bd).length) return (bd[dag] || []).includes(S.me);
  const mine = (a.roller || []).filter(r => r.navne.some(n => whoIs(n) === S.me));
  if (mine.length) return mine.some(r => !r.dage || !r.dage.length || r.dage.includes(dag));
  return !(a.roller || []).length && a.bemanding.includes(S.me);
}
const isMine = e => !!(e.aktivitet && mineOn(e.aktivitet, e.dag));
function visible(e) {
  if (S.hide[e.id] && !S.hideMode) return false;
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
const offSite = sted => /hillerød|helsinge|gribsø|gribskov|station|tog\b|skov/i.test(sted || "");
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
  const hid = S.hide[e.id];
  return `<a class="card ${e.maalgruppe === "team" ? "team" : ""} ${st} ${o.big ? "big" : ""} ${hid ? "hid" : ""}" href="${href}">
    <div class="t">${e.start} – ${e.slut}</div><div class="n">${esc(e.titel.split(" (")[0])}</div>${e.titel.includes(" (") ? `<div class="p">${esc(e.titel.slice(e.titel.indexOf(" (") + 2).replace(/\)$/, ""))}</div>` : ""}
    ${e.info ? `<div class="p">ℹ️ ${esc(e.info)}</div>` : ""}${a && a.sted && !/^startsted/i.test(a.sted) ? `<div class="p">📍 ${esc(a.sted)}</div>` : ""}${extra}
    ${tags ? `<div class="tags">${tags}</div>` : ""}${S.hideMode ? `<button class="star hidebtn" data-act="hide:${e.id}" aria-label="${hid ? "Vis igen" : "Skjul"}">${hid ? "↺" : "✕"}</button>` : e.aktivitet ? `<button class="star ${mine ? "on" : ""}" data-act="claim:${e.aktivitet}" aria-label="${mine ? "Fjern fra mine" : "Det er min"}">${mine ? "★" : "☆"}</button>` : ""}</a>`;
}
const audSeg = () => `<div class="seg">${[["kursist", "Kursist"], ["begge", "Begge"], ["team", "Team"]].map(([k, l]) => `<button data-act="aud:${k}" class="${S.aud === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
const minePill = () => `<div class="chips"><button class="pill ${S.mine ? "on" : ""}" data-act="mine">★ Kun mine${S.me ? ": " + esc(S.me) : ""}</button><button class="pill ${S.hideMode ? "on" : ""}" data-act="hidemode">${S.hideMode ? "Færdig med at skjule" : "Skjul punkter"}${Object.keys(S.hide).length && !S.hideMode ? " (" + Object.keys(S.hide).length + ")" : ""}</button>${S.demo ? '<span class="pill">Demo-tid ' + esc(S.demo.replace("T", " ")) + "</span>" : ""}</div>`;
const nav = r => `<nav class="bar2"><div class="in">${[["uge", "▤", "Uge"], ["husk", "☑", "Huskeliste"], ["patruljer", "⚑", "Patruljer"], ["mine", "★", "Mig"]].map(([k, i, l]) => `<a href="#/${k}" class="${r === k ? "on" : ""}"><i>${i}</i>${l}</a>`).join("")}</div></nav>`;

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
  const date = DATES[i], evAll = dayEvents(date), pastEv = evAll.filter(e => status(e) === "past"), collapse = !S.showPast && !S.hideMode && pastEv.length > 0, ev = collapse ? evAll.filter(e => status(e) !== "past") : evAll, two = S.aud === "begge" && ev.some(e => e.maalgruppe === "team");
  let h = `<div class="top"><div><h1>Ugen</h1><div class="sub">${fmtD(DATES[0])}–${fmtD(DATES[5])} 2026</div></div>${ALIEN}</div>`;
  const dism = (() => { try { return JSON.parse(ls.get("lp_news", "[]")); } catch { return []; } })();
  const LIVE_MS = 2 * 3600 * 1000;   // forældede beskeder skjules automatisk 2 timer efter udløb
  for (const nw of S.data.nyheder || []) if (now().getTime() <= Date.parse(nw.til.length === 10 ? nw.til + "T23:59" : nw.til) + LIVE_MS && !dism.includes(nw.id)) h += `<div class="box" style="border:2px solid var(--now);background:var(--card2)"><div class="line" style="padding:0 0 4px;align-items:flex-start"><b>📢 ${esc(nw.titel)}</b><button data-act="news:${esc(nw.id)}" aria-label="Luk" style="color:var(--mu);font-size:18px;padding:0 4px">✕</button></div><div style="font-size:14px">${esc(nw.tekst)}</div></div>`;
  h += `<div class="box ovbox"><div class="line" style="padding:0 0 4px"><h2 style="margin:0">Hele ugen</h2><span class="muted" style="font-size:11px">tryk på en dag</span></div>${weekOverview(i)}</div>`;
  h += `<div class="days">${DAYS.map((d, k) => `<button data-act="day:${k}" class="${k === i ? "on" : ""} ${DATES[k] === today ? "today" : ""} ${DATES[k] < today ? "gone" : ""}">${d.slice(0, 3)}<b>${+DATES[k].slice(8)}</b></button>`).join("")}</div>` + audSeg() + minePill();
  if (two) h += `<div class="lanehead"><span></span><span class="lh" style="color:var(--act)">KURSIST</span><span class="lh" style="color:var(--teamt)">TEAM<button data-act="aud:kursist" style="color:var(--mu)">✕</button></span></div>`;
  if (pastEv.length) h += `<button class="fold" data-act="past" style="margin:6px 0 10px">${collapse ? `▸ Færdige (${pastEv.length}) – ${pastEv.slice(0, 3).map(e => esc(e.titel.split(" (")[0])).join(", ")}${pastEv.length > 3 ? " …" : ""}` : "▾ Skjul færdige"}</button>`;
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
  if (!ev.length && !pastEv.length) h += `<div class="box muted">Ingen punkter med disse filtre.</div>`;
  else if (!ev.length) h += `<div class="box muted">Dagens program er slut.</div>`;
  const loose = Object.values(S.data.aktiviteter).filter(a => !S.data.events.some(e => e.aktivitet === a.id));
  if (loose.length && S.aud !== "team") h += `<h2>Uden fast tid</h2>` + loose.map(a => `<a class="card" href="#/a/${a.id}"><div class="t">Hele ugen / løbende</div><div class="n">${esc(a.titel)}</div></a>`).join("");
  return h;
}

function viewAct(id, tab) {
  const a = actFull(id);
  if (!a) return `<a href="#/uge">‹ Tilbage</a><p>Aktiviteten findes ikke.</p>`;
  tab = tab || "resume";
  const hasPl = false;
  const evs = allEvents().filter(e => e.aktivitet === id);
  const doc = S.data.events.find(e => e.aktivitet === id && e.docUrl);
  const when = evs.length ? evs.map(e => `${DAYS[dayIdx(e.dato)]} ${e.start}–${e.slut}`).join(" · ") : a.tidTekst;
  const place = a.sted && !/^startsted/i.test(a.sted) ? a.sted : "";
  let h = `<div class="top"><a href="javascript:history.back()" style="text-decoration:none">‹ Tilbage</a><button class="pill on" data-act="edit:a:${id}" style="color:var(--tx);border-color:var(--line)">✎ Ret</button></div>
    <h1 style="margin-top:14px">${esc(a.id)} · ${esc(a.titel)} ${a.rettet ? '<span class="chip edit">rettet</span>' : ""}</h1>
    <div class="meta"><div>🕒 ${esc(when)}</div>${a.ansvarlig ? `<div>👤 ${esc(a.ansvarlig)}</div>` : ""}${place ? `<div>📍 ${esc(place)} · ${offSite(place) ? `<a href="${mapsUrl(place)}" target="_blank" rel="noopener">Åbn i Maps ›</a>` : `<a href="#/patruljer/lejr">Se lejrkort ›</a>`}</div>` : ""}</div>
    <div class="tabs">${[["resume", "Resumé"], ["tid", "Tidsplan"], ...(hasPl ? [["pl", "PL-plan"]] : []), ["fantasi", "Fantasi"], ["bem", "Bemanding"]].map(([k, l]) => `<a href="#/a/${id}/${k}" class="${tab === k ? "on" : ""}">${l}</a>`).join("")}</div>`;
  h += `<button class="btn ${mineAct(id) ? "alt" : ""}" data-act="claim:${id}">${mineAct(id) ? "★ Det er min – tryk for at fjerne" : "☆ Det er min"}</button>`;
  if (a.note) h += `<div class="box" style="border:1.5px solid var(--mine)"><h2 style="margin:0 0 6px">Min note</h2>${paras(a.note)}</div>`;
  if (PL_IDS.includes(id) && tab === "resume") h += `<h2>PL-skifteplan</h2>${plCard(id)}`;
  if (tab === "pl" && hasPl) { return h.replace(/<button class="btn[^"]*" data-act="claim:[^>]*>[^<]*<\/button>/, "") + viewPL(id); }
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
    if (a.bemandingDage && Object.keys(a.bemandingDage).length) {
      h += `<h2>Pr. dag</h2>` + DAYS.filter(d => a.bemandingDage[d]).map(d => `<div class="box"><b>${d}</b><div class="names" style="margin-top:8px">${a.bemandingDage[d].map(n => `${personChip(n)}`).join("")}</div></div>`).join("");
    } else if (a.roller && a.roller.length) {
      if (a.bemandingTitel) h += `<h2>${esc(a.bemandingTitel)}</h2>`;
      const mineR = a.roller.filter(r => r.navne.some(n => whoIs(n) === S.me));
      if (mineR.length) h += `<div class="box" style="border:1.5px solid var(--mine)"><div class="muted">Din rolle</div><b>${mineR.map(r => esc(r.rolle) + (r.post ? " · " + esc(r.post) : "")).join("<br>")}</b></div>`;
      let last = "";
      for (const r of a.roller) {
        if (r.post !== last) { if (r.post) h += `<h2>${esc(r.post)}</h2>`; last = r.post; }
        h += `<div class="box"><div class="line" style="padding:0;align-items:flex-start"><b>${esc(r.rolle)}</b><span class="muted" style="text-align:right;flex:none">${r.tid ? esc(r.tid) + "<br>" : ""}${r.antal ? esc(r.antal) + " pers." : ""}</span></div>${r.navne.length ? `<div class="names" style="margin-top:8px">${r.navne.map(n => `${personChip(n)}`).join("")}</div>` : '<div class="muted" style="margin-top:6px">Ingen navne endnu</div>'}${r.note ? `<div class="muted" style="margin-top:8px">📝 ${esc(r.note)}</div>` : ""}</div>`;
      }
      for (const n of a.bemandingNoter || []) h += `<div class="box muted">📝 ${esc(n)}</div>`;
    } else h += `<h2>Teamere</h2>`;
    if (!(a.roller && a.roller.length) && !(a.bemandingDage && Object.keys(a.bemandingDage).length)) h += a.bemanding.length ? `<div class="names">${a.bemanding.map(n => `${personChip(n)}`).join("")}</div>` : `<p class="muted">Ingen bemanding fundet i beskrivelsen.</p>`;
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
    <div class="meta"><div>🕒 ${DAYS[dayIdx(e.dato)]} ${fmtD(e.dato)} · ${e.start}–${e.slut}</div><div>👥 ${e.maalgruppe === "team" ? "Team" : "Kursister"}</div>${e.info ? `<div>ℹ️ ${esc(e.info)}</div>` : ""}</div>
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
    ${Object.keys(S.hide).length ? `<button class="btn ghost" data-act="unhideall">Vis ${Object.keys(S.hide).length} skjulte punkter igen</button>` : ""}
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

// ---------- PL-skifteplan (patruljens time) ----------
const PL_IDS = ["5", "8", "19"];
const PL_COL = { 6: ["#d92b1f", "#f2c91b", "#b7c9a0", "#1c9be6", "#c9bfe0", "#aab7e0"], 7: ["#d92b1f", "#f6c9a3", "#f2c91b", "#b7c9a0", "#1c9be6", "#c9bfe0", "#aab7e0"] };
const PL_DARK = new Set(["#d92b1f", "#1c9be6"]);
const SK = -1;   // skift = patruljens time, hvor PL skifter
function defaultTpl(n) {
  const T = n === 6
    ? [[0, 0, "13:00", "19:15"], [SK, 0, "19:30", "21:00"], [1, 1, "09:00", "18:30"], [SK, 1, "18:30", "20:00"], [2, 1, "20:00", "21:00"], [2, 2, "13:15", "16:45"], [3, 2, "17:00", "23:00"], [3, 3, "07:00", "10:30"], [SK, 3, "10:30", "12:00"], [4, 3, "13:15", "21:00"], [5, 4, "09:00", "16:00"], [SK, 4, "16:00", "18:00"], [0, 4, "18:00", "23:00"], [0, 5, "09:00", "12:00"]]
    : [[0, 0, "13:00", "19:15"], [SK, 0, "19:30", "21:00"], [1, 1, "09:00", "12:00"], [2, 1, "13:15", "18:30"], [SK, 1, "18:30", "20:00"], [3, 1, "20:00", "21:00"], [3, 2, "13:15", "16:45"], [4, 2, "17:00", "23:00"], [4, 3, "07:00", "10:30"], [SK, 3, "10:30", "12:00"], [5, 3, "13:15", "21:00"], [6, 4, "09:00", "16:00"], [SK, 4, "16:00", "18:00"], [1, 4, "18:00", "23:00"], [1, 5, "09:00", "12:00"]];
  return T.map(([slot, dag, from, to], i) => ({ id: "s" + i, slot, dag, from, to }));
}
const plTpl = () => S.pl.tpl[S.pl.n] || (S.pl.tpl[S.pl.n] = defaultTpl(S.pl.n));
const plName = i => (S.pl.names[i] || "").trim() || `Kursist ${i + 1}`;
const mm = t => +t.slice(0, 2) * 60 + +t.slice(3);
const hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
function plState() {
  const n = now(), nm = n.getHours() * 60 + n.getMinutes(), di = dayIdx(ymd(n));
  const abs = (d, t) => d * 1440 + mm(t), cur = (di >= 0 ? di : n < at(DATES[0], "00:00") ? -1 : 6) * 1440 + nm;
  const segs = plTpl().slice().sort((a, b) => abs(a.dag, a.from) - abs(b.dag, b.from));
  const pls = segs.filter(s => s.slot !== SK), shifts = S.pl.shifts || {};
  const inSeg = s => abs(s.dag, s.from) <= cur && cur < abs(s.dag, s.to);
  const pair = sk => ({ from: [...pls].reverse().find(s => abs(s.dag, s.to) <= abs(sk.dag, sk.from) + 1), to: pls.find(s => abs(s.dag, s.from) >= abs(sk.dag, sk.to) - 1) });
  const outgoing = new Set();
  for (const k of segs.filter(s => s.slot === SK)) if (shifts[k.id] && abs(k.dag, k.from) <= cur) { const pr = pair(k); if (pr.from) outgoing.add(pr.from.slot); }
  let pl = pls.find(s => inSeg(s)), sk = segs.find(s => s.slot === SK && inSeg(s)), shiftedAt = null, from = null, to = null;
  if (sk) { ({ from, to } = pair(sk)); if (shifts[sk.id] && to) { shiftedAt = shifts[sk.id].t; pl = to; } }
  else if (!pl) {   // efter et bekræftet skifte, før næste blok starter
    const last = [...segs].reverse().find(s => s.slot === SK && abs(s.dag, s.from) <= cur && shifts[s.id]);
    if (last) { const pr = pair(last); if (pr.to && cur < abs(pr.to.dag, pr.to.to)) { pl = pr.to; shiftedAt = shifts[last.id].t; sk = last; from = pr.from; to = pr.to; } }
  }
  const nextSeg = pls.find(s => abs(s.dag, s.from) > (pl ? abs(pl.dag, pl.from) : cur) && abs(s.dag, s.from) > cur - 0 && (!pl || s.slot !== pl.slot));
  return { pl, sk, nextSeg, from, to, shiftedAt, outgoing, cur, abs, segs };
}
const slotDone = (slot, st) => S.pl.done[slot] === 1 || (S.pl.done[slot] !== -1 && st.outgoing && st.outgoing.has(slot)) || (S.pl.done[slot] !== -1 && st.segs.filter(s => s.slot === slot).length > 0 && st.segs.filter(s => s.slot === slot).every(s => st.abs(s.dag, s.to) <= st.cur));
function plCard(link) {
  if (!S.pl.ready) return `<a class="card" href="#/patruljer/pl"><div class="t">PL-skifteplan</div><div class="n">Opsæt patruljens PL-plan</div><div class="p">Skriv navnene, så husker appen, hvem der har været PL.</div></a>`;
  const st = plState(), col = PL_COL[S.pl.n], sw = c => `<i style="width:10px;height:34px;border-radius:3px;background:${c};flex:none"></i>`;
  if (st.sk && !st.shiftedAt && st.to) return `<a class="card now" href="#/patruljer/pl"><div class="t">PATRULJENS TIME · PL SKIFTER</div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0 10px">${sw(st.from ? col[st.from.slot] : "var(--line)")}<div><div class="n">${esc(st.from ? plName(st.from.slot) : "–")}</div><div class="p">går af som PL</div></div><b style="font-size:22px;color:var(--mu);margin:0 4px">→</b>${sw(col[st.to.slot])}<div><div class="n">${esc(plName(st.to.slot))}</div><div class="p">bliver PL</div></div></div>
    <button class="btn" data-act="plshift:${st.sk.id}" style="margin:0">Skift PL nu</button><div class="p" style="margin-top:6px">Skiftes automatisk, når Patruljens time slutter.</div></a>`;
  const who = st.pl ? `<div class="n">${esc(plName(st.pl.slot))}</div><div class="p">${st.shiftedAt ? `Skiftet kl. ${esc(st.shiftedAt)} · ` : ""}PL til ${DAYS[st.pl.dag].slice(0, 3)} ${st.pl.to}</div>` : `<div class="n">Ingen PL lige nu</div>${st.nextSeg ? `<div class="p">Næste: ${esc(plName(st.nextSeg.slot))} · ${DAYS[st.nextSeg.dag].slice(0, 3)} ${st.nextSeg.from}</div>` : ""}`;
  return `<a class="card now" href="#/patruljer/pl"><div class="t">NU ER PL</div><div style="display:flex;gap:10px;align-items:center">${sw(st.pl ? col[st.pl.slot] : "var(--line)")}<div style="flex:1">${who}</div>${st.shiftedAt && st.sk ? `<button data-act="plundo:${st.sk.id}" style="color:var(--act);font-weight:700;font-size:13px;padding:6px">Fortryd</button>` : ""}</div>${st.pl && st.nextSeg ? `<div class="p" style="margin-top:6px">Næste: ${esc(plName(st.nextSeg.slot))} · ${DAYS[st.nextSeg.dag].slice(0, 3)} ${st.nextSeg.from}</div>` : ""}</a>`;
}
function plSvg() {
  const n = S.pl.n, col = PL_COL[n], W = 358, gx = 30, top = 22, ph = 17.5, T0 = 420, colw = (W - gx - 6) / 6, H = top + 16 * ph + 8, ed = S.plEdit;
  const y = m => top + ((m - T0) / 60) * ph, now1 = now(), nowm = now1.getHours() * 60 + now1.getMinutes(), di = dayIdx(ymd(now1));
  let s = `<svg id="plsvg" class="ov plsvg ${ed ? "edit" : ""}" viewBox="0 0 ${W} ${H}">`;
  DAYS.forEach((d, i) => s += `<text class="ov-mu" x="${gx + i * colw + colw / 2}" y="12" font-size="10" font-weight="800" text-anchor="middle">${d.slice(0, 3)}</text>`);
  for (let h = 7; h <= 23; h += 2) s += `<line class="ov-grid" x1="${gx - 2}" x2="${gx + 6 * colw}" y1="${y(h * 60)}" y2="${y(h * 60)}"/><text class="ov-mu" x="${gx - 5}" y="${y(h * 60) + 3}" font-size="8" text-anchor="end">${String(h).padStart(2, "0")}</text>`;
  for (const sg of plTpl()) {
    const x = gx + sg.dag * colw + 1, y0 = y(mm(sg.from)), h = ((mm(sg.to) - mm(sg.from)) / 60) * ph, w = colw - 2, skf = sg.slot === SK, c = skf ? "#14161a" : col[sg.slot] || "#999";
    s += `<g><rect data-seg="${sg.id}" x="${x}" y="${y0}" width="${w}" height="${h}" rx="4" fill="${c}"/><text x="${x + w / 2}" y="${y0 + h / 2 + 3}" font-size="8" font-weight="700" text-anchor="middle" fill="${skf || PL_DARK.has(c) ? "#fff" : "#14161a"}" pointer-events="none">${skf ? "PT" : esc(plName(sg.slot).slice(0, 7))}</text>`;
    if (ed) s += `<rect data-h="${sg.id}:t" x="${x}" y="${y0 - 3}" width="${w}" height="9" fill="#fff" fill-opacity=".001" /><rect x="${x + w / 2 - 8}" y="${y0 - 1}" width="16" height="3" rx="1.5" fill="#fff" stroke="#14161a" stroke-width=".6" pointer-events="none"/><rect data-h="${sg.id}:b" x="${x}" y="${y0 + h - 6}" width="${w}" height="9" fill="#fff" fill-opacity=".001"/><rect x="${x + w / 2 - 8}" y="${y0 + h - 2}" width="16" height="3" rx="1.5" fill="#fff" stroke="#14161a" stroke-width=".6" pointer-events="none"/>`;
    s += `</g>`;
  }
  if (di >= 0) { const ny = Math.min(Math.max(y(nowm), top), y(1380)); s += `<line x1="${gx - 6}" x2="${gx + 6 * colw + 2}" y1="${ny}" y2="${ny}" class="ov-now-line"/>`; }
  return s + `</svg>`;
}
function viewPL(id) {
  const n = S.pl.n, col = PL_COL[n];
  if (!S.pl.ready || S.plSetup) {
    while (S.pl.names.length < n) S.pl.names.push("");
    let h = `<h2>Antal i patruljen</h2><div class="seg" style="margin-top:0">${[6, 7].map(k => `<button data-act="pln:${k}" class="${n === k ? "on" : ""}">${k} kursister</button>`).join("")}</div>
      <h2>Navne · hvem er PL hvornår <span style="font-weight:400;text-transform:none;letter-spacing:0">· brug ▲▼ til at flytte et navn</span></h2><div id="pllist">`;
    for (let i = 0; i < n; i++) { const f = plTpl().find(s => s.slot === i); h += `<div class="card plrow" data-i="${i}" style="display:flex;align-items:center;gap:8px;padding:8px 8px 8px 18px"><i style="position:absolute;left:0;top:0;bottom:0;width:6px;background:${col[i]}"></i><div style="width:62px;flex:none"><b style="font-size:13px">${i + 1}. PL</b><div class="muted" style="font-size:10px">${f ? DAYS[f.dag].slice(0, 3) + " " + f.from : ""}</div></div><input data-plname="${i}" value="${esc(S.pl.names[i] || "")}" placeholder="Navn ${i + 1}" style="flex:1;min-width:0"><div style="display:flex;flex-direction:column;gap:2px;flex:none"><button class="mv" data-act="plmove:${i}:-1" aria-label="Flyt op" ${i === 0 ? "disabled" : ""}>▲</button><button class="mv" data-act="plmove:${i}:1" aria-label="Flyt ned" ${i === n - 1 ? "disabled" : ""}>▼</button></div></div>`; }
    return h + `<button class="btn" data-act="plsave">Gem patrulje</button><div class="hint">Navnene gemmes kun på din telefon.</div>`;
  }
  const st = plState();
  let h = `<div style="margin-top:12px">${plCard(id)}</div>`;
  h += `<div class="seg"><button data-act="plv:liste" class="${S.plView === "liste" ? "on" : ""}">Liste</button><button data-act="plv:skema" class="${S.plView === "skema" ? "on" : ""}">Skema</button></div>`;
  if (S.plView === "liste") {
    const doneN = [...Array(n).keys()].filter(i => slotDone(i, st)).length;
    h += `<div class="line"><h2 style="margin:0">${doneN} af ${n} har været PL</h2><span class="bar" style="width:110px;margin:0"><i style="width:${(doneN / n) * 100}%;background:var(--ac)"></i></span></div>`;
    for (let i = 0; i < n; i++) {
      const mine = st.segs.filter(s => s.slot === i), dn = slotDone(i, st), isNow = st.pl && st.pl.slot === i, isNext = !!(st.nextSeg && st.nextSeg.slot === i && !isNow), hand = st.sk && !st.shiftedAt && st.to ? (st.from && st.from.slot === i ? "Går af" : st.to.slot === i ? "Overtager" : "") : "";
      h += `<div class="card ${dn ? "past" : ""}" style="display:flex;align-items:center;gap:10px;padding-left:18px"><i style="position:absolute;left:0;top:8px;bottom:8px;width:6px;border-radius:3px;background:${col[i]}"></i><div style="flex:1"><div class="n">${esc(plName(i))} ${hand ? `<span class="chip ${hand === "Går af" ? "edit" : ""}">${hand}</span>` : isNow ? '<span class="rec"><i></i>Nu</span>' : isNext ? '<span class="chip dim">Næste</span>' : ""}</div><div class="p">${mine.map(s => `${DAYS[s.dag].slice(0, 3)} ${s.from}–${s.to}`).join(" · ")}</div></div><button class="cb ${dn ? "on" : ""}" data-act="pldone:${i}" aria-label="Har været PL">${dn ? "✓" : ""}</button></div>`;
    }
    h += `<div class="hint">Boksen krydses også af sig selv, når turen er slut. Sort “PT” i skemaet = patruljens time, hvor PL skifter.</div>`;
  } else {
    h += `<div class="box" style="padding:10px"><div class="row2" style="margin:0 0 8px"><div class="seg" style="flex:1;margin:0">${[6, 7].map(k => `<button data-act="pln:${k}" class="${n === k ? "on" : ""}">${k}</button>`).join("")}</div><button class="pill ${S.plEdit ? "on" : ""}" data-act="pledit">✎ Ret skema</button></div><div id="plwrap">${plSvg()}</div>
      <div class="ovleg">${[...Array(n).keys()].map(i => `<span><i style="background:${col[i]};width:9px"></i>${esc(plName(i))}</span>`).join("")}<span><i style="background:#14161a"></i>PT = PL skifter</span></div>
      ${S.plEdit ? `<div class="hint">Træk i kanten af en blok for at ændre tiden. Tryk på en blok for at skifte person eller slette den.</div><div class="row2"><button class="btn alt" data-act="pladd">+ Ny blok</button><button class="btn ghost" data-act="plreset">Nulstil skema</button></div>` : ""}</div>`;
  }
  return h + `<button class="btn ghost" data-act="plsetup">Rediger navne og antal</button>`;
}
function openPlBlock(id) {
  const sg = plTpl().find(s => s.id === id); if (!sg) return;
  const opts = [...Array(S.pl.n).keys()].map(i => `<option value="${i}" ${sg.slot === i ? "selected" : ""}>${esc(plName(i))}</option>`).join("");
  const bg = document.createElement("div"); bg.className = "sheetbg";
  bg.innerHTML = `<div class="sheet"><h1 style="font-size:20px">Ret blok</h1><div class="field"><label>Hvem</label><select id="pls"><option value="-1" ${sg.slot === SK ? "selected" : ""}>Patruljens time – PL skifter</option>${opts}</select></div>
    <div class="field"><label>Dag</label><select id="pld">${DAYS.map((d, i) => `<option value="${i}" ${sg.dag === i ? "selected" : ""}>${d}</option>`).join("")}</select></div>
    <div class="row2"><div class="field" style="flex:1"><label>Fra</label><input id="plf" type="time" step="900" value="${sg.from}"></div><div class="field" style="flex:1"><label>Til</label><input id="plt" type="time" step="900" value="${sg.to}"></div></div>
    <div class="row2"><button class="btn alt" data-x="del">Slet blok</button><button class="btn" data-x="save">Gem</button></div><button class="btn ghost" data-x="close">Annullér</button></div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", ev => {
    const x = ev.target.dataset.x;
    if (ev.target === bg || x === "close") return bg.remove();
    if (x === "del") { S.pl.tpl[S.pl.n] = plTpl().filter(s => s.id !== id); savePl(); bg.remove(); render(); }
    if (x === "save") {
      const f = bg.querySelector("#plf").value, t = bg.querySelector("#plt").value;
      if (f && t && mm(t) > mm(f)) { sg.slot = +bg.querySelector("#pls").value; sg.dag = +bg.querySelector("#pld").value; sg.from = f; sg.to = t; savePl(); bg.remove(); render(); }
    }
  });
}
// træk i kanter (skema) og træk for at flytte navne
function bindPlDrag() {
  const wrap = document.getElementById("plwrap");
  if (wrap && S.plEdit) {
    wrap.addEventListener("pointerdown", ev => {
      const hEl = ev.target.closest("[data-h]"); if (!hEl) return;
      ev.preventDefault();
      const [id, edge] = hEl.dataset.h.split(":"), sg = plTpl().find(s => s.id === id); if (!sg) return;
      const move = e => {
        const svg = document.getElementById("plsvg"), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        let m = Math.round((420 + ((p.y - 22) / 17.5) * 60) / 15) * 15; m = Math.max(420, Math.min(1380, m));
        if (edge === "t") sg.from = hhmm(Math.min(m, mm(sg.to) - 15)); else sg.to = hhmm(Math.max(m, mm(sg.from) + 15));
        wrap.innerHTML = plSvg();
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); savePl(); render(); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
    wrap.addEventListener("click", ev => { const b = ev.target.closest("[data-seg]"); if (b && S.plEdit && !ev.target.closest("[data-h]")) openPlBlock(b.dataset.seg); });
  }
}

// ---------- Patruljer ----------
function myPatrolName() {
  const o = ls.get("lp_patrol"); if (o) return o;
  const p = (S.data.patruljer || []).find(p => p.vejledere.some(v => whoIs(v) === S.me));
  return p ? p.navn : null;
}
const patrolDot = (c, s = 28) => `<i style="display:inline-block;width:${s}px;height:${s}px;border-radius:${Math.round(s / 4)}px;background:${c};${c === "#ffffff" ? "box-shadow:inset 0 0 0 1.5px var(--line)" : ""};flex:none"></i>`;
function viewPatruljer(sub, hi) {
  sub = sub || "liste";
  const P = S.data.patruljer || [], my = myPatrolName(), mp = P.find(p => p.navn === my);
  let h = `<div class="top"><div><h1>Patruljer</h1><div class="sub">${P.length} patruljer · ${P.reduce((n, p) => n + p.vejledere.length, 0)} vejledere</div></div>${ALIEN}</div>
    <div class="tabs" style="margin:12px -16px">${[["liste", "Patruljer"], ["pl", "PL-plan"], ["lejr", "Lejrplads"], ["team", "Team"]].map(([k, l]) => `<a href="#/patruljer/${k}" class="${sub === k ? "on" : ""}">${l}</a>`).join("")}</div>`;
  if (sub === "pl") {
    h += mp ? `<div class="line" style="padding:0 0 4px">${patrolDot(mp.farve, 22)}<b style="flex:1">${esc(mp.navn)}</b><span class="muted">${esc(mp.vejledere.join(" & "))}</span></div>` : `<div class="box muted">Vælg din patrulje under “Patruljer”, så vi ved, hvem PL-planen gælder.</div>`;
    return h + viewPL("pl");
  }
  if (sub === "team") {
    if (hi) S.teamQ = "";
    hi = hi ? decodeURIComponent(hi) : "";
    const q = (S.teamQ || "").toLowerCase(), col = n => { const pp = P.find(p => p.vejledere.some(v => whoIs(v) === n)); return pp ? patrolDot(pp.farve, 18) : '<i style="width:18px"></i>'; };
    h += `<input id="tq" placeholder="Søg teamer …" value="${esc(S.teamQ || "")}" style="margin:4px 0 10px">`;
    const list = [...S.data.personer].sort((a, b) => a.localeCompare(b, "da")).filter(n => !q || n.toLowerCase().includes(q));
    h += list.map(n => { const t = (S.data.telefon || {})[n]; return `<div class="card ${n === hi ? "hi" : ""}" style="display:flex;align-items:center;gap:10px;padding-left:16px">${col(n)}<div style="flex:1"><div class="n">${esc(n)}${n === S.me ? ' <span class="chip">dig</span>' : ""}</div><div class="p">${t ? esc(t) : "Intet nummer endnu"}</div></div>${t ? `<a class="pill on" href="tel:${esc(t)}" style="text-decoration:none;color:var(--tx)">Ring</a><a class="pill on" href="sms:${esc(t)}" style="text-decoration:none;color:var(--tx)">SMS</a>` : ""}</div>`; }).join("") || '<div class="box muted">Ingen teamere fundet.</div>';
    return h;
  }
  if (sub === "lejr") {
    h += `<div class="box" style="font-size:14px">Hver patrulje har sin egen lejrplads, så pladsen føles som deres egen og ikke som en lejrgade.<div class="row2" style="margin-top:10px"><div class="box" style="margin:0;flex:1"><div class="muted">Patruljeplads</div><b>10 × 10 m</b></div><div class="box" style="margin:0;flex:1"><div class="muted">Huggeplads</div><b>10 × 10 m</b></div></div></div>`;
    if (S.data.lejrkort) h += `<h2>Fordeling af lejrpladser og PT-steder</h2><button class="box" data-act="kort" style="padding:6px;display:block;width:100%"><img src="${S.data.lejrkort}" alt="Kort over lejrpladser og PT-steder" style="width:100%;border-radius:10px;display:block"><div class="muted" style="padding:6px 4px 2px;text-align:right">Tryk for fuld skærm ⤢</div></button>`;
    h += `<h2>PT-steder</h2>` + P.map(p => `<div class="card" style="display:flex;gap:12px;align-items:center;padding-left:18px">${patrolDot(p.farve, 24)}<div><div class="n">${esc(p.navn)}</div><div class="p">${esc(p.pt)} · lejrplads ${esc(p.lejr)}</div></div></div>`).join("");
    return h;
  }
  if (S.data.fotoLink) h += `<a class="btn" href="${esc(S.data.fotoLink)}" target="_blank" rel="noopener" style="margin:0 0 12px">📷 Billeder af kursisterne</a>`;
  if (mp) h += `<div class="card now" style="padding-left:18px"><div class="t">DIN PATRULJE</div><div style="display:flex;align-items:center;gap:12px">${patrolDot(mp.farve, 34)}<div><div class="n">${esc(mp.navn)} · ${esc(mp.vejledere.join(" & "))}</div><div class="p">PT: ${esc(mp.pt)}</div></div></div></div>`;
  h += P.map(p => { const me = p.navn === my;
    return `<div class="card" style="padding-left:18px;${me ? "box-shadow:inset 0 0 0 2px var(--now)" : ""}"><div style="display:flex;align-items:center;gap:12px">${patrolDot(p.farve, 30)}<div style="flex:1"><div class="n">${esc(p.navn)}</div><div class="names" style="margin-top:4px">${p.vejledere.map(personChip).join("")}</div></div><button class="pill ${me ? "on" : ""}" data-act="patrol:${esc(p.navn)}">${me ? "★ Min" : "Min?"}</button></div><div class="p" style="margin-top:8px">PT: ${esc(p.pt)} · lejrplads ${esc(p.lejr)}</div></div>`; }).join("");
  if ((S.data.udenPatrulje || []).length) h += `<div class="hint">Uden patrulje på tavlen: ${S.data.udenPatrulje.map(esc).join(", ")}</div>`;
  return h;
}
// ---------- teamkontakter ----------
const phoneOf = n => (S.data.telefon || {})[whoIs(n)] || "";
function openPerson(name) {
  const t = phoneOf(name); if (!t) return;
  const bg = document.createElement("div"); bg.className = "sheetbg";
  bg.innerHTML = `<div class="sheet"><h1 style="font-size:22px">${esc(name)}</h1><div class="sub" style="font-size:15px;margin:4px 0 14px">${esc(t)}</div>
    <div class="row2"><a class="btn" href="tel:${esc(t)}" style="text-decoration:none">Ring</a><a class="btn alt" href="sms:${esc(t)}" style="text-decoration:none">SMS</a></div>
    <div class="row2"><button class="btn alt" data-x="copy">Kopiér nummer</button><button class="btn ghost" data-x="close">Luk</button></div></div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", ev => { const x = ev.target.dataset.x; if (ev.target === bg || x === "close") bg.remove(); if (x === "copy") { try { navigator.clipboard.writeText(t); ev.target.textContent = "Kopieret ✓"; } catch {} } });
}
const personChip = n => { const w = whoIs(n), me = w === S.me ? "me" : ""; return S.data.personer.includes(w) ? `<a class="${me}" href="#/patruljer/team/${encodeURIComponent(w)}" style="padding:5px 11px;border-radius:14px;background:var(--card2);font-size:13px;color:var(--tx);text-decoration:none">${esc(n)}</a>` : `<span class="${me}">${esc(n)}</span>`; };
function openKort() {
  const bg = document.createElement("div"); bg.className = "sheetbg"; bg.style.alignItems = "stretch";
  bg.innerHTML = `<div style="background:var(--bg);width:100%;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;padding-top:calc(12px + env(safe-area-inset-top))"><b>Lejrpladser og PT-steder</b><button class="pill on" data-x="close" style="color:var(--tx)">Luk ✕</button></div><div style="overflow:auto;flex:1;-webkit-overflow-scrolling:touch"><img src="${S.data.lejrkort}" style="width:220%;max-width:none;display:block;background:#fff"></div></div>`;
  document.body.appendChild(bg); bg.addEventListener("click", ev => { if (ev.target.dataset.x === "close") bg.remove(); });
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
  let ev = allEvents().filter(e => !S.hide[e.id] && (c.aud === "begge" || e.maalgruppe === c.aud) && c.days.includes(dayIdx(e.dato)) && !c.skip.includes(actKey(e)));
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
  else if (r === "patruljer") { h = viewPatruljer(a, b); tab = "patruljer"; }
  else { h = viewUge(a); tab = "uge"; }
  $app.innerHTML = h + nav(tab);
  updateNowLine(); bindPlDrag();
  const hiEl = document.querySelector(".card.hi"); if (hiEl) setTimeout(() => hiEl.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
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
  else if (act === "news") { const id = p.join(":"); let d = []; try { d = JSON.parse(ls.get("lp_news", "[]")); } catch {} if (!d.includes(id)) d.push(id); ls.set("lp_news", JSON.stringify(d)); }
  else if (act === "past") S.showPast = !S.showPast;
  else if (act === "hidemode") S.hideMode = !S.hideMode;
  else if (act === "hide") { const id = p.join(":"); S.hide[id] ? delete S.hide[id] : (S.hide[id] = 1); saveHide(); }
  else if (act === "unhideall") { S.hide = {}; saveHide(); }
  else if (act === "ht") S.todoTab = p[0];
  else if (act === "pln") { S.pl.n = +p[0]; while (S.pl.names.length < S.pl.n) S.pl.names.push(""); savePl(); }
  else if (act === "plsave") { for (let i = 0; i < S.pl.n; i++) if (!(S.pl.names[i] || "").trim()) S.pl.names[i] = `Kursist ${i + 1}`; S.pl.names.length = S.pl.n; S.pl.ready = true; S.plSetup = false; savePl(); }
  else if (act === "plsetup") S.plSetup = true;
  else if (act === "patrol") { const nm = p.join(":"); if (ls.get("lp_patrol") === nm) ls.del("lp_patrol"); else ls.set("lp_patrol", nm); }
  else if (act === "kort") return openKort();
  else if (act === "person") return openPerson(p.join(":"));
  else if (act === "plshift") { const t = now(); (S.pl.shifts = S.pl.shifts || {})[p.join(":")] = { t: String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") }; savePl(); }
  else if (act === "plundo") { if (S.pl.shifts) delete S.pl.shifts[p.join(":")]; savePl(); }
  else if (act === "plmove") {
    const i = +p[0], d = +p[1], k = i + d; if (k < 0 || k >= S.pl.n) return;
    const rows = [...document.querySelectorAll("#pllist .plrow")]; if (!rows[i] || !rows[k]) return;
    const a = rows[i].querySelector("input"), b = rows[k].querySelector("input"), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    while (S.pl.names.length < S.pl.n) S.pl.names.push("");
    [S.pl.names[i], S.pl.names[k]] = [S.pl.names[k], S.pl.names[i]]; [a.value, b.value] = [b.value, a.value]; savePl();
    for (const [el, from] of [[a, rb.top - ra.top], [b, ra.top - rb.top]]) { el.style.transition = "none"; el.style.transform = `translateY(${from}px)`; el.style.position = "relative"; el.style.zIndex = "2"; el.classList.add("moved"); void el.offsetWidth; el.style.transition = "transform .35s ease"; el.style.transform = ""; setTimeout(() => { el.classList.remove("moved"); el.style.zIndex = ""; }, 900); }
    return;
  }
  else if (act === "plv") S.plView = p[0];
  else if (act === "pledit") S.plEdit = !S.plEdit;
  else if (act === "pldone") { const i = +p[0], st = plState(), d = slotDone(i, st); S.pl.done[i] = d ? -1 : 1; savePl(); }
  else if (act === "pladd") { const t = plTpl(); t.push({ id: "s" + Date.now().toString(36), slot: 0, dag: Math.max(0, dayIdx(ymd(now()))), from: "09:00", to: "10:00" }); savePl(); }
  else if (act === "plreset") { if (confirm("Nulstil skemaet til standard?")) { delete S.pl.tpl[S.pl.n]; savePl(); } }
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
  else if (act === "exp") return saveFile("lommeplan-sikkerhedskopi.json", JSON.stringify({ v: 1, navn: S.me, rettelser: S.over, huskeliste: S.todo, pl: S.pl, claim: S.claim, skjult: S.hide }, null, 1), "application/json", true);
  else if (act === "resetall") { if (confirm("Nulstil alle dine rettelser?")) { S.over = {}; saveOver(); } }
  else if (act === "demooff") { S.demo = null; ls.del("lp_demo"); }
  else if (act === "logout") { if (confirm("Glem nøglen? Du skal bruge dit link eller din kode igen.")) { ["lp_key", "lp_name", "lp_exp", "lp_onb"].forEach(ls.del); S.data = null; S.me = null; S.onb = 0; } }
  render();
});
document.addEventListener("input", ev => {
  if (ev.target.id === "tq") { S.teamQ = ev.target.value; const pos = ev.target.selectionStart; render(); const el = document.getElementById("tq"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; } const el = ev.target; if (el.dataset && el.dataset.plname !== undefined) { S.pl.names[+el.dataset.plname] = el.value; savePl(); } });
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
          saveTodo(); if (o.pl) { S.pl = { ...S.pl, ...o.pl }; savePl(); } if (o.claim) { S.claim = { ...S.claim, ...o.claim }; saveClaim(); } if (o.skjult) { S.hide = { ...S.hide, ...o.skjult }; saveHide(); }
          if (o.navn && !S.me) { S.me = o.navn; ls.set("lp_name", S.me); }
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
