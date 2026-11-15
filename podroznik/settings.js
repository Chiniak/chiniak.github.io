/* Podróżnik – ekran Ustawień (redesign etap 6).
   Trasa #/ustawienia. Grupy: Wygląd · Podróżowanie · Bezpieczeństwo · Dane · Integracje · O aplikacji.
   Ekrany szczegółowe mają własne pliki: przypomnienia (reminders.js), kopia (backup.js), blokada (lock.js), Gmail (gmail.js). */
(function () {
  const { esc, icon } = App;
  const $ = (sel, root = document) => root.querySelector(sel);

  // wiersz-link: ikona, tytuł, opis, opcjonalny chip, strzałka
  const link = (href, ico, title, sub, extra = "", attrs = "") => `
    <a class="li" href="${href}"${attrs}><span class="li-ico" aria-hidden="true">${icon(ico)}</span>
      <span class="li-main"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>${extra}${icon("chev")}</a>`;
  // wiersz z kontrolką pod spodem (przełącznik segmentowy, lista wyboru)
  const ctl = (ico, title, body, sub = "", id = "") => `
    <div class="li set-ctl"${id ? ` id="${id}"` : ""}><span class="li-ico" aria-hidden="true">${icon(ico)}</span>
      <span class="li-main"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>
      <div class="set-body">${body}</div></div>`;
  const group = (name, rows, note = "") => `
    <section class="set-group"><h3 class="section">${name}</h3><div class="list">${rows}</div>${note ? `<p class="set-note">${note}</p>` : ""}</section>`;

  App.route(/^\/ustawienia$/, async () => {
    const theme = await DB.getSetting("theme", "auto");
    const [last, lock, nTrips] = await Promise.all([DB.getSetting("lastBackup", null), DB.getSetting("lock", null), DB.count("trips")]);
    const age = last ? Math.floor((Date.now() - new Date(last.at)) / 86400000) : null;
    const backupTxt = !last ? "jeszcze nie zrobiona" : age === 0 ? "ostatnia dziś" : `ostatnia ${age} ${App.plural(age, "dzień", "dni", "dni")} temu`;
    const backupWarn = !last || age > 30;
    const gmailCfg = App.Gmail ? await DB.getSetting("gmail", null) : null;
    const notifyOn = App.Reminders && App.Reminders.notifyOn ? App.Reminders.notifyOn() : "Notification" in window && Notification.permission === "granted";
    const inApk = /^android-app:\/\/io\.github\.chiniak\.podroznik/.test(document.referrer) || (self.PodroznikNative && PodroznikNative.isNative);
    const lang = self.I18N ? I18N.pref : "auto";

    const seg = (attr, cur, opts, label) => `<div class="seg" role="group" aria-label="${label}">${opts.map(([v, t, tr]) =>
      `<button type="button" data-${attr}="${v}" aria-pressed="${cur === v}"${tr ? ' translate="no"' : ""}>${t}</button>`).join("")}</div>`;
    const chip = (txt, cls = "") => `<span class="chip${cls ? " " + cls : ""}">${txt}</span>`;

    const look = group("Wygląd",
      ctl("sun", "Motyw", seg("theme-opt", theme, [["auto", "Auto"], ["light", "Jasny"], ["dark", "Ciemny"]], "Motyw")) +
      (App.Backdrop ? ctl("image", "Tło", `
        ${seg("bg-opt", App.Backdrop.enabled ? "1" : "0", [["1", "Zdjęcia"], ["0", "Bez zdjęć"]], "Tło")}
        <label class="field set-field" id="bg-every-box"${App.Backdrop.enabled ? "" : " hidden"}><span>Nowe zdjęcie</span>
          <select id="bg-every">${[["start", "Przy uruchomieniu aplikacji"], ["10", "Co 10 minut"], ["day", "Raz dziennie"], ["screen", "Przy każdej zmianie ekranu"]]
            .map(([k, t]) => `<option value="${k}" ${App.Backdrop.every === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <div id="bg-info" class="set-info"></div>`, "zdjęcia natury i miast z Wikimedia Commons") : "") +
      ctl("globe", "Język / Language", seg("lang-opt", lang, [["auto", "Auto", 1], ["pl", "Polski", 1], ["en", "English", 1]], "Język / Language"),
        `<span translate="no">Auto = ${(self.I18N && I18N.lang === "en") ? "English unless the phone is set to Polish" : "polski, gdy telefon jest po polsku, inaczej angielski"}.</span>`));

    const travel = group("Podróżowanie",
      ctl("navigate", "Nawigacja i mapy", `
        <label class="field set-field"><span>Przycisk „Nawiguj” otwiera</span>
          <select id="nav-app">
            <option value="google" ${App.navApp === "google" ? "selected" : ""}>Mapy Google</option>
            <option value="geo" ${App.navApp === "geo" ? "selected" : ""}>Aplikację z telefonu – do wyboru (Organic Maps, Maps.me, Amap…)</option>
            <option value="amap" ${App.navApp === "amap" ? "selected" : ""}>Amap 高德 – Chiny</option>
          </select></label>
        <p class="set-info">W Chinach Google (Mapy, Gmail) nie działa bez VPN. Do Azji polecamy <b>Organic Maps</b> – darmowe mapy offline:
          przed wyjazdem pobierz w niej mapy krajów przez Wi-Fi i wybierz tu „Aplikację z telefonu”.</p>
        <p class="set-info">Mapa w Podróżniku zapamiętuje oglądane fragmenty – przed wyjazdem przejrzyj na niej okolice noclegów i punktów planu, a będą widoczne także bez internetu.</p>`) +
      link("#/ustawienia/przypomnienia", "bell", "Przypomnienia i kalendarz", notifyOn ? "powiadomienia włączone" : "ustaw powiadomienia",
        notifyOn ? "" : chip("wył.", "warn")));

    const security = group("Bezpieczeństwo",
      link("#/ustawienia/blokada", "lock", "Blokada PIN-em", lock ? "aplikacja otwiera się po podaniu PIN-u" : "każdy z telefonem widzi Twoje bilety i dokumenty",
        chip(lock ? "włączona" : "wyłączona", lock ? "ok" : "")));

    const data = group("Dane",
      link("#/ustawienia/kopia", "cloud", "Kopia zapasowa", backupTxt, backupWarn ? chip("zrób kopię", "warn") : "", backupWarn ? ' data-warn="1"' : "") +
      `<div class="li set-storage"><span class="li-ico" aria-hidden="true">${icon("chart")}</span>
        <span class="li-main"><b>Dane w telefonie</b><small id="storage">Sprawdzam…</small></span>
        <div class="set-body" id="storage-bar"></div></div>`);

    const integr = (App.Gmail && App.Gmail.available()) || !inApk ? group("Integracje",
      (App.Gmail && App.Gmail.available() ? link("#/gmail?wroc=%23%2Fustawienia", "mail", "Konto Google (Gmail)",
        gmailCfg ? `<span translate="no">${esc(gmailCfg.email)}</span>` : "propozycje z maili", gmailCfg ? chip("połączone", "ok") : "") : "") +
      (inApk ? "" : `<a class="li" href="Podroznik.apk" download><span class="li-ico" aria-hidden="true">${icon("download")}</span>
        <span class="li-main"><b>Aplikacja na Androida</b><small>pobierz APK (430 KB)</small></span>${icon("chev")}</a>`)) : "";

    const about = group("O aplikacji", `
      <div class="li"><span class="li-ico" aria-hidden="true">${icon("info")}</span><span class="li-main"><b>Wersja</b></span><b class="set-val" id="app-version">${App.VERSION}</b></div>
      <div class="li"><span class="li-ico" aria-hidden="true">${icon("download")}</span><span class="li-main"><b>Tryb offline</b></span><b class="set-val" id="sw-state">…</b></div>`);

    return {
      html: `
        <header class="set-head">
          <img class="set-logo" src="icon-192.png" alt="">
          <div><h2>Podróżnik</h2><p>${nTrips} ${App.plural(nTrips, "podróż", "podróże", "podróży")} · dane tylko w tym telefonie</p></div>
        </header>
        ${look}${travel}${security}${data}${integr}${about}`,
      after(v) {
        v.querySelectorAll("[data-theme-opt]").forEach(b => b.addEventListener("click", async () => {
          await DB.setSetting("theme", b.dataset.themeOpt);
          App.applyTheme(b.dataset.themeOpt);
          v.querySelectorAll("[data-theme-opt]").forEach(x => x.setAttribute("aria-pressed", x === b));
        }));
        showStorage(v);
        const bgInfo = async () => {
          const box = v.querySelector("#bg-info");
          if (!box) return;
          const i = await App.Backdrop.info();
          // gdy brak zdjęć – dlaczego (do zgłoszenia): oszczędzanie danych, błąd Commons, pusta lista
          const why = !i.enabled || i.count ? "" : i.saveData ? "<br><span>Telefon ma włączone oszczędzanie danych – zdjęcia nie są pobierane.</span>"
            : !navigator.onLine ? "<br><span>Brak internetu.</span>"
            : i.err ? `<br><span>Nie udało się pobrać listy zdjęć:</span> <span translate="no">${esc(i.err)}</span>`
            : i.pool === 0 ? "<br><span>Nie znaleziono zdjęć – spróbuję ponownie za 10 min.</span>"
            : i.pool ? `<br><span>Zdjęcia na liście:</span> ${i.pool} <span>– pobieram (przełącz kilka ekranów).</span>` : "";
          box.innerHTML = !i.enabled ? "Jednolite tło." : `Pobrane zdjęcia: ${i.count}/${i.max}${i.count < i.max ? " (kolejne dochodzą przy przeglądaniu, z internetem)" : ""}.` + why +
            (i.current ? `<br><span>Teraz:</span> <a href="${esc(i.current.page)}" target="_blank" rel="noopener" translate="no">${esc(i.current.title)}</a>${i.current.by ? ` <span translate="no">· ${esc(i.current.by)}</span>` : ""} <span>(Wikimedia Commons)</span>
              <br><button type="button" class="btn set-btn" id="bg-block">${icon("close")} Nie pokazuj tego zdjęcia</button>` : "");
          const bl = box.querySelector("#bg-block");
          const ev = v.querySelector("#bg-every");
          if (ev) ev.onchange = () => { App.Backdrop.setEvery(ev.value); App.toast("Zapisano"); };
          if (bl) bl.onclick = async () => { bl.disabled = true; await App.Backdrop.block(); App.toast("To zdjęcie nie pojawi się więcej"); setTimeout(bgInfo, 400); };
        };
        setTimeout(bgInfo, 300);
        v.querySelectorAll("[data-bg-opt]").forEach(b => b.addEventListener("click", async () => {
          await App.Backdrop.setEnabled(b.dataset.bgOpt === "1");
          v.querySelectorAll("[data-bg-opt]").forEach(x => x.setAttribute("aria-pressed", x === b));
          const eb = v.querySelector("#bg-every-box"); if (eb) eb.hidden = b.dataset.bgOpt !== "1";
          setTimeout(bgInfo, 300);
        }));
        v.querySelectorAll("[data-lang-opt]").forEach(b => b.addEventListener("click", async () => {
          const val = b.dataset.langOpt;
          try { localStorage.setItem("podroznik-lang", val); } catch (e) { /* brak dostępu */ }
          await DB.setSetting("lang", val);
          location.reload(); // tłumaczenie całego ekranu od nowa
        }));
        v.querySelector("#nav-app").onchange = async e => { App.navApp = e.target.value; await DB.setSetting("navApp", App.navApp); App.toast("Zapisano"); };
        $("#sw-state", v).textContent = navigator.serviceWorker && navigator.serviceWorker.controller ? "włączony" : "uruchomi się po ponownym otwarciu";
      },
    };
  });

  // dane w telefonie: liczby rekordów, zajęte miejsce, ochrona przed usunięciem
  async function showStorage(v) {
    const el = $("#storage", v), bar = $("#storage-bar", v);
    if (!el) return;
    const [t, s, f] = await Promise.all(["trips", "segments", "files"].map(x => DB.count(x)));
    const parts = [`${t} ${App.plural(t, "podróż", "podróże", "podróży")}`, `${s} ${App.plural(s, "odcinek", "odcinki", "odcinków")}`, `${f} ${App.plural(f, "plik", "pliki", "plików")}`];
    let extra = "";
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      const mb = n => (n / 1048576).toFixed(1).replace(".", ",") + " MB";
      const pct = quota ? Math.max(1, Math.round(usage / quota * 100)) : 0;
      extra = `
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="set-kv"><span>Zajęte</span><b>${mb(usage)} z ${mb(quota)}</b></div>
        <div class="set-kv"><span>Ochrona przed usunięciem</span><b>${persisted ? "tak" : "nie"}</b></div>`;
    }
    if (!el.isConnected) return;
    el.textContent = parts.join(" · ");
    bar.innerHTML = extra;
  }
})();
