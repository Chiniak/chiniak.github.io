/* Podróżnik – ekran Ustawień (redesign etap 6, uporządkowany 15.11: krótki ekran, każda opcja w jednym wierszu).
   Trasa #/ustawienia. Grupy: Wygląd · Podróżowanie · Dane i bezpieczeństwo · Aplikacja.
   Ekrany szczegółowe mają własne pliki: przypomnienia (reminders.js), kopia (backup.js), blokada (lock.js), Gmail (gmail.js). */
(function () {
  const { esc, icon } = App;
  const $ = (sel, root = document) => root.querySelector(sel);

  // wiersz-link: ikona, tytuł, opis, opcjonalny chip, strzałka
  const link = (href, ico, title, sub, extra = "", attrs = "") => `
    <a class="li" href="${href}"${attrs}><span class="li-ico" aria-hidden="true">${icon(ico)}</span>
      <span class="li-main"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>${extra}${icon("chev")}</a>`;
  const group = (name, rows, note = "") => `
    <section class="set-group"><h2 class="section">${name}</h2><div class="list">${rows}</div>${note ? `<p class="set-note">${note}</p>` : ""}</section>`;

  App.route(/^\/ustawienia$/, async () => {
    const theme = await DB.getSetting("theme", "auto");
    const startScreen = App.Today ? await App.Today.startScreen() : "podroze";
    // obywatelstwo – do wiz (visas.js); lista paszportów z bazy światowej
    let cit = "PL", citOpts = [["PL", "Polska"]];
    if (self.Visas) {
      await Visas.ready();
      cit = Visas.citizen();
      const all = self.VISA_WORLD ? Object.keys(VISA_WORLD.rows) : ["PL"];
      citOpts = all.map(cc => [cc, Visas.name(cc)]).sort((a, b) => a[1].localeCompare(b[1], self.I18N && I18N.lang === "en" ? "en" : "pl"));
    }
    const [last, lock] = await Promise.all([DB.getSetting("lastBackup", null), DB.getSetting("lock", null)]);
    const age = last ? Math.floor((Date.now() - new Date(last.at)) / 86400000) : null;
    const backupTxt = !last ? "jeszcze nie zrobiona" : age === 0 ? "ostatnia dziś" : `ostatnia ${age} ${App.plural(age, "dzień", "dni", "dni")} temu`;
    const backupWarn = !last || age > 30;
    const gmailCfg = App.Gmail ? await DB.getSetting("gmail", null) : null;
    const notifyOn = App.Reminders && App.Reminders.notifyOn ? App.Reminders.notifyOn() : "Notification" in window && Notification.permission === "granted";
    const inApk = /^android-app:\/\/io\.github\.chiniak\.podroznik/.test(document.referrer) || (self.PodroznikNative && PodroznikNative.isNative);
    const lang = self.I18N ? I18N.pref : "auto";
    const chip = (txt, cls = "") => `<span class="chip${cls ? " " + cls : ""}">${txt}</span>`;

    // wiersz z listą wyboru po prawej (systemowy wybór – mało miejsca)
    const pick = (ico, title, id, opts, cur, sub = "", attrs = "") => `
      <label class="li set-row"${attrs}><span class="li-ico" aria-hidden="true">${icon(ico)}</span>
        <span class="li-main"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>
        <select class="set-sel" id="${id}" aria-label="${title}">${opts.map(([v, t]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
    const bgOn = App.Backdrop && App.Backdrop.enabled;

    const look = group("Wygląd",
      pick("sun", "Motyw", "theme-sel", [["auto", "Auto"], ["light", "Jasny"], ["dark", "Ciemny"]], theme) +
      pick("globe", "Język / Language", "lang-sel", [["auto", "Auto"], ["pl", "Polski"], ["en", "English"]], lang, "", ' translate="no"') +
      (App.Backdrop ? `
        <div class="li set-row set-bg"><span class="li-ico" aria-hidden="true">${icon("image")}</span>
          <span class="li-main"><b>Tło ze zdjęć</b><small>natura i miasta z Wikimedia Commons</small></span>
          <label class="sw"><span class="sr">Tło ze zdjęć</span><input type="checkbox" id="bg-on" ${bgOn ? "checked" : ""}><span class="sw-ui" aria-hidden="true"></span></label>
          <div class="set-body" id="bg-more"${bgOn ? "" : " hidden"}>
            <label class="set-inline"><span>Nowe zdjęcie</span>
              <select class="set-sel" id="bg-every">${[["start", "przy uruchomieniu"], ["10", "co 10 minut"], ["day", "raz dziennie"], ["screen", "przy każdym ekranie"]]
                .map(([k, t]) => `<option value="${k}" ${App.Backdrop.every === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
            <div id="bg-info" class="set-info"></div>
          </div>
        </div>` : ""));

    const travel = group("Podróżowanie",
      pick("navigate", "Nawigacja", "nav-app", [["google", "Mapy Google"], ["geo", "Inna aplikacja"], ["amap", "Amap (Chiny)"]], App.navApp,
        App.navApp === "geo" ? "np. Organic Maps – mapy offline" : App.navApp === "amap" ? "高德 – w Chinach Google nie działa" : "") +
      pick("passport", "Obywatelstwo", "cit-sel", citOpts, cit, "paszport – do informacji o wizach") +
      pick("trips", "Start w trakcie podróży", "start-sel", [["dzis", "Dziś"], ["podroze", "Podróże"]], startScreen) +
      link("#/ustawienia/przypomnienia", "bell", "Przypomnienia i kalendarz", notifyOn ? "powiadomienia włączone" : "ustaw powiadomienia",
        notifyOn ? "" : chip("wył.", "warn")));

    const data = group("Dane i bezpieczeństwo",
      link("#/ustawienia/kopia", "cloud", "Kopia zapasowa", backupTxt, backupWarn ? chip("zrób kopię", "warn") : "", backupWarn ? ' data-warn="1"' : "") +
      link("#/ustawienia/blokada", "lock", "Blokada PIN-em", lock ? "otwiera się po podaniu PIN-u" : "zabezpiecz bilety i dokumenty",
        chip(lock ? "wł." : "wył.", lock ? "ok" : "")));

    const acc = App.Social && App.Social.available() ? await App.Social.account().catch(() => null) : null;
    const app = group("Aplikacja",
      link("#/konto", "users", "Twoje konto", acc ? `<span translate="no">${esc(acc.email || acc.name)}</span>` : "załóż przez Google lub Facebooka",
        acc ? chip([acc.google && "Google", acc.facebook && "Facebook"].filter(Boolean).join(" + "), "ok") : "") +
      (App.Social && App.Social.available() ? link("#/znajomi", "users", "Znajomi", "czat i podgląd planów") : "") +
      (App.Gmail && App.Gmail.available() ? link("#/gmail?wroc=%23%2Fustawienia", "google", "Konto Google (Gmail)",
        gmailCfg ? `<span translate="no">${esc(gmailCfg.email)}</span>` : "propozycje z maili", gmailCfg ? chip("połączone", "ok") : "") : "") +
      (inApk ? "" : `<a class="li" href="Podroznik.apk" download><span class="li-ico" aria-hidden="true">${icon("download")}</span>
        <span class="li-main"><b>Aplikacja na Androida</b><small>pobierz APK</small></span>${icon("chev")}</a>`) +
      `<a class="li" href="https://chiniak.github.io/podroznik/prywatnosc.html" target="_blank" rel="noopener"><span class="li-ico" aria-hidden="true">${icon("shield")}</span>
        <span class="li-main"><b>Polityka prywatności</b><small>dane zostają na telefonie</small></span>${icon("chev")}</a>` +
      `<div class="li"><span class="li-ico" aria-hidden="true">${icon("info")}</span>
        <span class="li-main"><b>Podróżnik <span id="app-version">${App.VERSION}</span></b><small id="storage">Sprawdzam…</small></span></div>`);

    return {
      html: `${look}${travel}${data}${app}`,
      after(v) {
        v.querySelector("#theme-sel").onchange = async e => { await DB.setSetting("theme", e.target.value); App.applyTheme(e.target.value); };
        v.querySelector("#lang-sel").onchange = async e => {
          try { localStorage.setItem("podroznik-lang", e.target.value); } catch (err) { /* brak dostępu */ }
          await DB.setSetting("lang", e.target.value);
          location.reload(); // tłumaczenie całego ekranu od nowa
        };
        v.querySelector("#nav-app").onchange = async e => { App.navApp = e.target.value; await DB.setSetting("navApp", App.navApp); App.toast("Zapisano"); App.render(); };
        const citSel = v.querySelector("#cit-sel");
        if (citSel) citSel.onchange = async e => {
          await DB.setSetting("citizenship", e.target.value);
          if (self.Visas) Visas.setCitizen(e.target.value);
          if (App.Reminders && App.Reminders.syncNative) App.Reminders.syncNative();
          App.toast("Zapisano");
        };
        v.querySelector("#start-sel").onchange = async e => { await DB.setSetting("startScreen", e.target.value); App.toast("Zapisano"); };
        showStorage(v);
        const bgInfo = async () => {
          const box = v.querySelector("#bg-info");
          if (!box || !App.Backdrop.enabled) return;
          const i = await App.Backdrop.info();
          // tylko gdy coś do powiedzenia: brak zdjęć (dlaczego) albo obecne zdjęcie z autorem
          const why = i.count ? "" : i.saveData ? "Telefon ma włączone oszczędzanie danych – zdjęcia nie są pobierane."
            : !navigator.onLine ? "Brak internetu – zdjęcia pobiorą się później."
            : i.err ? `<span>Nie udało się pobrać listy zdjęć:</span> <span translate="no">${esc(i.err)}</span>`
            : i.pool === 0 ? "Nie znaleziono zdjęć – spróbuję ponownie za 10 min." : "Pobieram zdjęcia – przełącz kilka ekranów.";
          box.innerHTML = why || (i.current ? `<span>Teraz:</span> <a href="${esc(i.current.page)}" target="_blank" rel="noopener" translate="no">${esc(i.current.title)}</a>${i.current.by ? ` <span translate="no">· ${esc(i.current.by)}</span>` : ""}
              <button type="button" class="set-link" id="bg-block">${icon("close", "sm")} Nie pokazuj tego zdjęcia</button>` : "");
          const bl = box.querySelector("#bg-block");
          if (bl) bl.onclick = async () => { bl.disabled = true; await App.Backdrop.block(); App.toast("To zdjęcie nie pojawi się więcej"); setTimeout(bgInfo, 400); };
        };
        setTimeout(bgInfo, 300);
        const ev = v.querySelector("#bg-every");
        if (ev) ev.onchange = () => { App.Backdrop.setEvery(ev.value); App.toast("Zapisano"); };
        const on = v.querySelector("#bg-on");
        if (on) on.onchange = async () => {
          await App.Backdrop.setEnabled(on.checked);
          v.querySelector("#bg-more").hidden = !on.checked;
          setTimeout(bgInfo, 300);
        };
      },
    };
  });

  // jedna linijka pod wersją: podróże, zajęte miejsce, tryb offline
  async function showStorage(v) {
    const el = $("#storage", v);
    if (!el) return;
    const t = await DB.count("trips");
    const parts = [`${t} ${App.plural(t, "podróż", "podróże", "podróży")}`];
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0 } = await navigator.storage.estimate();
      parts.push(`${(usage / 1048576).toFixed(1).replace(".", ",")} MB w telefonie`);
    }
    parts.push(navigator.serviceWorker && navigator.serviceWorker.controller ? "działa offline" : "offline po ponownym otwarciu");
    if (el.isConnected) el.textContent = parts.join(" · ");
  }
})();
