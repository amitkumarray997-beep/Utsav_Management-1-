"use strict";

/* ===== Email settings (EmailJS). Fill these in to send real confirmation emails. See README. ===== */
const EMAILJS = { publicKey: "", serviceId: "", templateId: "" };

/* ===== Helpers ===== */
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
};
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3000);
}
/* ===== Data ===== */
let events = [];
const api = (path, opt = {}) => fetch(path, { ...opt, headers: { "Content-Type": "application/json" } })
  .then(async r => { const d = await r.json(); if (!r.ok) { const e = new Error(d.error || "Server error"); e.field = d.field; throw e; } return d; });
let me = null, regs = [];            // logged-in user and their registrations (all of them for the admin), both from the server
let activeCat = "All", currentEvent = null, editId = null, posterData; // posterData: undefined = keep, "" = default

const PAL = { Tech: ["#5b3df5", "#8a4dff"], Cultural: ["#ff5d73", "#ff9a5d"], Sports: ["#1fc7a0", "#1fa3c7"], Workshop: ["#2b2d6e", "#5b3df5"] };
const ICON = { Tech: "💻", Cultural: "🎭", Sports: "🏅", Workshop: "🛠️" };
function bg(e) {
  if (e.poster) return `url("${e.poster}") center/cover`;
  let p = PAL[e.category];
  if (!p) { const h = [...e.category].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; p = [`hsl(${h},65%,48%)`, `hsl(${(h + 45) % 360},70%,55%)`]; }
  return `linear-gradient(135deg, ${p[0]}, ${p[1]})`;
}
const icon = (e) => e.poster ? "" : (ICON[e.category] || "🎉");
const getRegs = () => regs;
const regCount = (id) => events.find(e => e.id === id)?.registered || 0;
const user = () => me;
async function loadRegs() { regs = me ? await api("/api/registrations").catch(() => []) : []; }
async function reloadEvents() { events = await api("/api/events"); }
const sorted = () => [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
function daysLeft(iso) {
  const d = Math.ceil((new Date(iso) - new Date()) / 864e5);
  return d > 1 ? `Starts in ${d} days` : d === 1 ? "Starts tomorrow" : d === 0 ? "Happening today" : "Event ended";
}

/* ===== Event cards ===== */
function cardHTML(e) {
  return `
    <article class="card">
      <div class="card-img" style="background:${bg(e)}" role="img" aria-label="${esc(e.name)} poster">
        <span class="tag">${esc(e.category)}</span>${icon(e)}
      </div>
      <div class="card-body">
        <h3>${esc(e.name)}</h3>
        <p class="meta">📅 ${fmtDate(e.date)} &nbsp; 📍 ${esc(e.venue)}</p>
        <p class="meta">⏳ ${daysLeft(e.date)} &nbsp; 👥 ${regCount(e.id)} registered</p>
        <p>${esc(e.desc.length > 90 ? e.desc.slice(0, 90) + "…" : e.desc)}</p>
        <button class="btn btn-sm" data-id="${e.id}">View &amp; register</button>
      </div>
    </article>`;
}
function renderFeatured() {
  const f = sorted().filter(e => e.featured);
  $("featured").hidden = !f.length;
  $("featuredGrid").innerHTML = f.map(cardHTML).join("");
}
function renderEvents() {
  const q = $("search").value.trim().toLowerCase();
  const list = sorted().filter(e => (activeCat === "All" || e.category === activeCat) &&
    `${e.name} ${e.venue} ${e.desc} ${e.category}`.toLowerCase().includes(q));
  $("grid").innerHTML = list.map(cardHTML).join("");
  $("empty").hidden = list.length > 0;
  $("count").textContent = `Showing ${list.length} of ${events.length} events`;
}
function renderChips() {
  const cats = ["All", ...new Set(events.map(e => e.category))];
  if (!cats.includes(activeCat)) activeCat = "All";
  $("chips").innerHTML = cats.map(c => `<button class="chip ${c === activeCat ? "active" : ""}" data-cat="${esc(c)}" aria-pressed="${c === activeCat}">${esc(c)}</button>`).join("");
  $("catList").innerHTML = cats.slice(1).map(c => `<option value="${esc(c)}">`).join("");
}
$("search").addEventListener("input", renderEvents);
$("chips").addEventListener("click", (ev) => {
  const b = ev.target.closest(".chip"); if (!b) return;
  activeCat = b.dataset.cat; renderChips(); renderEvents();
});
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-id]"); if (b) openModal(Number(b.dataset.id));
  if (ev.target.closest("[data-login]")) { closeModal(); openAuth("login"); }
});

/* ===== Validation ===== */
const R = {
  name: v => !v ? "Please enter your name." : !/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(v) ? "Use letters only (2 to 60 characters)." : "",
  email: v => !v ? "Please enter your email." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "Enter a valid email like name@college.edu." : "",
  phone: v => !v ? "Please enter your phone number." : !/^[6-9]\d{9}$/.test(v) ? "Enter a valid 10-digit mobile number starting with 6-9." : "",
  pass: v => !v ? "Please enter a password." : v.length < 6 ? "Use at least 6 characters." : "",
  sel: v => !v ? "Please select an event." : ""
};
const regRules = { name: R.name, email: R.email, phone: R.phone, eventSelect: R.sel };
const authRules = { aName: R.name, aEmail: R.email, aPhone: R.phone, aPass: R.pass };
function vf(id, fn) {
  const el = $(id), m = fn(el.value.trim());
  $(id + "Err").textContent = m;
  el.classList.toggle("invalid", !!m); el.classList.toggle("valid", !m);
  return !m;
}
function bindLive(map) {
  Object.keys(map).forEach(id => {
    $(id).addEventListener("blur", () => vf(id, map[id]));
    $(id).addEventListener("input", () => { if ($(id).classList.contains("invalid")) vf(id, map[id]); });
  });
}
bindLive(regRules); bindLive(authRules);
["phone", "aPhone"].forEach(id => $(id).addEventListener("input", () => { $(id).value = $(id).value.replace(/\D/g, ""); }));
function clearFields(map) { Object.keys(map).forEach(id => { $(id).classList.remove("invalid", "valid"); $(id + "Err").textContent = ""; }); }

/* ===== Overlays ===== */
function lock(on) { document.body.style.overflow = on ? "hidden" : ""; }
function closeModal() { $("overlay").hidden = true; lock(false); }
function closeAuth() { $("authOverlay").hidden = true; lock(false); }
$("close").onclick = $("done").onclick = closeModal;
$("authClose").onclick = closeAuth;
[["overlay", closeModal], ["authOverlay", closeAuth]].forEach(([id, fn]) => $(id).addEventListener("click", ev => { if (ev.target === $(id)) fn(); }));
document.addEventListener("keydown", ev => { if (ev.key === "Escape") { closeModal(); closeAuth(); } });

/* ===== Event details + registration ===== */
function fillSelect(selected) {
  $("eventSelect").innerHTML = `<option value="">Select an event</option>` +
    sorted().map(x => `<option value="${x.id}" ${x.id === selected ? "selected" : ""}>${esc(x.name)}</option>`).join("");
}
function openModal(id) {
  const e = currentEvent = events.find(x => x.id === id), u = user();
  $("mBanner").style.background = bg(e); $("mBanner").textContent = icon(e);
  $("mTitle").textContent = e.name;
  $("mFacts").innerHTML = `<li>📅 ${fmtDate(e.date)}</li><li>🕒 ${fmtTime(e.date)}</li><li>📍 ${esc(e.venue)}</li><li>🏷️ ${esc(e.category)}</li>`;
  $("mDesc").textContent = e.desc;
  $("success").hidden = true;
  $("loginPrompt").hidden = !!u;
  $("form").hidden = !u;
  if (u) {
    $("form").reset(); clearFields(regRules); fillSelect(id);
    $("name").value = u.name; $("email").value = u.email; $("phone").value = u.phone || "";
  }
  $("overlay").hidden = false; lock(true);
}
async function sendMail(entry, ev) {
  const c = EMAILJS;
  if (!(c.publicKey && c.serviceId && c.templateId && window.emailjs)) return "off";
  try {
    await emailjs.send(c.serviceId, c.templateId, {
      to_name: entry.name, to_email: entry.email, event_name: ev.name,
      event_date: `${fmtDate(ev.date)} at ${fmtTime(ev.date)}`, event_venue: ev.venue
    }, { publicKey: c.publicKey });
    return "sent";
  } catch (_) { return "failed"; }
}
$("form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!Object.keys(regRules).map(id => vf(id, regRules[id])).every(Boolean)) { document.querySelector("#form .invalid")?.focus(); return; }
  const chosen = events.find(e => e.id === Number($("eventSelect").value)), u = user();
  const btn = $("form").querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Registering…";
  let entry;
  try {
    entry = await api("/api/registrations", { method: "POST", body: JSON.stringify({ eventId: chosen.id, name: $("name").value.trim(), email: $("email").value.trim(), phone: $("phone").value }) });
  } catch (e) {
    btn.disabled = false; btn.textContent = "Confirm registration";
    if (e.field === "eventSelect") { $("eventSelectErr").textContent = e.message; $("eventSelect").classList.add("invalid"); } else toast(e.message);
    return;
  }
  const mail = await sendMail(entry, chosen);
  btn.disabled = false; btn.textContent = "Confirm registration";
  const note = { sent: `A confirmation email has been sent to ${entry.email}.`,
    failed: "Your registration is saved, but the confirmation email could not be sent. Please check the EmailJS settings.",
    off: "Your registration is saved. Email sending is not set up yet (see README)." }[mail];
  $("successMsg").textContent = `Thanks ${entry.name.split(" ")[0]}! You are registered for "${chosen.name}" on ${fmtDate(chosen.date)} at ${chosen.venue}. ${note} Your pass code: ${entry.pass}`;
  $("form").hidden = true; $("success").hidden = false;
  await Promise.all([loadRegs(), reloadEvents()]).catch(() => {}); refreshAll();
});

/* ===== Accounts ===== */
let authMode = "login";
function openAuth(mode) { setMode(mode); $("authForm").reset(); clearFields(authRules); $("authOverlay").hidden = false; lock(true); }
function setMode(m) {
  authMode = m;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.mode === m));
  document.querySelectorAll(".signup-only").forEach(el => el.hidden = m === "login");
  $("authTitle").textContent = m === "login" ? "Welcome back" : "Create your student account";
  $("authSubmit").textContent = m === "login" ? "Log in" : "Create account";
  $("aPass").autocomplete = m === "login" ? "current-password" : "new-password";
}
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => setMode(t.dataset.mode)));
$("authForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const ids = authMode === "signup" ? ["aName", "aEmail", "aPhone", "aPass"] : ["aEmail", "aPass"];
  if (!ids.map(id => vf(id, authRules[id])).every(Boolean)) return;
  const body = { email: $("aEmail").value.trim().toLowerCase(), password: $("aPass").value };
  if (authMode === "signup") { body.name = $("aName").value.trim(); body.phone = $("aPhone").value; }
  try { me = await api(authMode === "signup" ? "/api/signup" : "/api/login", { method: "POST", body: JSON.stringify(body) }); }
  catch (e) { $((e.field || "aPass") + "Err").textContent = e.message; return; }
  await Promise.all([loadRegs(), reloadEvents()]).catch(() => {});
  closeAuth(); refreshAll(); toast(`Welcome, ${me.name.split(" ")[0]}!`);
});
$("authBtn").addEventListener("click", async () => {
  if (user()) { await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {}); me = null; regs = []; resetEvForm(); await reloadEvents().catch(() => {}); refreshAll(); toast("You have been logged out."); location.hash = "#home"; }
  else openAuth("login");
});

/* ===== My registrations ===== */
function exportCSV(list) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["Name", "Email", "Phone", "Event", "Event date", "Registered at"], ...list.map(r => [r.name, r.email, r.phone, r.event, r.date, r.at])];
  const url = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "registrations.csv" }).click();
  URL.revokeObjectURL(url);
}
const myRegs = () => regs.filter(r => me && r.userId === me.id);
function renderRegs() {
  const u = user(), regs = u ? myRegs() : [];
  $("regBadge").textContent = regs.length;
  $("regSummary").textContent = regs.length ? `You have ${regs.length} registration${regs.length > 1 ? "s" : ""}.` : "";
  $("exportBtn").hidden = $("clearBtn").hidden = !regs.length;
  $("regList").innerHTML = !u ? `<p class="empty">Please <button class="link" data-login>log in</button> to see the events you registered for.</p>`
    : regs.length ? regs.slice().reverse().map(r => `
    <div class="reg"><div><h3>${esc(r.event)}</h3>
      <p>${esc(r.name)} · ${esc(r.email)} · ${esc(r.phone)}</p>
      <p>Event date: ${fmtDate(r.date)} · Registered on ${fmtDate(r.at)}</p></div>
      <button class="cancel" data-cancel="${r.id}">Cancel registration</button></div>`).join("")
    : `<p class="empty">You have not registered for any event yet. Pick one from the events above.</p>`;
}
$("regList").addEventListener("click", async ev => {
  const b = ev.target.closest("[data-cancel]"); if (!b) return;
  try { await api("/api/registrations/" + b.dataset.cancel, { method: "DELETE" }); await Promise.all([loadRegs(), reloadEvents()]); refreshAll(); toast("Registration cancelled"); }
  catch (e) { toast(e.message); }
});
$("clearBtn").onclick = async () => {
  if (!confirm("Cancel all your registrations?")) return;
  try { await api("/api/registrations", { method: "DELETE" }); await Promise.all([loadRegs(), reloadEvents()]); refreshAll(); toast("Your registrations were cleared"); }
  catch (e) { toast(e.message); }
};
$("exportBtn").onclick = () => exportCSV(myRegs());

/* ===== Admin panel ===== */
const isAdmin = () => user()?.role === "admin";
function showPreview(e) { $("ePrev").style.background = bg(e); $("ePrev").textContent = icon(e); }
function resetEvForm() {
  editId = null; posterData = undefined; $("evForm").reset();
  $("evFormTitle").textContent = "Add new event"; $("evSave").textContent = "Add event";
  showPreview({ category: $("eCat").value || "Event", poster: "" });
}
function readPoster(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 900 / img.width), c = document.createElement("canvas");
        c.width = img.width * s; c.height = img.height * s;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", .78));
      };
      img.onerror = rej; img.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}
$("ePoster").addEventListener("change", async () => {
  const f = $("ePoster").files[0]; if (!f) return;
  try { posterData = await readPoster(f); showPreview({ category: $("eCat").value, poster: posterData }); }
  catch (_) { toast("Could not read that image. Try another file."); }
});
$("posterReset").onclick = () => { posterData = ""; $("ePoster").value = ""; showPreview({ category: $("eCat").value || "Event", poster: "" }); };
$("eCat").addEventListener("input", () => { if (!posterData && !(editId && posterData === undefined && events.find(e => e.id === editId)?.poster)) showPreview({ category: $("eCat").value || "Event", poster: "" }); });
$("evCancel").onclick = resetEvForm;
$("evForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const o = { name: $("eName").value.trim(), category: $("eCat").value.trim(), date: $("eDate").value, venue: $("eVenue").value.trim(), desc: $("eDesc").value.trim(), featured: $("eFeat").checked };
  if (Object.values(o).slice(0, 5).some(v => !v)) { toast("Please fill in all the event details."); return; }
  if (posterData !== undefined) o.image = posterData;   // "" = remove poster, data URL = new poster
  try {
    events = await api(editId ? "/api/events/" + editId : "/api/events", { method: editId ? "PUT" : "POST", body: JSON.stringify(o) });
    toast(editId ? "Event updated" : "Event added. Poster saved in the uploads folder.");
    resetEvForm(); refreshAll();
  } catch (e) { toast(e.message); }
});
function renderAdmin() {
  $("admin").hidden = !isAdmin(); $("adminLink").hidden = !isAdmin();
  if (!isAdmin()) return;
  $("adminEvents").innerHTML = sorted().map(e => `
    <div class="ev-row"><div class="thumb" style="background:${bg(e)}">${icon(e)}</div>
      <div><h3>${esc(e.name)}</h3><p>${fmtDate(e.date)} · ${esc(e.venue)} · ${regCount(e.id)} registered</p></div>
      <div><button class="mini" data-edit="${e.id}">Edit</button><button class="mini del" data-del="${e.id}">Delete</button></div></div>`).join("")
    || `<p class="empty">No events yet. Add your first event.</p>`;
  $("adminRegCount").textContent = regs.length;
  $("adminRegs").innerHTML = regs.slice().reverse().map(r => `
    <div class="reg"><div><h3>${esc(r.name)} → ${esc(r.event)}</h3><p>${esc(r.email)} · ${esc(r.phone)} · Registered on ${fmtDate(r.at)}</p></div>
      <button class="cancel" data-cancel-admin="${r.id}">Remove</button></div>`).join("") || `<p class="empty">No registrations yet.</p>`;
}
$("adminEvents").addEventListener("click", ev => {
  const ed = ev.target.closest("[data-edit]"), del = ev.target.closest("[data-del]");
  if (ed) {
    const e = events.find(x => x.id === Number(ed.dataset.edit));
    editId = e.id; posterData = undefined;
    $("eName").value = e.name; $("eCat").value = e.category; $("eDate").value = e.date; $("eVenue").value = e.venue; $("eDesc").value = e.desc; $("eFeat").checked = !!e.featured;
    $("evFormTitle").textContent = "Edit event"; $("evSave").textContent = "Save changes"; showPreview(e);
    $("evForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (del && confirm("Delete this event? It will disappear from the site.")) {
    api("/api/events/" + del.dataset.del, { method: "DELETE" }).then(list => {
      events = list; if (editId === Number(del.dataset.del)) resetEvForm();
      refreshAll(); toast("Event and its poster file deleted");
    }).catch(e => toast(e.message));
  }
});
$("adminRegs").addEventListener("click", async ev => {
  const b = ev.target.closest("[data-cancel-admin]"); if (!b) return;
  try { await api("/api/registrations/" + b.dataset.cancelAdmin, { method: "DELETE" }); await Promise.all([loadRegs(), reloadEvents()]); refreshAll(); toast("Registration removed"); }
  catch (e) { toast(e.message); }
});
$("adminExport").onclick = () => exportCSV(getRegs());

/* ===== Countdown to next event ===== */
let next = null;
function setNext() {
  next = sorted().find(e => new Date(e.date) > new Date()) || null;
  $("nextName").textContent = next ? next.name : "No upcoming events";
  $("nextMeta").textContent = next ? `${fmtDate(next.date)} · ${next.venue}` : "Check back soon.";
  $("timer").hidden = $("nextBtn").hidden = !next;
}
$("nextBtn").addEventListener("click", () => next && openModal(next.id));
function tick() {
  if (!next) return;
  const diff = Math.max(0, new Date(next.date) - new Date());
  $("d").textContent = Math.floor(diff / 864e5); $("h").textContent = Math.floor(diff % 864e5 / 36e5);
  $("m").textContent = Math.floor(diff % 36e5 / 6e4); $("s").textContent = Math.floor(diff % 6e4 / 1e3);
}
setInterval(tick, 1000);

/* ===== Theme, menu, scroll reveal ===== */
function applyTheme(t) {
  document.documentElement.dataset.theme = t; $("theme").innerHTML = t === "dark" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>'; store.set("theme", t);
}
applyTheme(store.get("theme", null) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("theme").onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
$("burger").onclick = () => { const o = $("menu").classList.toggle("open"); $("burger").setAttribute("aria-expanded", o); };
$("menu").addEventListener("click", ev => { if (ev.target.tagName === "A") $("menu").classList.remove("open"); });
const revealEls = document.querySelectorAll(".section>h2,.steps li,.reg-bar");
revealEls.forEach(el => el.classList.add("reveal"));
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(items => items.forEach(i => { if (i.isIntersecting) { i.target.classList.add("in"); io.unobserve(i.target); } }), { threshold: .15 });
  revealEls.forEach(el => io.observe(el));
} else revealEls.forEach(el => el.classList.add("in"));

/* ===== Render everything ===== */
function refreshAll() {
  const u = user();
  $("authBtn").textContent = u ? `Log out (${u.name.split(" ")[0]})` : "Log in";
  setNext(); tick(); renderFeatured(); renderChips(); renderEvents(); renderRegs(); renderAdmin();
}
(async function init() {
  ["users", "session", "registrations"].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });   // old browser-only data from earlier versions
  try { [events, me] = await Promise.all([api("/api/events"), api("/api/me")]); await loadRegs(); }
  catch (_) { toast("Server not running. Start it with: node server.js"); }
  resetEvForm(); refreshAll();
})();
