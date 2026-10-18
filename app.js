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
  aud: ls.get("lp_aud", "begge"), viewAs: ls.get("lp_viewas", ""), withPartner: ls.get("lp_partner") === "1", vopen: false, vq: "", demo: ls.get("lp_demo") || null,
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
const PALIAS = { bondo: "Bondo", marie: "Bondo", "marie b": "Bondo", "marie e": "Bondo", mads: "Mads", havbro: "Mads", mathilde: "Mathilde G", "mathilde m": "Mathilde G", "mathilde g": "Mathilde G", alsa: "Asla" };
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
function mineOnFor(name, id, dag) {   // dagsspecifik bemanding: kun de dage, personen står på
  const a = S.data.aktiviteter[id]; if (!a || !name) return false;
  if (name === S.me) { const c = S.claim[id]; if (c === 1) return true; if (c === -1) return false; }
  if (a.ansvarligNavne.includes(name)) return true;
  const bd = a.bemandingDage || {};
  if (Object.keys(bd).length) return (bd[dag] || []).includes(name);
  const mine = (a.roller || []).filter(r => r.navne.some(n => whoIs(n) === name));
  if (mine.length) return mine.some(r => !r.dage || !r.dage.length || r.dage.includes(dag));
  return !(a.roller || []).length && a.bemanding.includes(name);
}
const mineOn = (id, dag) => mineOnFor(S.me, id, dag);
function partnersOf(name) { const p = (S.data.patruljer || []).find(p => p.vejledere.some(v => whoIs(v) === name)); return p ? p.vejledere.map(whoIs).filter(n => n !== name && S.data.personer.includes(n)) : []; }
const viewNames = () => (S.viewAs ? [S.viewAs, ...(S.withPartner ? partnersOf(S.viewAs) : [])] : []);
const whoOn = e => (e.aktivitet ? viewNames().filter(n => mineOnFor(n, e.aktivitet, e.dag)) : []);
const isMine = e => !!(e.aktivitet && mineOn(e.aktivitet, e.dag));
function visible(e) {
  if (S.aud === "kursist" && e.maalgruppe !== "kursist") return false;
  if (S.aud === "team" && e.maalgruppe !== "team") return false;
  if (S.viewAs && e.aktivitet && S.data.aktiviteter[e.aktivitet] && !whoOn(e).length) return false;
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
  const tags = (st === "now" ? '<span class="rec"><i></i>NU</span>' : "") + (S.viewAs ? (whoOn(e).length ? `<span class="chip">★ ${esc(whoOn(e).map(n => (n === S.me && S.viewAs === S.me && !S.withPartner ? "mine" : n)).join(" + "))}</span>` : "") : mine ? '<span class="chip">★ mine</span>' : "") + (e.maalgruppe === "team" && S.aud === "begge" && !o.lane ? '<span class="chip team">T</span>' : "") + (e.rettet ? '<span class="chip edit">rettet</span>' : "");
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
const minePill = () => {
  const pers = [...S.data.personer].sort((x, y) => x.localeCompare(y, "da")), q = S.vq.toLowerCase(), P = S.data.patruljer || [];
  const dot = n => { const p = P.find(p => p.vejledere.some(v => whoIs(v) === n)); return p ? patrolDot(p.farve, 16) : '<i style="display:inline-block;width:16px"></i>'; };
  const label = !S.viewAs ? "Alle teamere" : S.viewAs === S.me ? `Mig (${esc(S.me)})` : esc(S.viewAs), part = S.viewAs ? partnersOf(S.viewAs) : [];
  let h = `<div style="display:flex;gap:8px;align-items:stretch;margin:10px 0"><button data-act="vopen" style="flex:1;text-align:left;background:var(--card);border:2px solid ${S.vopen ? "var(--act)" : "var(--line)"};border-radius:16px;padding:8px 12px"><span class="muted" style="font-size:9px;font-weight:800;letter-spacing:.06em;display:block">VISNING FOR</span><b>${label}</b> <span class="muted">${S.vopen ? "▴" : "▾"}</span></button>`;
  if (part.length) h += `<button data-act="vpartner" class="pill ${S.withPartner ? "on" : ""}" style="background:${S.withPartner ? "var(--mine)" : "var(--card)"};color:${S.withPartner ? "#000" : "var(--mu)"};font-weight:800">${S.withPartner ? "★ + " : "+ "}${esc(part.join(" & "))} (makker)${S.withPartner ? " ✓" : ""}</button>`;
  h += `</div>`;
  if (S.vopen) h += `<div class="box" style="padding:8px;margin:-4px 0 10px"><input id="vq" placeholder="🔎 Søg teamer …" value="${esc(S.vq)}" style="margin-bottom:6px">` + [["", "Alle teamere"], ...(S.me ? [[S.me, `Mig (${S.me})`]] : []), ...pers.filter(n => n !== S.me && (!q || n.toLowerCase().includes(q))).map(n => [n, n])].filter(([v, l]) => !q || v === "" || l.toLowerCase().includes(q) || v.toLowerCase().includes(q)).map(([v, l]) => `<button data-act="vset:${esc(v)}" style="display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:9px 8px;border-radius:8px;${(S.viewAs || "") === v ? "background:#d9f7e6;color:#000;font-weight:800" : ""}">${v ? dot(v === S.me ? S.me : v) : '<i style="width:16px"></i>'}<span style="flex:1">${esc(l)}</span>${(S.viewAs || "") === v ? "✓" : ""}</button>`).join("") + `</div>`;
  if (S.demo) h += `<div class="chips"><span class="pill">Demo-tid ${esc(S.demo.replace("T", " "))}</span></div>`;
  return h;
};
const nav = r => `<nav class="bar2"><div class="in">${[["uge", "▤", "Uge"], ["husk", "☑", "Huskeliste"], ["patruljer", "⚑", "Patruljer"], ...(S.evalOn ? [["eval", "✎", "Evaluering"]] : []), ["mine", "★", "Mig"]].map(([k, i, l]) => `<a href="#/${k}" class="${r === k ? "on" : ""}"><i>${i}</i>${l}</a>`).join("")}</div></nav>`;

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
  let h = `<div class="top"><div><h1>Ugen</h1><div class="sub">${fmtD(DATES[0])}–${fmtD(DATES[5])} 2026</div></div><div style="display:flex;gap:10px;align-items:center"><a href="#/soeg" class="pill on" style="text-decoration:none;color:var(--tx);border-color:var(--line)">🔎 Søg</a>${ALIEN}</div></div>`;
  const dism = (() => { try { return JSON.parse(ls.get("lp_news", "[]")); } catch { return []; } })();
  const LIVE_MS = 2 * 3600 * 1000;   // forældede beskeder skjules automatisk 2 timer efter udløb
  for (const nw of S.data.nyheder || []) if (now().getTime() <= Date.parse(nw.til.length === 10 ? nw.til + "T23:59" : nw.til) + LIVE_MS && !dism.includes(nw.id)) h += `<div class="box" style="border:2px solid var(--now);background:var(--card2)"><div class="line" style="padding:0 0 4px;align-items:flex-start"><b>📢 ${esc(nw.titel)}</b><button data-act="news:${esc(nw.id)}" aria-label="Luk" style="color:var(--mu);font-size:18px;padding:0 4px">✕</button></div><div style="font-size:14px">${esc(nw.tekst)}</div>${nw.kontakt ? `<a class="pill on" href="#/patruljer/team/${encodeURIComponent(nw.kontakt)}" style="display:inline-block;margin-top:8px;text-decoration:none;color:var(--tx)">📞 ${esc(nw.kontakt)}</a>` : ""}</div>`;
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

// Tidsplan med levende status: grå fortid, blinkende prik ved "nu"
function planRows(a, evs) {
  const rows = a.tidsplan || [], n = now(), WD = { søn: 0, man: 1, tir: 2, ons: 3, tor: 4, fre: 5 };
  const dates = [...new Set(evs.map(e => e.dato))].sort(); if (!rows.length || !dates.length) return null;
  const parse = (base) => {
    let off = dayIdx(base), prev = -1, out = [];
    for (const r of rows) {
      const ts = [...r.tid.matchAll(/(\d{1,2})[:.](\d{2})/g)].map(m => +m[1] * 60 + +m[2]); if (!ts.length) { out.push(null); continue; }
      const wd = r.tid.match(/\((søn|man|tir|ons|tor|fre)/i); if (wd) off = WD[wd[1].toLowerCase()]; else if (prev >= 0 && ts[0] < prev - 360) off++;
      prev = ts[0];
      const s = new Date(`${DATES[Math.max(0, off)]}T${hhmm(ts[0])}:00`); let e = ts[1] !== undefined ? new Date(`${DATES[Math.max(0, off)]}T${hhmm(ts[1])}:00`) : null; if (e && e <= s) e = new Date(e.getTime() + 864e5);
      out.push({ s, e });
    }
    for (let i = 0; i < out.length; i++) if (out[i] && !out[i].e) { const nx = out.slice(i + 1).find(Boolean); out[i].e = nx ? nx.s : new Date(out[i].s.getTime() + 36e5); }
    return out;
  };
  let best = null;
  for (const d of dates) { const t = parse(d), v = t.filter(Boolean); if (!v.length) continue; best = best || t; if (n >= v[0].s && n < v[v.length - 1].e) { best = t; break; } }
  return best;
}
function tidslinje(a, evs) {
  const times = planRows(a, evs), n = now();
  if (!a.tidsplan.length) return `<div class="box muted">Beskrivelsen har ingen tidsplan som liste.</div>`;
  let h = `<div class="tline">`, placed = false;
  a.tidsplan.forEach((r, i) => {
    const t = times && times[i], st = !t ? "" : t.e <= n ? "past" : t.s <= n ? "now" : "future";
    if (!placed && t && st === "future" && i > 0 && times[i - 1] && times[i - 1].e <= n && times.slice(0, i).some(x => x && x.e <= n)) { placed = true; h += `<div class="it livemark"><div class="tm" style="color:var(--rec)">● nu · ${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}</div></div>`; }
    if (st === "now") placed = true;
    h += `<div class="it ${st}"><div class="tm">${esc(r.tid)}${st === "now" ? ' <span class="rec" style="margin-left:6px"><i></i>NU</span>' : ""}</div><div class="tx">${esc(r.tekst)}</div></div>`;
  });
  return h + `</div>`;
}
const songsOf = id => (S.data.sange || {})[id] || [];
const songEmbed = (x, h = 152, dark = false) => `<iframe src="https://suno.com/embed/${esc(x.id)}" loading="lazy" title="${esc(x.titel)}" allow="autoplay; clipboard-write; encrypted-media" referrerpolicy="origin" style="width:100%;height:${h}px;border:0;border-radius:12px;margin-top:6px;background:${dark ? "rgba(0,0,0,.3)" : "var(--card2)"}"></iframe>`;
function songBox(id) {
  const l = (S.data.sange || {})[id];
  if (!l || !l.length) return "";
  return l.map(x => `<div class="box song"><div class="line" style="padding:0"><b>🎵 ${esc(x.titel)}</b><a href="https://suno.com/song/${esc(x.id)}" target="_blank" rel="noopener" class="muted">Åbn i Suno ›</a></div><iframe src="https://suno.com/embed/${esc(x.id)}" loading="lazy" title="${esc(x.titel)}" allow="autoplay; clipboard-write; encrypted-media" referrerpolicy="origin" style="width:100%;height:160px;border:0;border-radius:12px;margin-top:8px;background:var(--card2)"></iframe></div>`).join("");
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
    <div class="meta"><div>🕒 ${esc(when)}</div>${a.ansvarlig ? `<div>👤 ${esc(a.ansvarlig)}</div>` : ""}${place ? `<div>📍 ${esc(place)} · ${a.stedLink ? `<a href="${esc(a.stedLink)}" target="_blank" rel="noopener">${esc(a.stedLinkTekst || "Se kort")} ›</a>` : offSite(place) ? `<a href="${mapsUrl(place)}" target="_blank" rel="noopener">Åbn i Maps ›</a>` : `<a href="#/patruljer/lejr">Se lejrkort ›</a>`}</div>` : ""}</div>
    <div class="tabs">${[["resume", "Resumé"], ["tid", "Tidsplan"], ...(hasPl ? [["pl", "PL-plan"]] : []), ["fantasi", "Fantasi"], ["bem", "Bemanding"]].map(([k, l]) => `<a href="#/a/${id}/${k}" class="${tab === k ? "on" : ""}">${l}</a>`).join("")}</div>`;
  h += `<button class="btn ${mineAct(id) ? "alt" : ""}" data-act="claim:${id}">${mineAct(id) ? "★ Det er min – tryk for at fjerne" : "☆ Det er min"}</button>`;
  if (a.note) h += `<div class="box" style="border:1.5px solid var(--mine)"><h2 style="margin:0 0 6px">Min note</h2>${paras(a.note)}</div>`;
  if (PL_IDS.includes(id) && tab === "resume") h += `<h2>PL-skifteplan</h2>${plCard(id)}`;
  if (tab === "pl" && hasPl) { return h.replace(/<button class="btn[^"]*" data-act="claim:[^>]*>[^<]*<\/button>/, "") + viewPL(id); }
  if (tab === "resume" || tab === "fantasi") h += songBox(id);
  if (tab === "resume") {
    h += `<h2>Formål</h2><div class="prose">${paras(a.formaal) || '<p class="muted">Ikke beskrevet.</p>'}</div>`;
    if (a.koncept) h += `<h2>Koncept</h2><div class="prose ${S.expand ? "" : "clamp"}">${paras(a.koncept)}</div><button class="fold" data-act="expand">${S.expand ? "Vis mindre" : "Læs hele konceptet ▾"}</button>`;
    if (a.godEnergi || a.spraengRammerne) h += `<h2>God energi / Spræng rammerne</h2><div class="prose">${paras(a.godEnergi)}${paras(a.spraengRammerne)}</div>`;
  } else if (tab === "tid") {
    h += tidslinje(a, evs);
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
  if (tab === "resume" && (S.data.memer || {})[id]) h += `<h2>Aktiviteten i ét meme</h2><div class="box" style="padding:8px">${memeSvg(S.data.memer[id])}</div>`;
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
    ${nOver ? '<button class="btn ghost" data-act="resetall">Nulstil alle rettelser</button>' : ""}</div>
    <h2>Test</h2><div class="box"><div class="line"><div><b>Vis Evaluering-fanen</b><div class="muted">Vist som standard</div></div><button class="toggle ${S.evalOn ? "on" : ""}" data-act="evaltoggle" aria-label="Evaluering"></button></div>${S.evalOn ? `<div class="line"><div><b>Tillad alle aktiviteter</b><div class="muted">Også dem, der ikke er afholdt</div></div><button class="toggle ${S.evalAll ? "on" : ""}" data-act="evalall" aria-label="Alle"></button></div>` : ""}</div>
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
  let held = false;   // der er altid en PL: man er PL, indtil den næste tager over
  if (!pl) { const last = [...pls].reverse().find(s => abs(s.dag, s.from) <= cur); if (last) { pl = last; held = true; } }
  const nextAny = pls.find(s => abs(s.dag, s.from) > cur);
  const nextSeg = pls.find(s => abs(s.dag, s.from) > (pl ? abs(pl.dag, pl.from) : cur) && abs(s.dag, s.from) > cur - 0 && (!pl || s.slot !== pl.slot));
  return { pl, sk, nextSeg, nextAny, from, to, shiftedAt, outgoing, held, cur, abs, segs };
}
const slotDone = (slot, st) => S.pl.done[slot] === 1 || (S.pl.done[slot] !== -1 && st.outgoing && st.outgoing.has(slot)) || (S.pl.done[slot] !== -1 && st.segs.filter(s => s.slot === slot).length > 0 && st.segs.filter(s => s.slot === slot).every(s => st.abs(s.dag, s.to) <= st.cur));
function plCard(link) {
  if (!S.pl.ready) return `<a class="card" href="#/patruljer/pl"><div class="t">PL-skifteplan</div><div class="n">Opsæt patruljens PL-plan</div><div class="p">Skriv navnene, så husker appen, hvem der har været PL.</div></a>`;
  const st = plState(), col = PL_COL[S.pl.n], sw = c => `<i style="width:10px;height:34px;border-radius:3px;background:${c};flex:none"></i>`;
  if (st.sk && !st.shiftedAt && st.to) return `<a class="card now" href="#/patruljer/pl"><div class="t">PATRULJENS TIME · PL SKIFTER</div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0 10px">${sw(st.from ? col[st.from.slot] : "var(--line)")}<div><div class="n">${esc(st.from ? plName(st.from.slot) : "–")}</div><div class="p">går af som PL</div></div><b style="font-size:22px;color:var(--mu);margin:0 4px">→</b>${sw(col[st.to.slot])}<div><div class="n">${esc(plName(st.to.slot))}</div><div class="p">bliver PL</div></div></div>
    <button class="btn" data-act="plshift:${st.sk.id}" style="margin:0">Skift PL nu</button><div class="p" style="margin-top:6px">Skiftes automatisk, når Patruljens time slutter.</div></a>`;
  const who = st.pl ? `<div class="n">${esc(plName(st.pl.slot))}</div><div class="p">${st.shiftedAt ? `Skiftet kl. ${esc(st.shiftedAt)} · ` : ""}${st.held ? (st.nextAny ? (st.nextAny.slot === st.pl.slot ? `PL fortsætter ${DAYS[st.nextAny.dag].slice(0, 3)} ${st.nextAny.from}` : `PL indtil ${esc(plName(st.nextAny.slot))} tager over ${DAYS[st.nextAny.dag].slice(0, 3)} ${st.nextAny.from}`) : "Sidste PL i ugen") : `PL til ${DAYS[st.pl.dag].slice(0, 3)} ${st.pl.to}`}</div>` : `<div class="n">Ingen PL lige nu</div>${st.nextSeg ? `<div class="p">Næste: ${esc(plName(st.nextSeg.slot))} · ${DAYS[st.nextSeg.dag].slice(0, 3)} ${st.nextSeg.from}</div>` : ""}`;
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
    return h + `<button class="btn" data-act="plsave">Gem patrulje</button><button class="btn ghost" data-act="plpaste">⤓ Har du fået en plan? Indsæt den her</button><div class="hint">Navnene gemmes kun på din telefon.</div>`;
  }
  const st = plState();
  let h = `<div style="margin-top:12px">${plCard(id)}</div>`;
  h += `<div class="seg"><button data-act="plv:liste" class="${S.plView === "liste" ? "on" : ""}">Liste</button><button data-act="plv:skema" class="${S.plView === "skema" ? "on" : ""}">Skema</button></div>`;
  if (S.plView === "liste") {
    const doneN = [...Array(n).keys()].filter(i => slotDone(i, st) && !(st.pl && st.pl.slot === i)).length;
    h += `<div class="line"><h2 style="margin:0">${doneN} af ${n} har været PL</h2><span class="bar" style="width:110px;margin:0"><i style="width:${(doneN / n) * 100}%;background:var(--ac)"></i></span></div>`;
    for (let i = 0; i < n; i++) {
      const mine = st.segs.filter(s => s.slot === i), isNow = st.pl && st.pl.slot === i, dn = slotDone(i, st) && !isNow, isNext = !!(st.nextSeg && st.nextSeg.slot === i && !isNow), hand = st.sk && !st.shiftedAt && st.to ? (st.from && st.from.slot === i ? "Går af" : st.to.slot === i ? "Overtager" : "") : "";
      h += `<div class="card ${dn ? "past" : ""}" style="display:flex;align-items:center;gap:10px;padding-left:18px"><i style="position:absolute;left:0;top:8px;bottom:8px;width:6px;border-radius:3px;background:${col[i]}"></i><div style="flex:1"><div class="n">${esc(plName(i))} ${hand ? `<span class="chip ${hand === "Går af" ? "edit" : ""}">${hand}</span>` : isNow ? '<span class="rec"><i></i>Nu</span>' : isNext ? '<span class="chip dim">Næste</span>' : ""}</div><div class="p">${mine.map(s => `${DAYS[s.dag].slice(0, 3)} ${s.from}–${s.to}`).join(" · ")}</div></div><button class="cb ${dn ? "on" : ""}" data-act="pldone:${i}" aria-label="Har været PL">${dn ? "✓" : ""}</button></div>`;
    }
    h += `<div class="hint">Boksen krydses også af sig selv, når turen er slut. Sort “PT” i skemaet = patruljens time, hvor PL skifter.</div>`;
  } else {
    h += `<div class="box" style="padding:10px"><div class="row2" style="margin:0 0 8px"><div class="seg" style="flex:1;margin:0">${[6, 7].map(k => `<button data-act="pln:${k}" class="${n === k ? "on" : ""}">${k}</button>`).join("")}</div><button class="pill ${S.plEdit ? "on" : ""}" data-act="pledit">✎ Ret skema</button></div><div id="plwrap">${plSvg()}</div>
      <div class="ovleg">${[...Array(n).keys()].map(i => `<span><i style="background:${col[i]};width:9px"></i>${esc(plName(i))}</span>`).join("")}<span><i style="background:#14161a"></i>PT = PL skifter</span></div>
      ${S.plEdit ? `<div class="hint">Træk i kanten af en blok for at ændre tiden. Tryk på en blok for at skifte person eller slette den.</div><div class="row2"><button class="btn alt" data-act="pladd">+ Ny blok</button><button class="btn ghost" data-act="plreset">Nulstil skema</button></div>` : ""}</div>`;
  }
  return h + `<div class="row2"><button class="btn alt" data-act="plcopy">⧉ Kopiér plan</button><button class="btn alt" data-act="plpaste">⤓ Indsæt plan</button></div><button class="btn ghost" data-act="plsetup">Rediger navne og antal</button>`;
}
// ---------- del PL-plan som krypteret tekst ----------
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function streamBytes(stream) { return new Uint8Array(await new Response(stream).arrayBuffer()); }
async function plExport() {
  const keyB64 = ls.get("lp_key"); if (!keyB64) throw new Error("Ingen nøgle");
  const payload = { v: 1, t: new Date().toISOString().slice(0, 16), patrulje: myPatrolName() || "", pl: { n: S.pl.n, names: S.pl.names, ready: S.pl.ready, tpl: S.pl.tpl, done: S.pl.done, shifts: S.pl.shifts || {} } };
  let bytes = enc.encode(JSON.stringify(payload)), tag = "LP1.";
  if (typeof CompressionStream !== "undefined") { bytes = await streamBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))); tag = "LP1c."; }
  const key = await crypto.subtle.importKey("raw", b64d(keyB64), "AES-GCM", false, ["encrypt"]), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("lommeplan-pl") }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return tag + b64u(out);
}
async function plImport(text) {
  const m = String(text).trim().replace(/\s+/g, "").match(/(LP1c?\.[A-Za-z0-9_-]+)/); if (!m) throw new Error("Teksten ser ikke ud som en delt PL-plan.");
  const comp = m[1].startsWith("LP1c."), raw = unb64u(m[1].slice(comp ? 5 : 4)), key = await crypto.subtle.importKey("raw", b64d(ls.get("lp_key")), "AES-GCM", false, ["decrypt"]);
  let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: enc.encode("lommeplan-pl") }, key, raw.slice(12)));
  if (comp) bytes = await streamBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")));
  const o = JSON.parse(dec.decode(bytes)); if (o.v !== 1 || !o.pl) throw new Error("Ukendt format.");
  return o;
}
function openPlShare(mode) {
  const bg = document.createElement("div"); bg.className = "sheetbg"; document.body.appendChild(bg);
  const close = () => bg.remove(), msg = t => { const el = bg.querySelector(".err"); if (el) el.textContent = t; };
  if (mode === "copy") {
    bg.innerHTML = `<div class="sheet"><h1 style="font-size:20px">Kopiér PL-plan</h1><div class="sub">Krypteret tekst med navne, tider og hvem der har været PL. Send den i en besked. Kun Lommeplan kan læse den.</div><div class="field"><textarea id="plt" readonly style="min-height:110px;font-size:12px;word-break:break-all">Laver tekst …</textarea></div><div class="err" role="alert"></div>
      <div class="row2"><button class="btn" data-x="copy">Kopiér</button>${navigator.share ? '<button class="btn alt" data-x="share">Del …</button>' : ""}</div><button class="btn ghost" data-x="close">Luk</button></div>`;
    plExport().then(t => { bg.querySelector("#plt").value = t; }).catch(e => msg(String(e.message || e)));
    bg.addEventListener("click", async ev => {
      const x = ev.target.dataset.x, ta = bg.querySelector("#plt");
      if (ev.target === bg || x === "close") return close();
      if (x === "copy") { try { await navigator.clipboard.writeText(ta.value); ev.target.textContent = "Kopieret ✓"; } catch { ta.select(); msg("Markér og kopiér teksten selv."); } }
      if (x === "share") { try { await navigator.share({ text: ta.value }); } catch {} }
    });
  } else {
    bg.innerHTML = `<div class="sheet"><h1 style="font-size:20px">Indsæt PL-plan</h1><div class="sub">Indsæt den krypterede tekst, du har fået. Din nuværende PL-plan bliver erstattet.</div><div class="field"><textarea id="plt" placeholder="LP1c.…" style="min-height:110px;font-size:12px"></textarea></div><div class="err" role="alert"></div><div id="plp"></div>
      <div class="row2"><button class="btn alt" data-x="close">Annullér</button><button class="btn" data-x="read">Læs</button></div></div>`;
    let parsed = null;
    bg.addEventListener("click", async ev => {
      const x = ev.target.dataset.x;
      if (ev.target === bg || x === "close") return close();
      if (x === "read") { try { parsed = await plImport(bg.querySelector("#plt").value); const p = parsed.pl; msg(""); bg.querySelector("#plp").innerHTML = `<div class="box"><b>${p.n} kursister${parsed.patrulje ? " · " + esc(parsed.patrulje) : ""}</b><div class="muted">${esc((p.names || []).join(", "))}</div><div class="hint">Lavet ${esc(parsed.t)}</div></div>`; ev.target.textContent = "Erstat min plan"; ev.target.dataset.x = "apply"; } catch (e) { msg(e.name === "OperationError" ? "Kunne ikke åbnes. Teksten er ændret, eller den kommer fra en anden version af koden." : String(e.message || e)); } return; }
      if (x === "apply" && parsed) { const p = parsed.pl; S.pl = { ...S.pl, n: p.n, names: p.names || [], ready: true, tpl: p.tpl || {}, done: p.done || {}, shifts: p.shifts || {} }; S.plSetup = false; savePl(); close(); render(); }
    });
  }
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

// ---------- Søg i planen (BM25 i browseren, ingen AI, intet forlader telefonen) ----------
const STOP = new Set("og i på er der til af en et de den det som for med at om har har skal vil kan fra ved men ikke også så jeg vi du man hvad hvor hvem hvornår hvilken hvilke min mit mine".split(" "));
const tok = s => (String(s || "").toLowerCase().match(/\d{1,2}[:.]\d{2}|[a-zæøå0-9]+/g) || []).map(t => t.replace(".", ":"));
function chunk(text, n = 280) {
  const out = []; let cur = "";
  for (const p of String(text || "").split(/\n+/).map(x => x.trim()).filter(Boolean)) {
    for (const s of p.split(/(?<=[.!?])\s+/)) { if ((cur + " " + s).length > n && cur) { out.push(cur); cur = s; } else cur = cur ? cur + " " + s : s; }
    if (cur) { out.push(cur); cur = ""; }
  }
  return out;
}
function buildIndex() {
  const docs = [], add = (typ, titel, tekst, href, extra = "") => docs.push({ typ, titel, tekst, href, extra });
  const D = S.data;
  for (const a of Object.values(D.aktiviteter)) {
    const base = `#/a/${a.id}`, t = a.titel.split(" (")[0];
    add("akt", t, `${a.titel}. Sted: ${a.sted || ""}. Ansvarlig: ${a.ansvarlig || ""}. ${a.tidTekst || ""}`, base, "sted");
    for (const [lab, txt, tab] of [["Formål", a.formaal, "resume"], ["Koncept", a.koncept, "resume"], ["God energi", a.godEnergi, "resume"], ["Spræng rammerne", a.spraengRammerne, "resume"], ["Fantasi", a.fantasi, "fantasi"]]) for (const c of chunk(txt)) add("akt", t, c, `${base}/${tab}`, lab);
    for (const r of a.tidsplan || []) add("akt", t, `${r.tid} ${r.tekst}`, `${base}/tid`, "Tidsplan");
    for (const h of a.huskepunkter || []) add("husk", t, h, `${base}`, "Husk");
    for (const r of a.roller || []) add("rolle", t, `${r.rolle}${r.post ? " (" + r.post + ")" : ""}: ${r.navne.join(", ")} ${r.tid || ""} ${r.note || ""}`, `${base}/bem`, "Bemanding");
    for (const [d, ns] of Object.entries(a.bemandingDage || {})) add("rolle", t, `${d}: ${ns.join(", ")}`, `${base}/bem`, "Bemanding");
    if (!(a.roller || []).length && !Object.keys(a.bemandingDage || {}).length && a.bemanding.length) add("rolle", t, `Bemanding: ${a.bemanding.join(", ")}`, `${base}/bem`, "Bemanding");
  }
  for (const e of D.events) {
    const a = e.aktivitet && D.aktiviteter[e.aktivitet];
    add("event", e.titel.split(" (")[0], `${e.dag} ${fmtD(e.dato)} kl. ${e.start}–${e.slut}. ${e.maalgruppe === "team" ? "Team." : "Kursister."} ${e.info || ""} ${a && a.sted && !/^startsted/i.test(a.sted) ? a.sted : ""}`, e.aktivitet ? `#/a/${e.aktivitet}` : `#/e/${e.id}`, "Program");
  }
  for (const p of D.patruljer || []) add("patrulje", `Patrulje ${p.navn}`, `Vejledere: ${p.vejledere.join(", ")}. PT-sted: ${p.pt}. Lejrplads: ${p.lejr}.`, "#/patruljer/liste", "Patrulje");
  for (const n of D.personer) { const pp = (D.patruljer || []).find(p => p.vejledere.some(v => whoIs(v) === n)); add("team", n, `Teamer ${pp ? "i patrulje " + pp.navn : ""}. Telefon og kontakt.`, `#/patruljer/team/${encodeURIComponent(n)}`, "Team"); }
  for (const n of D.nyheder || []) add("nyhed", n.titel, n.tekst, "#/uge", "Besked");
  // BM25-indeks
  const inv = new Map(); let total = 0;
  docs.forEach((d, i) => { const ts = [...tok(d.titel), ...tok(d.titel), ...tok(d.titel), ...tok(d.tekst)].filter(t => !STOP.has(t)); d.len = ts.length; total += ts.length; const tf = new Map(); ts.forEach(t => tf.set(t, (tf.get(t) || 0) + 1)); tf.forEach((c, t) => { if (!inv.has(t)) inv.set(t, []); inv.get(t).push([i, c]); }); });
  return { docs, inv, avg: total / docs.length, terms: [...inv.keys()] };
}
function searchPlan(q) {
  if (!S.idx) S.idx = buildIndex();
  const { docs, inv, avg, terms } = S.idx, ql = q.toLowerCase(), today = ymd(now());
  let extra = "";
  if (/i dag|idag/.test(ql)) extra += " " + (DAYS[dayIdx(today)] || "");
  if (/i morgen|imorgen/.test(ql)) extra += " " + (DAYS[dayIdx(today) + 1] || "");
  const qt = [...tok(q + extra)].filter(t => !STOP.has(t));
  const scores = new Map(), N = docs.length, k1 = 1.2, b = .75;
  for (const t of new Set(qt)) {
    const variants = new Map([[t, 1]]);
    const stem = t.replace(/(erne|ene|er|en|et|e|s)$/, ""); if (stem.length >= 3 && stem !== t) variants.set(stem, .8);
    for (const [v, w] of [...variants]) if (v.length >= 3) for (const term of terms) if (term !== v && term.startsWith(v)) variants.set(term, Math.min(variants.get(term) || 0, 1) || .6 * w);
    for (const [v, w] of variants) {
      const post = inv.get(v); if (!post) continue;
      const idf = Math.log(1 + (N - post.length + .5) / (post.length + .5));
      for (const [i, c] of post) scores.set(i, (scores.get(i) || 0) + w * idf * (c * (k1 + 1)) / (c + k1 * (1 - b + b * docs[i].len / avg)));
    }
  }
  const hvornaar = /hvornår|kl\b|tid\b|starter|slutter/.test(ql), hvem = /hvem|vejleder|bemand|står på|patrulje|ring|telefon|nummer/.test(ql), hvor = /hvor\b|sted|lokation|mødes|starter ved|find/.test(ql);
  const boost = d => (hvornaar && d.typ === "event" ? 1.7 : 1) * (hvem && (d.typ === "rolle" || d.typ === "patrulje" || d.typ === "team") ? 1.6 : 1) * (hvor && (d.typ === "event" || d.extra === "sted" || d.typ === "patrulje") ? 1.5 : 1) * (d.typ === "nyhed" ? 1.3 : 1);
  return [...scores].map(([i, s]) => ({ d: docs[i], s: s * boost(docs[i]) })).sort((a, b) => b.s - a.s).slice(0, 12);
}
function snippet(text, q) {
  const qs = [...new Set(tok(q).filter(t => !STOP.has(t) && t.length >= 2))], low = text.toLowerCase();
  let at0 = qs.map(t => low.indexOf(t.replace(":", "[:]"))).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const from = Math.max(0, at0 - 50), part = text.slice(from, from + 190);
  let h = esc((from > 0 ? "…" : "") + part + (from + 190 < text.length ? "…" : ""));
  for (const t of qs) h = h.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-zæøå0-9]*)", "gi"), "<mark>$1</mark>");
  return h;
}
function soegResultater(q) {
  q = (q || "").trim(); if (q.length < 2) return `<div class="muted" style="padding:10px 2px">Skriv et spørgsmål eller et ord, fx navn, sted eller aktivitet. Søgningen kører kun på din telefon.</div>`;
  const res = searchPlan(S.me ? q.replace(/\b(min|mit|mine)\b/gi, S.me).replace(/\bjeg\b/gi, S.me) : q); if (!res.length) return `<div class="box muted">Ingen svar i planen. Prøv et andet ord.</div>`;
  const icon = { akt: "📄", event: "🕒", rolle: "👥", patrulje: "⚑", team: "📞", nyhed: "📢", husk: "☑" };
  const top = res.find(r => r.d.typ === "event" && r.s > res[0].s * .6);
  let h = top ? `<div class="box" style="border:2px solid var(--now);background:var(--card2)"><div class="muted" style="font-size:11px;font-weight:800">HURTIGT SVAR</div><a href="${top.d.href}" style="text-decoration:none;color:var(--tx)"><b>${esc(top.d.titel)}</b><div>${esc(top.d.tekst)}</div></a></div>` : "";
  return h + res.map(r => `<a class="card" href="${r.d.href}" style="padding-left:16px"><div class="t">${icon[r.d.typ] || ""} ${esc(r.d.extra || r.d.typ)}</div><div class="n">${esc(r.d.titel)}</div><div class="p" style="font-size:13px;color:var(--tx);opacity:.85">${snippet(r.d.tekst, q)}</div></a>`).join("");
}
function viewSoeg() {
  const ex = ["Hvornår er lejrbål?", ...(S.me ? [S.me] : []), "Hvor starter Bevis-løb?", "Hvem står på Morgenvæk i morgen?", "Nødkuvert"];
  return `<div class="top"><a href="javascript:history.back()" style="text-decoration:none">‹ Tilbage</a>${ALIEN}</div><h1 style="margin-top:12px">Spørg planen</h1><div class="sub">Søger i aktiviteter, bemanding, program og patruljer. Virker uden net.</div>
    <input id="sq" type="search" placeholder="Fx: hvornår er aftensmad?" value="${esc(S.sq || "")}" autocomplete="off" style="margin:12px 0 8px;font-size:17px">
    <div class="chips">${ex.map(x => `<button class="pill" data-act="sq:${esc(x)}">${esc(x)}</button>`).join("")}</div><div id="sres">${soegResultater(S.sq)}</div>`;
}

// ---------- memer (SVG, tegnet i appen) ----------
const MEME_BG = { star: ["#1b1f5e", "#6a2fa0"], train: ["#0f4c5c", "#1b8a6b"], tent: ["#14532d", "#2f855a"], pause: ["#3b1c5a", "#b83280"], moon: ["#0b1030", "#2a3b8f"], sun: ["#c05621", "#f6ad55"], flag: ["#1a365d", "#2b6cb0"], cup: ["#744210", "#d69e2e"], magnifier: ["#22543d", "#38a169"], pot: ["#7b341e", "#dd6b20"], fire: ["#2d1b0e", "#c53030"], alien: ["#064e3b", "#10b981"], stopwatch: ["#1e3a5f", "#e53e3e"], ufo: ["#0b1030", "#2c7a7b"], flask: ["#44337a", "#38b2ac"], disco: ["#521b64", "#d53f8c"] };
function memeIcon(k) {
  const f = (d, c, x = "") => `<path d="${d}" fill="${c}" ${x}/>`, R = (x, y, w, h, c, r = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}"/>`, C = (x, y, r, c, s = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${s}/>`;
  switch (k) {
    case "star": return f("M180 100 L192 133 L228 135 L200 157 L210 191 L180 172 L150 191 L160 157 L132 135 L168 133Z", "#fde047", 'stroke="#fff" stroke-width="3"');
    case "train": return R(120, 118, 120, 62, "#e2e8f0", 10) + R(130, 128, 28, 24, "#2b6cb0", 4) + R(166, 128, 28, 24, "#2b6cb0", 4) + R(202, 128, 28, 24, "#2b6cb0", 4) + R(120, 160, 120, 8, "#e53e3e", 0) + C(145, 188, 9, "#1a202c") + C(215, 188, 9, "#1a202c") + `<rect x="100" y="198" width="160" height="5" fill="#a0aec0"/>`;
    case "tent": return f("M180 100 L250 190 L110 190Z", "#fbd38d", 'stroke="#fff" stroke-width="3"') + f("M180 135 L204 190 L156 190Z", "#744210");
    case "pause": return R(142, 108, 28, 84, "#fff", 8) + R(190, 108, 28, 84, "#fff", 8);
    case "moon": return f("M205 105 A52 52 0 1 0 235 175 A42 42 0 1 1 205 105Z", "#fef3c7") + C(250, 112, 3, "#fff") + C(120, 120, 2.5, "#fff") + C(262, 160, 2, "#fff") + C(140, 98, 2, "#fff");
    case "sun": return C(180, 150, 34, "#fde047") + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="${180 + 44 * Math.cos(a * Math.PI / 180)}" y1="${150 + 44 * Math.sin(a * Math.PI / 180)}" x2="${180 + 62 * Math.cos(a * Math.PI / 180)}" y2="${150 + 62 * Math.sin(a * Math.PI / 180)}" stroke="#fde047" stroke-width="7" stroke-linecap="round"/>`).join("");
    case "flag": return R(130, 98, 7, 100, "#e2e8f0", 3) + f("M137 102 L222 112 L137 136Z", "#e53e3e");
    case "cup": return R(140, 125, 80, 66, "#fff", 10) + `<path d="M220 140 q28 4 0 36" stroke="#fff" stroke-width="9" fill="none"/>` + `<path d="M158 112 q8 -12 0 -22 M180 112 q8 -12 0 -22 M202 112 q8 -12 0 -22" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>`;
    case "magnifier": return C(168, 140, 42, "none", 'stroke="#fff" stroke-width="12"') + `<line x1="200" y1="172" x2="244" y2="216" stroke="#fff" stroke-width="16" stroke-linecap="round"/>`;
    case "pot": return R(128, 140, 104, 54, "#2d3748", 12) + R(118, 134, 124, 12, "#4a5568", 6) + `<path d="M150 124 q8 -14 0 -26 M180 124 q8 -14 0 -26 M210 124 q8 -14 0 -26" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".75"/>`;
    case "fire": return f("M180 98 C205 128 222 148 210 176 C204 192 156 192 150 176 C140 152 162 140 168 116 C174 126 180 118 180 98Z", "#f6ad55", 'stroke="#fff" stroke-width="3"') + f("M180 140 C194 154 200 166 192 178 C186 188 170 188 166 178 C162 166 176 158 180 140Z", "#fde047") + R(130, 196, 100, 12, "#744210", 6);
    case "alien": return f("M180 98 C225 98 232 150 202 182 C190 194 170 194 158 182 C128 150 135 98 180 98Z", "#bbf7d0", 'stroke="#fff" stroke-width="3"') + f("M146 136 Q168 142 172 168 Q148 168 142 148Z", "#052e16") + f("M214 136 Q192 142 188 168 Q212 168 218 148Z", "#052e16");
    case "stopwatch": return C(180, 156, 48, "#fff") + C(180, 156, 40, "#1e293b") + R(172, 98, 16, 14, "#fff", 3) + `<line x1="180" y1="156" x2="180" y2="124" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="180" y1="156" x2="204" y2="168" stroke="#fb7185" stroke-width="5" stroke-linecap="round"/>`;
    case "ufo": return `<path d="M150 188 L120 230 H240 L210 188Z" fill="#fde047" opacity=".35"/>` + f("M150 150 A30 30 0 0 1 210 150Z", "#9ae6b4") + `<ellipse cx="180" cy="158" rx="68" ry="20" fill="#cbd5e0" stroke="#fff" stroke-width="3"/>` + C(145, 160, 5, "#fde047") + C(180, 164, 5, "#fde047") + C(215, 160, 5, "#fde047");
    case "flask": return f("M164 100 H196 V140 L226 192 Q230 206 214 206 H146 Q130 206 134 192 L164 140Z", "rgba(255,255,255,.35)", 'stroke="#fff" stroke-width="4"') + f("M150 176 H210 L226 196 Q228 204 214 204 H146 Q132 204 134 196Z", "#68d391") + C(172, 160, 5, "#fff") + C(188, 150, 4, "#fff") + C(180, 130, 3, "#fff");
    case "disco": return C(180, 156, 50, "#e2e8f0") + [-30, 0, 30].map(y => `<ellipse cx="180" cy="${156 + y}" rx="50" ry="${Math.max(6, 50 - Math.abs(y) * 1.2)}" fill="none" stroke="#a0aec0" stroke-width="2"/>`).join("") + [-30, 0, 30].map(x => `<line x1="${180 + x}" y1="106" x2="${180 + x}" y2="206" stroke="#a0aec0" stroke-width="2"/>`).join("") + R(176, 86, 8, 22, "#a0aec0", 2);
    default: return "";
  }
}
function memeSvg(m) {
  const [c1, c2] = MEME_BG[m.ikon] || MEME_BG.alien, top = m.top.split("\n"), bot = m.bottom.split("\n"), fs = lines => Math.min(26, Math.floor(336 / (0.68 * Math.max(...lines.map(l => l.length)))));
  const T = (lines, y0, up) => { const s = fs(lines), lh = s * 1.12; return lines.map((l, i) => `<text x="180" y="${y0 + (up ? i * lh : (i - (lines.length - 1)) * lh)}" text-anchor="middle" font-family="Impact,Haettenschweiler,'Arial Black',sans-serif" font-weight="900" font-size="${s}" fill="#fff" stroke="#000" stroke-width="${s / 5}" stroke-linejoin="round" paint-order="stroke">${esc(l)}</text>`).join(""); };
  return `<svg viewBox="0 0 360 300" role="img" aria-label="Meme: ${esc(m.top.replace(/\n/g, " "))} ${esc(m.bottom.replace(/\n/g, " "))}" style="width:100%;border-radius:14px;display:block"><defs><linearGradient id="mg${esc(m.ikon)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="360" height="300" fill="url(#mg${esc(m.ikon)})"/>${memeIcon(m.ikon)}${T(top, 34, true)}${T(bot, 282, false)}</svg>`;
}

// ---------- Brugsstatistik (kun tællere, ingen indhold; sendes kun, hvis du vælger det i app-evalueringen) ----------
const FEATURES = [
  ["view:uge", "Ugeplan"], ["act:day", "Ugeoverblik (tryk på en dag)"], ["view:soeg", "Søg i planen"], ["view:a:resume", "Aktivitet: Resumé"], ["view:a:tid", "Aktivitet: Tidsplan"],
  ["view:a:fantasi", "Aktivitet: Fantasi"], ["view:a:bem", "Aktivitet: Bemanding"], ["view:husk", "Huskeliste"], ["act:tadd", "Egne huskepunkter"], ["view:patruljer:liste", "Patruljer og vejledere"],
  ["view:patruljer:pl", "PL-plan"], ["act:plshift", "PL-skifte"], ["view:patruljer:lejr", "Lejrkort og PT-steder"], ["view:patruljer:team", "Team og kontakter"], ["link:tel", "Ring eller SMS til en teamer"],
  ["act:claim", "“Det er min”-stjernen"], ["act:vset", "Visning for en anden teamer"], ["act:vpartner", "Makker-knappen"], ["act:ics", "Kalender-download"], ["act:exp", "Sikkerhedskopi"],
  ["act:theme", "Lys/mørkt udseende"], ["view:eval", "Evaluering"], ["view:eval:wrapped", "Wrapped"], ["link:maps", "Google Maps-links"], ["link:doc", "Åbn original-doc"], ["act:plcopy", "Del PL-plan som tekst"],
];
const featLabel = k => (FEATURES.find(f => f[0] === k) || [k, k])[1];

// ---------- Evaluering + Wrapped (testfane: slås til under Mig) ----------
Object.assign(S, {
  evalOn: ls.get("lp_eval_on") !== "0", evalAll: ls.get("lp_eval_all") === "1", ev: null, wr: 0, agg: null, lydOk: null,
  evals: (() => { try { return JSON.parse(ls.get("lp_evals", "{}")); } catch { return {}; } })(),
  evSent: (() => { try { return JSON.parse(ls.get("lp_evsent", "{}")); } catch { return {}; } })(),
});
const saveEvals = () => { ls.set("lp_evals", JSON.stringify(S.evals)); ls.set("lp_evsent", JSON.stringify(S.evSent)); };
const devId = () => { let d = ls.get("lp_devid"); if (!d) { d = [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, "0")).join(""); ls.set("lp_devid", d); } return d; };
const EV = {
  mave: [[1, "😟", "Svær"], [2, "😐", "Så-så"], [3, "🙂", "God"], [4, "🤩", "Fed!"]],
  stemning: ["Glade", "Spændte", "Forbeholdne", "Trætte", "Ligeglade"],
  godt: ["Klar intro", "God stemning", "Godt samarbejde", "Godt materiale", "Fed idé", "God tid"],
  bedre: ["Mere tid", "Bedre opsætning", "Klarere intro", "Flere folk", "Andet sted", "Bedre materiale", "Mindre tidspres", "Mere fantasi"],
  savnet: ["Ingen mangler", "Info i beskrivelsen", "Materialer", "Instruktion til posten", "Kontakt til nogen", "Tidsplan"],
};
function evalActs() {
  const n = now(), out = [];
  for (const a of Object.values(S.data.aktiviteter)) {
    if (!mineAct(a.id)) continue;
    const evs = allEvents().filter(e => e.aktivitet === a.id).sort((x, y) => x.dato.localeCompare(y.dato) || x.start.localeCompare(y.start)); if (!evs.length) continue;
    const first = evs[0], ended = at(first.dato, first.slut) <= n;
    out.push({ a, first, ended, ok: ended || S.evalAll, done: !!S.evals[a.id] });
  }
  return out.sort((x, y) => at(x.first.dato, x.first.start) - at(y.first.dato, y.first.start));
}
async function hmacHex(keyB64, msg) {
  const k = await crypto.subtle.importKey("raw", b64d(keyB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)))].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function evCall(path, opts = {}) {
  const base = (S.data.evalUrl || "").replace(/\/$/, ""); if (!base) throw new Error("ingen server");
  const ts = String(Date.now()), proof = await hmacHex(ls.get("lp_key"), `${ts}|${path}`);
  return fetch(base + path, { ...opts, headers: { "content-type": "application/json", "x-lp-ts": ts, "x-lp-proof": proof } });
}
async function sendEval(akt) {
  try { const r = await evCall("/send", { method: "POST", body: JSON.stringify({ akt, dev: devId(), svar: S.evals[akt] }) }); if (r.ok) { S.evSent[akt] = 1; saveEvals(); return true; } } catch {}
  return false;
}
async function flushEvals() { for (const akt of Object.keys(S.evals)) if (!S.evSent[akt] && S.data && S.data.evalUrl) await sendEval(akt); }
async function loadAgg() { try { const r = await evCall("/aggregat"); if (r.ok) { S.agg = await r.json(); if (/^#\/eval\/wrapped/.test(location.hash)) render(); } } catch {} }

function viewEval(sub) {
  if (!S.me) return `<div class="top"><div><h1>Evaluering</h1></div>${ALIEN}</div><div class="box muted">Vælg dit navn under Mig, så ved appen, hvilke aktiviteter du har stået på.</div>`;
  if (sub === "q" && S.ev) return viewEvQ();
  const rows = evalActs(), done = rows.filter(r => r.done).length, avail = rows.filter(r => r.ok), todo = avail.filter(r => !r.done), pct = rows.length ? done / rows.length : 0, circ = 2 * Math.PI * 30;
  const all = rows.length > 0 && rows.every(r => r.done || !r.ok) && avail.length > 0 && todo.length === 0, nxt = todo[0];
  let h = `<div class="top"><div><h1>Evaluering</h1><div class="sub">Dine aktiviteter · kun du ser dine svar</div></div>${ALIEN}</div>
    <div class="box" style="display:flex;gap:14px;align-items:center;margin-top:14px"><svg width="76" height="76" viewBox="0 0 76 76" style="flex:none"><circle cx="38" cy="38" r="30" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="38" cy="38" r="30" fill="none" stroke="var(--ac)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(circ * pct).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 38 38)"/><text x="38" y="44" text-anchor="middle" font-size="16" font-weight="800" fill="var(--tx)">${done}/${rows.length}</text></svg>
    <div style="flex:1"><b>Du har evalueret ${done} af ${rows.length}</b><div class="muted">Hver tager ca. 1 minut</div>${nxt ? `<button class="btn" data-act="evstart:${nxt.a.id}" style="margin:8px 0 0;padding:8px">Evaluér næste: ${esc(nxt.a.titel.split(" (")[0])} ▶</button>` : ""}</div></div>`;
  if (!rows.length) h += `<div class="box muted">Du står ikke på nogen aktiviteter endnu.</div>`;
  for (const r of rows) h += `<div class="card" style="display:flex;align-items:center;gap:12px;padding-left:14px"><span class="cb ${r.done ? "on" : ""}" style="pointer-events:none">${r.done ? "✓" : ""}</span><div style="flex:1"><div class="n">${esc(r.a.titel.split(" (")[0])}</div><div class="p">${DAYS[dayIdx(r.first.dato)].slice(0, 3)} ${r.first.start}${r.ok ? "" : " · ikke afholdt endnu"}</div></div>${r.done ? `<button class="pill" data-act="evstart:${r.a.id}" style="color:var(--act)">Redigér</button>` : r.ok ? `<button class="pill on" data-act="evstart:${r.a.id}" style="background:var(--ac);color:#000;font-weight:800;border-color:var(--ac)">Start</button>` : ""}${r.done && S.data.evalUrl ? `<span class="muted" title="${S.evSent[r.a.id] ? "Sendt" : "Gemt på telefonen"}" style="font-size:14px">${S.evSent[r.a.id] ? "☁✓" : "☁…"}</span>` : ""}</div>`;
  h += `<a class="card" href="#/eval/app" style="display:flex;align-items:center;gap:12px;padding-left:14px;text-decoration:none"><span class="cb ${S.appEval ? "on" : ""}" style="pointer-events:none">${S.appEval ? "✓" : ""}</span><div style="flex:1"><div class="n">📱 Evaluér selve appen</div><div class="p">Hvad brugte du mest og mindst?</div></div><span class="pill ${S.appEval ? "" : "on"}" style="${S.appEval ? "color:var(--act)" : "background:var(--ac);color:#000;font-weight:800;border-color:var(--ac)"}">${S.appEval ? "Redigér" : "Start"}</span></a>`;
  h += all ? `<a class="btn" href="#/eval/wrapped/0" style="margin-top:14px;text-decoration:none">🎧 Åbn din uge som Wrapped</a>` : `<div class="box" style="background:#ede9fe;color:#14161a;display:flex;justify-content:space-between;align-items:center"><div><b>🎧 Din uge, som Wrapped</b><div class="muted" style="color:#4c4c5c">Åbner, når du har evalueret alle</div></div><span style="font-size:18px">🔒</span></div>`;
  if (!S.data.evalUrl) h += `<div class="hint">Serveren er ikke sat op endnu. Svar gemmes kun på din telefon.</div>`;
  return h;
}
const EV_N = 5;
function evBody() {
  const { akt, step, d } = S.ev, a = S.data.aktiviteter[akt], chips = (f, list) => `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">${list.map(l => `<button class="pill ${(d[f] || []).includes(l) ? "on" : ""}" data-act="evchip:${f}:${esc(l)}" style="${(d[f] || []).includes(l) ? "background:#d9f7e6;color:#000;border-color:var(--act)" : "color:var(--tx)"};padding:8px 14px;font-size:13px">${esc(l)}</button>`).join("")}</div>`;
  const ta = (f, ph) => `<textarea id="ev_${f}" placeholder="${esc(ph)}" style="min-height:90px">${esc(d[f] || "")}</textarea>`, H = t => `<h2 style="margin-top:18px;text-transform:none;letter-spacing:0;font-size:13px;color:var(--tx)">${t}</h2>`;
  const nm = esc(a.titel.split(" (")[0]);
  return ({
    1: `<div class="muted" style="font-weight:800;font-size:11px">MAVEFORNEMMELSEN</div><h1 style="font-size:24px;margin:6px 0 16px">Hvordan var den, da du stod på ${nm}?</h1><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${EV.mave.map(([v, ic, l]) => `<button data-act="evmave:${v}" class="box" style="margin:0;text-align:center;padding:14px 4px;${d.mave === v ? "background:#d9f7e6;color:#000;box-shadow:inset 0 0 0 2px var(--act)" : ""}"><div style="font-size:30px">${ic}</div><b style="font-size:12px">${l}</b></button>`).join("")}</div>${H("Hvordan var stemningen hos kursisterne?")}${chips("stemning", EV.stemning)}`,
    2: `<div class="muted" style="font-weight:800;font-size:11px">DET DER VIRKEDE</div><h1 style="font-size:24px;margin:6px 0 10px">Hvad gik godt?</h1>${chips("godt", EV.godt)}${H("Hvilke forudsætninger lå til grund for, at det fungerede?")}${ta("godtTekst", "Fx: Vi havde pakket alt dagen før …")}`,
    3: `<div class="muted" style="font-weight:800;font-size:11px">10 % BEDRE</div><h1 style="font-size:24px;margin:6px 0 10px">Hvad skal der til, for at den kan blive 10 % bedre?</h1><div class="muted">Vælg det, der passer (flere er ok)</div>${chips("bedre", EV.bedre)}${H("Med dine egne ord (valgfrit)")}${ta("bedreTekst", "Fx: Posterne kunne stå tættere på startstedet …")}`,
    4: `<div class="muted" style="font-weight:800;font-size:11px">DET DU SAVNEDE</div><h1 style="font-size:24px;margin:6px 0 6px">Gav aktivitetsbeskrivelsen nok indsigt?</h1><div style="display:flex;justify-content:center;gap:4px;margin:8px 0">${[1, 2, 3, 4, 5].map(i => `<button data-act="evstars:${i}" style="font-size:42px;color:${i <= (d.indsigt || 0) ? "#f2c91b" : "var(--line)"}" aria-label="${i} stjerner">★</button>`).join("")}</div>${H("Var der noget, du savnede?")}${chips("savnet", EV.savnet)}${H("Hvordan kan vi opfylde det behov? (kort)")}${ta("behov", "Fx: Skriv, hvor posterne står, i beskrivelsen …")}`,
    5: `<div style="text-align:center;padding-top:30px"><div style="font-size:64px">🎉</div><h1 style="font-size:26px">Tak!</h1><p class="muted">Dine svar om ${nm} gemmes${S.data.evalUrl ? " og sendes anonymt til arrangørerne" : " på din telefon"}.</p>${S.data.evalUrl ? '<p class="muted" style="font-size:12px">Uden navn. Skriv ikke andres navne i fritekst, hvis de ikke skal stå der.</p>' : ""}</div>`,
  })[step];
}
const evFoot = () => { const step = S.ev.step; return `<button class="btn" data-act="${step === EV_N ? "evdone" : "evnext"}" style="margin:0 0 6px">${step === EV_N ? "Færdig" : "Næste"}</button><div style="display:flex;justify-content:space-between"><button data-act="evback" class="muted" ${step === 1 ? "disabled" : ""} style="padding:8px">‹ Tilbage</button>${step < EV_N ? '<button data-act="evnext" class="muted" style="padding:8px">Spring over</button>' : ""}</div>`; };
function evPartial() {   // skift spørgsmål uden at genindlæse siden, så sangen bliver ved med at spille
  const b = document.getElementById("evbody"); if (!b || !S.ev) return false;
  b.innerHTML = evBody(); document.getElementById("evprog").style.width = (S.ev.step / EV_N) * 100 + "%"; document.getElementById("evstep").textContent = S.ev.step + "/" + EV_N; document.getElementById("evfoot").innerHTML = evFoot(); return true;
}
function viewEvQ() {
  const { akt, step } = S.ev, a = S.data.aktiviteter[akt], songs = songsOf(akt);
  return `<div style="display:flex;justify-content:space-between;align-items:center"><button data-act="evexit" style="font-size:20px;color:var(--mu)">✕</button><b>${esc(a.titel.split(" (")[0])}</b><span id="evstep" class="muted" style="font-weight:700">${step}/${EV_N}</span></div>
    <div class="bar" style="margin:10px 0 14px"><i id="evprog" style="width:${(step / EV_N) * 100}%;background:var(--ac)"></i></div>${songs.length ? `<div class="box" style="padding:8px 12px;margin:0 0 14px"><div class="muted" style="font-size:12px;font-weight:700">🎵 ${esc(songs.map(x => "“" + x.titel + "”").join(" · "))} – spiller, mens du svarer</div>${songEmbed(songs[0])}${songs.length > 1 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${songs.map((x, i) => `<button class="pill" data-act="evsong:${i}" style="font-size:11px">${esc(x.titel)}</button>`).join("")}</div>` : ""}</div>` : ""}<div id="evbody">${evBody()}</div>
    <div id="evfoot" style="position:sticky;bottom:calc(88px + env(safe-area-inset-bottom));padding-top:14px;background:linear-gradient(transparent,var(--bg) 30%)">${evFoot()}</div>`;
}
// ---------- Evaluering af selve appen ----------
Object.assign(S, { ap: null, aggApp: null, appEval: (() => { try { return JSON.parse(ls.get("lp_appeval", "null")); } catch { return null; } })() });
async function sendAppEval() {
  if (!S.data.evalUrl || !S.appEval) return false;
  try { const r = await evCall("/send-app", { method: "POST", body: JSON.stringify({ dev: devId(), svar: S.appEval }) }); if (r.ok) { S.appEval.sendt = 1; ls.set("lp_appeval", JSON.stringify(S.appEval)); return true; } } catch {}
  return false;
}
async function loadAggApp() { try { const r = await evCall("/app-aggregat"); if (r.ok) { S.aggApp = await r.json(); if (/^#\/eval\/wrapped/.test(location.hash)) render(); } } catch {} }
function viewAppEval() {
  const d = S.ap, chips = (f) => `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">${FEATURES.map(([k, l]) => `<button class="pill ${(d[f] || []).includes(k) ? "on" : ""}" data-act="apchip:${f}:${esc(k)}" style="${(d[f] || []).includes(k) ? "background:#d9f7e6;color:#000;border-color:var(--act)" : "color:var(--tx)"};padding:6px 11px;font-size:12px">${esc(l)}</button>`).join("")}</div>`;
  return `<div style="display:flex;justify-content:space-between;align-items:center"><button data-act="apexit" style="font-size:20px;color:var(--mu)">✕</button><b>Evaluér appen</b><span></span></div>
    <h1 style="font-size:24px;margin:14px 0 6px">Hvor god har Lommeplan været?</h1><div style="display:flex;justify-content:center;gap:4px">${[1, 2, 3, 4, 5].map(i => `<button data-act="apstars:${i}" style="font-size:42px;color:${i <= (d.stjerner || 0) ? "#f2c91b" : "var(--line)"}" aria-label="${i} stjerner">★</button>`).join("")}</div>
    <h2 style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--tx)">Hvad brugte du mest?</h2>${chips("mest")}
    <h2 style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--tx)">Hvad brugte du næsten aldrig?</h2>${chips("mindst")}
    <h2 style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--tx)">Hvad savnede du i appen?</h2><textarea id="ap_mangler" placeholder="Fx: Et kort over Gribskov …" style="min-height:70px">${esc(d.mangler || "")}</textarea>
    <h2 style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--tx)">Hvad irriterede dig?</h2><textarea id="ap_irriterer" placeholder="Fx: Teksten var for lille …" style="min-height:70px">${esc(d.irriterer || "")}</textarea>
    <button class="btn" data-act="apsend" style="margin-top:14px">Gem og send</button>${S.data.evalUrl ? "" : '<div class="hint">Serveren er ikke sat op endnu. Svar gemmes kun på din telefon.</div>'}`;
}
function wrapTopActivity() {
  const rows = evalActs(), tot = {};
  for (const e of allEvents()) if (e.aktivitet && rows.some(r => r.a.id === e.aktivitet) && mineOn(e.aktivitet, e.dag)) tot[e.aktivitet] = (tot[e.aktivitet] || 0) + (mm(e.slut) - mm(e.start));
  return Object.entries(tot).sort((a, b) => b[1] - a[1]).map(x => x[0]).find(id => songsOf(id).length) || "";
}
function wrapStats() {
  const rows = evalActs(), mine = new Set(rows.map(r => r.a.id)), evsMine = allEvents().filter(e => e.aktivitet && mine.has(e.aktivitet) && mineOn(e.aktivitet, e.dag));
  const mins = evsMine.reduce((s, e) => s + (mm(e.slut) - mm(e.start)), 0), dage = new Set(evsMine.map(e => e.dato)).size;
  const others = new Set(rows.flatMap(r => r.a.bemanding).filter(n => n !== S.me)), ratings = Object.entries(S.evals).filter(([, v]) => v.mave);
  const cnt = [4, 3, 2, 1].map(v => ratings.filter(([, x]) => x.mave === v).length), avg = ratings.length ? ratings.reduce((s, [, x]) => s + x.mave, 0) / ratings.length : 0;
  const fav = [...ratings].sort((a, b) => b[1].mave - a[1].mave || (b[1].t || "").localeCompare(a[1].t || ""))[0], longest = [...rows].sort((a, b) => b.a.tidsplan.length - a.a.tidsplan.length)[0];
  const vibe = avg >= 3.5 ? ["Alien-fest-pop", "med stjerner i øjnene"] : avg >= 2.8 ? ["Alien-folk", "rundt om bålet"] : avg >= 2 ? ["Synth", "under en tung himmel"] : ["Rolig ambient", "efter regn"];
  return { n: rows.length, timer: Math.round(mins / 60), dage, others: others.size, cnt, vibe, fav: fav && { a: S.data.aktiviteter[fav[0]], d: fav[1] }, favSong: ([...ratings].filter(([id]) => songsOf(id).length).sort((a, b) => b[1].mave - a[1].mave || (b[1].t || "").localeCompare(a[1].t || ""))[0] || [""])[0], avg };
}
const WR_GRAD = [["#3b0764", "#be185d"], ["#7c2d12", "#ea580c"], ["#134e4a", "#0891b2"], ["#312e81", "#7c3aed"], ["#14532d", "#65a30d"], ["#831843", "#db2777"], ["#1e3a8a", "#0ea5e9"]];
function wrapDays(s) {   // én side pr. dag, du stod på noget
  const rows = evalActs(), mine = new Set(rows.map(r => r.a.id)), out = [];
  for (let d = 0; d < 6; d++) {
    const evs = allEvents().filter(e => e.dato === DATES[d] && e.aktivitet && mine.has(e.aktivitet) && mineOn(e.aktivitet, e.dag)).sort((x, y) => x.start.localeCompare(y.start)); if (!evs.length) continue;
    const mins = evs.reduce((t, e) => t + (mm(e.slut) - mm(e.start)), 0), rated = evs.filter(e => S.evals[e.aktivitet] && S.evals[e.aktivitet].mave), best = [...rated].sort((x, y) => S.evals[y.aktivitet].mave - S.evals[x.aktivitet].mave || x.start.localeCompare(y.start))[0];
    const longest = [...evs].sort((x, y) => (mm(y.slut) - mm(y.start)) - (mm(x.slut) - mm(x.start)))[0], last = evs[evs.length - 1], first = evs[0];
    const others = new Set(evs.flatMap(e => S.data.aktiviteter[e.aktivitet].bemanding).filter(n => n !== S.me));
    const mood = rated.length ? rated.reduce((t, e) => t + S.evals[e.aktivitet].mave, 0) / rated.length : 0, T = e => esc(e.titel.split(" (")[0]);
    const facts = [`${evs.length} ${evs.length === 1 ? "aktivitet" : "aktiviteter"} og ${Math.floor(mins / 60)} t ${mins % 60 ? (mins % 60) + " min " : ""}på post`, `Først på banen: ${T(first)} kl. ${first.start}`, `Længste: ${T(longest)} (${Math.round((mm(longest.slut) - mm(longest.start)) / 6) / 10} t)`];
    if (mm(last.slut) >= 22 * 60) facts.push(`Nat-vagt: ${T(last)} sluttede kl. ${last.slut}`); else if (others.size) facts.push(`Du delte dagen med ${others.size} andre teamere`);
    if (best) facts.push(`Dagens højdepunkt: ${T(best)} ${EV.mave.find(m => m[0] === S.evals[best.aktivitet].mave)[1]}`);
    out.push({ d, evs, mins, mood, facts, best: best && best.aktivitet, songAct: (best && songsOf(best.aktivitet).length ? best.aktivitet : evs.map(e => e.aktivitet).find(id => songsOf(id).length)) || "", quote: best && S.evals[best.aktivitet].godtTekst });
  }
  return out;
}
function funFacts(s) {
  const D = S.data, evK = D.events.filter(e => e.maalgruppe === "kursist"), dur = e => mm(e.slut) - mm(e.start);
  const longest = [...evK].filter(e => e.aktivitet).sort((a, b) => dur(b) - dur(a))[0], mostStaffed = Object.values(D.aktiviteter).sort((a, b) => b.bemanding.length - a.bemanding.length)[0];
  const kursistTimer = Math.round(evK.reduce((t, e) => t + dur(e), 0) / 60), hrs = s.timer || 0;
  const f = [
    `Ugen havde ${evK.length} programpunkter for kursisterne, ca. ${kursistTimer} timer i alt`,
    longest ? `Længste aktivitet: ${longest.titel.split(" (")[0]} (${Math.floor(dur(longest) / 60)} t ${dur(longest) % 60} min)` : "",
    `${mostStaffed.bemanding.length} teamere stod på ${mostStaffed.titel.split(" (")[0]}, ugens mest bemandede`,
    `${D.personer.length} teamere og ${(D.patruljer || []).length} patruljer blev det til`,
    "Patruljens halve døgn varede 19,5 timer, fra tirsdag kl. 15:00 til onsdag kl. 10:30",
    "5 shelters i Gribskov var booket, og 2,2 km var gåturen til stationen",
  ];
  if (hrs) f.push(`Dine ${hrs} timer på post svarer til ca. ${Math.max(1, Math.round(hrs / 1.5))} fodboldkampe eller ${Math.max(1, Math.round(hrs / 3.25))} gange Titanic`);
  return f.filter(Boolean);
}
function wrapSlides() {
  const s = wrapStats(), days = wrapDays(s), topAct = wrapTopActivity(), sl = [];
  sl.push({ k: "tal", song: topAct });
  days.forEach(dd => sl.push({ k: "dag", dd, song: dd.songAct }));
  sl.push({ k: "fun", song: "9" });
  if (days.filter(x => x.mood).length >= 2) sl.push({ k: "udvikling", days: days.filter(x => x.mood) });
  sl.push({ k: "vibe", song: s.favSong }, { k: "holdet", song: "20" }, { k: "appen" }, { k: "tak", song: "7" });
  return { s, sl };
}
function viewWrapped(i) {
  const { s, sl } = wrapSlides(), N = sl.length; i = Math.max(0, Math.min(N - 1, i));
  const it = sl[i], G = WR_GRAD[i % WR_GRAD.length], sng = it.song && (songsOf(it.song)[songsOf(it.song).length - 1] || null);
  const top = `<div class="wtop">${[...Array(N)].map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div><div class="wlab"><span>🎧 DIN UGE · PLanstar 2026</span><a href="#/eval" style="color:#fff;text-decoration:none;font-size:18px">✕</a></div>`;
  let body = "";
  if (it.k === "tal") body = `<div class="w1">Du stod på</div><div class="wbig">${s.n}</div><div class="w2">aktiviteter</div><div class="wst"><div><b>${s.timer} t</b>på post</div><div><b>${s.dage}</b>dage i felten</div><div><b>${s.others}</b>andre teamere ved din side</div></div><p class="wnote">Det er kun for dig. Ingen rangliste.</p><p class="wnote">Tryk til højre for at bladre. Hver dag har sin egen side.</p>`;
  if (it.k === "dag") { const dd = it.dd, face = dd.mood ? EV.mave[Math.max(0, Math.min(3, Math.round(dd.mood) - 1))][1] : "🎧"; body = `<div class="w1">${DAYS[dd.d] === "Søndag" ? "Dag 1" : "Dag " + (dd.d + 1)}</div><div class="wbig2" style="font-size:54px">${DAYS[dd.d]}</div><div style="font-size:70px;margin:8px 0">${face}</div>${dd.facts.map(f => `<div class="wfact">${f}</div>`).join("")}${dd.quote ? `<p class="wnote" style="font-style:italic">“${esc(dd.quote.slice(0, 110))}”</p>` : ""}`; }
  if (it.k === "fun") body = `<div class="w1">Fun facts</div><div class="wbig2" style="font-size:40px">Ugen i skøre tal 🤓</div>${funFacts(s).map(f => `<div class="wfact">${esc(f)}</div>`).join("")}`;
  if (it.k === "appen") { const g = S.aggApp; let inner; if (g && g.svar >= 3) { const lst = (o) => Object.entries(o || {}).sort((x, y) => y[1] - x[1]).slice(0, 5), box = (t, o) => `<div class="w1" style="margin-top:18px;font-weight:800">${t}</div>${lst(o).map(([k, n]) => `<div class="wbarl"><span>${esc(featLabel(k))}</span><b>${Math.round(100 * n / g.svar)}%</b></div><div class="wbar"><i style="width:${Math.round(100 * n / g.svar)}%"></i></div>`).join("") || '<p class="wnote">Ingen er helt enige endnu.</p>'}`; inner = `<div class="wcard"><b style="font-size:40px">${g.stjerner ?? "–"}</b><span>i snit på appen (1–5)</span><small>${g.svar} teamere har evalueret appen</small></div>${box("Mest brugt", g.mest)}${box("Mindst brugt", g.mindst)}`; } else inner = `<div class="wcard"><span>Resultatet vises, når mindst 3 teamere har evalueret appen.</span></div>`; body = `<div class="w1" style="font-size:26px;font-weight:800">Appen i ugens løb</div><div class="wnote">Hvad teamet selv siger de brugte mest og mindst</div>${inner}`; }
  if (it.k === "udvikling") {
    const ds = it.days, W = 330, H = 190, px = k => 30 + (ds.length === 1 ? 135 : (k * 270) / (ds.length - 1)), py = m => 160 - ((m - 1) / 3) * 130;
    const first = ds[0].mood, last = ds[ds.length - 1].mood, peak = [...ds].sort((a, b) => b.mood - a.mood)[0], trend = last - first > 0.4 ? ["Din uge steg 📈", "Du sluttede højere, end du startede"] : last - first < -0.4 ? ["Ugen blev tungere 📉", "Det sker. Det er netop derfor, vi evaluerer"] : ["Stabil hele ugen ⚖️", "Jævn energi fra start til slut"];
    body = `<div class="w1">Din udvikling over ugen</div><div class="wbig2" style="font-size:36px">${esc(trend[0])}</div><div class="w2" style="font-size:16px;font-weight:600;opacity:.9">${esc(trend[1])}</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;margin-top:20px;overflow:visible"><polyline fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${ds.map((x, k) => px(k) + "," + py(x.mood)).join(" ")}" opacity=".9"/>${ds.map((x, k) => `<circle cx="${px(k)}" cy="${py(x.mood)}" r="${x === peak ? 9 : 6}" fill="${x === peak ? "#fde047" : "#fff"}"/><text x="${px(k)}" y="${py(x.mood) - 16}" text-anchor="middle" font-size="20">${EV.mave[Math.max(0, Math.min(3, Math.round(x.mood) - 1))][1]}</text><text x="${px(k)}" y="${H - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${DAYS[x.d].slice(0, 3)}</text>`).join("")}</svg>
      <p class="wnote" style="margin-top:18px">Toppen: ${DAYS[peak.d]} ${peak.best ? "· " + esc(S.data.aktiviteter[peak.best].titel.split(" (")[0]) : ""}</p>`;
  }
  if (it.k === "vibe") body = `<div class="w1">Din uge lød som</div><div class="wbig2">${esc(s.vibe[0])}</div><div class="w2" style="font-size:26px">${esc(s.vibe[1])}</div><div class="wface">${EV.mave.slice().reverse().map(([v, ic], k) => `<div><span>${ic}</span><i style="height:${12 + Math.round(70 * s.cnt[k] / Math.max(1, ...s.cnt))}px"></i><b>${s.cnt[k]}</b></div>`).join("")}</div>${s.fav ? `<p class="w1" style="margin-top:22px">Din favorit: ${esc(s.fav.a.titel.split(" (")[0])}</p>${s.fav.d.godtTekst ? `<p class="wnote" style="font-style:italic">“${esc(s.fav.d.godtTekst.slice(0, 110))}”</p>` : ""}` : ""}`;
  if (it.k === "holdet") { const g = S.agg; body = `<div class="w1" style="font-size:26px;font-weight:800">Teamets opsummering</div><div class="wnote">Alle teamere samlet, ingen navne</div>` + (g && g.svar ? `<div class="wcard"><b style="font-size:44px">${g.mave ?? "–"}</b><span>i snit på mavefornemmelsen (1–4)</span><small>${g.teamere} teamere har svaret</small></div><div class="w1" style="margin-top:22px;font-weight:800">Mest nævnt til “10 % bedre”</div>${(g.bedre || []).slice(0, 3).map(b => `<div class="wbarl"><span>${esc(b.l)}</span><b>${b.pct}%</b></div><div class="wbar"><i style="width:${Math.min(100, b.pct * 2)}%"></i></div>`).join("") || '<p class="wnote">For få svar endnu.</p>'}` : `<div class="wcard"><span>Teamets opsummering dukker op, når nok teamere har svaret.</span></div>`); }
  if (it.k === "tak") body = `<div class="w1" style="font-size:30px;font-weight:900;margin-top:40px">Tak for en alien-uge 👽</div><p class="wnote" style="font-size:15px;margin-top:14px">Dine svar bliver til PLan næste år.</p><a class="btn" href="#/eval" style="background:#fff;color:#000;margin-top:30px;text-decoration:none">Tilbage til Evaluering</a>`;
  return `<div class="wrap" style="background:linear-gradient(160deg,${G[0]},${G[1]})">${top}<div class="wbody">${body}</div><div class="wnav"><button data-act="wr:-1" aria-label="Forrige"></button><button data-act="wr:1" aria-label="Næste"></button></div>${sng ? `<div class="wplayer"><div class="wlab" style="margin:0 0 -2px;font-size:11px">🎵 ${esc(sng.titel)} · ${esc((S.data.aktiviteter[it.song] || {}).titel || "").split(" (")[0]}</div>${songEmbed(sng, 152, true)}</div>` : ""}</div>`;
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
  let [r = "uge", a, b] = location.hash.replace(/^#\/?/, "").split("/");
  let h, tab = r;
  if (r === "a") { h = viewAct(a, b); tab = "uge"; }
  else if (r === "e") { h = viewEvent(a); tab = "uge"; }
  else if (r === "uge") h = viewUge(a);
  else if (r === "mine") h = viewMine();
  else if (r === "husk") { h = viewHusk(); tab = "husk"; }
  else if (r === "eval" && S.evalOn) {
    if (a === "wrapped") { $app.innerHTML = viewWrapped(+b || 0); if (!S.agg) loadAgg(); if (!S.aggApp) loadAggApp(); return; }
    if (a === "app") { if (!S.ap) S.ap = JSON.parse(JSON.stringify(S.appEval || { samtykke: true })); h = viewAppEval(); tab = "eval"; return $app.innerHTML = h + nav(tab), void 0; }
    if (a === "q" && !S.ev) { history.replaceState(null, "", "#/eval"); a = ""; }   // genåbnet app på et spørgsmål uden udkast: tilbage til checklisten
    h = viewEval(a); tab = "eval";
  }
  else if (r === "soeg") { h = viewSoeg(); tab = "uge"; }
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
  else if (act === "evaltoggle") { S.evalOn = !S.evalOn; ls.set("lp_eval_on", S.evalOn ? "1" : "0"); }
  else if (act === "evalall") { S.evalAll = !S.evalAll; ls.set("lp_eval_all", S.evalAll ? "1" : "0"); }
  else if (act === "apexit") { S.ap = null; location.hash = "#/eval"; return; }
  else if (act === "apstars") { S.ap.stjerner = +p[0]; }
  else if (act === "apchip") { const f = p[0], k = p.slice(1).join(":"), arr = S.ap[f] = S.ap[f] || [], i = arr.indexOf(k); i >= 0 ? arr.splice(i, 1) : arr.push(k); }
  else if (act === "apsend") { S.appEval = { ...S.ap, t: new Date().toISOString().slice(0, 16), sendt: 0 }; ls.set("lp_appeval", JSON.stringify(S.appEval)); S.ap = null; sendAppEval().then(() => render()); location.hash = "#/eval"; return; }
  else if (act === "evsong") { const s = songsOf(S.ev.akt)[+p[0]], f = document.querySelector(".box iframe"); if (s && f) f.src = "https://suno.com/embed/" + s.id; return; }
  else if (act === "evstart") { S.ev = { akt: p.join(":"), step: 1, d: JSON.parse(JSON.stringify(S.evals[p.join(":")] || {})) }; if (location.hash === "#/eval/q") render(); else location.hash = "#/eval/q"; window.scrollTo(0, 0); return; }
  else if (act === "evexit") { S.ev = null; location.hash = "#/eval"; return; }
  else if (act === "evnext") { if (S.ev) S.ev.step = Math.min(5, S.ev.step + 1); window.scrollTo(0, 0); if (evPartial()) return; }
  else if (act === "evback") { if (S.ev) S.ev.step = Math.max(1, S.ev.step - 1); window.scrollTo(0, 0); if (evPartial()) return; }
  else if (act === "evmave") { S.ev.d.mave = +p[0]; if (evPartial()) return; }
  else if (act === "evstars") { S.ev.d.indsigt = +p[0]; if (evPartial()) return; }
  else if (act === "evchip") { const f = p[0], l = p.slice(1).join(":"), arr = S.ev.d[f] = S.ev.d[f] || []; const i = arr.indexOf(l); i >= 0 ? arr.splice(i, 1) : arr.push(l); if (evPartial()) return; }
  else if (act === "evdone") { S.ev.d.t = new Date().toISOString().slice(0, 16); S.evals[S.ev.akt] = S.ev.d; S.evSent[S.ev.akt] = 0; saveEvals(); const k = S.ev.akt; S.ev = null; sendEval(k).then(() => render()); location.hash = "#/eval"; return; }
  else if (act === "wr") { const m = location.hash.match(/wrapped\/(\d+)/), N = wrapSlides().sl.length, i = Math.max(0, Math.min(N - 1, (m ? +m[1] : 0) + +p[0])); location.hash = "#/eval/wrapped/" + i; return; }
  else if (act === "vopen") { S.vopen = !S.vopen; S.vq = ""; }
  else if (act === "vset") { S.viewAs = p.join(":"); ls.set("lp_viewas", S.viewAs); S.vopen = false; S.vq = ""; if (!partnersOf(S.viewAs).length) S.withPartner = false; }
  else if (act === "vpartner") { S.withPartner = !S.withPartner; ls.set("lp_partner", S.withPartner ? "1" : "0"); }
  else if (act === "expand") S.expand = !S.expand;
  else if (act === "theme") { ls.set("lp_theme", p[0]); applyTheme(); }
  else if (act === "news") { const id = p.join(":"); let d = []; try { d = JSON.parse(ls.get("lp_news", "[]")); } catch {} if (!d.includes(id)) d.push(id); ls.set("lp_news", JSON.stringify(d)); }
  else if (act === "past") S.showPast = !S.showPast;
  else if (act === "sq") { S.sq = p.join(":"); }
  else if (act === "hidemode") S.hideMode = !S.hideMode;
  else if (act === "hide") { const id = p.join(":"); S.hide[id] ? delete S.hide[id] : (S.hide[id] = 1); saveHide(); }
  else if (act === "unhideall") { S.hide = {}; saveHide(); }
  else if (act === "ht") S.todoTab = p[0];
  else if (act === "pln") { S.pl.n = +p[0]; while (S.pl.names.length < S.pl.n) S.pl.names.push(""); savePl(); }
  else if (act === "plsave") { for (let i = 0; i < S.pl.n; i++) if (!(S.pl.names[i] || "").trim()) S.pl.names[i] = `Kursist ${i + 1}`; S.pl.names.length = S.pl.n; S.pl.ready = true; S.plSetup = false; savePl(); }
  else if (act === "plsetup") S.plSetup = true;
  else if (act === "plcopy") return openPlShare("copy");
  else if (act === "plpaste") return openPlShare("paste");
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
  if (ev.target.id && ev.target.id.startsWith("ap_") && S.ap) { S.ap[ev.target.id.slice(3)] = ev.target.value; return; }
  if (ev.target.id && ev.target.id.startsWith("ev_") && S.ev) { S.ev.d[ev.target.id.slice(3)] = ev.target.value; return; }
  if (ev.target.id === "sq") { S.sq = ev.target.value; const el = document.getElementById("sres"); if (el) el.innerHTML = soegResultater(S.sq); return; }
  if (ev.target.id === "vq") { S.vq = ev.target.value; const pos = ev.target.selectionStart; render(); const el = document.getElementById("vq"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
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
setInterval(() => { if (S.data && !document.querySelector(".sheetbg") && !S.demo && /^#\/?(uge(\/\d)?)?$|^#\/a\/[^/]+\/tid$/.test(location.hash)) render(); }, 30000);

// ---------- opdateringer ----------
function showUpdate() {
  if (document.getElementById("upd")) return;
  const b = document.createElement("button"); b.id = "upd"; b.textContent = "Ny version er klar – tryk for at opdatere ⟳";
  b.onclick = async () => { b.textContent = "Opdaterer …"; try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch {} location.reload(); };
  document.body.appendChild(b);
}
async function checkVersion() {
  try { const v = await (await fetch("version.json?_=" + Date.now(), { cache: "no-store" })).json(); if (v.v && window.LP_V && v.v !== window.LP_V && window.LP_V !== "0") showUpdate(); } catch {}
}
async function refreshData() {   // ny plan uden genstart: hent og dekryptér stille
  const key = ls.get("lp_key"); if (!S.data || !key || document.querySelector(".sheetbg")) return;
  try {
    const env = await (await fetch("data.enc.json", { cache: "no-cache" })).json(), d = await decryptData(env, key);
    if (d.genereret !== S.data.genereret || JSON.stringify(d.nyheder) !== JSON.stringify(S.data.nyheder)) { S.data = d; S.idx = null; render(); }
  } catch {}
}
function periodic() { checkVersion(); refreshData(); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") periodic(); });
setInterval(periodic, 5 * 60 * 1000);

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
    try { S.data = await decryptData(S.env, key); S.me = ls.get("lp_name") || null; { const M = { Marie: "Bondo", Havbro: "Mads", Mathilde: "Mathilde G" }; if (S.me && M[S.me]) { S.me = M[S.me]; ls.set("lp_name", S.me); } } S.exp = exp; S.onb = ls.get("lp_onb") === "1" ? 0 : (S.me || standalone() ? (S.me ? 0 : 2) : 1); }
    catch { ls.del("lp_key"); S.loginErr = "Planen er låst med en ny kode. Skriv den nye kode."; }
  } else if (key) { ["lp_key", "lp_name", "lp_exp"].forEach(ls.del); S.loginErr = "Adgangen er udløbet."; }
  if (S.data && !location.hash) location.hash = "#/uge";
  render(); checkVersion(); setTimeout(() => flushEvals(), 4000);
})();
