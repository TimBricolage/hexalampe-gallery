/**
 * HexaLamp - API de la galerie (Cloudflare Worker)
 *
 * Reçoit un modèle envoyé depuis le site, le vérifie, puis l'enregistre dans votre
 * dépôt GitHub (dossier models/) avec l'API GitHub. Le jeton GitHub reste secret,
 * côté Cloudflare : il n'est jamais visible dans le site.
 *
 * Fichiers créés dans le dépôt :
 *   models/<id>.json   -> { id, name, date, hexes:[[q,r,epaisseur],...] }
 *   models/<id>.jpg    -> miniature
 *   models/index.json  -> [{ id, name, date, n }, ...]
 *
 * Variables / secrets à configurer (voir GUIDE_INSTALLATION.md) :
 *   GITHUB_TOKEN   (secret)  jeton GitHub avec droit "Contents : Read and write" sur le dépôt
 *   GITHUB_REPO    ex : "moncompte/hexalampe"
 *   GITHUB_BRANCH  ex : "main"
 *   ALLOWED_ORIGIN ex : "https://moncompte.github.io"  (plusieurs possibles, séparés par des virgules)
 *   MAX_PER_HOUR   (optionnel) envois max par heure et par adresse IP, défaut 5
 */

const MAX_HEXES = 300;
const MAX_NAME = 30;
const MAX_BODY = 250000;      // octets
const MAX_THUMB = 150000;     // caractères base64

// mémoire de limitation (propre à chaque instance du Worker : protection de base)
const hits = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
    const originOk = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk && origin ? origin : (allowed[0] || "*"),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET") return json({ ok: true, service: "hexalampe-gallery" });
    if (request.method !== "POST") return json({ error: "method" }, 405);
    if (!originOk) return json({ error: "origin" }, 403);

    try {
      // ---- limitation par IP ----
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const limit = parseInt(env.MAX_PER_HOUR || "5", 10);
      const now = Date.now();
      const recent = (hits.get(ip) || []).filter(t => now - t < 3600000);
      if (recent.length >= limit) return json({ error: "rate" }, 429);

      // ---- lecture ----
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: "invalid" }, 413);
      let body;
      try { body = JSON.parse(text); } catch (e) { return json({ error: "invalid" }, 400); }

      // piège anti-robots : champ caché rempli => on fait semblant que tout va bien
      if (body.website) return json({ ok: true, id: "x" });

      // ---- validation ----
      const name = cleanName(body.name);
      if (!name) return json({ error: "name" }, 400);

      const hexes = body.hexes;
      const check = validateHexes(hexes);
      if (check) return json(check, 400);

      const thumb = parseThumb(body.thumb);
      if (!thumb) return json({ error: "invalid" }, 400);

      const id = await makeId(hexes);
      const date = new Date().toISOString();

      // ---- déjà présent ? ----
      const idxFile = await getFile(env, "models/index.json");
      let idx0 = [];
      if (idxFile) { try { idx0 = JSON.parse(idxFile.content); } catch (e) { idx0 = []; } }
      if (Array.isArray(idx0) && idx0.some(m => m.id === id)) return json({ error: "exists" }, 409);

      recent.push(now); hits.set(ip, recent);

      // ---- écriture dans GitHub (miniature, modèle, puis index) ----
      await putFile(env, `models/${id}.jpg`, thumb, `Galerie : miniature ${id}`);
      const modelJson = JSON.stringify({ id, name, date, hexes });
      await putFile(env, `models/${id}.json`, toBase64(modelJson), `Galerie : modèle ${id} (${name})`);
      await updateIndex(env, { id, name, date, n: hexes.length });

      return json({ ok: true, id });
    } catch (e) {
      console.error("worker error", e && e.message ? e.message : e);
      return json({ error: "server" }, 500);
    }
  }
};

/* ---------------- validation ---------------- */

function cleanName(v) {
  if (typeof v !== "string") return "";
  const s = v
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const len = Array.from(s).length;
  if (len < 1 || len > MAX_NAME) return "";
  return s;
}

const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function validateHexes(h) {
  if (!Array.isArray(h) || h.length < 2 || h.length > MAX_HEXES) return { error: "empty" };
  const set = new Set();
  for (const a of h) {
    if (!Array.isArray(a) || a.length !== 3) return { error: "invalid" };
    const [q, r, t] = a;
    if (!Number.isInteger(q) || !Number.isInteger(r) || Math.abs(q) > 60 || Math.abs(r) > 60) return { error: "invalid" };
    if (![1, 2, 3, 4].includes(t)) return { error: "invalid" };
    const k = q + "," + r;
    if (set.has(k)) return { error: "invalid" };
    set.add(k);
  }
  // aucun hexagone isolé
  for (let i = 0; i < h.length; i++) {
    const [q, r] = h[i];
    if (!DIRS.some(d => set.has((q + d[0]) + "," + (r + d[1])))) return { error: "isolated", n: i + 1 };
  }
  return null;
}

function parseThumb(v) {
  if (typeof v !== "string" || v.length > MAX_THUMB) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) return null;
  try {
    const head = atob(m[1].slice(0, 8));
    if (head.charCodeAt(0) !== 0xff || head.charCodeAt(1) !== 0xd8 || head.charCodeAt(2) !== 0xff) return null;
  } catch (e) { return null; }
  return m[1];
}

async function makeId(hexes) {
  const data = new TextEncoder().encode(hexes.map(a => a.join(",")).join(";"));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- GitHub ---------------- */

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function ghFetch(env, path, init) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  return fetch(url + (init.method === "GET" ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH || "main")}` : ""), {
    ...init,
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "hexalampe-gallery-worker",
      "Content-Type": "application/json"
    }
  });
}

async function getFile(env, path) {
  const res = await ghFetch(env, path, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} -> ${res.status}`);
  const j = await res.json();
  return { sha: j.sha, content: j.content ? fromBase64(j.content) : "" };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// écrit (ou remplace) un fichier ; réessaie si GitHub signale un conflit
async function putFile(env, path, contentB64, message, transform) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await getFile(env, path);
    let content = contentB64;
    if (transform) content = toBase64(transform(existing ? existing.content : ""));
    const res = await ghFetch(env, path, {
      method: "PUT",
      body: JSON.stringify({
        message, content, branch: env.GITHUB_BRANCH || "main",
        ...(existing ? { sha: existing.sha } : {})
      })
    });
    if (res.ok) return;
    if (res.status === 409 || res.status === 422) { await sleep(350 * (attempt + 1)); continue; }
    throw new Error(`GitHub PUT ${path} -> ${res.status}`);
  }
  throw new Error(`GitHub PUT ${path} : trop de conflits`);
}

async function updateIndex(env, entry) {
  await putFile(env, "models/index.json", null, `Galerie : ajout de ${entry.id}`, current => {
    let list = [];
    try { list = JSON.parse(current || "[]"); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    if (!list.some(m => m.id === entry.id)) list.push(entry);
    return JSON.stringify(list, null, 1) + "\n";
  });
}
