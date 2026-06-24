/*
 * cc-chat web UI — talks the b3nd-move HTTP wire directly.
 *
 * Wire: POST /api/v1/observe?u=<b64>  → NDJSON of string[] batches
 *       POST /api/v1/read?u=<b64>     → JSON Output[]
 *
 * `u=` is a url-list: UTF-8 bytes for each URL framed by a 2-byte BE
 * length prefix per slot, base64-url-unpadded over the concatenation.
 *
 * URL params: ?url=<rig>&root=<root>&room=<room>
 *   room: subscribe to <root><room>/** and render a meta.md header strip.
 *         When absent, subscribe to <root>** (legacy free-chat mode).
 */
(() => {
  const STORAGE_KEY = "cc-chat:config";

  // Inline mirror of src/protocol.ts parseUri — keep in sync.
  const _NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
  const _ROOM_RE = /^([0-9]{14})-([a-z0-9][a-z0-9-]{0,47})$/;
  const _LEAF_RE = /^([0-9]{14})-([a-z0-9]{6}|[a-z0-9][a-z0-9-]{0,47})\.(md|json)$/;
  const _TYPES = ["join", "msg", "pause", "resume", "end", "mention", "output"];
  function parseUri(root, uri) {
    if (!root || !uri.startsWith(root)) return null;
    const rest = uri.slice(root.length);
    const parts = rest.split("/");
    // <room>/meta.md
    if (parts.length === 2 && parts[1] === "meta.md") {
      if (!_ROOM_RE.test(parts[0])) return null;
      return { type: "meta", room: parts[0] };
    }
    // <room>/<who>/<type>/...
    if (parts.length < 4) return null;
    const [room, who, type] = parts;
    if (!_ROOM_RE.test(room)) return null;
    if (!_NAME_RE.test(who)) return null;
    if (!_TYPES.includes(type)) return null;
    if (type === "mention") {
      if (parts.length !== 5) return null;
      const target = parts[3];
      const leafStr = parts[4];
      if (!_NAME_RE.test(target)) return null;
      const m = _LEAF_RE.exec(leafStr);
      if (!m) return null;
      return { type: "mention", room, who, target, ts: m[1], slug: m[2] };
    }
    if (parts.length !== 4) return null;
    const m = _LEAF_RE.exec(parts[3]);
    if (!m) return null;
    const [, ts, sn] = m;
    switch (type) {
      case "join":
      case "pause":
      case "resume":
      case "end":
        return { type, room, who, ts, nonce: sn };
      case "msg":
      case "output":
        return { type, room, who, ts, slug: sn };
    }
    return null;
  }

  function loadConfig() {
    const params = new URLSearchParams(window.location.search);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { saved = {}; }
    const url = params.get("url") || saved.url || "http://127.0.0.1:7373";
    const root = params.get("root") || saved.root || "immutable://open/cc-chat/";
    const room = params.get("room") || saved.room || "";
    return { url, root, room };
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
  }

  const cfg = loadConfig();
  let targetRemote = cfg.url;
  let rootPath = cfg.root;
  let currentRoom = cfg.room;
  const pattern = () => currentRoom
    ? `${rootPath}${currentRoom}/**`
    : `${rootPath}**`;

  // Visual ageing windows. Independent of the rig's bridge buffer.
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
  const metaStripEl = document.getElementById("meta-strip");
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
  const rows = [];
  setInterval(renderRoster, 1000);

  function renderTimestamp() {
    const t = new Date();
    return `<span class="t">${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}</span>`;
  }

  function render(uri, payload) {
    const parsed = parseUri(rootPath, uri);
    if (!parsed) return;
    if (parsed.type === "meta") return; // meta loaded separately at startup

    if (emptyEl) { emptyEl.remove(); emptyEl = null; }

    const row = document.createElement("div");
    streamEl.appendChild(row);
    streamEl.scrollTop = streamEl.scrollHeight;
    rows.push({ el: row, t: Date.now() });
    while (rows.length > 1000) {
      const drop = rows.shift();
      drop.el.remove();
    }

    switch (parsed.type) {
      case "msg": {
        row.className = "row msg";
        row.innerHTML =
          renderTimestamp() +
          `<span class="who"></span><span class="body"></span>`;
        const whoEl = row.querySelector(".who");
        whoEl.textContent = parsed.who;
        whoEl.style.color = colorFor(parsed.who);
        row.querySelector(".body").textContent = payload ?? "";
        noteSeen(parsed.who);
        break;
      }
      case "mention": {
        row.className = "row msg mention";
        row.innerHTML =
          renderTimestamp() +
          `<span class="who"></span>` +
          `<span class="mention-badge"></span>` +
          `<span class="body"></span>`;
        const whoEl = row.querySelector(".who");
        whoEl.textContent = parsed.who;
        whoEl.style.color = colorFor(parsed.who);
        const badgeEl = row.querySelector(".mention-badge");
        badgeEl.textContent = `@${parsed.target}`;
        badgeEl.style.color = colorFor(parsed.target);
        row.querySelector(".body").textContent = payload ?? "";
        noteSeen(parsed.who);
        break;
      }
      case "join": {
        row.className = "row status";
        row.innerHTML =
          renderTimestamp() +
          `<span class="who"></span><span class="body status-text">joined</span>`;
        const whoEl = row.querySelector(".who");
        whoEl.textContent = parsed.who;
        whoEl.style.color = colorFor(parsed.who);
        noteSeen(parsed.who);
        break;
      }
      case "end": {
        row.className = "row status";
        row.innerHTML =
          renderTimestamp() +
          `<span class="who"></span><span class="body status-text">left</span>`;
        const whoEl = row.querySelector(".who");
        whoEl.textContent = parsed.who;
        whoEl.style.color = colorFor(parsed.who);
        lastSeen.delete(parsed.who);
        renderRoster();
        break;
      }
      case "pause": {
        row.className = "row banner pause-banner";
        row.innerHTML =
          renderTimestamp() +
          `<span class="banner-label">paused</span>` +
          `<span class="banner-reason"></span>`;
        row.querySelector(".banner-reason").textContent = payload ? ` — ${payload}` : "";
        break;
      }
      case "resume": {
        row.className = "row banner resume-banner";
        row.innerHTML =
          renderTimestamp() +
          `<span class="banner-label">resumed</span>`;
        break;
      }
      case "output": {
        row.className = "row output-card";
        row.innerHTML =
          renderTimestamp() +
          `<span class="output-label">deliverable</span>` +
          `<span class="body output-body"></span>`;
        row.querySelector(".output-body").textContent = payload ?? "";
        break;
      }
      default:
        row.remove();
        rows.pop();
    }
  }

  // ---- meta.md fetch + header strip ----
  function parseFrontmatter(text) {
    const fm = {};
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return fm;
    for (const line of match[1].split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key = line.slice(0, colon).trim();
      let val = line.slice(colon + 1).trim();
      // Strip inline YAML arrays  ["a","b"] → "a, b"
      if (val.startsWith("[") && val.endsWith("]")) {
        val = val.slice(1, -1).replace(/["']/g, "").split(",").map((s) => s.trim()).join(", ");
      }
      fm[key] = val;
    }
    return fm;
  }

  async function fetchMeta(room) {
    if (!room || !metaStripEl) return;
    const metaUri = `${rootPath}${room}/meta.md`;
    try {
      const u = encodeUrlList([metaUri]);
      const res = await fetch(`${targetRemote}/api/v1/read?u=${u}`, { method: "POST" });
      if (!res.ok) return;
      const outs = await res.json();
      const pair = outs.find(([uri]) => uri === metaUri);
      if (!pair) return;
      const [, content] = pair;
      if (!content) return;
      const fm = parseFrontmatter(content);
      renderMetaStrip(room, fm);
    } catch {
      // 404 or parse error — skip silently
    }
  }

  function renderMetaStrip(room, fm) {
    if (!metaStripEl) return;
    metaStripEl.classList.remove("hidden");
    const parts = [];
    if (fm.goal) parts.push(`<span class="meta-goal">${escHtml(fm.goal)}</span>`);
    if (fm.participants) {
      parts.push(`<span class="meta-kv"><span class="meta-key">participants</span> ${escHtml(fm.participants)}</span>`);
    }
    if (fm.deliverable || fm["deliverable-destination"]) {
      const dest = fm["deliverable-destination"] || fm.deliverable;
      parts.push(`<span class="meta-kv"><span class="meta-key">deliverable</span> ${escHtml(dest)}</span>`);
    }
    const roomLabel = `<span class="meta-room">${escHtml(room)}</span>`;
    metaStripEl.innerHTML = `${roomLabel}${parts.join("")}`;
  }

  function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const cfgRoomEl = document.getElementById("cfg-room");
  const cfgToggleEl = document.getElementById("cfg-toggle");
  const cfgPanelEl = document.getElementById("settings");
  const cfgApplyEl = document.getElementById("cfg-apply");
  const cfgCancelEl = document.getElementById("cfg-cancel");

  function openPanel() {
    cfgUrlEl.value = targetRemote;
    cfgRootEl.value = rootPath;
    if (cfgRoomEl) cfgRoomEl.value = currentRoom;
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
    const newRoom = cfgRoomEl ? cfgRoomEl.value.trim() : "";
    if (!newUrl) return;
    targetRemote = newUrl;
    rootPath = newRoot;
    currentRoom = newRoom;
    saveConfig({ url: targetRemote, root: rootPath, room: currentRoom });
    closePanel();
    // Reload to restart the observe loop cleanly against the new target.
    const u = new URL(window.location.href);
    u.searchParams.set("url", targetRemote);
    u.searchParams.set("root", rootPath);
    if (currentRoom) {
      u.searchParams.set("room", currentRoom);
    } else {
      u.searchParams.delete("room");
    }
    window.location.assign(u.toString());
  });

  // Kick off meta fetch then start streaming
  if (currentRoom) fetchMeta(currentRoom);
  observeForever();
})();
