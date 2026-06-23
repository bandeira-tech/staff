/*
 * cc-chat web UI — talks directly to the b3nd-move HTTP wire.
 *
 * Wire: POST /api/v1/observe?u=<b64>   → NDJSON of string[] batches
 *       POST /api/v1/read?u=<b64>      → JSON Output[]
 *
 * `u=` is a url-list: UTF-8 bytes for each URL framed by a 2-byte BE
 * length prefix per slot, base64-url-unpadded over the concatenation.
 * Matches `@bandeira-tech/b3nd-move/codecs/url-list`.
 */
(() => {
  const RIG_URL = (() => {
    const meta = document.querySelector('meta[name="cc-chat-rig"]');
    return (meta && meta.getAttribute("content")) || window.location.origin;
  })();

  const PATTERN_ALL = "cc-chat://**";

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

  // ---- DOM ----
  const streamEl = document.getElementById("stream");
  const statusEl = document.getElementById("status");
  let emptyEl = streamEl.querySelector(".empty");

  function setStatus(state, text) {
    statusEl.className = "status " + state;
    statusEl.textContent = text;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function render(uri, payload) {
    if (emptyEl) { emptyEl.remove(); emptyEl = null; }
    const m = /^cc-chat:\/\/(stream|presence)\/([a-z0-9][a-z0-9-]{0,31})\//.exec(uri);
    if (!m) return;
    const [, kind, name] = m;
    const t = new Date();
    const row = document.createElement("div");
    row.className = "row " + kind;
    row.innerHTML =
      `<span class="t">${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}</span>` +
      `<span class="who"></span><span class="body"></span>`;
    row.querySelector(".who").textContent = name;
    const bodyText = kind === "presence"
      ? (payload === "join" ? "joined" : payload === "leave" ? "left" : (payload ?? ""))
      : (payload ?? "");
    row.querySelector(".body").textContent = bodyText;
    streamEl.appendChild(row);
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  async function readBatch(uris) {
    const u = encodeUrlList(uris);
    const res = await fetch(`${RIG_URL}/api/v1/read?u=${u}`, { method: "POST" });
    if (!res.ok) return [];
    return await res.json();
  }

  async function observeForever() {
    while (true) {
      setStatus("down", "connecting…");
      try {
        const u = encodeUrlList([PATTERN_ALL]);
        const res = await fetch(`${RIG_URL}/api/v1/observe?u=${u}`, {
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

  observeForever();
})();
