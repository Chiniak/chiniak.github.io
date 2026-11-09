/* Podróżnik – rdzeń: router, górny pasek, wspólne pomocniki i proste zakładki.
   Widoki rejestruje się przez App.route(/^\/sciezka\/(\w+)$/, (params, query) => ({ title, back, action, html, after })).
   Etap 1 (podróże i odcinki) jest w trips.js. */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $("#view");
  const App = window.App = { $ };

  /* ---------- pomocniki ---------- */
  App.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  App.todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  App.parseDay = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  App.dayDiff = (a, b) => Math.round((App.parseDay(b) - App.parseDay(a)) / 86400000);
  App.addDays = (s, n) => { const d = App.parseDay(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  App.time = s => (s && s.length > 10 ? s.slice(11, 16) : "");
  // godziny zapisane jako czas lokalny miejsca ("2026-11-13T08:15"), więc różnica jest liczona "na zegarku"
  App.minutes = (from, to) => Math.round((new Date(to) - new Date(from)) / 60000);
  App.duration = min => {
    if (!(min > 0)) return "";
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h${m ? " " + m + " min" : ""}` : `${m} min`;
  };
  // polska odmiana: 1 dzień, 2–4 dni / noce, 5+ dni / nocy
  App.plural = (n, one, few, many) => {
    if (n === 1) return one;
    const d = n % 10, dd = n % 100;
    return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
  };
  const fmt = opts => new Intl.DateTimeFormat("pl-PL", opts);
  App.fmtDay = s => fmt({ weekday: "short", day: "numeric", month: "short" }).format(App.parseDay(s));
  App.fmtDayLong = s => fmt({ weekday: "long", day: "numeric", month: "long" }).format(App.parseDay(s));
  App.fmtRange = (a, b) => {
    if (!a) return "";
    const A = App.parseDay(a), B = App.parseDay(b || a);
    const y = A.getFullYear() !== B.getFullYear() || A.getFullYear() !== new Date().getFullYear();
    if (a === (b || a)) return fmt({ day: "numeric", month: "short", year: y ? "numeric" : undefined }).format(A);
    if (A.getFullYear() === B.getFullYear() && A.getMonth() === B.getMonth())
      return `${A.getDate()}–${fmt({ day: "numeric", month: "short", year: y ? "numeric" : undefined }).format(B)}`;
    const o = { day: "numeric", month: "short" };
    return `${fmt(o).format(A)} – ${fmt({ ...o, year: y ? "numeric" : undefined }).format(B)}`;
  };

  // wczytanie biblioteki dopiero, gdy jest potrzebna (pliki w lib/ są też w pamięci offline)
  const scripts = {};
  App.loadScript = src => scripts[src] || (scripts[src] = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => { delete scripts[src]; el.remove(); reject(new Error("Nie udało się wczytać: " + src)); };
    document.head.appendChild(el);
  }));

  // link do nawigacji w Google Maps (na Androidzie otwiera aplikację Mapy); wklejony link do mapy zostaje bez zmian
  App.mapsUrl = place => /^https?:\/\//i.test(place) ? place
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;

  App.toast = msg => {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2200);
  };

  App.empty = (icon, title, text, extra = "") => `
    <div class="empty">
      <div class="big" aria-hidden="true">${icon}</div>
      <h2>${title}</h2>
      <p>${text}</p>
      ${extra}
    </div>`;

  /* ---------- router ---------- */
  const routes = [];
  App.route = (re, fn) => routes.push([re, fn]);
  let navCount = 0;
  App.back = fallback => { if (navCount > 0) history.back(); else location.replace(fallback); };

  const TAB_TITLES = { podroze: "Podróże", bilety: "Bilety", plan: "Plan", pakowanie: "Pakowanie", ustawienia: "Ustawienia" };

  // r.cleanup z poprzedniego widoku (np. wyłączenie kamery, zwolnienie blokady ekranu)
  let cleanup = null, renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
    const raw = location.hash.slice(1) || "/podroze";
    const [path, qs] = raw.split("?");
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    let match = null, handler = null;
    for (const [re, fn] of routes) { match = path.match(re); if (match) { handler = fn; break; } }
    if (!handler) { location.replace("#/podroze"); return; }

    const TAB_OF = { odcinek: "podroze", bilet: "bilety", skanuj: "bilety", punkt: "plan", rzecz: "pakowanie" };
    const first = path.split("/")[1];
    const tab = TAB_OF[first] || first;
    document.querySelectorAll(".tabbar a").forEach(a => {
      const on = a.dataset.tab === tab;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });

    let r;
    try {
      r = await handler(match.slice(1), query);
    } catch (e) {
      console.error(e);
      r = { title: "Błąd", html: App.empty("⚠️", "Coś poszło nie tak", App.esc(e.message || e)) };
    }
    // w międzyczasie przełączono ekran (wolniejszy widok skończył się wczytywać później) – nie nadpisuj nowszego
    if (seq !== renderSeq) return;
    if (typeof r === "string") r = { html: r };
    const title = r.title || TAB_TITLES[tab] || "Podróżnik";
    $("#title").textContent = title;
    document.title = title === "Podróżnik" ? title : `${title} · Podróżnik`;
    const back = $("#back");
    back.hidden = !r.back;
    back.onclick = () => App.back(r.back);
    $("#action").innerHTML = r.action || "";
    view.innerHTML = r.html;
    if (r.after) r.after(view);
    cleanup = r.cleanup || null;
    window.scrollTo(0, 0);
  }
  App.render = render;

  /* ---------- proste zakładki (kolejne etapy) ---------- */

  App.route(/^\/ustawienia$/, async () => {
    const theme = await DB.getSetting("theme", "auto");
    const [last, lock] = await Promise.all([DB.getSetting("lastBackup", null), DB.getSetting("lock", null)]);
    const age = last ? Math.floor((Date.now() - new Date(last.at)) / 86400000) : null;
    const backupTxt = !last ? "jeszcze nie zrobiona" : age === 0 ? "ostatnia dziś" : `ostatnia ${age} ${App.plural(age, "dzień", "dni", "dni")} temu`;
    const opt = (v, label) => `<button type="button" data-theme-opt="${v}" aria-pressed="${theme === v}">${label}</button>`;
    return {
      html: `
        <div class="card">
          <h2>Motyw</h2>
          <div class="seg" role="group" aria-label="Motyw">${opt("auto", "Auto")}${opt("light", "Jasny")}${opt("dark", "Ciemny")}</div>
        </div>
        <div class="card">
          <h2>Dane w telefonie</h2>
          <div id="storage" class="muted">Sprawdzam…</div>
        </div>
        <a class="plan-link" href="#/ustawienia/przypomnienia"><span aria-hidden="true">🔔</span> Przypomnienia i kalendarz
          <span class="muted">– ${"Notification" in window && Notification.permission === "granted" ? "powiadomienia włączone" : "ustaw powiadomienia"}</span><b aria-hidden="true">›</b></a>
        <a class="plan-link${!last || age > 30 ? " warn" : ""}" href="#/ustawienia/kopia"><span aria-hidden="true">💾</span> Kopia zapasowa
          <span class="muted">– ${backupTxt}</span><b aria-hidden="true">›</b></a>
        <a class="plan-link" href="#/ustawienia/blokada"><span aria-hidden="true">🔒</span> Blokada PIN-em
          <span class="muted">– ${lock ? "włączona" : "wyłączona"}</span><b aria-hidden="true">›</b></a>
        <div class="card" style="margin-top:12px">
          <h2>O aplikacji</h2>
          <div class="row"><span class="muted">Wersja</span><b>0.7 · etap 6</b></div>
          <div class="row"><span class="muted">Tryb offline</span><b id="sw-state">…</b></div>
        </div>`,
      after(v) {
        v.querySelectorAll("[data-theme-opt]").forEach(b => b.addEventListener("click", async () => {
          await DB.setSetting("theme", b.dataset.themeOpt);
          applyTheme(b.dataset.themeOpt);
          v.querySelectorAll("[data-theme-opt]").forEach(x => x.setAttribute("aria-pressed", x === b));
        }));
        showStorage();
        $("#sw-state").textContent = navigator.serviceWorker && navigator.serviceWorker.controller ? "włączony" : "uruchomi się po ponownym otwarciu";
      },
    };
  });

  async function showStorage() {
    const el = $("#storage");
    if (!el) return;
    const counts = await Promise.all(["trips", "segments", "files"].map(s => DB.count(s)));
    let html = `
      <div class="row"><span class="muted">Podróże</span><b>${counts[0]}</b></div>
      <div class="row"><span class="muted">Odcinki i noclegi</span><b>${counts[1]}</b></div>
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
    window.addEventListener("hashchange", () => { navCount++; render(); });
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    updateOnline();
    if (!location.hash) history.replaceState(null, "", "#/podroze");
    render();
  }

  // start po wczytaniu wszystkich skryptów (trips.js rejestruje swoje widoki)
  document.addEventListener("DOMContentLoaded", start);
})();
