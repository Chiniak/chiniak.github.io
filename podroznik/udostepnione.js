/* Tripwillow – „Udostępnij → Tripwillow” dla plików (PDF, zdjęcia, screeny, .ics, .pkpass, .eml) i tekstu.
   Skąd przychodzą:
   - aplikacja na Androida: wtyczka ShareIn (podroznik-app, ShareInPlugin.java) → native.js → App.Shared.receive,
   - aplikacja z ekranu głównego (PWA): manifest share_target (POST) → sw.js zapisuje pliki w pamięci „tw-udostepnione”
     i otwiera index.html?udostepnione=1 → tu je odczytujemy i kasujemy.
   Sam tekst (np. mail z Gmaila) → od razu „Dodaj z maila” (#/wklej). Pliki → ekran #/udostepnione z wyborem:
   rezerwacja z pliku (email.js), punkt planu (plan.js fromFiles), bilet do odcinka (tickets.js addFiles), dokument (docs.js). */
(function () {
  const { esc, plural } = App;
  const I = (n, c = "sm") => App.icon(n, c);
  const SHARE_CACHE = "tw-udostepnione";
  let files = []; // udostępnione pliki, czekające na wybór

  const ext = f => ((f.name || "").match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  const isPdf = f => /pdf/.test(f.type) || ext(f) === "pdf";
  const isImg = f => /^image\//.test(f.type) || /^(jpe?g|png|webp|heic|gif)$/.test(ext(f));
  const isPass = f => /pkpass/.test(f.type) || ext(f) === "pkpass";
  const isText = f => /calendar|rfc822|^text\//.test(f.type) || /^(ics|eml|txt|html?)$/.test(ext(f));
  const kb = n => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
  const fileIcon = f => isPdf(f) ? "doc" : isImg(f) ? "image" : isPass(f) ? "ticket" : /calendar/.test(f.type) || ext(f) === "ics" ? "plan" : "mail";

  // wejście: { text, files: [File] }
  function receive({ text = "", files: list = [] } = {}) {
    list = (list || []).filter(f => f && f.size > 0);
    if (list.length) {
      files = list; // tekst przy plikach (zwykle sam tytuł) pomijamy
      if (location.hash === "#/udostepnione") App.render(); else location.hash = "#/udostepnione";
    } else if (String(text).trim()) {
      App.sharedText = String(text).trim();
      if (location.hash === "#/wklej") App.render(); else location.hash = "#/wklej";
    }
  }

  // PWA: pliki zapisane przez sw.js
  async function fromServiceWorker() {
    if (!/[?&]udostepnione=1/.test(location.search) || !self.caches) return;
    try {
      const c = await caches.open(SHARE_CACHE);
      const out = [];
      let text = "";
      for (const req of await c.keys()) {
        const r = await c.match(req);
        if (/\/tekst$/.test(req.url)) text = await r.text();
        else out.push(new File([await r.blob()], decodeURIComponent(r.headers.get("x-name") || "plik"), { type: r.headers.get("content-type") || "" }));
      }
      await caches.delete(SHARE_CACHE);
      history.replaceState(null, "", location.pathname + (location.hash || "#/podroze"));
      receive({ text, files: out });
    } catch (e) { console.warn("udostępnione pliki:", e); }
  }

  // odcinki i wydarzenia z planu z podróży, które jeszcze się nie skończyły (do „Bilet do…”)
  async function targets() {
    const today = App.todayStr();
    const trips = (await DB.all("trips")).filter(t => t.end >= today).sort((a, b) => a.start.localeCompare(b.start));
    const out = [];
    for (const t of trips) {
      const segs = (await DB.byIndex("segments", "tripId", t.id)).filter(s => !s.depart || s.depart.slice(0, 10) >= today || (s.arrive || "").slice(0, 10) >= today);
      segs.sort((a, b) => (a.depart || "").localeCompare(b.depart || ""));
      segs.forEach(s => out.push({ trip: t, seg: s, title: s.type === "nocleg" ? (s.name || "Nocleg") : `${s.from || "?"} → ${s.to || "?"}`,
        when: s.depart ? `${App.fmtDay(s.depart)} · ${App.time(s.depart)}` : "", icon: App.icon.type ? App.icon.type(s.type) : "" }));
    }
    return { trips, list: out };
  }

  App.route(/^\/udostepnione$/, async () => {
    if (!files.length) return {
      title: "Udostępnione", back: "#/podroze",
      html: App.empty("📎", "Nic tu nie ma", "W innej aplikacji (Gmail, galeria, przeglądarka PDF) wybierz „Udostępnij” → Tripwillow, a plik pojawi się tutaj."),
    };
    const { trips, list } = await targets();
    const pdfs = files.filter(isPdf), imgs = files.filter(isImg), passes = files.filter(isPass), texts = files.filter(isText);
    const readable = pdfs[0] || texts[0];
    const ticketable = files.filter(f => isPdf(f) || isImg(f) || isPass(f));
    const docable = files.length === 1 && (isPdf(files[0]) || isImg(files[0]));
    const one = files.length === 1;
    const tripOpts = trips.map(t => `<option value="${t.id}">${esc(t.name)} · ${App.fmtRange(t.start, t.end)}</option>`).join("");
    const segOpts = list.map((x, i) => `<option value="${i}">${esc(x.trip.name)}: ${esc(x.title)}${x.when ? ` · ${x.when}` : ""}</option>`).join("");
    const opt = (key, ico, title, sub, extra = "") => `<div class="sh-opt" data-k="${key}">
        <div class="sh-opt-h"><span class="li-ico" aria-hidden="true">${I(ico, "")}</span><span class="li-main"><b>${title}</b><small>${sub}</small></span></div>
        ${extra}</div>`;

    return {
      title: "Udostępnione",
      back: "#/podroze",
      html: `
        <section class="tx-hero">
          <span class="tx-hero-ic" aria-hidden="true">${I("clip", "")}</span>
          <div><h2>${one ? "Otrzymano plik" : `Otrzymano ${files.length} ${plural(files.length, "plik", "pliki", "plików")}`}</h2>
          <p>Co z ${one ? "nim" : "nimi"} zrobić? Pliki zostają tylko w telefonie.</p></div>
        </section>
        <div class="list sh-files">${files.map(f => `<div class="li"><span class="li-ico" aria-hidden="true">${I(fileIcon(f))}</span>
          <span class="li-main"><b>${esc(f.name || "plik")}</b><small>${esc(f.type || ext(f) || "plik")} · ${kb(f.size)}</small></span></div>`).join("")}</div>
        <div class="sh-opts">
        ${readable ? opt("read", "mail", "Rezerwacja: lot, pociąg, hotel", `odczytam dane z ${isPdf(readable) ? "PDF" : "pliku"} i dodam do podróży${isPdf(readable) ? " (z biletem)" : ""}`,
          `<button type="button" class="btn primary wide" data-go="read">${I("search")} Odczytaj</button>`) : ""}
        ${ticketable.length && trips.length ? opt("plan", "plan", "Punkt planu", "bilet na koncert, do muzeum, rezerwacja stolika – dzień i godzinę odczytam z biletu",
          `<label class="field"><span>Podróż</span><select id="sh-trip">${tripOpts}</select></label>
           <button type="button" class="btn wide" data-go="plan">${I("plus")} Nowy punkt planu</button>`) : ""}
        ${ticketable.length && list.length ? opt("seg", "ticket", "Bilet do lotu, pociągu, noclegu", `${ticketable.length} ${plural(ticketable.length, "plik", "pliki", "plików")} jako bilet – kod wykryję sam`,
          `<label class="field"><span>Odcinek</span><select id="sh-seg">${segOpts}</select></label>
           <button type="button" class="btn wide" data-go="seg">${I("ticket")} Dodaj bilet</button>`) : ""}
        ${docable ? opt("doc", "passport", "Dokument", "paszport, wiza, ubezpieczenie – skan zostaje w telefonie",
          `<button type="button" class="btn wide" data-go="doc">${I("passport")} Nowy dokument</button>`) : ""}
        ${!readable && !ticketable.length ? `<p class="error">Tego rodzaju pliku aplikacja nie umie wczytać. Obsługiwane: PDF, zdjęcia i screeny, .ics, .pkpass, .eml.</p>` : ""}
        ${ticketable.length && !trips.length ? `<p class="f-hint">Bilet do planu albo odcinka dodasz, gdy będzie nadchodząca podróż – <a href="#/podroze/nowa">dodaj podróż</a>.</p>` : ""}
        </div>
        <button type="button" class="btn danger wide sh-drop" id="sh-drop">Odrzuć</button>`,
      after(view) {
        view.querySelector("#sh-drop").onclick = () => { files = []; App.sharedText = null; location.replace("#/podroze"); };
        view.querySelectorAll("[data-go]").forEach(b => b.onclick = async () => {
          const k = b.dataset.go;
          b.disabled = true;
          try {
            if (k === "read") { App.sharedFile = readable; files = []; location.hash = "#/wklej"; }
            else if (k === "plan") { const f = ticketable; files = []; await App.Plan.fromFiles(view.querySelector("#sh-trip").value, f); }
            else if (k === "seg") {
              const x = list[+view.querySelector("#sh-seg").value];
              await App.Tickets.addFiles(x.seg, ticketable);
              files = [];
              location.hash = `#/odcinek/${x.seg.id}`;
            } else if (k === "doc") { App.sharedDoc = files[0]; files = []; location.hash = "#/dokumenty/nowy"; }
          } catch (e) { b.disabled = false; App.toast(`Nie udało się: ${e.message || e}`); }
        });
      },
    };
  });

  App.Shared = { receive, get files() { return files; } };
  // pliki z PWA (sw.js) i to, co aplikacja na Androida dostała przy starcie (native.js zapamiętał przed wczytaniem tego pliku)
  fromServiceWorker();
  if (self.PodroznikNative && PodroznikNative.pendingShare) { const s = PodroznikNative.pendingShare; PodroznikNative.pendingShare = null; receive(s); }
})();
