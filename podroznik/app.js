/* Podróżnik – nawigacja i widoki.
   Każda zakładka to funkcja w VIEWS, która zwraca HTML (lub uzupełnia widok po wczytaniu danych). */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $("#view");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const TITLES = { podroze: "Podróże", bilety: "Bilety", plan: "Plan", pakowanie: "Pakowanie", ustawienia: "Ustawienia" };

  const empty = (icon, title, text, stage) => `
    <div class="empty">
      <div class="big" aria-hidden="true">${icon}</div>
      <h2>${title}</h2>
      <p>${text}</p>
      ${stage ? `<span class="soon">${stage}</span>` : ""}
    </div>`;

  const VIEWS = {
    async podroze() {
      const trips = await DB.all("trips");
      if (!trips.length) return empty("🧳", "Nie masz jeszcze podróży",
        "Tu pojawią się Twoje wyjazdy: loty, pociągi, autobusy i noclegi.", "Dodawanie podróży – etap 1");
      return trips.map(t => `<div class="card"><h2>${esc(t.name || "Podróż")}</h2></div>`).join("");
    },
    bilety: () => empty("🎫", "Bilety pod ręką",
      "Zdjęcia, PDF-y i kody QR biletów – otwierane jednym kliknięciem, także bez internetu.", "Etap 2"),
    plan: () => empty("🗓️", "Plan dnia i podróży",
      "Rozkład dzień po dniu: transport, noclegi i Twoje własne punkty z mapą.", "Etap 3"),
    pakowanie: () => empty("✅", "Co zabrać",
      "Listy rzeczy do spakowania i zadań przed wyjazdem, z szablonami i postępem.", "Etap 4"),
    async ustawienia() {
      const theme = await DB.getSetting("theme", "auto");
      const opt = (v, label) => `<button type="button" data-theme-opt="${v}" aria-pressed="${theme === v}">${label}</button>`;
      return `
        <div class="card">
          <h2>Motyw</h2>
          <div class="seg" role="group" aria-label="Motyw">${opt("auto", "Auto")}${opt("light", "Jasny")}${opt("dark", "Ciemny")}</div>
        </div>
        <div class="card">
          <h2>Dane w telefonie</h2>
          <div id="storage" class="muted">Sprawdzam…</div>
        </div>
        <div class="card">
          <h2>O aplikacji</h2>
          <div class="row"><span class="muted">Wersja</span><b>0.1 · etap 0</b></div>
          <div class="row"><span class="muted">Tryb offline</span><b id="sw-state">…</b></div>
        </div>`;
    },
  };

  // co zrobić po narysowaniu widoku (podpięcie przycisków itp.)
  const AFTER = {
    ustawienia() {
      view.querySelectorAll("[data-theme-opt]").forEach(b => b.addEventListener("click", async () => {
        await DB.setSetting("theme", b.dataset.themeOpt);
        applyTheme(b.dataset.themeOpt);
        view.querySelectorAll("[data-theme-opt]").forEach(x => x.setAttribute("aria-pressed", x === b));
      }));
      showStorage();
      $("#sw-state").textContent = navigator.serviceWorker && navigator.serviceWorker.controller ? "włączony" : "uruchomi się po ponownym otwarciu";
    },
  };

  async function showStorage() {
    const el = $("#storage");
    if (!el) return;
    const counts = await Promise.all(["trips", "segments", "files"].map(s => DB.count(s)));
    let html = `
      <div class="row"><span class="muted">Podróże</span><b>${counts[0]}</b></div>
      <div class="row"><span class="muted">Odcinki</span><b>${counts[1]}</b></div>
      <div class="row"><span class="muted">Pliki biletów</span><b>${counts[2]}</b></div>`;
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      const mb = n => (n / 1048576).toFixed(1).replace(".", ",") + " MB";
      const pct = quota ? Math.max(1, Math.round(usage / quota * 100)) : 0;
      html += `
        <div class="row"><span class="muted">Zajęte</span><b>${mb(usage)} z ${mb(quota)}</b></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="row"><span class="muted">Ochrona przed usunięciem</span><b>${persisted ? "tak" : "nie"}</b></div>`;
    }
    el.innerHTML = html;
    el.classList.remove("muted");
  }

  async function render() {
    const tab = (location.hash.match(/^#\/(\w+)/) || [])[1];
    const name = VIEWS[tab] ? tab : "podroze";
    document.querySelectorAll(".tabbar a").forEach(a => {
      const on = a.dataset.tab === name;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("#title").textContent = name === "podroze" ? "Podróżnik" : TITLES[name];
    document.title = name === "podroze" ? "Podróżnik" : TITLES[name] + " · Podróżnik";
    try {
      view.innerHTML = await VIEWS[name]();
      if (AFTER[name]) AFTER[name]();
    } catch (e) {
      console.error(e);
      view.innerHTML = empty("⚠️", "Coś poszło nie tak", esc(e.message || e));
    }
    view.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function applyTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }

  function updateOnline() { $("#offline").hidden = navigator.onLine; }

  async function start() {
    applyTheme(await DB.getSetting("theme", "auto"));
    // poproś przeglądarkę, by nie usuwała danych (bilety!) przy braku miejsca
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW:", e));
    window.addEventListener("hashchange", render);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    updateOnline();
    if (!location.hash) history.replaceState(null, "", "#/podroze");
    render();
  }

  start();
})();
