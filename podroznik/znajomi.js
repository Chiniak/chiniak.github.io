/* Podróżnik – znajomi (ekrany; rdzeń w social.js).
   Trasy:
     #/znajomi                         mój kod / QR, zaproszenia, lista znajomych, dodawanie z linku
     #/znajomi/dodaj/:uid              dodanie znajomego z linku / QR (dolacz.html#z.UID)
     #/znajomy/:uid                    profil znajomego: czat, jego podróże (teraz, nadchodzące, historia)
     #/czat/:uid                       czat 1:1
     #/znajomy/:uid/p/:doc             podgląd podróży znajomego
     #/publiczna/:uid/:doc/:key        podróż publiczna z linku (dolacz.html#p.UID.DOC.KEY)
     #/widocznosc/:tripId              kto widzi moją podróż: prywatna / dla znajomych / publiczna */
(function () {
  const { esc, plural } = App;
  const ic = (n, c = "sm") => App.icon(n, c);
  const SO = () => App.Social;
  const hue = id => `hsl(${[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 45% 42%)`;
  const initials = name => (String(name || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2) || "?").toUpperCase();
  const av = (id, name, cls = "") => `<span class="zn-av ${cls}" style="--h:${hue(id)}" aria-hidden="true">${esc(initials(name))}</span>`;
  const hhmm = iso => new Date(iso).toLocaleTimeString(self.I18N ? I18N.locale : "pl-PL", { hour: "2-digit", minute: "2-digit" });
  const today = () => App.todayStr();

  const notReady = () => App.empty("🤝", "Już wkrótce",
    "Znajomi, czat i podgląd planów działają razem ze wspólnym planowaniem – uruchomimy je w jednej z następnych wersji.");
  const offlineMsg = e => e && e.code === "noconfig" ? "Znajomi nie są jeszcze włączeni w tej wersji aplikacji."
    : navigator.onLine ? `Nie udało się połączyć: ${esc(e && (e.message || e.code) || "błąd")}` : "Brak internetu – spróbuj, gdy będzie połączenie.";

  // zakładki: Znajomi · Obserwuję · Odkrywaj
  const tabs = (on, n = 0) => `<nav class="rz-seg zn-tabs" aria-label="Ludzie">
      <a href="#/znajomi" class="${on === "z" ? "on" : ""}"${on === "z" ? ' aria-current="page"' : ""}>${ic("users")} Znajomi${n ? ` <span class="rz-badge">${n}</span>` : ""}</a>
      <a href="#/obserwowani" class="${on === "o" ? "on" : ""}"${on === "o" ? ' aria-current="page"' : ""}>${ic("star")} Obserwuję</a>
      <a href="#/odkrywaj-ludzi" class="${on === "d" ? "on" : ""}"${on === "d" ? ' aria-current="page"' : ""}>${ic("compass")} Odkrywaj</a></nav>`;
  const feedCard = x => `<a class="tp-trip zn-feed" href="#/publiczna/${x.uid}/${x.doc}/${x.key}" style="--c:${esc(x.color || "#0f6e6e")}"><span class="tp-bar" aria-hidden="true"></span>
      <span class="tp-main"><small class="zn-feed-who">${esc(x.owner || "Podróżnik")}</small><b>${esc(x.name)}</b><small>${x.dest && x.dest !== x.name ? `${esc(x.dest)} · ` : ""}${App.fmtRange(x.start, x.end)}</small></span>
      <span class="tp-st tp-${statusOf({ start: x.start, end: x.end })}">${statusTxt({ start: x.start, end: x.end })}</span></a>`;

  /* ================= lista znajomych ================= */
  App.route(/^\/znajomi$/, async () => {
    if (!SO() || !SO().available()) return notReady();
    let link = "", err = null, acc = null;
    try { await SO().enable(); link = await SO().myLink(); acc = await SO().account(); } catch (e) { err = e; }
    const st = await SO().state(), name = await SO().myName();
    const fr = Object.entries(st.friends);
    const incoming = fr.filter(([, f]) => f.state === "in"), outgoing = fr.filter(([, f]) => f.state === "out"), ok = fr.filter(([, f]) => f.state === "ok");
    const last = {};
    for (const [id] of ok) { const m = await SO().messages(id); last[id] = { m: m[m.length - 1], n: await SO().unread(id) }; }
    ok.sort((a, b) => ((last[b[0]].m || {}).at || b[1].since || "").localeCompare((last[a[0]].m || {}).at || a[1].since || ""));
    const shared = Object.values(st.trips).filter(r => r.vis !== "private").length;

    const row = ([id, f]) => {
      const l = last[id];
      return `<a class="li zn-row" href="#/znajomy/${id}">${av(id, f.name)}
        <span class="li-main"><b>${esc(f.name || "Bez imienia")}</b><small>${l.m ? `${l.m.by === "me" ? "Ty: " : ""}${esc(l.m.text.slice(0, 60))}` : "napisz albo zobacz plany"}</small></span>
        ${l.n ? `<span class="rz-badge" aria-label="${l.n} nowe">${l.n}</span>` : ""}${ic("chev", "")}</a>`;
    };
    return {
      title: "Znajomi",
      html: `${tabs("z", incoming.length)}
        ${err ? `<p class="gd-err">${offlineMsg(err)}</p>` : ""}
        <section class="card zn-me">
          <div class="zn-me-h">${av("me", name || "Ty", "lg")}
            <form id="zn-name" class="zn-name"><label class="sr" for="zn-name-in">Twoje imię</label>
              <input id="zn-name-in" name="n" maxlength="40" placeholder="Twoje imię (widzą je znajomi)" value="${esc(name)}" autocomplete="name">
              <button class="btn small" type="submit">Zapisz</button></form></div>
          ${link ? `
          <div class="zn-qr-wrap"><canvas id="zn-qr" class="zn-qr" aria-label="Kod QR do dodania Cię do znajomych"></canvas></div>
          <p class="muted small zn-hint">Znajomy skanuje ten kod aparatem telefonu albo otwiera Twój link – i jesteście znajomymi, gdy przyjmiesz zaproszenie.</p>
          <div class="zn-acts">
            <button type="button" class="btn primary" id="zn-share">${ic("share")} <span>Wyślij swój link</span></button>
            <button type="button" class="btn" id="zn-copy">${ic("copy")} <span>Kopiuj</span></button>
          </div>` : ""}
        </section>

        <a class="btn wide zn-acclink" href="#/profil">${ic("users")} <span>Mój profil – tak widzą mnie inni</span></a>
        ${err ? "" : acc ? `
        <section class="card zn-acc">
          <div class="zn-acc-h"><span class="li-ico">${ic("lock")}</span><span class="li-main"><b>${acc.google && acc.facebook ? "Konto Google i Facebook" : acc.google ? "Konto Google" : "Konto Facebook"}</b><small translate="no">${esc(acc.email || acc.name)}</small></span>
            <button type="button" class="btn small" id="zn-out">Wyloguj</button></div>
          <label class="zn-sw"><input type="checkbox" id="zn-find"${st.findable !== false ? " checked" : ""}><span><b>Znajomi mogą znaleźć mnie po e-mailu</b><small>tylko gdy wpiszą dokładnie ten adres</small></span></label>
          ${acc.google ? "" : `<button type="button" class="btn wide zn-g2" id="zn-google">${ic("lock")} <span>Dołącz też konto Google</span></button>`}
          ${SO().fbAvailable() ? acc.facebook ? `<button type="button" class="btn wide zn-fbf" id="zn-fbfriends">${ic("users")} <span>Znajomi z Facebooka w Podróżniku</span></button><div id="zn-fblist"></div>`
            : `<button type="button" class="btn wide zn-fb" id="zn-facebook">${ic("users")} <span>Połącz z Facebookiem – znajdź znajomych</span></button>` : ""}
          <a class="btn wide zn-acclink" href="#/konto">${ic("lock")} <span>Połączone konta (Google, Facebook)</span></a>
          <label class="zn-sw"><input type="checkbox" id="zn-vault"${st.vault !== false ? " checked" : ""}><span><b>Kopia znajomych na koncie</b><small>na nowym telefonie wrócą znajomi, czaty i widoczność podróży (kopia klucza czatu jest chroniona logowaniem do konta, bez osobnego hasła)</small></span></label>
        </section>` : `
        <section class="card zn-acc">
          <p class="zn-acc-t"><b>Zaloguj się kontem Google</b> – znajomi i czaty przejdą z Tobą na nowy telefon, a znajomi znajdą Cię po adresie e-mail.</p>
          <button type="button" class="btn primary wide" id="zn-google">${ic("lock")} <span>Zaloguj kontem Google</span></button>
          ${SO().fbAvailable() ? `<button type="button" class="btn wide zn-fb" id="zn-facebook">${ic("users")} <span>Zaloguj przez Facebooka</span></button>
          <p class="f-hint">Przez Facebooka zobaczysz znajomych, którzy też zalogowali się do Podróżnika przez Facebooka.</p>` : ""}
        </section>`}

        ${incoming.length ? `<h2 class="section">Zaproszenia <span class="rz-badge">${incoming.length}</span></h2>
          <div class="list">${incoming.map(([id, f]) => `<div class="li zn-row">${av(id, f.name)}
            <span class="li-main"><b>${esc(f.name || "Bez imienia")}</b><small>chce dodać Cię do znajomych</small></span>
            <button type="button" class="btn small primary" data-ok="${id}">Przyjmij</button>
            <button type="button" class="icon-btn" data-no="${id}" aria-label="Odrzuć: ${esc(f.name || "")}">${ic("close", "")}</button></div>`).join("")}</div>` : ""}

        <h2 class="section">Twoi znajomi${ok.length ? ` <span class="chip">${ok.length}</span>` : ""}</h2>
        ${ok.length ? `<div class="list">${ok.map(row).join("")}</div>` : `<p class="muted small zn-none">Nie masz jeszcze znajomych. Wyślij komuś swój link albo zeskanuj jego kod.</p>`}
        ${outgoing.length ? `<h3 class="tp-h">Czekają na odpowiedź</h3><div class="list">${outgoing.map(([id, f]) => `<div class="li zn-row">${av(id, f.name)}
          <span class="li-main"><b>${esc(f.name || "Bez imienia")}</b><small>zaproszenie wysłane</small></span>
          <button type="button" class="icon-btn" data-no="${id}" aria-label="Anuluj zaproszenie: ${esc(f.name || "")}">${ic("close", "")}</button></div>`).join("")}</div>` : ""}

        <h2 class="section">Dodaj znajomego</h2>
        <form class="rz-add" id="zn-add"><label class="sr" for="zn-add-in">Link albo kod znajomego</label>
          <input id="zn-add-in" name="l" placeholder="Wklej link znajomego" autocomplete="off">
          <button class="btn primary" type="submit">Dodaj</button></form>
        <p class="f-hint">Kod QR znajomego zeskanuj zwykłym aparatem – link otworzy Podróżnika.</p>
        <form class="rz-add zn-mail" id="zn-mail"><label class="sr" for="zn-mail-in">Adres e-mail znajomego</label>
          <input id="zn-mail-in" name="e" type="email" inputmode="email" placeholder="albo wpisz e-mail znajomego (Gmail)" autocomplete="off">
          <button class="btn" type="submit" aria-label="Szukaj po e-mailu">${ic("search", "")}</button></form>

        <div class="list zn-more">
          <a class="li" href="#/widocznosc"><span class="li-ico">${ic("lock")}</span><span class="li-main"><b>Kto widzi moje podróże</b>
            <small>${shared ? `${shared} ${plural(shared, "podróż udostępniona", "podróże udostępnione", "podróży udostępnionych")}` : "wszystkie prywatne"}</small></span>${ic("chev", "")}</a>
        </div>
        <p class="f-hint zn-privacy">Wiadomości i plany są szyfrowane w telefonie (end-to-end) – serwer widzi tylko Twoje imię i to, z kim jesteś w kontakcie. Znajomi widzą plan bez biletów, kodów rezerwacji, cen i notatek.</p>`,
      after(view) {
        const qr = view.querySelector("#zn-qr");
        if (qr && link) App.loadScript("lib/bwip-js.min.js").then(() => { try { bwipjs.toCanvas(qr, { bcid: "qrcode", text: link, scale: 4, padding: 2, backgroundcolor: "FFFFFF" }); } catch (e) { console.warn(e); } }).catch(() => {});
        const nf = view.querySelector("#zn-name");
        nf.onsubmit = async e => { e.preventDefault(); try { await SO().rename(nf.n.value); App.toast("Zapisano imię"); } catch (er) { App.toast(offlineMsg(er)); } App.render(); };
        const sh = view.querySelector("#zn-share");
        if (sh) sh.onclick = async () => {
          const text = `Dodaj mnie do znajomych w Podróżniku: ${link}`;
          if (navigator.share) { try { await navigator.share({ title: "Podróżnik", text }); return; } catch (e) { if (e.name === "AbortError") return; } }
          try { await navigator.clipboard.writeText(link); App.toast("Skopiowano link"); } catch (e) { App.toast(link); }
        };
        const cp = view.querySelector("#zn-copy");
        if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(link); App.toast("Skopiowano link"); } catch (e) { App.toast(link); } };
        view.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => { b.disabled = true; try { await SO().accept(b.dataset.ok); App.toast("Jesteście znajomymi"); } catch (e) { App.toast(offlineMsg(e)); } App.render(); });
        view.querySelectorAll("[data-no]").forEach(b => b.onclick = async () => { b.disabled = true; try { await SO().remove(b.dataset.no); } catch (e) { App.toast(offlineMsg(e)); } App.render(); });
        const gb = view.querySelector("#zn-google");
        if (gb) gb.onclick = async () => {
          gb.disabled = true;
          try { const a = await App.Account.signIn("google.com"); App.toast(`Zalogowano: ${a ? a.email : ""}`); }
          catch (e) { App.toast(App.Account.errMsg(e)); }
          App.render();
        };
        const fbb = view.querySelector("#zn-facebook");
        if (fbb) fbb.onclick = async () => {
          fbb.disabled = true;
          try { await App.Account.signIn("facebook.com"); App.toast("Połączono z Facebookiem"); }
          catch (e) { App.toast(App.Account.errMsg(e)); }
          App.render();
        };
        const fbf = view.querySelector("#zn-fbfriends");
        if (fbf) fbf.onclick = async () => {
          const box = view.querySelector("#zn-fblist");
          fbf.disabled = true; box.innerHTML = `<p class="muted small">Sprawdzam…</p>`;
          try {
            const list = await SO().facebookFriends();
            box.innerHTML = list.length ? `<div class="list">${list.map(x => `<div class="li zn-row">${av(x.uid, x.name)}
              <span class="li-main"><b>${esc(x.name || x.fbName)}</b>${x.fbName && x.fbName !== x.name ? `<small>na Facebooku: ${esc(x.fbName)}</small>` : ""}</span>
              ${x.state === "ok" ? `<span class="chip">znajomi</span>` : x.state === "out" ? `<span class="chip">wysłane</span>` : `<a class="btn small primary" href="#/znajomi/dodaj/${x.uid}">Zaproś</a>`}</div>`).join("")}</div>`
              : `<p class="muted small">Nikt z Twoich znajomych z Facebooka nie połączył jeszcze Podróżnika z Facebookiem. Wyślij im swój link.</p>`;
          } catch (e) {
            box.innerHTML = `<p class="gd-err">${e.code === "fb-expired" || e.code === "no-fb" ? "Połącz ponownie z Facebookiem." : offlineMsg(e)}</p>`;
            if (e.code === "fb-expired" || e.code === "no-fb") box.insertAdjacentHTML("beforeend", `<button type="button" class="btn wide" id="zn-fbagain">Połącz ponownie</button>`);
            const again = box.querySelector("#zn-fbagain");
            if (again) again.onclick = async () => { try { await SO().signInFacebook(); fbf.click(); } catch (er) { App.toast(offlineMsg(er)); } };
          }
          fbf.disabled = false;
        };
        const so = view.querySelector("#zn-out");
        if (so) so.onclick = async () => {
          if (!confirm("Wylogować konto Google na tym telefonie? Znajomi i czaty znikną z telefonu" + (st.vault !== false ? ", ale wrócą po ponownym zalogowaniu." : " (kopia na koncie jest wyłączona – nie wrócą).")))
            return;
          try { await SO().signOut(); App.toast("Wylogowano"); } catch (e) { App.toast(offlineMsg(e)); }
          App.render();
        };
        const fd = view.querySelector("#zn-find");
        if (fd) fd.onchange = async () => { try { await SO().setFindable(fd.checked); App.toast(fd.checked ? "Znajomi znajdą Cię po e-mailu" : "Ukryto Twój e-mail"); } catch (e) { fd.checked = !fd.checked; App.toast(offlineMsg(e)); } };
        const vt = view.querySelector("#zn-vault");
        if (vt) vt.onchange = async () => {
          if (!vt.checked && !confirm("Wyłączyć kopię na koncie? Na nowym telefonie zaczniesz bez znajomych i czatów.")) { vt.checked = true; return; }
          try { await SO().setVault(vt.checked); } catch (e) { vt.checked = !vt.checked; App.toast(offlineMsg(e)); }
        };
        const mf = view.querySelector("#zn-mail");
        mf.onsubmit = async e => {
          e.preventDefault();
          const b = mf.querySelector("button"); b.disabled = true;
          try {
            const id = await SO().findByEmail(mf.e.value);
            if (id) location.hash = `#/znajomi/dodaj/${id}`;
            else App.toast("Nikt z tym adresem nie korzysta z Podróżnika (albo ukrył adres)");
          } catch (er) { App.toast(er.code === "bad-email" ? er.message : offlineMsg(er)); }
          b.disabled = false;
        };
        const af = view.querySelector("#zn-add");
        af.onsubmit = e => {
          e.preventDefault();
          const id = SO().parseFriend(af.l.value);
          if (!id) { App.toast("To nie wygląda na link znajomego z Podróżnika"); return; }
          location.hash = `#/znajomi/dodaj/${id}`;
        };
      },
    };
  });

  /* ================= dodawanie z linku ================= */
  App.route(/^\/znajomi\/dodaj\/([A-Za-z0-9]{20,40})$/, async ([id]) => {
    if (!SO() || !SO().available()) return notReady();
    let p = null, err = null, me = null;
    try { await SO().enable(); me = await SO().profile(); p = id === me ? null : await SO().person(id); } catch (e) { err = e; }
    const st = await SO().state(), cur = st.friends[id];
    const name = await SO().myName();
    if (id === me) return { title: "Dodaj znajomego", back: "#/znajomi", html: App.empty("🤝", "To Twój kod", "Wyślij ten link znajomemu – to on doda Ciebie.", `<a class="btn" href="#/znajomi">Znajomi</a>`) };
    return {
      title: "Dodaj znajomego", back: "#/znajomi",
      html: err ? `<p class="gd-err">${offlineMsg(err)}</p>` : !p ? App.empty("🤝", "Nie znaleziono", "Tej osoby nie ma w Podróżniku albo link jest niepełny.") : `
        <div class="gd-intro">${av(id, p.name, "xl")}<h2>${esc(p.name || "Bez imienia")}</h2>
          <p class="muted">${cur && cur.state === "ok" ? "Jesteście już znajomymi." : cur && cur.state === "out" ? "Zaproszenie już wysłane – czeka na odpowiedź." : "Zaproś tę osobę do znajomych – zobaczycie swoje plany (te, które udostępnicie) i będziecie mogli pisać."}</p></div>
        ${cur && cur.state === "ok" ? `<a class="btn primary wide" href="#/znajomy/${id}">Otwórz</a>` : cur && cur.state === "out" ? "" : `
        <form id="zn-inv" class="form">
          ${name ? "" : `<label class="field"><span>Twoje imię (zobaczy je znajomy)</span><input name="n" maxlength="40" required autocomplete="name"></label>`}
          <button class="btn primary wide" type="submit">${cur && cur.state === "in" ? "Przyjmij zaproszenie" : "Zaproś do znajomych"}</button></form>`}`,
      after(view) {
        const f = view.querySelector("#zn-inv");
        if (f) f.onsubmit = async e => {
          e.preventDefault();
          f.querySelector("button").disabled = true;
          try {
            if (f.n) await SO().rename(f.n.value);
            const r = await SO().addFriend(id);
            App.toast(r.state === "ok" ? "Jesteście znajomymi" : "Wysłano zaproszenie");
            location.replace(r.state === "ok" ? `#/znajomy/${id}` : "#/znajomi");
          } catch (er) { f.querySelector("button").disabled = false; App.toast(er.message || offlineMsg(er)); }
        };
      },
    };
  });

  /* ================= profil znajomego ================= */
  const statusOf = t => t.start <= today() && today() <= t.end ? "now" : t.start > today() ? "soon" : "past";
  const statusTxt = t => {
    const s = statusOf(t);
    if (s === "now") return `trwa · dzień ${App.dayDiff(t.start, today()) + 1} z ${App.dayDiff(t.start, t.end) + 1}`;
    if (s === "soon") { const n = App.dayDiff(today(), t.start); return n === 1 ? "jutro" : `za ${n} ${plural(n, "dzień", "dni", "dni")}`; }
    return "minęła";
  };
  const tripCard = (href, s) => `<a class="tp-trip" href="${href}" style="--c:${esc(s.trip.color || "#0f6e6e")}"><span class="tp-bar" aria-hidden="true"></span>
      <span class="tp-main"><b>${esc(s.trip.name)}</b><small>${s.trip.destination && s.trip.destination !== s.trip.name ? `${esc(s.trip.destination)} · ` : ""}${App.fmtRange(s.trip.start, s.trip.end)}</small></span>
      <span class="tp-st tp-${statusOf(s.trip)}">${statusTxt(s.trip)}</span></a>`;

  App.route(/^\/znajomy\/([A-Za-z0-9]{20,40})$/, async ([id]) => {
    if (!SO() || !SO().available()) return notReady();
    const st = await SO().state(), f = st.friends[id];
    if (!f || f.state !== "ok") { location.replace("#/znajomi"); return ""; }
    let trips = [], err = null;
    try { trips = await SO().friendTrips(id); } catch (e) { err = e; }
    const n = await SO().unread(id);
    const by = s => trips.filter(x => statusOf(x.trip) === s);
    const now = by("now"), soon = by("soon").sort((a, b) => a.trip.start.localeCompare(b.trip.start)), past = by("past").sort((a, b) => b.trip.start.localeCompare(a.trip.start));
    const ideas = ideasOf(trips);
    const sec = (title, list) => list.length ? `<h3 class="tp-h">${title}</h3>${list.map(s => tripCard(`#/znajomy/${id}/p/${s.doc}`, s)).join("")}` : "";
    return {
      title: f.name || "Znajomy", back: "#/znajomi",
      html: `
        <div class="gd-intro zn-prof">${av(id, f.name, "xl")}<h2>${esc(f.name || "Bez imienia")}</h2>
          <p class="muted small">znajomi od ${App.fmtDay(String(f.since || "").slice(0, 10) || today())}</p>
          ${trips.length ? `<p class="zn-stats"><span class="chip">${trips.length} ${plural(trips.length, "podróż", "podróże", "podróży")}</span>${ideas.length ? `<span class="chip">${ideas.length} ${plural(ideas.length, "pomysł", "pomysły", "pomysłów")}</span>` : ""}</p>` : ""}</div>
        <a class="btn primary wide" href="#/czat/${id}">${ic("chat")} <span>Czat</span>${n ? ` <span class="rz-badge">${n}</span>` : ""}</a>
        <h2 class="section">Podróże</h2>
        ${err ? `<p class="gd-err">${offlineMsg(err)}</p>` : ""}${trips.offline ? `<p class="muted small">Bez internetu – pokazuję ostatnio pobrane.</p>` : ""}
        ${trips.length ? sec("Teraz", now) + sec("Nadchodzące", soon) + (past.length ? `<h3 class="tp-h">Historia</h3>${past.map(s => tripCard(`#/znajomy/${id}/p/${s.doc}`, s)).join("")}` : "")
          : err ? "" : `<p class="muted small">${esc(f.name || "Znajomy")} nie udostępnia jeszcze żadnej podróży.</p>`}
        ${ideasHtml(ideas, f.name || "znajomego")}
        <div class="pl-danger"><button type="button" class="btn danger" id="zn-del">${ic("trash")} <span>Usuń ze znajomych</span></button></div>`,
      after(view) {
        bindTake(view, ideas, f.name);
        view.querySelector("#zn-del").onclick = async () => {
          if (!confirm(`Usunąć ${f.name || "tę osobę"} ze znajomych? Przestaniecie widzieć swoje plany „dla znajomych”, a czat zniknie z tego telefonu.`)) return;
          try { await SO().remove(id); App.toast("Usunięto ze znajomych"); } catch (e) { App.toast(offlineMsg(e)); }
          location.replace("#/znajomi");
        };
      },
    };
  });

  /* ================= czat ================= */
  const drafts = {};
  App.route(/^\/czat\/([A-Za-z0-9]{20,40})$/, async ([id]) => {
    if (!SO() || !SO().available()) return notReady();
    const st = await SO().state(), f = st.friends[id];
    if (!f || f.state !== "ok") { location.replace("#/znajomi"); return ""; }
    SO().startChat(id).catch(() => {});
    const msgs = await SO().messages(id);
    await SO().markRead(id);
    let last = "", prev = "", html = "";
    for (const m of msgs) {
      const day = m.at.slice(0, 10);
      if (day !== last) { html += `<div class="rz-day">${App.fmtDayLong(day)}</div>`; last = day; prev = ""; }
      const mine = m.by === "me", cont = prev === m.by;
      html += `<div class="rz-msg${mine ? " me" : ""}${cont ? " cont" : ""}">${mine ? "" : cont ? `<span class="rz-av-sp"></span>` : av(id, f.name, "sm")}
        <div class="rz-bub"><span class="rz-txt">${esc(m.text)}</span><time>${hhmm(m.at)}</time></div></div>`;
      prev = m.by;
    }
    if (!msgs.length) html = `<p class="rz-empty muted">Napisz pierwszą wiadomość do ${esc(f.name || "znajomego")}.</p>`;
    return {
      title: f.name || "Czat", back: `#/znajomy/${id}`,
      action: `<a class="icon-btn" href="#/znajomy/${id}" aria-label="Profil i podróże: ${esc(f.name || "")}">${ic("trips", "")}</a>`,
      html: `<div class="rz-chat" id="zn-chat">${html}</div>
        <form class="rz-send" id="zn-send" autocomplete="off">
          <label class="sr" for="zn-in">Wiadomość</label>
          <textarea id="zn-in" rows="1" maxlength="4000" placeholder="Wiadomość…">${esc(drafts[id] || "")}</textarea>
          <button class="icon-btn rz-go" aria-label="Wyślij">${ic("send", "")}</button>
        </form>
        <p class="sr">Wiadomości są szyfrowane end-to-end.</p>`,
      after(view) {
        const fm = view.querySelector("#zn-send"), inp = fm.querySelector("textarea");
        const grow = () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 140) + "px"; };
        inp.oninput = () => { drafts[id] = inp.value; grow(); };
        grow();
        inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); fm.requestSubmit(); } };
        fm.onsubmit = async e => {
          e.preventDefault();
          const text = inp.value.trim();
          if (!text) return;
          inp.value = ""; drafts[id] = "";
          try { await SO().sendMessage(id, text); } catch (er) { App.toast(offlineMsg(er)); inp.value = text; return; }
          await App.render();
          const again = document.querySelector("#zn-in");
          if (again) again.focus();
        };
        requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
      },
    };
  });

  /* ================= podgląd cudzej podróży ================= */
  const SEG_ICON = { lot: "plane", pociag: "train", autobus: "bus", prom: "ferry", auto: "car", nocleg: "bed" };
  function tripView(s, { owner, back, ownerHref }) {
    const t = s.trip, CATS = App.Plan ? App.Plan.CATS : {};
    const days = [];
    for (let d = t.start; d && d <= t.end && days.length < 120; d = App.addDays(d, 1)) days.push(d);
    const segAt = (seg, day) => seg.type === "nocleg" ? (seg.depart || "").slice(0, 10) === day : (seg.depart || "").slice(0, 10) === day;
    const segRow = seg => seg.type === "nocleg"
      ? `<div class="zn-ev"><span class="zn-ev-t">${App.time(seg.depart)}</span><span class="zn-ev-ic">${ic("bed")}</span><span><b>${esc(seg.name || "Nocleg")}</b>${seg.city ? `<small>${esc(seg.city)}</small>` : ""}</span></div>`
      : `<div class="zn-ev"><span class="zn-ev-t">${App.time(seg.depart)}</span><span class="zn-ev-ic">${ic(SEG_ICON[seg.type] || "navigate")}</span><span><b>${esc(seg.from)} → ${esc(seg.to)}</b>${seg.arrive ? `<small>przyjazd ${App.time(seg.arrive)}${seg.number ? ` · ${esc(seg.number)}` : ""}</small>` : ""}</span></div>`;
    const idx = new Map((s.items || []).map((it, i) => [it, i]));
    const itemRow = it => `<div class="zn-ev zn-ev-it"><span class="zn-ev-t">${esc(it.time || "–")}</span><span class="zn-ev-ic" aria-hidden="true">${(CATS[it.cat] || { icon: "📌" }).icon}</span>
      <span><b>${esc(it.title)}</b>${it.place ? `<small>${esc(it.place)}</small>` : ""}</span>
      <button type="button" class="icon-btn zn-take" data-take="${idx.get(it)}" aria-label="Weź pomysł: ${esc(it.title)}">${ic("plus", "")}</button></div>`;
    let body = "";
    for (const d of days) {
      const segs = (s.segs || []).filter(x => segAt(x, d)).map(x => ({ k: (x.depart || "").slice(11, 16) || "99", h: segRow(x) }));
      const its = (s.items || []).filter(i => i.date === d).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(i => ({ k: i.time || "", h: itemRow(i) }));
      const all = its.filter(x => x.k).concat(segs).sort((a, b) => a.k.localeCompare(b.k)).concat(its.filter(x => !x.k));
      if (!all.length) continue;
      const nIt = its.length;
      body += `<section class="zn-day"><div class="zn-day-h"><h3>${App.fmtDayLong(d)}</h3>
        ${nIt ? `<button type="button" class="btn small zn-copyday" data-copyday="${d}" aria-label="Skopiuj ten dzień: ${App.fmtDay(d)}">${ic("copy")} <span>Skopiuj dzień</span></button>` : ""}</div>
        ${all.map(x => x.h).join("")}</section>`;
    }
    const ideas = (s.items || []).filter(i => !i.date);
    if (ideas.length) body += `<section class="zn-day"><h3>💡 Pomysły</h3>${ideas.map(itemRow).join("")}</section>`;
    if (!body) body = `<p class="muted">Plan jest jeszcze pusty.</p>`;
    return `
      <div class="zn-copybar"><button type="button" class="btn primary wide" id="zn-copytop">${ic("copy")} <span>Skopiuj całą wycieczkę</span></button></div>
      <header class="pl-head zn-thead" style="--c:${esc(t.color || "#0f6e6e")}">
        <p class="zn-owner">${ownerHref ? `<a href="${ownerHref}">${esc(owner || s.owner || "")}</a>` : esc(owner || s.owner || "")}</p>
        <h2>${esc(t.name)}</h2>
        <p class="pl-info">${t.destination && t.destination !== t.name ? `${esc(t.destination)} · ` : ""}${App.fmtRange(t.start, t.end)} · ${statusTxt(t)}</p>
      </header>
      ${body}
      <button type="button" class="btn wide zn-copy" id="zn-copytrip">${ic("copy")} <span>Skopiuj do moich podróży</span></button>
      <p class="f-hint">Podgląd bez biletów, kodów rezerwacji, cen i notatek · zaktualizowano ${App.fmtDay(String(s.updated || "").slice(0, 10) || today())}</p>`;
  }
  // „+” przy punkcie: do pomysłów w wybranej mojej podróży (items – lista punktów, data-take = numer na liście)
  const bindTake = (view, items, from) => view.querySelectorAll("[data-take]").forEach(b => b.onclick = async () => {
    const it = items[+b.dataset.take];
    const mine = await DB.all("trips");
    const put = async tripId => {
      await SO().takeIdea(tripId, it, from);
      const t = mine.find(x => x.id === tripId);
      b.innerHTML = ic("check", ""); b.classList.add("done");
      App.toast(`Dodano do pomysłów: ${t ? t.name : ""}`);
    };
    if (!mine.length) { App.toast("Najpierw dodaj swoją podróż – albo skopiuj całą"); return; }
    if (mine.length === 1) return put(mine[0].id);
    if (App.Plan && App.Plan.tripSheet) App.Plan.tripSheet(mine, null, put);
  });
  // pomysły z planów danej osoby (miejsca bez powtórzeń) – z „+” do moich pomysłów
  const ideasOf = snaps => {
    const seen = new Set(), list = [];
    for (const sn of snaps) for (const it of sn.items || []) {
      const k = (it.title || "").trim().toLowerCase();
      if (!k || seen.has(k)) continue; seen.add(k);
      list.push({ ...it, _trip: sn.trip && sn.trip.name || "" });
    }
    return list.slice(0, 40);
  };
  const ideasHtml = (list, name) => {
    const CATS = App.Plan ? App.Plan.CATS : {};
    return list.length ? `<h2 class="section">Pomysły od ${esc(name)}</h2><p class="muted small">Dotknij „+”, żeby dodać miejsce do swoich pomysłów.</p>
      <div class="list zn-ideas">${list.map((it, i) => `<div class="li zn-ev-it"><span class="zn-ev-ic" aria-hidden="true">${(CATS[it.cat] || { icon: "📌" }).icon}</span>
        <span class="li-main"><b>${esc(it.title)}</b><small>${esc(it.place || it._trip || "")}</small></span>
        <button type="button" class="icon-btn zn-take" data-take="${i}" aria-label="Weź pomysł: ${esc(it.title)}">${ic("plus", "")}</button></div>`).join("")}</div>` : "";
  };

  const copyBtn = (view, s, from) => {
    bindTake(view, s.items, from || s.owner);
    // „Skopiuj dzień”: punkty tego dnia (z godzinami) → wybrana moja podróż i dzień
    view.querySelectorAll("[data-copyday]").forEach(b => b.onclick = async () => {
      const day = b.dataset.copyday;
      const items = (s.items || []).filter(i => i.date === day).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
      const mine = await DB.all("trips");
      if (!mine.length) { App.toast("Najpierw dodaj swoją podróż – albo skopiuj całą wycieczkę"); return; }
      const nth = App.dayDiff(s.trip.start, day); // ten sam numer dnia w mojej podróży
      const go = tripId => {
        const t = mine.find(x => x.id === tripId);
        daySheet(t, nth, async target => {
          const have = (await DB.byIndex("planItems", "tripId", tripId)).filter(i => i.date === target);
          let order = have.reduce((m, i) => Math.max(m, i.order ?? 0), -1) + 1;
          for (const it of items) await SO().takeIdea(tripId, it, from || s.owner).then(rec => DB.put("planItems", { ...rec, date: target, time: it.time || "", order: order++ }));
          b.innerHTML = `${ic("check")} <span>Skopiowano</span>`; b.classList.add("done");
          App.toast(`Skopiowano ${items.length} ${plural(items.length, "punkt", "punkty", "punktów")} → ${t.name}, ${App.fmtDay(target)}`);
        });
      };
      if (mine.length === 1) go(mine[0].id); else App.Plan.tripSheet(mine, null, go);
    });
    view.querySelector("#zn-copytop").onclick = () => view.querySelector("#zn-copytrip").click();
    // „Skopiuj całą wycieczkę”: nowa podróż u mnie, z wyborem daty wyjazdu (plan przesuwa się razem z nią)
    view.querySelector("#zn-copytrip").onclick = () => {
      const old = document.querySelector(".tp-sheet"); if (old) old.remove();
      const len = App.dayDiff(s.trip.start, s.trip.end) + 1, past = s.trip.start < today();
      const dlg = document.createElement("dialog");
      dlg.className = "tp-sheet";
      dlg.setAttribute("aria-label", "Skopiuj wycieczkę");
      dlg.innerHTML = `<form class="tp-in zn-copyform" method="dialog">
          <div class="tp-top"><h2>Skopiuj wycieczkę</h2><button type="button" class="icon-btn" data-close aria-label="Zamknij">${App.icon("close")}</button></div>
          <p class="muted small">„${esc(s.trip.name)}” – ${len} ${plural(len, "dzień", "dni", "dni")}, ${(s.items || []).length} ${plural((s.items || []).length, "punkt", "punkty", "punktów")} planu. To będzie Twoja kopia – zmiany autora nie będą się w niej pojawiać.</p>
          <label class="field"><span>Kiedy jedziesz?</span><input type="date" name="start" value="${past ? App.addDays(today(), 30) : esc(s.trip.start)}" required></label>
          <p class="f-hint" id="zn-copyend"></p>
          <button class="btn primary wide" type="submit">${App.icon("copy", "sm")} <span>Skopiuj</span></button>
        </form>`;
      document.body.appendChild(dlg);
      const f = dlg.querySelector("form"), endP = dlg.querySelector("#zn-copyend");
      const showEnd = () => { endP.textContent = f.start.value ? `Powrót: ${App.fmtDayLong(App.addDays(f.start.value, len - 1))}` : ""; };
      f.start.oninput = showEnd; showEnd();
      const close = () => { dlg.close(); dlg.remove(); };
      dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-close]")) close(); });
      dlg.addEventListener("cancel", e => { e.preventDefault(); close(); });
      f.onsubmit = async e => {
        e.preventDefault();
        if (!f.start.value) return;
        f.querySelector("button[type=submit]").disabled = true;
        const t = await SO().copyTrip(s, f.start.value);
        close();
        App.toast("Skopiowano – to teraz Twoja podróż");
        location.hash = `#/podroze/${t.id}`;
      };
      dlg.showModal();
    };
  };

  // wybór dnia w mojej podróży (arkusz jak przy wyborze podróży)
  function daySheet(t, nth, onPick) {
    const old = document.querySelector(".tp-sheet"); if (old) old.remove();
    const days = [];
    for (let d = t.start; d <= t.end && days.length < 120; d = App.addDays(d, 1)) days.push(d);
    const sug = days[Math.min(Math.max(nth, 0), days.length - 1)];
    const dlg = document.createElement("dialog");
    dlg.className = "tp-sheet";
    dlg.setAttribute("aria-label", "Wybierz dzień");
    dlg.innerHTML = `<div class="tp-in">
        <div class="tp-top"><h2>Do którego dnia?</h2><button type="button" class="icon-btn" data-close aria-label="Zamknij">${App.icon("close")}</button></div>
        <p class="muted small" style="margin:0 0 6px">${esc(t.name)}</p>
        <div class="tp-list">${days.map((d, i) => `<button type="button" class="tp-trip${d === sug ? " on" : ""}" data-day="${d}" style="--c:${esc(t.color || "#0f6e6e")}">
          <span class="tp-bar" aria-hidden="true"></span><span class="tp-main"><b>Dzień ${i + 1}</b><small>${App.fmtDayLong(d)}</small></span>${d === sug ? `<span class="tp-st tp-soon">ten sam dzień</span>` : ""}</button>`).join("")}</div></div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener("click", e => {
      if (e.target === dlg || e.target.closest("[data-close]")) return close();
      const b = e.target.closest("[data-day]");
      if (b) { close(); onPick(b.dataset.day); }
    });
    dlg.addEventListener("cancel", e => { e.preventDefault(); close(); });
    dlg.showModal();
    const cur = dlg.querySelector(".tp-trip.on"); if (cur) cur.scrollIntoView({ block: "center" });
  }

  App.route(/^\/znajomy\/([A-Za-z0-9]{20,40})\/p\/([\w-]{12})$/, async ([id, doc]) => {
    if (!SO() || !SO().available()) return notReady();
    const st = await SO().state(), f = st.friends[id];
    if (!f || f.state !== "ok") { location.replace("#/znajomi"); return ""; }
    let trips = [], err = null;
    try { trips = await SO().friendTrips(id); } catch (e) { err = e; }
    const s = trips.find(x => x.doc === doc);
    if (!s) return { title: "Podróż", back: `#/znajomy/${id}`, html: err ? `<p class="gd-err">${offlineMsg(err)}</p>` : App.empty("🔒", "Niedostępna", "Ta podróż nie jest już udostępniona.") };
    return { title: "Plan znajomego", back: `#/znajomy/${id}`, html: tripView(s, { owner: f.name, ownerHref: `#/znajomy/${id}` }), after: view => copyBtn(view, s) };
  });

  App.route(/^\/publiczna\/([A-Za-z0-9]{20,40})\/([\w-]{12})\/([\w-]{43})$/, async ([uid, doc, key]) => {
    if (!SO() || !SO().available()) return notReady();
    let s = null, err = null;
    try { s = await SO().publicTrip({ uid, doc, key }); } catch (e) { err = e; }
    if (!s) return { title: "Podróż", html: err ? `<p class="gd-err">${offlineMsg(err)}</p>` : App.empty("🔒", "Niedostępna", "Autor przestał udostępniać tę podróż albo link jest niepełny.") };
    const st = await SO().state(), isFriend = st.friends[uid] && st.friends[uid].state === "ok";
    const me = await SO().profile().catch(() => ""), mine = uid === me;
    return {
      title: "Podróż", html: tripView(s, { ownerHref: isFriend ? `#/znajomy/${uid}` : mine ? "" : `#/osoba/${uid}` }) +
        (isFriend || mine ? "" : `<a class="btn wide zn-addowner" href="#/osoba/${uid}">${ic("users")} <span>Profil autora – obserwuj albo dodaj do znajomych</span></a>`),
      after: view => copyBtn(view, s),
    };
  });

  /* ================= profil dowolnej osoby (podróże publiczne, obserwowanie) ================= */
  App.route(/^\/osoba\/([A-Za-z0-9]{20,40})$/, async ([uid]) => {
    if (!SO() || !SO().available()) return notReady();
    const st = await SO().state();
    if (st.friends[uid] && st.friends[uid].state === "ok") { location.replace(`#/znajomy/${uid}`); return ""; }
    let ix = null, p = null, err = null;
    try { await SO().enable(); [ix, p] = await Promise.all([SO().publicTrips(uid), SO().person(uid)]); } catch (e) { err = e; }
    const name = (p && p.name) || (ix && ix.name) || "Podróżnik", fol = await SO().isFollowing(uid);
    const trips = (ix && ix.trips) || [];
    const snaps = [];
    for (const t of trips.slice(0, 4)) { const sn = await SO().publicTrip({ uid, doc: t.doc, key: t.key }).catch(() => null); if (sn) snaps.push(sn); }
    const ideas = ideasOf(snaps);
    return {
      title: name, back: "#/obserwowani",
      html: err ? `<p class="gd-err">${offlineMsg(err)}</p>` : `
        <div class="gd-intro zn-prof">${av(uid, name, "xl")}<h2>${esc(name)}</h2>
          <p class="muted small">${trips.length} ${plural(trips.length, "podróż publiczna", "podróże publiczne", "podróży publicznych")}</p></div>
        <div class="zn-acts">
          <button type="button" class="btn ${fol ? "" : "primary"}" id="zn-follow">${ic(fol ? "check" : "star")} <span>${fol ? "Obserwujesz" : "Obserwuj"}</span></button>
          ${st.friends[uid] ? "" : `<a class="btn" href="#/znajomi/dodaj/${uid}">${ic("users")} <span>Dodaj do znajomych</span></a>`}
        </div>
        <h2 class="section">Podróże</h2>
        ${trips.length ? trips.map(t => feedCard({ ...t, uid, owner: name })).join("") : `<p class="muted small">Brak podróży publicznych.</p>`}
        ${ideasHtml(ideas, name)}
        <p class="f-hint">Obserwując widzisz tylko podróże publiczne. Znajomi widzą też te „dla znajomych” i mogą pisać na czacie.</p>`,
      after(view) {
        bindTake(view, ideas, name);
        const b = view.querySelector("#zn-follow");
        if (b) b.onclick = async () => { b.disabled = true; try { if (fol) await SO().unfollow(uid); else await SO().follow(uid); App.toast(fol ? "Nie obserwujesz" : `Obserwujesz: ${name}`); } catch (e) { App.toast(offlineMsg(e)); } App.render(); };
      },
    };
  });

  /* ================= obserwowani: nowe podróże ================= */
  App.route(/^\/obserwowani$/, async () => {
    if (!SO() || !SO().available()) return notReady();
    let feed = [], err = null, nFol = 0;
    try { await SO().enable(); feed = await SO().followingFeed(); nFol = await SO().followersCount().catch(() => 0); } catch (e) { err = e; }
    const st = await SO().state(), fol = Object.entries(st.following || {});
    return {
      title: "Znajomi",
      html: `${tabs("o")}
        ${err ? `<p class="gd-err">${offlineMsg(err)}</p>` : ""}
        ${fol.length ? `<div class="st-chips zn-folchips">${fol.map(([id, f]) => `<a class="st-chip" href="#/osoba/${id}">${av(id, f.name, "xs")} ${esc(f.name || "Podróżnik")}</a>`).join("")}</div>` : ""}
        <h2 class="section">Podróże obserwowanych</h2>
        ${feed.length ? feed.map(feedCard).join("") : `<p class="muted small zn-none">${fol.length ? "Obserwowane osoby nie mają jeszcze podróży publicznych." : "Nikogo jeszcze nie obserwujesz. Zajrzyj do „Odkrywaj” albo otwórz czyjś link do podróży i wybierz „Obserwuj”."}</p>`}
        <p class="f-hint">Otwórz podróż i dotknij „+” przy punkcie, żeby wziąć pomysł do swojej podróży.${nFol ? ` · Ciebie obserwuje: ${nFol}` : ""}</p>`,
    };
  });

  /* ================= odkrywaj: podróże innych (za ich zgodą) ================= */
  App.route(/^\/odkrywaj-ludzi$/, async () => {
    if (!SO() || !SO().available()) return notReady();
    let list = [], err = null;
    try { await SO().enable(); list = await SO().explore(); } catch (e) { err = e; }
    const st = await SO().state();
    const nPub = Object.values(st.trips).filter(r => r.vis === "public").length;
    return {
      title: "Znajomi",
      html: `${tabs("d")}
        ${err ? `<p class="gd-err">${offlineMsg(err)}</p>` : ""}
        <section class="card zn-acc"><label class="zn-sw"><input type="checkbox" id="zn-explore"${st.explore ? " checked" : ""}>
          <span><b>Pokazuj moje publiczne podróże w Odkrywaj</b><small>${nPub ? `${nPub} ${plural(nPub, "podróż publiczna", "podróże publiczne", "podróży publicznych")} – zobaczą je wszyscy użytkownicy Podróżnika` : "nie masz jeszcze podróży publicznych – ustaw je w „Kto widzi podróż”"}</small></span></label></section>
        <h2 class="section">Inspiracje od innych</h2>
        ${list.length ? list.map(feedCard).join("") : `<p class="muted small zn-none">Nikt jeszcze nie pokazuje podróży w Odkrywaj. Bądź pierwszy!</p>`}`,
      after(view) {
        const x = view.querySelector("#zn-explore");
        x.onchange = async () => { try { await SO().setExplore(x.checked); App.toast(x.checked ? "Twoje publiczne podróże są w Odkrywaj" : "Ukryto w Odkrywaj"); } catch (e) { x.checked = !x.checked; App.toast(offlineMsg(e)); } App.render(); };
      },
    };
  });

  /* ================= widoczność moich podróży ================= */
  const VIS_INFO = {
    private: { ic: "lock", t: "Prywatna", d: "Widzisz ją tylko Ty." },
    friends: { ic: "users", t: "Dla znajomych", d: "Widzą ją Twoi znajomi w Podróżniku." },
    public: { ic: "globe", t: "Publiczna", d: "Widzi ją każdy, kto ma link – także osoby spoza znajomych." },
  };
  App.route(/^\/widocznosc$/, async () => {
    if (!SO() || !SO().available()) return notReady();
    const trips = (await DB.all("trips")).sort((a, b) => b.start.localeCompare(a.start));
    const rows = [];
    for (const t of trips) { const v = await SO().visibility(t.id); rows.push(`<a class="li" href="#/widocznosc/${t.id}"><span class="li-ico">${ic(VIS_INFO[v].ic)}</span>
      <span class="li-main"><b>${esc(t.name)}</b><small>${App.fmtRange(t.start, t.end)} · ${VIS_INFO[v].t}</small></span>${ic("chev", "")}</a>`); }
    return { title: "Kto widzi moje podróże", back: "#/znajomi", html: trips.length ? `<div class="list">${rows.join("")}</div>
      <p class="f-hint">Znajomi widzą plan bez biletów, kodów rezerwacji, cen, notatek, dokumentów i dziennika. Minione podróże widać jako historię.</p>` : App.empty("🧳", "Brak podróży", "Dodaj podróż, a potem wybierz, kto może ją zobaczyć.") };
  });

  App.route(/^\/widocznosc\/([\w-]+)$/, async ([tripId]) => {
    if (!SO() || !SO().available()) return notReady();
    const t = await DB.get("trips", tripId);
    if (!t) { location.replace("#/podroze"); return ""; }
    const v = await SO().visibility(tripId), link = await SO().publicLink(tripId);
    const st = await SO().state(), nFriends = Object.values(st.friends).filter(f => f.state === "ok").length;
    return {
      title: "Kto widzi podróż", back: `#/podroze/${tripId}`,
      html: `<h2 class="zn-vis-name">${esc(t.name)}</h2>
        <div class="zn-vis" role="radiogroup" aria-label="Widoczność podróży">
          ${SO().VIS.map(k => `<button type="button" class="zn-vis-opt${k === v ? " on" : ""}" role="radio" aria-checked="${k === v}" data-vis="${k}">
            <span class="zn-vis-ic">${ic(VIS_INFO[k].ic, "")}</span><span class="tp-main"><b>${VIS_INFO[k].t}</b><small>${VIS_INFO[k].d}${k === "friends" ? ` (${nFriends})` : ""}</small></span>
            ${k === v ? `<span class="tp-check">${ic("check")}</span>` : ""}</button>`).join("")}
        </div>
        ${link ? `<section class="card zn-publink"><h3>Link do podróży</h3>
          <div class="zn-qr-wrap"><canvas id="zn-pqr" class="zn-qr" aria-label="Kod QR podróży"></canvas></div>
          <div class="zn-acts"><button type="button" class="btn primary" id="zn-pshare">${ic("share")} <span>Wyślij link</span></button>
          <button type="button" class="btn" id="zn-pcopy">${ic("copy")} <span>Kopiuj</span></button></div>
          <p class="f-hint">Zmiana na „Prywatna” albo „Dla znajomych” wyłącza ten link.</p></section>` : ""}
        <p class="f-hint">Udostępniane są: nazwa, cel, termin, trasa, noclegi (nazwa i miasto), plan dni i pomysły. Nie są: bilety, kody rezerwacji, ceny, notatki, wydatki, dokumenty, dziennik. Zmiany w planie pojawiają się u innych po kilku sekundach.</p>`,
      after(view) {
        view.querySelectorAll("[data-vis]").forEach(b => b.onclick = async () => {
          if (b.dataset.vis === v) return;
          view.querySelectorAll("[data-vis]").forEach(x => x.disabled = true);
          try { await SO().enable(); await SO().setVisibility(tripId, b.dataset.vis); App.toast(`Podróż: ${VIS_INFO[b.dataset.vis].t.toLowerCase()}`); }
          catch (e) { App.toast(offlineMsg(e)); }
          App.render();
        });
        if (link) {
          App.loadScript("lib/bwip-js.min.js").then(() => { try { bwipjs.toCanvas(view.querySelector("#zn-pqr"), { bcid: "qrcode", text: link, scale: 3, padding: 2, backgroundcolor: "FFFFFF" }); } catch (e) { console.warn(e); } }).catch(() => {});
          view.querySelector("#zn-pshare").onclick = async () => {
            if (navigator.share) { try { await navigator.share({ title: t.name, text: `Mój plan podróży „${t.name}” w Podróżniku: ${link}` }); return; } catch (e) { if (e.name === "AbortError") return; } }
            try { await navigator.clipboard.writeText(link); App.toast("Skopiowano link"); } catch (e) { App.toast(link); }
          };
          view.querySelector("#zn-pcopy").onclick = async () => { try { await navigator.clipboard.writeText(link); App.toast("Skopiowano link"); } catch (e) { App.toast(link); } };
        }
      },
    };
  });

  /* ---------- powiadomienia w aplikacji ---------- */
  if (self.App && App.Social) App.Social.on((what, d) => {
    const h = location.hash;
    if (what === "message") {
      if (h === `#/czat/${d.id}`) { const a = document.activeElement, typing = a && a.id === "zn-in"; App.render().then(() => { if (typing) { const i = document.querySelector("#zn-in"); if (i) i.focus(); } }); return; }
      App.toast(`💬 ${d.name || "Znajomy"}: ${d.msgs[d.msgs.length - 1].text.slice(0, 80)}`);
      if (/^#\/znajomi$/.test(h)) App.render();
    } else if (what === "friends") { if (/^#\/znajomi/.test(h) && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) App.render(); }
    else if (what === "account") { if (/^#\/znajomi/.test(h)) App.render(); }
    else if (what === "accepted") App.toast(`🤝 ${d.name || "Znajomy"} przyjmuje zaproszenie`);
  });

  /* ================= wiadomości: wszystkie rozmowy w jednym miejscu ================= */
  App.route(/^\/wiadomosci$/, async () => {
    if (!SO() || !SO().available()) return notReady();
    let err = null;
    try { await SO().enable(); } catch (e) { err = e; }
    const st = await SO().state();
    const ok = Object.entries(st.friends).filter(([, f]) => f.state === "ok"), inc = Object.entries(st.friends).filter(([, f]) => f.state === "in");
    const rows = [];
    for (const [id, f] of ok) { const m = await SO().messages(id); rows.push({ id, f, last: m[m.length - 1], n: await SO().unread(id) }); }
    rows.sort((a, b) => ((b.last || {}).at || b.f.since || "").localeCompare((a.last || {}).at || a.f.since || ""));
    const talked = rows.filter(r => r.last), quiet = rows.filter(r => !r.last);
    const row = r => `<a class="li zn-row" href="#/czat/${r.id}">${av(r.id, r.f.name)}
      <span class="li-main"><b>${esc(r.f.name || "Bez imienia")}</b><small>${r.last ? `${r.last.by === "me" ? "Ty: " : ""}${esc(r.last.text.slice(0, 70))}` : "napisz pierwszą wiadomość"}</small></span>
      ${r.n ? `<span class="rz-badge" aria-label="${r.n} nowe">${r.n}</span>` : r.last ? `<time class="muted small">${hhmm(r.last.at)}</time>` : ""}${ic("chev", "")}</a>`;
    return {
      title: "Wiadomości",
      html: `${err ? `<p class="gd-err">${offlineMsg(err)}</p>` : ""}
        ${inc.length ? `<a class="btn wide" href="#/znajomi">${ic("users")} <span>${inc.length} ${plural(inc.length, "zaproszenie czeka", "zaproszenia czekają", "zaproszeń czeka")}</span></a>` : ""}
        ${talked.length ? `<div class="list">${talked.map(row).join("")}</div>` : ""}
        ${quiet.length ? `<h3 class="tp-h">${talked.length ? "Napisz do znajomych" : "Znajomi"}</h3><div class="list">${quiet.map(row).join("")}</div>` : ""}
        ${ok.length ? "" : App.empty("💬", "Brak rozmów", "Dodaj znajomych, a ich wiadomości pojawią się tutaj.", `<a class="btn primary" href="#/znajomi">Znajomi</a>`)}`,
    };
  });

  /* ================= mój profil: tak widzą mnie inni ================= */
  App.route(/^\/profil$/, async () => {
    if (!SO() || !SO().available()) return notReady();
    let me = "", fol = 0, err = null;
    try { await SO().enable(); me = await SO().profile(); fol = await SO().followersCount().catch(() => 0); } catch (e) { err = e; }
    const st = await SO().state(), name = await SO().myName();
    const trips = (await DB.all("trips")).sort((a, b) => b.start.localeCompare(a.start));
    const vis = {}; for (const t of trips) vis[t.id] = await SO().visibility(t.id);
    const nf = Object.values(st.friends).filter(f => f.state === "ok").length;
    const shown = trips.filter(t => vis[t.id] !== "private");
    const VI = { friends: ["users", "dla znajomych"], public: ["globe", "publiczna"] };
    return {
      title: "Mój profil", back: "#/znajomi",
      html: `${err ? `<p class="gd-err">${offlineMsg(err)}</p>` : ""}
        <div class="gd-intro zn-prof">${av(me, name || "Ty", "xl")}<h2>${esc(name || "Bez imienia")}</h2>
          <p class="zn-stats"><span class="chip">${nf} ${plural(nf, "znajomy", "znajomych", "znajomych")}</span><span class="chip">${fol} ${plural(fol, "obserwujący", "obserwujących", "obserwujących")}</span><span class="chip">${shown.length} ${plural(shown.length, "podróż widoczna", "podróże widoczne", "podróży widocznych")}</span></p></div>
        <div class="zn-acts"><a class="btn" href="#/znajomi">${ic("edit")} <span>Zmień imię</span></a>
          <a class="btn" href="#/widocznosc">${ic("lock")} <span>Kto widzi podróże</span></a></div>
        <h2 class="section">Moje podróże w oczach innych</h2>
        ${trips.length ? `<div class="list">${trips.map(t => `<a class="li" href="#/widocznosc/${t.id}"><span class="li-ico">${ic(vis[t.id] === "private" ? "lock" : VI[vis[t.id]][0])}</span>
          <span class="li-main"><b>${esc(t.name)}</b><small>${App.fmtRange(t.start, t.end)} · ${vis[t.id] === "private" ? "tylko Ty" : VI[vis[t.id]][1]}</small></span>${ic("chev", "")}</a>`).join("")}</div>`
          : `<p class="muted small">Dodaj podróż, a potem wybierz, kto ją widzi.</p>`}
        <p class="f-hint">Znajomi i obserwujący mogą oglądać plany i brać z nich pomysły. Bilety, kody rezerwacji, ceny i notatki nigdy nie są pokazywane.</p>`,
    };
  });

  /* ================= stały pasek: Znajomi i Wiadomości na każdym ekranie ================= */
  (function topButtons() {
    const box = document.getElementById("social-top");
    if (!box || !SO()) return;
    let last = "";
    async function refresh() {
      if (!SO().available()) { box.hidden = true; return; }
      let inv = 0, msg = 0;
      try {
        const st = await SO().state();
        for (const [id, f] of Object.entries(st.friends)) { if (f.state === "in") inv++; else if (f.state === "ok") msg += await SO().unread(id); }
      } catch (e) { /* bez licznika */ }
      const h = `${inv}|${msg}|${(location.hash || "").slice(0, 12)}`;
      if (h === last) return; last = h;
      const here = r => location.hash.startsWith(r) ? ' aria-current="page"' : "";
      const dot = n => n ? `<span class="zn-dot">${n > 99 ? "99+" : n}</span>` : "";
      box.innerHTML = `<a class="icon-btn zn-top" href="#/znajomi"${here("#/znajomi")} aria-label="Znajomi${inv ? ` – ${inv} zaproszeń` : ""}">${ic("users", "")}${dot(inv)}</a>
        <a class="icon-btn zn-top" href="#/wiadomosci"${here("#/wiadomosci")} aria-label="Wiadomości${msg ? ` – ${msg} nowych` : ""}">${ic("chat", "")}${dot(msg)}</a>`;
      box.hidden = false;
      if (self.I18N && I18N.translate) try { I18N.translate(box); } catch (e) { /* tłumaczenie opcjonalne */ }
    }
    const soon = () => { last = ""; setTimeout(refresh, 120); };
    window.addEventListener("hashchange", soon);
    window.addEventListener("online", soon);
    SO().on(() => { last = ""; refresh(); });
    setInterval(refresh, 5000);
    setTimeout(refresh, 400);
  })();
})();
