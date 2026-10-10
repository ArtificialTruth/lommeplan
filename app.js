"use strict";
const DAYS = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];
const DATES = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
const MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const HOME = "DDS Høbjerghus, Høbjerg Hegn 5, 3200 Helsinge";
const ALIEN = '<svg class="alien" viewBox="-18 -18 36 36"><path d="M0 -14 C14 -14 16 4 7 12 C3 16 -3 16 -7 12 C-16 4 -14 -14 0 -14Z" fill="#fff"/><path d="M-10 -3 Q-4 -1 -3 5 Q-9 5 -11 -1Z" fill="#000"/><path d="M10 -3 Q4 -1 3 5 Q9 5 11 -1Z" fill="#000"/></svg>';
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
  showPast: false, expand: false, loginErr: "",
  cal: { aud: "begge", mine: false, days: [0, 1, 2, 3, 4, 5], skip: [], alarm: 0 },
};
const saveOver = () => ls.set("lp_over", JSON.stringify(S.over));

// ---------- krypto (WebCrypto) ----------
const enc = new TextEncoder(), dec = new TextDecoder();
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const normCode = s => s.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
async function sha256hex(s) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...h].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function unlockWithCode(env, raw) {
  const code = normCode(raw);
  if (code.length !== 12) return null;
  const id = (await sha256hex("lp-id:" + code)).slice(0, 16);
  const u = env.users.find(x => x.id === id);
  if (!u) return null;
  const km = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: b64d(u.salt), iterations: env.iter }, km, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(u.iv), additionalData: enc.encode("lommeplan-user") }, key, b64d(u.ct));
    return JSON.parse(dec.decode(pt));
  } catch { return null; }
}
async function decryptData(env, kB64) {
  const key = await crypto.subtle.importKey("raw", b64d(kB64), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(env.data.iv), additionalData: enc.encode("lommeplan1") }, key, b64d(env.data.ct));
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
function actFull(id) {
  const a = S.data.aktiviteter[id];
  if (!a) return null;
  const o = S.over["a:" + id] || {};
  return { ...a, sted: o.sted || a.sted, ansvarlig: o.ansvarlig || a.ansvarlig, note: o.note || "", rettet: !!(o.sted || o.ansvarlig) };
}
const allEvents = () => S.data.events.map(evFull);
const isMine = e => { const a = e.aktivitet && S.data.aktiviteter[e.aktivitet]; return !!(a && S.me && (a.bemanding.includes(S.me) || a.ansvarligNavne.includes(S.me))); };
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
  const tags = (mine ? '<span class="chip">★ mine</span>' : "") + (e.maalgruppe === "team" && S.aud === "begge" && !o.lane ? '<span class="chip team">T</span>' : "") + (e.rettet ? '<span class="chip edit">rettet</span>' : "");
  let extra = "";
  if (o.bar && st === "now") {
    const n = now(), s = at(e.dato, e.start), en = at(e.dato, e.slut);
    const pct = Math.min(100, Math.max(0, ((n - s) / (en - s)) * 100)), rem = Math.max(0, Math.round((en - n) / 60000));
    extra = `<div class="bar"><i style="width:${pct}%"></i></div><div class="p">${Math.round(pct)} % · ${Math.floor(rem / 60)} t ${rem % 60} min tilbage</div>`;
  }
  return `<a class="card ${e.maalgruppe === "team" ? "team" : ""} ${st} ${o.big ? "big" : ""}" href="${href}">
    <div class="t">${e.start} – ${e.slut}</div><div class="n">${esc(e.titel.split(" (")[0])}</div>${e.titel.includes(" (") ? `<div class="p">${esc(e.titel.slice(e.titel.indexOf(" (") + 2).replace(/\)$/, ""))}</div>` : ""}
    ${a && a.sted && !/^startsted/i.test(a.sted) ? `<div class="p">📍 ${esc(a.sted)}</div>` : ""}${extra}
    ${tags ? `<div class="tags">${tags}</div>` : ""}</a>`;
}
const audSeg = () => `<div class="seg">${[["kursist", "Kursist"], ["begge", "Begge"], ["team", "Team"]].map(([k, l]) => `<button data-act="aud:${k}" class="${S.aud === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
const minePill = () => `<div class="chips"><button class="pill ${S.mine ? "on" : ""}" data-act="mine">★ Kun mine${S.me ? ": " + esc(S.me) : ""}</button>${S.demo ? '<span class="pill">Demo-tid ' + esc(S.demo.replace("T", " ")) + "</span>" : ""}</div>`;
const nav = r => `<nav class="bar2"><div class="in">${[["uge", "▤", "Uge"], ["mine", "★", "Mine"]].map(([k, i, l]) => `<a href="#/${k}" class="${r === k ? "on" : ""}"><i>${i}</i>${l}</a>`).join("")}</div></nav>`;

// ---------- skærme ----------
function viewUge(arg) {
  const today = ymd(now());
  let i = arg !== undefined && arg !== "" ? +arg : today > DATES[5] ? 5 : Math.max(0, dayIdx(today));
  if (!(i >= 0 && i < 6)) i = 0;
  const date = DATES[i], ev = dayEvents(date), two = S.aud === "begge" && ev.some(e => e.maalgruppe === "team");
  let h = `<div class="top"><div><h1>Ugen</h1><div class="sub">${fmtD(DATES[0])}–${fmtD(DATES[5])} 2026</div></div>${ALIEN}</div>`;
  h += `<div class="days">${DAYS.map((d, k) => `<button data-act="day:${k}" class="${k === i ? "on" : ""} ${DATES[k] === today ? "today" : ""}">${d.slice(0, 3)}<b>${+DATES[k].slice(8)}</b></button>`).join("")}</div>` + audSeg() + minePill();
  if (two) h += `<div class="lanehead"><span></span><span class="lh" style="color:var(--ac)">KURSIST</span><span class="lh" style="color:var(--team)">TEAM<button data-act="aud:kursist" style="color:var(--mu)">✕</button></span></div>`;
  const starts = [...new Set(ev.map(e => e.start))].sort();
  h += `<div class="grid ${two ? "two" : ""}">`;
  for (const s of starts) {
    const rowEv = ev.filter(e => e.start === s), past = rowEv.every(e => status(e) === "past");
    h += `<div class="tl ${past ? "past" : ""}">${s}</div>`;
    if (two) h += `<div>${rowEv.filter(e => e.maalgruppe === "kursist").map(e => evCard(e, { lane: 1 })).join("")}</div><div>${rowEv.filter(e => e.maalgruppe === "team").map(e => evCard(e, { lane: 1 })).join("")}</div>`;
    else h += `<div>${rowEv.map(e => evCard(e)).join("")}</div>`;
  }
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
    h += `<h2>Ansvarlig</h2><div class="prose"><p>${esc(a.ansvarlig) || "–"}</p></div><h2>Teamere</h2>`;
    h += a.bemanding.length ? `<div class="names">${a.bemanding.map(n => `<span class="${n === S.me ? "me" : ""}">${esc(n)}</span>`).join("")}</div>` : `<p class="muted">Ingen bemanding fundet i beskrivelsen.</p>`;
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
  let h = `<div class="top"><div><h1>Mine</h1><div class="sub">${S.me ? "Hej " + esc(S.me) : "Vælg dit navn"}</div></div>${ALIEN}</div>
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
    <h2>Mine rettelser</h2><div class="box"><div class="muted">${nOver ? nOver + " rettede felter gemmes kun på denne telefon." : "Ingen rettelser endnu."}</div>
    <div class="row2"><button class="btn alt" data-act="exp">Eksportér</button><label class="btn alt" style="margin:10px 0">Importér<input type="file" accept="application/json,.json" data-act="imp" hidden></label></div>
    ${nOver ? '<button class="btn ghost" data-act="resetall">Nulstil alle rettelser</button>' : ""}</div>
    <h2>Avanceret</h2><div class="box"><div class="field"><label>Demo-tid (test af “Nu”)</label><input type="datetime-local" data-act="demo" value="${esc(S.demo || "")}"></div>
    ${S.demo ? '<button class="btn alt" data-act="demooff">Brug rigtig tid</button>' : ""}
    <div class="hint">Plan genereret ${esc(S.data.genereret)} · adgang udløber ${esc(String(S.exp || "").slice(0, 10))}</div>
    <button class="btn ghost" data-act="logout">Glem nøgle på denne telefon</button></div>`;
  return h;
}

function viewLogin() {
  return `<div class="login">${ALIEN.replace('class="alien"', 'class="alien" style="width:90px;height:90px"')}<h1 style="font-size:30px">Lommeplan</h1><div class="sub">PLanstar 2026 · for teamere</div>
    <form id="lf"><div class="field" style="margin-top:40px;text-align:left"><label>Din kode</label><input id="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"></div>
    <div class="err">${esc(S.loginErr)}</div><button class="btn" type="submit">Åbn</button></form>
    <p class="muted">Brug det personlige link, du har fået. Virker det ikke, så skriv koden her. Koden gemmes kun på din telefon.</p></div>`;
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

function scrollToNow() {
  const el = document.querySelector(".grid .card.now") || [...document.querySelectorAll(".grid .card:not(.past)")][0];
  if (el && document.querySelector(".days .today.on")) el.scrollIntoView({ block: "center" });
}
// ---------- router + events ----------
function render() {
  if (!S.data) { $app.innerHTML = S.loading ? '<p class="muted" style="padding-top:30vh;text-align:center">Henter plan …</p>' : viewLogin(); bindLogin(); return; }
  const [r = "uge", a, b] = location.hash.replace(/^#\/?/, "").split("/");
  let h, tab = r;
  if (r === "a") { h = viewAct(a, b); tab = "uge"; }
  else if (r === "e") { h = viewEvent(a); tab = "uge"; }
  else if (r === "uge") h = viewUge(a);
  else if (r === "mine") h = viewMine();
  else { h = viewUge(a); tab = "uge"; }
  $app.innerHTML = h + nav(tab);
}
function bindLogin() {
  const f = document.getElementById("lf"); if (!f) return;
  f.onsubmit = async ev => { ev.preventDefault(); S.loginErr = ""; await tryUnlock(document.getElementById("code").value); };
}
async function tryUnlock(code) {
  let u = null; try { u = await unlockWithCode(S.env, code); } catch {}
  if (!u) { S.loginErr = "Ukendt kode. Tjek, at den er skrevet rigtigt."; render(); return false; }
  if (Date.now() > Date.parse(u.exp)) { S.loginErr = "Adgangen er udløbet."; render(); return false; }
  ls.set("lp_key", u.k); ls.set("lp_name", u.name); ls.set("lp_exp", u.exp);
  S.me = u.name; S.exp = u.exp;
  S.data = await decryptData(S.env, u.k);
  location.hash = "#/uge"; render(); scrollToNow(); return true;
}
document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]"); if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
  const [act, ...p] = el.dataset.act.split(":");
  if (act === "aud") { S.aud = p[0]; ls.set("lp_aud", S.aud); }
  else if (act === "mine") { S.mine = !S.mine; ls.set("lp_mine", S.mine ? "1" : "0"); }
  else if (act === "expand") S.expand = !S.expand;
  else if (act === "day") { location.hash = "#/uge/" + p[0]; return; }
  else if (act === "edit") return openEdit(p[0], p.slice(1).join(":"));
  else if (act === "cal") {
    const [k, v] = [p[0], p.slice(1).join(":")];
    if (k === "aud") S.cal.aud = v; else if (k === "mine") S.cal.mine = !S.cal.mine; else if (k === "alarm") S.cal.alarm = +v;
    else if (k === "day") { const d = +v; S.cal.days = S.cal.days.includes(d) ? S.cal.days.filter(x => x !== d) : [...S.cal.days, d]; }
  }
  else if (act === "ics") return saveFile("lommeplan.ics", buildIcs(), "text/calendar", false);
  else if (act === "icsshare") return saveFile("lommeplan.ics", buildIcs(), "text/calendar", true);
  else if (act === "exp") return saveFile("lommeplan-rettelser.json", JSON.stringify(S.over, null, 1), "application/json", true);
  else if (act === "resetall") { if (confirm("Nulstil alle dine rettelser?")) { S.over = {}; saveOver(); } }
  else if (act === "demooff") { S.demo = null; ls.del("lp_demo"); }
  else if (act === "logout") { if (confirm("Glem nøglen? Du skal bruge dit link eller din kode igen.")) { ["lp_key", "lp_name", "lp_exp"].forEach(ls.del); S.data = null; S.me = null; } }
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
    f.text().then(t => { try { const o = JSON.parse(t); if (typeof o !== "object" || Array.isArray(o)) throw 0; S.over = { ...S.over, ...o }; saveOver(); alert("Rettelser importeret."); } catch { alert("Filen kunne ikke læses."); } render(); });
    return;
  }
  render();
});
window.addEventListener("hashchange", () => { S.expand = false; render(); window.scrollTo(0, 0); scrollToNow(); });
setInterval(() => { if (S.data && !document.querySelector(".sheetbg") && !S.demo && /^#\/?(uge(\/\d)?)?$/.test(location.hash)) render(); }, 60000);

// ---------- start ----------
(async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
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
    try { S.data = await decryptData(S.env, key); S.me = ls.get("lp_name") || null; S.exp = exp; } catch { ls.del("lp_key"); S.loginErr = "Planen er opdateret med ny nøgle. Brug dit link igen."; }
  } else if (key) { ["lp_key", "lp_name", "lp_exp"].forEach(ls.del); S.loginErr = "Adgangen er udløbet."; }
  if (S.data && !location.hash) location.hash = "#/uge";
  render(); scrollToNow();
})();
