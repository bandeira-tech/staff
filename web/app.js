(() => {
  const stream = document.getElementById("stream");
  const status = document.getElementById("status");
  let empty = stream.querySelector(".empty");

  function setStatus(state, text) {
    status.className = "status " + state;
    status.textContent = text;
  }

  function render(uri, payload) {
    if (empty) { empty.remove(); empty = null; }
    const m = /^cc-chat:\/\/(stream|presence)\/([a-z0-9][a-z0-9-]{0,31})$/.exec(uri);
    if (!m) return;
    const [, kind, name] = m;
    const row = document.createElement("div");
    row.className = "row " + kind;
    const time = new Date();
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");
    const ss = String(time.getSeconds()).padStart(2, "0");
    row.innerHTML = `<span class="t">${hh}:${mm}:${ss}</span>` +
      `<span class="who">${name}</span>` +
      `<span class="body"></span>`;
    row.querySelector(".body").textContent = kind === "presence"
      ? (payload === "join" ? "joined" : payload === "leave" ? "left" : payload)
      : payload;
    stream.appendChild(row);
    stream.scrollTop = stream.scrollHeight;
  }

  function connect() {
    setStatus("down", "connecting…");
    const es = new EventSource("/sse");
    es.addEventListener("open", () => setStatus("live", "live"));
    es.addEventListener("chat", (ev) => {
      try {
        const { uri, payload } = JSON.parse(ev.data);
        render(uri, payload);
      } catch (e) { console.error("bad event", e, ev.data); }
    });
    es.addEventListener("error", () => {
      setStatus("down", "disconnected · retrying");
      es.close();
      setTimeout(connect, 1500);
    });
  }
  connect();
})();
