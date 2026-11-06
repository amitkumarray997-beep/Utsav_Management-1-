// Campus Mela server: zero dependencies. Run with: node server.js
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = "admin@mela.com";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Admin@123";
const ROOT = __dirname, DATA_DIR = process.env.DATA_DIR || ROOT;   // on a host with a persistent disk, point DATA_DIR at it
const UPLOADS = path.join(DATA_DIR, "uploads"), DB = path.join(DATA_DIR, "data", "db.json");
const SESSION_MS = 7 * 24 * 3600 * 1000;
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const PUBLIC = new Set(["/index.html", "/script.js", "/style.css", "/mela.css"]);

/* ---- tiny JSON database: { events, users, registrations, sessions } ---- */
fs.mkdirSync(UPLOADS, { recursive: true }); fs.mkdirSync(path.dirname(DB), { recursive: true });
const seed = [
  ["CodeStorm 24h Hackathon", "Tech", "2026-11-21T09:00", "Innovation Lab, Block C", true, "Build a working prototype in 24 hours with your team. Mentors, free meals and cash prizes for the top three projects."],
  ["Rhythm Night Live", "Cultural", "2026-11-28T18:30", "Open Air Theatre", true, "Bands, solo singers and dancers take the stage for an evening of live music under the stars."],
  ["Inter-College Cricket Cup", "Sports", "2026-12-05T08:00", "Main Ground", true, "Eight college teams compete in a T10 knockout. Come cheer for your department."],
  ["Intro to Machine Learning", "Workshop", "2026-11-14T10:00", "Seminar Hall 2", false, "A hands-on beginner workshop covering Python, datasets and training your first model. Bring your laptop."]
].map(([name, category, date, venue, featured, desc], i) => ({ id: i + 1, name, category, date, venue, featured, desc, poster: "" }));

let db;
try {
  db = JSON.parse(fs.readFileSync(DB, "utf8"));
  if (Array.isArray(db)) db = { events: db };            // upgrade from the old events-only file
} catch (_) { db = { events: seed }; }
db.events ||= []; db.users ||= []; db.registrations ||= []; db.sessions ||= {};
function save() { fs.writeFileSync(DB + ".tmp", JSON.stringify(db, null, 2)); fs.renameSync(DB + ".tmp", DB); }

/* ---- passwords (scrypt + random salt) and sessions ---- */
function hashPass(p) { const salt = crypto.randomBytes(16).toString("hex"); return salt + ":" + crypto.scryptSync(p, salt, 64).toString("hex"); }
function checkPass(p, stored) {
  const [salt, h] = String(stored).split(":"); if (!salt || !h) return false;
  const a = Buffer.from(h, "hex"), b = crypto.scryptSync(p, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
if (!db.users.some(u => u.role === "admin")) {
  db.users.push({ id: Date.now(), name: "Admin", email: ADMIN_EMAIL, phone: "", role: "admin", pass: hashPass(ADMIN_PASS) });
}
save();
if (!process.env.ADMIN_PASSWORD) console.log("Note: using the default admin password. Set ADMIN_PASSWORD before deploying.");

function cookies(req) { return Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split("=")).filter(c => c[0])); }
function currentUser(req) {
  const sid = cookies(req).sid, s = sid && db.sessions[sid];
  if (!s) return null;
  if (s.expires < Date.now()) { delete db.sessions[sid]; save(); return null; }
  return db.users.find(u => u.id === s.userId) || null;
}
function startSession(req, res, user) {
  const sid = crypto.randomBytes(32).toString("hex");
  db.sessions[sid] = { userId: user.id, expires: Date.now() + SESSION_MS };
  for (const k in db.sessions) if (db.sessions[k].expires < Date.now()) delete db.sessions[k];
  save();
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
}
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

/* simple login throttle: 10 failed attempts per 10 minutes per IP */
const fails = new Map();
const tooMany = ip => (fails.get(ip) || []).filter(t => t > Date.now() - 6e5).length >= 10;
const noteFail = ip => fails.set(ip, [...(fails.get(ip) || []).filter(t => t > Date.now() - 6e5), Date.now()]);

/* ---- validation (mirrors the browser rules) ---- */
const V = {
  name: v => /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(v),
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
  phone: v => /^[6-9]\d{9}$/.test(v),
  pass: v => typeof v === "string" && v.length >= 6 && v.length <= 200
};

/* ---- image files: saved in /uploads, removed when event/poster is deleted ---- */
function saveImage(id, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  const ext = m[1] === "jpeg" ? "jpg" : m[1], name = `event-${id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, name), Buffer.from(m[2], "base64"));
  return "/uploads/" + name;
}
function removeImage(poster) {
  if (!poster || !poster.startsWith("/uploads/")) return;
  fs.unlink(path.join(UPLOADS, path.basename(poster)), () => {});
}

/* ---- http helpers ---- */
const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
function readBody(req) {
  return new Promise((ok, no) => {
    let s = "", n = 0;
    req.on("data", c => { n += c.length; if (n > 8e6) { no(new Error("Too large")); req.destroy(); } else s += c; });
    req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { no(e); } });
  });
}
function clean(b) {
  const o = { name: String(b.name || "").trim(), category: String(b.category || "").trim(), date: String(b.date || ""), venue: String(b.venue || "").trim(), desc: String(b.desc || "").trim(), featured: !!b.featured };
  return o.name && o.category && o.date && o.venue && o.desc ? o : null;
}
const eventsOut = () => db.events.map(e => ({ ...e, registered: db.registrations.filter(r => r.eventId === e.id).length }));
function regOut(r) {
  const ev = db.events.find(e => e.id === r.eventId);
  return { ...r, event: ev ? ev.name : "(deleted event)", date: ev ? ev.date : r.at };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = decodeURIComponent(url.pathname);
  const ip = req.socket.remoteAddress;
  try {
    if (p.startsWith("/api/")) {
      const me = currentUser(req), isAdmin = me?.role === "admin";
      if (req.method !== "GET" && req.method !== "DELETE" && !/application\/json/.test(req.headers["content-type"] || "")) return send(res, 415, { error: "JSON only" });

      /* --- accounts --- */
      if (p === "/api/me" && req.method === "GET") return send(res, 200, me ? publicUser(me) : null);
      if (p === "/api/signup" && req.method === "POST") {
        const b = await readBody(req), name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase(), phone = String(b.phone || "");
        if (!V.name(name) || !V.email(email) || !V.phone(phone) || !V.pass(b.password)) return send(res, 400, { error: "Please check your details." });
        if (db.users.some(u => u.email === email)) return send(res, 409, { error: "An account with this email already exists.", field: "aEmail" });
        const u = { id: Date.now(), name, email, phone, role: "student", pass: hashPass(b.password) };
        db.users.push(u); save(); startSession(req, res, u);
        return send(res, 201, publicUser(u));
      }
      if (p === "/api/login" && req.method === "POST") {
        if (tooMany(ip)) return send(res, 429, { error: "Too many attempts. Try again in a few minutes." });
        const b = await readBody(req), email = String(b.email || "").trim().toLowerCase();
        const u = db.users.find(x => x.email === email);
        if (!u || !checkPass(String(b.password || ""), u.pass)) { noteFail(ip); return send(res, 401, { error: "Incorrect email or password.", field: "aPass" }); }
        startSession(req, res, u);
        return send(res, 200, publicUser(u));
      }
      if (p === "/api/logout" && req.method === "POST") {
        const sid = cookies(req).sid; if (sid) { delete db.sessions[sid]; save(); }
        res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
        return send(res, 200, { ok: true });
      }

      /* --- events --- */
      if (p === "/api/events" && req.method === "GET") return send(res, 200, eventsOut());
      if (p.startsWith("/api/events")) {
        if (!isAdmin) return send(res, 401, { error: "Admin only" });
        const id = Number(p.split("/")[3]);
        if (req.method === "POST") {
          const b = await readBody(req), o = clean(b); if (!o) return send(res, 400, { error: "Fill all fields" });
          const ev = { id: Date.now(), ...o, poster: "" }; ev.poster = saveImage(ev.id, b.image) || "";
          db.events.push(ev); save(); return send(res, 201, eventsOut());
        }
        const ev = db.events.find(e => e.id === id); if (!ev) return send(res, 404, { error: "Not found" });
        if (req.method === "PUT") {
          const b = await readBody(req), o = clean(b); if (!o) return send(res, 400, { error: "Fill all fields" });
          Object.assign(ev, o);
          if (b.image === "") { removeImage(ev.poster); ev.poster = ""; }          // reset to default poster
          else if (b.image) { const np = saveImage(id, b.image); if (np) { removeImage(ev.poster); ev.poster = np; } }
          save(); return send(res, 200, eventsOut());
        }
        if (req.method === "DELETE") {
          removeImage(ev.poster);
          db.events = db.events.filter(e => e.id !== id);
          db.registrations = db.registrations.filter(r => r.eventId !== id);   // no orphaned registrations
          save(); return send(res, 200, eventsOut());
        }
      }

      /* --- registrations --- */
      if (p.startsWith("/api/registrations")) {
        if (!me) return send(res, 401, { error: "Please log in." });
        const rid = Number(p.split("/")[3]);
        if (p === "/api/registrations" && req.method === "GET")
          return send(res, 200, db.registrations.filter(r => isAdmin || r.userId === me.id).map(regOut));
        if (p === "/api/registrations" && req.method === "POST") {
          const b = await readBody(req), ev = db.events.find(e => e.id === Number(b.eventId));
          const name = String(b.name || "").trim(), email = String(b.email || "").trim(), phone = String(b.phone || "");
          if (!ev) return send(res, 400, { error: "Please select an event.", field: "eventSelect" });
          if (!V.name(name) || !V.email(email) || !V.phone(phone)) return send(res, 400, { error: "Please check your details." });
          if (db.registrations.some(r => r.eventId === ev.id && r.userId === me.id)) return send(res, 409, { error: "You are already registered for this event.", field: "eventSelect" });
          const entry = { id: Date.now(), pass: "MELA-" + crypto.randomBytes(4).toString("hex").slice(0, 5).toUpperCase(), eventId: ev.id, userId: me.id, userEmail: me.email, name, email, phone, at: new Date().toISOString() };
          db.registrations.push(entry); save();
          return send(res, 201, regOut(entry));
        }
        if (p === "/api/registrations" && req.method === "DELETE") {          // clear my registrations
          db.registrations = db.registrations.filter(r => r.userId !== me.id); save();
          return send(res, 200, { ok: true });
        }
        if (rid && req.method === "DELETE") {
          const r = db.registrations.find(x => x.id === rid);
          if (!r) return send(res, 404, { error: "Not found" });
          if (r.userId !== me.id && !isAdmin) return send(res, 403, { error: "Not allowed" });
          db.registrations = db.registrations.filter(x => x.id !== rid); save();
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: "Not found" });
    }

    /* static files (only the site files and /uploads/*) */
    const f = p === "/" ? "/index.html" : p;
    const file = f.startsWith("/uploads/") ? path.join(UPLOADS, path.basename(f)) : PUBLIC.has(f) ? path.join(ROOT, f) : null;
    if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }); fs.createReadStream(file).pipe(res);
  } catch (e) { send(res, 400, { error: e.message }); }
}).listen(PORT, () => console.log(`Campus Mela running at http://localhost:${PORT}`));
