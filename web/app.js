/*
 * cc-chat web UI — talks the b3nd-move HTTP wire directly.
 *
 * Wire: POST /api/v1/observe?u=<b64>  → NDJSON of string[] batches
 *       POST /api/v1/read?u=<b64>     → JSON Output[]
 *
 * `u=` is a url-list: UTF-8 bytes for each URL framed by a 2-byte BE
 * length prefix per slot, base64-url-unpadded over the concatenation.
 */
(() => {
  const STORAGE_KEY = "cc-chat:config";

  function loadConfig() {
    const params = new URLSearchParams(window.location.search);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { saved = {}; }
    const url = params.get("url") || saved.url || "http://127.0.0.1:7373";
    const root = params.get("root") || saved.root || "immutable://open/cc-chat/";
    return { url, root };
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
  }

  const cfg = loadConfig();
  let targetRemote = cfg.url;
  let rootPath = cfg.root;
  const pattern = () => `${rootPath}**`;

  // Visual ageing windows. Independent of the rig's bridge buffer.
  const AGE_FADE_MS = 60_000;
  const PRESENCE_MIN_OPACITY = 0.18;
  const PRESENCE_WINDOW_MS = 30_000; // name considered "here" if seen within

  // ---- url-list encoder (browser-side, matches b3nd-move/codecs) ----
  function encodeUrlList(urls) {
    const enc = new TextEncoder();
    const slots = urls.map((u) => enc.encode(u));
    let total = 0;
    for (const s of slots) total += 2 + s.length;
    const buf = new Uint8Array(total);
    let off = 0;
    for (const s of slots) {
      if (s.length > 0xffff) throw new Error("url too long for u16 frame");
      buf[off++] = (s.length >> 8) & 0xff;
      buf[off++] = s.length & 0xff;
      buf.set(s, off);
      off += s.length;
    }
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // ---- Stable name → palette index ----
  const PALETTE = [
    "#39FF88", // green
    "#FF3FB7", // pink
    "#7C5CFF", // violet
    "#FFD340", // amber
    "#5DD5FF", // sky
    "#FF8A4C", // tangerine
    "#A8FF60", // chartreuse
  ];
  function colorFor(name) {
    let h = 5381;
    for (let i = 0; i < name.length; i++) h = ((h << 5) + h) ^ name.charCodeAt(i);
    return PALETTE[Math.abs(h) % PALETTE.length];
  }

  // ---- DOM ----
  const streamEl = document.getElementById("stream");
  const statusEl = document.getElementById("status");
  const presenceList = document.getElementById("presence-list");
  let emptyEl = streamEl.querySelector(".empty");

  function setStatus(state, text) {
    statusEl.className = "status " + state;
    statusEl.textContent = text;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  // ---- Roster: name → lastSeenMs ----
  const lastSeen = new Map();
  function noteSeen(name) { lastSeen.set(name, Date.now()); }

  function renderRoster() {
    const now = Date.now();
    const active = [];
    for (const [name, ts] of lastSeen) {
      const age = now - ts;
      if (age > PRESENCE_WINDOW_MS) {
        lastSeen.delete(name);
        continue;
      }
      active.push({ name, ts, age });
    }
    active.sort((a, b) => a.name.localeCompare(b.name));

    presenceList.replaceChildren();
    if (active.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-roster";
      li.textContent = "no one";
      presenceList.appendChild(li);
      return;
    }
    for (const { name, age } of active) {
      const li = document.createElement("li");
      li.style.color = colorFor(name);
      const sec = Math.max(0, Math.floor(age / 1000));
      li.innerHTML = `<span class="dot"></span><span class="nm"></span><span class="ago"></span>`;
      li.querySelector(".nm").textContent = name;
      li.querySelector(".ago").textContent = sec < 1 ? "now" : `${sec}s`;
      presenceList.appendChild(li);
    }
  }

  // ---- Stream rendering ----
  // Rows stay full-opacity so a human catching up later can read the
  // record at full strength. Only the "here now" presence panel ages out
  // (it represents *current* presence, not message visibility).
  const rows = [];
  setInterval(renderRoster, 1000);

  function render(uri, payload) {
    if (emptyEl) { emptyEl.remove(); emptyEl = null; }
    const escaped = rootPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`^${escaped}(stream|presence)\\/([a-z0-9][a-z0-9-]{0,31})\\/`).exec(uri);
    if (!m) return;
    const [, kind, name] = m;
    noteSeen(name);
    const t = new Date();
    const row = document.createElement("div");
    row.className = "row " + kind;
    row.innerHTML =
      `<span class="t">${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}</span>` +
      `<span class="who"></span><span class="body"></span>`;
    const whoEl = row.querySelector(".who");
    whoEl.textContent = name;
    whoEl.style.color = colorFor(name);
    const bodyText = kind === "presence"
      ? (payload === "join" ? "joined" : payload === "leave" ? "left" : (payload ?? ""))
      : (payload ?? "");
    row.querySelector(".body").textContent = bodyText;
    streamEl.appendChild(row);
    streamEl.scrollTop = streamEl.scrollHeight;
    rows.push({ el: row, t: t.getTime() });
    while (rows.length > 1000) {
      const drop = rows.shift();
      drop.el.remove();
    }
    renderRoster();
  }

  async function readBatch(uris) {
    const u = encodeUrlList(uris);
    const res = await fetch(`${targetRemote}/api/v1/read?u=${u}`, { method: "POST" });
    if (!res.ok) return [];
    return await res.json();
  }

  async function observeForever() {
    while (true) {
      setStatus("down", "connecting…");
      try {
        const u = encodeUrlList([pattern()]);
        const res = await fetch(`${targetRemote}/api/v1/observe?u=${u}`, {
          method: "POST",
        });
        if (!res.ok || !res.body) {
          throw new Error(`observe failed: HTTP ${res.status}`);
        }
        setStatus("live", "live");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let frame;
            try { frame = JSON.parse(line); } catch { continue; }
            if (Array.isArray(frame) && frame.every((s) => typeof s === "string")) {
              const outs = await readBatch(frame);
              for (const [uri, payload] of outs) {
                render(uri, payload);
              }
            }
          }
        }
      } catch (e) {
        console.warn("observe loop ended:", e?.message ?? e);
      }
      setStatus("down", "disconnected · reconnecting");
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // ---- Settings panel ----
  const cfgUrlEl = document.getElementById("cfg-url");
  const cfgRootEl = document.getElementById("cfg-root");
  const cfgToggleEl = document.getElementById("cfg-toggle");
  const cfgPanelEl = document.getElementById("settings");
  const cfgApplyEl = document.getElementById("cfg-apply");
  const cfgCancelEl = document.getElementById("cfg-cancel");

  function openPanel() {
    cfgUrlEl.value = targetRemote;
    cfgRootEl.value = rootPath;
    cfgPanelEl.classList.remove("hidden");
  }
  function closePanel() { cfgPanelEl.classList.add("hidden"); }

  cfgToggleEl.addEventListener("click", () => {
    cfgPanelEl.classList.contains("hidden") ? openPanel() : closePanel();
  });
  cfgCancelEl.addEventListener("click", closePanel);
  cfgApplyEl.addEventListener("click", () => {
    const newUrl = cfgUrlEl.value.trim();
    const newRoot = cfgRootEl.value.trim() || "immutable://open/cc-chat/";
    if (!newUrl) return;
    targetRemote = newUrl;
    rootPath = newRoot;
    saveConfig({ url: targetRemote, root: rootPath });
    closePanel();
    // Reload to restart the observe loop cleanly against the new target.
    const u = new URL(window.location.href);
    u.searchParams.set("url", targetRemote);
    u.searchParams.set("root", rootPath);
    window.location.assign(u.toString());
  });

  observeForever();
})();
