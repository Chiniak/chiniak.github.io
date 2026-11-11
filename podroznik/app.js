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
  /* strefy czasowe (etap 9): odcinek może mieć tzFrom / tzTo (strefa IANA lotniska, np. "Europe/Lisbon"),
     wtedy czas podróży liczony jest dokładnie, a nie „na zegarku” */
  const tzFmt = {};
  // przesunięcie strefy względem UTC (w minutach) w chwili ms
  const tzOffsetAt = (tz, ms) => {
    try {
      const f = tzFmt[tz] || (tzFmt[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }));
      const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
      return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000;
    } catch (e) { return null; } // nieznana strefa
  };
  // "2026-11-13T08:15" w strefie tz → chwila (ms od 1970); bez strefy – czas telefonu
  App.instant = (s, tz) => {
    const [d, t = "00:00"] = s.split("T");
    const [y, m, dd] = d.split("-").map(Number), [h, mi] = t.split(":").map(Number);
    if (!tz) return new Date(y, m - 1, dd, h || 0, mi || 0).getTime();
    const wall = Date.UTC(y, m - 1, dd, h || 0, mi || 0);
    let off = tzOffsetAt(tz, wall);
    if (off == null) return new Date(y, m - 1, dd, h || 0, mi || 0).getTime();
    off = tzOffsetAt(tz, wall - off * 60000); // druga próba – poprawne także przy zmianie czasu
    return wall - off * 60000;
  };
  // czas trwania odcinka w minutach – ze strefami, gdy obie znane
  App.segMinutes = s => s.tzFrom && s.tzTo
    ? Math.round((App.instant(s.arrive, s.tzTo) - App.instant(s.depart, s.tzFrom)) / 60000)
    : App.minutes(s.depart, s.arrive);
  // różnica czasu na miejscu (w godzinach), np. +1 dla Warszawa → Lizbona: -1
  App.tzShift = s => {
    if (!s.tzFrom || !s.tzTo || s.tzFrom === s.tzTo || !s.arrive) return 0;
    const at = App.instant(s.arrive, s.tzTo);
    const d = (tzOffsetAt(s.tzTo, at) - tzOffsetAt(s.tzFrom, at)) / 60;
    return isFinite(d) ? d : 0;
  };
  App.tzShiftText = s => {
    const d = App.tzShift(s);
    if (!d) return "";
    const n = Math.abs(d);
    return `🕒 ${d > 0 ? "+" : "−"}${String(n).replace(".", ",")} h na miejscu`;
  };
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
  const fmt = opts => new Intl.DateTimeFormat((self.I18N ? I18N.locale : "pl-PL"), opts);
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
  // Aplikacja do nawigacji (Ustawienia): "google" – Mapy Google, "geo" – wybór aplikacji telefonu (Organic Maps, Maps.me, Amap…),
  // "amap" – Amap 高德 (Chiny, gdzie Google nie działa). Miejsce: tekst/adres albo „szer.,dł.”.
  App.navApp = "google";
  App.mapsUrl = place => {
    if (/^https?:\/\//i.test(place)) return place;
    const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(place || "");
    const q = encodeURIComponent(place);
    if (App.navApp === "geo") return m ? `geo:${m[1]},${m[2]}?q=${m[1]},${m[2]}` : `geo:0,0?q=${q}`;
    if (App.navApp === "amap") return m ? `https://uri.amap.com/marker?position=${m[2]},${m[1]}&coordinate=wgs84&callnative=1`
      : `https://uri.amap.com/search?keyword=${q}&callnative=1`;
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  };
  // wyszukiwanie w okolicy (Odkrywaj): „restauracje” wokół punktu
  App.mapsSearchUrl = (what, lat, lon) => App.navApp === "amap"
    ? `https://uri.amap.com/search?keyword=${encodeURIComponent(what)}&center=${lon},${lat}&coordinate=wgs84&callnative=1`
    : App.navApp === "geo" ? `geo:${lat},${lon}?q=${encodeURIComponent(what)}`
    : `https://www.google.com/maps/search/${encodeURIComponent(what)}/@${(+lat).toFixed(5)},${(+lon).toFixed(5)},15z`;

  // zmniejszenie zdjęcia (np. tło podróży) – mniej miejsca w telefonie i w kopii zapasowej
  App.resizeImage = async (blob, max = 1280, quality = 0.82) => {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return new Promise(res => c.toBlob(res, "image/jpeg", quality));
  };

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

    const TAB_OF = { odcinek: "podroze", bilet: "bilety", skanuj: "bilety", punkt: "plan", rzecz: "pakowanie", dokumenty: "bilety", dokument: "bilety", budzet: "podroze", wydatek: "podroze", statystyki: "podroze", wklej: "podroze", mapa: "plan", odkrywaj: "plan", rozliczenie: "podroze", udostepnij: "podroze" };
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
        <div class="card">
          <h2>Język / Language</h2>
          <div class="seg" role="group" aria-label="Język / Language">${["auto", "pl", "en"].map(v => `<button type="button" data-lang-opt="${v}" aria-pressed="${(self.I18N ? I18N.pref : "auto") === v}" translate="no">${{ auto: "Auto", pl: "Polski", en: "English" }[v]}</button>`).join("")}</div>
          <p class="small muted" style="margin:8px 0 0" translate="no">Auto = ${(self.I18N && I18N.lang === "en") ? "English unless the phone is set to Polish" : "polski, gdy telefon jest po polsku, inaczej angielski"}.</p>
        </div>
        <div class="card">
          <h2>Nawigacja i mapy</h2>
          <label class="field"><span>Przycisk „Nawiguj” otwiera</span>
            <select id="nav-app">
              <option value="google" ${App.navApp === "google" ? "selected" : ""}>Mapy Google</option>
              <option value="geo" ${App.navApp === "geo" ? "selected" : ""}>Aplikację z telefonu – do wyboru (Organic Maps, Maps.me, Amap…)</option>
              <option value="amap" ${App.navApp === "amap" ? "selected" : ""}>Amap 高德 – Chiny</option>
            </select></label>
          <p class="small muted" style="margin:8px 0 0">W Chinach Google (Mapy, Gmail) nie działa bez VPN. Do Azji polecamy <b>Organic Maps</b> – darmowe mapy offline:
            przed wyjazdem pobierz w niej mapy krajów przez Wi-Fi i wybierz tu „Aplikację z telefonu”.</p>
          <p class="small muted" style="margin:8px 0 0">Mapa w Podróżniku zapamiętuje oglądane fragmenty – przed wyjazdem przejrzyj na niej okolice noclegów i punktów planu, a będą widoczne także bez internetu.</p>
        </div>
        <a class="plan-link" href="#/ustawienia/przypomnienia"><span aria-hidden="true">🔔</span> Przypomnienia i kalendarz
          <span class="muted">– ${"Notification" in window && Notification.permission === "granted" ? "powiadomienia włączone" : "ustaw powiadomienia"}</span><b aria-hidden="true">›</b></a>
        <a class="plan-link${!last || age > 30 ? " warn" : ""}" href="#/ustawienia/kopia"><span aria-hidden="true">💾</span> Kopia zapasowa
          <span class="muted">– ${backupTxt}</span><b aria-hidden="true">›</b></a>
        <a class="plan-link" href="#/ustawienia/blokada"><span aria-hidden="true">🔒</span> Blokada PIN-em
          <span class="muted">– ${lock ? "włączona" : "wyłączona"}</span><b aria-hidden="true">›</b></a>
        ${/^android-app:\/\/io\.github\.chiniak\.podroznik/.test(document.referrer) ? "" : `
        <a class="plan-link" href="Podroznik.apk" download style="margin-top:8px"><span aria-hidden="true">📲</span> Aplikacja na Androida
          <span class="muted">– pobierz APK (430 KB)</span><b aria-hidden="true">›</b></a>`}
        <div class="card" style="margin-top:12px">
          <h2>O aplikacji</h2>
          <div class="row"><span class="muted">Wersja</span><b>1.1 · etapy 0–10</b></div>
          <div class="row"><span class="muted">Tryb offline</span><b id="sw-state">…</b></div>
        </div>`,
      after(v) {
        v.querySelectorAll("[data-theme-opt]").forEach(b => b.addEventListener("click", async () => {
          await DB.setSetting("theme", b.dataset.themeOpt);
          applyTheme(b.dataset.themeOpt);
          v.querySelectorAll("[data-theme-opt]").forEach(x => x.setAttribute("aria-pressed", x === b));
        }));
        showStorage();
        v.querySelectorAll("[data-lang-opt]").forEach(b => b.addEventListener("click", async () => {
          const val = b.dataset.langOpt;
          try { localStorage.setItem("podroznik-lang", val); } catch (e) { /* brak dostępu */ }
          await DB.setSetting("lang", val);
          location.reload(); // tłumaczenie całego ekranu od nowa
        }));
        v.querySelector("#nav-app").onchange = async e => { App.navApp = e.target.value; await DB.setSetting("navApp", App.navApp); App.toast("Zapisano"); };
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
    App.navApp = await DB.getSetting("navApp", "google");
    // poproś przeglądarkę, by nie usuwała danych (bilety!) przy braku miejsca
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW:", e));
    window.addEventListener("hashchange", () => { navCount++; render(); });
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    updateOnline();
    // udostępnienie tekstu do aplikacji (np. maila z Gmaila → „Udostępnij” → Podróżnik) – manifest share_target
    if (location.search) {
      const sp = new URLSearchParams(location.search);
      const shared = [sp.get("title"), sp.get("text"), sp.get("url")].filter(Boolean).join("\n");
      if (shared) { App.sharedText = shared; history.replaceState(null, "", location.pathname + "#/wklej"); }
    }
    if (!location.hash) history.replaceState(null, "", "#/podroze");
    render();
  }

  // start po wczytaniu wszystkich skryptów (trips.js rejestruje swoje widoki)
  document.addEventListener("DOMContentLoaded", start);
})();
