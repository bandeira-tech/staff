/*
 * cc-chat web UI — talks the b3nd-move HTTP wire directly.
 *
 * Wire: POST /api/v1/observe?u=<b64>  → NDJSON of string[] batches
 *       POST /api/v1/read?u=<b64>     → outputs-frame bytes (Output[])
 *
 * `u=` is a url-list: UTF-8 bytes for each URL framed by a 2-byte BE
 * length prefix per slot, base64-url-unpadded over the concatenation.
 *
 * Read response is application/octet-stream packed by the outputs-frame
 * codec (b3nd-move/src/codecs/outputs-frame.ts):
 *   slot = <u8 flag><u16 uri-len BE><uri utf8><u32 payload-len BE><payload>
 * flag=1 → raw bytes payload (decoded as UTF-8 for cc-chat text records);
 * flag=0 → JSON-encoded payload (decoded then parsed).
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
  // PRESENCE_WINDOW_MS bounds the "Ns / Nm ago" activity badge — names DO NOT
  // age out of the roster. Roster authority is `inRoom` (any URI seen, minus
  // /end/), mirroring src/roster.ts's joined−ended model.
  const PRESENCE_WINDOW_MS = 30_000;

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

  // ---- Roster: join−end as the source of truth ----
  // `inRoom` is the authoritative presence set — any participant we've seen
  // any URI for, minus anyone who has minted an /end/. Mirrors src/roster.ts.
  // `lastSeen` is a secondary signal used only for the "Ns ago" activity
  // badge; names stay in the roster regardless of `lastSeen` freshness.
  const inRoom = new Set();
  const lastSeen = new Map();
  function noteSeen(name) {
    inRoom.add(name);
    lastSeen.set(name, Date.now());
  }
  function noteEnd(name) {
    inRoom.delete(name);
    lastSeen.delete(name);
  }

  function formatAge(ms) {
    if (ms < 1000) return "now";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    return `${hr}h`;
  }

  function renderRoster() {
    const now = Date.now();
    const names = [...inRoom].sort((a, b) => a.localeCompare(b));

    presenceList.replaceChildren();
    if (names.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-roster";
      li.textContent = "no one";
      presenceList.appendChild(li);
      return;
    }
    for (const name of names) {
      const li = document.createElement("li");
      li.style.color = colorFor(name);
      li.innerHTML = `<span class="dot"></span><span class="nm"></span><span class="ago"></span>`;
      li.querySelector(".nm").textContent = name;
      const ts = lastSeen.get(name);
      const agoEl = li.querySelector(".ago");
      if (ts == null) {
        agoEl.textContent = "";
      } else {
        const age = now - ts;
        agoEl.textContent = formatAge(age);
        if (age > PRESENCE_WINDOW_MS) li.classList.add("idle");
      }
      presenceList.appendChild(li);
    }
  }

  // ---- Stream rendering ----
  const rows = [];
  const renderedUris = new Set();
  setInterval(renderRoster, 1000);

  function renderTimestamp() {
    const t = new Date();
    return `<span class="t">${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}</span>`;
  }

  function render(uri, payload) {
    const parsed = parseUri(rootPath, uri);
    if (!parsed) return;
    if (parsed.type === "meta") return; // meta loaded separately at startup
    if (renderedUris.has(uri)) return; // dedupe history vs. live
    renderedUris.add(uri);

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
        row.querySelector(".body").innerHTML = renderMarkdown(payload ?? "");
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
        row.querySelector(".body").innerHTML = renderMarkdown(payload ?? "");
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
        noteEnd(parsed.who);
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
        row.querySelector(".output-body").innerHTML = renderMarkdown(payload ?? "");
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
    if (!room || !metaStripEl) return null;
    const metaUri = `${rootPath}${room}/meta.md`;
    try {
      const u = encodeUrlList([metaUri]);
      const res = await fetch(`${targetRemote}/api/v1/read?u=${u}`, { method: "POST" });
      if (!res.ok) return null;
      const outs = decodeOutputsFrame(new Uint8Array(await res.arrayBuffer()));
      const pair = outs.find(([uri]) => uri === metaUri);
      if (!pair) return null;
      const [, content] = pair;
      if (typeof content !== "string" || !content) return null;
      const fm = parseFrontmatter(content);
      const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
      renderMetaStrip(room, fm, body);
      return fm;
    } catch {
      return null; // 404 or parse error — skip silently
    }
  }

  function renderMetaStrip(room, fm, body) {
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
    const detailsHtml = (body && body.trim())
      ? renderMarkdown(body.trim())
      : `<em style="color:var(--muted)">no body in meta.md</em>`;
    metaStripEl.innerHTML =
      `<div class="meta-summary">${roomLabel}${parts.join("")}` +
      `<span class="meta-chev">▾</span></div>` +
      `<div class="meta-details">${detailsHtml}</div>`;
    metaStripEl.querySelector(".meta-summary").addEventListener("click", () => {
      metaStripEl.classList.toggle("open");
    });
  }

  // ---- History replay ----
  // PIN-only — no side-car endpoints. We use the participants listed in
  // meta.md (the protocol's canonical roster) to enumerate the leaf URIs
  // via `read("<root><room>/<who>/<type>/?fn=ls&format=uris")`, then a
  // second `read` to fetch payloads. Each record then flows through the
  // same render() path live messages take, so per-type design is preserved.
  //
  // The wire has no recursive listing verb; this approach trades that for
  // a fan-out of ls calls bounded by `participants × types`. Participants
  // not declared in meta will not appear in the replay.
  const NON_MENTION_TYPES = ["join", "msg", "pause", "resume", "end", "output"];
  const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

  function participantsFromMeta(fm) {
    const raw = fm && fm.participants ? String(fm.participants) : "";
    return raw.split(/[,\s]+/).map((s) => s.trim()).filter((s) => NAME_RE.test(s));
  }

  async function loadHistory(room, fm) {
    if (!room) return;
    const participants = participantsFromMeta(fm);
    if (participants.length === 0) return;

    const lsUris = [];
    for (const who of participants) {
      for (const type of NON_MENTION_TYPES) {
        lsUris.push(`${rootPath}${room}/${who}/${type}/?fn=ls&format=uris`);
      }
      for (const target of participants) {
        if (target === who) continue;
        lsUris.push(`${rootPath}${room}/${who}/mention/${target}/?fn=ls&format=uris`);
      }
    }

    const leaves = [];
    for (let i = 0; i < lsUris.length; i += 50) {
      let outs;
      try {
        outs = await readBatch(lsUris.slice(i, i + 50));
      } catch {
        continue;
      }
      for (const [, payload] of outs) {
        if (!Array.isArray(payload)) continue;
        for (const u of payload) {
          if (typeof u === "string") leaves.push(u);
        }
      }
    }
    if (leaves.length === 0) return;

    const items = [];
    for (const uri of leaves) {
      const p = parseUri(rootPath, uri);
      if (!p || p.type === "meta") continue;
      items.push({ uri, ts: p.ts ?? "" });
    }
    items.sort((a, b) => a.ts.localeCompare(b.ts) || a.uri.localeCompare(b.uri));

    let inserted = false;
    for (let i = 0; i < items.length; i += 50) {
      const slice = items.slice(i, i + 50).map((x) => x.uri);
      try {
        const outs = await readBatch(slice);
        for (const [uri, payload] of outs) {
          render(uri, payload);
          inserted = true;
        }
      } catch {
        // partial failure — skip chunk
      }
    }
    if (inserted) {
      const marker = document.createElement("div");
      marker.className = "row history-marker";
      marker.textContent = "— end of history · live below —";
      streamEl.appendChild(marker);
      streamEl.scrollTop = streamEl.scrollHeight;
    }
  }

  function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---- Minimal markdown renderer for chat messages ----
  // Block-aware: handles fenced code, ATX headers, bullet lists, plus
  // inline code/bold/italic/links. HTML is escaped before transforms so
  // payload content cannot inject markup. Sentinels around extracted
  // code spans are NUL bytes (\x00) — survive escHtml, never in chat.
  function _inlineMd(line, inlines) {
    let s = escHtml(line);
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      if (!/^(https?:|mailto:)/i.test(url)) return `[${label}](${escHtml(url)})`;
      return `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    s = s.replace(/(^|[^*\w])\*\*([^*\n]+)\*\*(?!\*)/g, "$1<strong>$2</strong>");
    s = s.replace(/(^|[^_\w])__([^_\n]+)__(?!_)/g, "$1<strong>$2</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
    s = s.replace(/\x00I(\d+)\x00/g, (_, i) => `<code>${escHtml(inlines[+i])}</code>`);
    return s;
  }
  function _renderBlocks(segment, inlines) {
    if (!segment) return "";
    const lines = segment.split(/\r?\n/);
    const out = [];
    let listOpen = false;
    const closeList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const isLast = i === lines.length - 1;
      if (trimmed === "") {
        closeList();
        if (!isLast && out.length && !/<br>$|<\/(ul|h[1-6]|pre)>$/.test(out[out.length - 1])) {
          out.push("<br>");
        }
        continue;
      }
      const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (h) {
        closeList();
        const level = Math.min(h[1].length, 6);
        out.push(`<h${level}>${_inlineMd(h[2], inlines)}</h${level}>`);
        continue;
      }
      const li = /^[-*]\s+(.*)$/.exec(trimmed);
      if (li) {
        if (!listOpen) { out.push("<ul>"); listOpen = true; }
        out.push(`<li>${_inlineMd(li[1], inlines)}</li>`);
        continue;
      }
      closeList();
      out.push(_inlineMd(line, inlines));
      if (!isLast && lines[i + 1] !== undefined && lines[i + 1].trim() !== "") {
        out.push("<br>");
      }
    }
    closeList();
    return out.join("");
  }
  function renderMarkdown(text) {
    if (!text) return "";
    const inlines = [];
    const captured = text.replace(/`([^`\n]+)`/g, (_, code) => {
      inlines.push(code);
      return `\x00I${inlines.length - 1}\x00`;
    });
    const fence = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
    const out = [];
    let last = 0;
    let m;
    while ((m = fence.exec(captured)) !== null) {
      out.push(_renderBlocks(captured.slice(last, m.index), inlines));
      out.push(`<pre><code>${escHtml(m[2].replace(/\n$/, ""))}</code></pre>`);
      last = m.index + m[0].length;
    }
    out.push(_renderBlocks(captured.slice(last), inlines));
    return out.join("");
  }

  async function readBatch(uris) {
    const u = encodeUrlList(uris);
    const res = await fetch(`${targetRemote}/api/v1/read?u=${u}`, { method: "POST" });
    if (!res.ok) return [];
    return decodeOutputsFrame(new Uint8Array(await res.arrayBuffer()));
  }

  // ---- outputs-frame decoder (browser-side, matches b3nd-move/codecs) ----
  // Mirrors b3nd-move/src/codecs/outputs-frame.ts. flag=1 raw bytes are
  // decoded as UTF-8 (all cc-chat payloads are text); flag=0 is JSON-decoded
  // and parsed. Returns [uri, payload][] where payload is string | unknown | null.
  function decodeOutputsFrame(buf) {
    const td = new TextDecoder("utf-8", { fatal: true });
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const outs = [];
    let off = 0;
    while (off < buf.length) {
      const flag = buf[off]; off += 1;
      const uriLen = view.getUint16(off, false); off += 2;
      const uri = td.decode(buf.subarray(off, off + uriLen)); off += uriLen;
      const payloadLen = view.getUint32(off, false); off += 4;
      const payloadBytes = buf.subarray(off, off + payloadLen); off += payloadLen;
      let payload;
      if (payloadLen === 0) {
        payload = flag === 1 ? "" : null;
      } else if (flag === 1) {
        payload = td.decode(payloadBytes);
      } else {
        try { payload = JSON.parse(td.decode(payloadBytes)); } catch { payload = null; }
      }
      outs.push([uri, payload]);
    }
    return outs;
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

  // Fetch meta first — its frontmatter carries the participants list that
  // history replay needs. Live observe runs in parallel; the dedupe set
  // keeps replay and live in sync regardless of arrival order.
  if (currentRoom) {
    fetchMeta(currentRoom).then((fm) => loadHistory(currentRoom, fm));
  }
  observeForever();
})();
