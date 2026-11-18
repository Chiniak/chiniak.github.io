/* Tripwillow – przewodniki Wikivoyage offline.
   Trasa: #/przewodnik/:tripId?g=<id przewodnika>&dodaj=<tytuł>&l=pl|en
   Artykuł z Wikivoyage (PL, w razie braku EN) pobierany raz przez API MediaWiki, „czyszczony” w telefonie
   (bez skryptów, stylów, obrazków, map i przycisków edycji – tylko tekst, listy i linki) i zapisywany w IndexedDB
   (magazyn „guides”, poza kopią zapasową – zawsze można pobrać ponownie). Potem czyta się go bez internetu.
   Obiekty z artykułu (atrakcje, jedzenie, zakupy… – szablony „listing”, klasa .vcard) są kartami z przyciskiem
   „Do pomysłów” (punkt planu bez dnia z położeniem) i nawigacją.
   Link do innego artykułu (np. dzielnicy) pobiera go jako kolejny przewodnik tej podróży.
   Licencja treści: CC BY-SA 4.0 – w stopce nazwa artykułu, link do autorów i licencji. */
(function () {
  const { esc } = App;
  const I = (n, c = "sm") => App.icon(n, c);
  const STORE = "guides";
  const API = lang => `https://${lang}.wikivoyage.org/w/api.php`;
  const PAGE = (lang, title) => `https://${lang}.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const appLang = () => (self.I18N ? I18N.lang : "pl");
  const GLANGS = () => [...new Set([appLang(), "pl", "en"])]; // języki przewodnika: język aplikacji, polski, angielski

  /* ---------- pobieranie ---------- */
  async function api(lang, params, timeout = 20000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(API(lang) + "?" + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params }), { signal: ctl.signal });
      if (!r.ok) throw new Error(r.status === 429 ? "busy" : "http");
      return await r.json();
    } finally { clearTimeout(t); }
  }
  // artykuł; null, gdy nie ma takiej strony
  async function fetchArticle(lang, title) {
    const j = await api(lang, { action: "parse", page: title, prop: "text|sections|revid|displaytitle", redirects: "1",
      disableeditsection: "1", disablelimitreport: "1", disabletoc: "1" });
    if (j.error) { if (j.error.code === "missingtitle" || j.error.code === "invalidtitle") return null; throw new Error("api"); }
    return j.parse;
  }
  async function searchTitles(lang, q) {
    const j = await api(lang, { action: "query", list: "search", srsearch: q, srlimit: "8", srnamespace: "0", srprop: "snippet" });
    return ((j.query && j.query.search) || []).map(r => ({ title: r.title, snippet: String(r.snippet || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#0?39;/g, "'") }));
  }

  /* ---------- czyszczenie HTML artykułu ---------- */
  // rodzaj obiektu z nagłówka sekcji → kategoria punktu planu
  const CAT_RULES = [
    [/^(see|zobacz|atrakcj|zabytk|muze|warto zobaczyć|zwiedz)/i, "zwiedzanie"],
    [/^(eat|drink|jedzenie|gastronom|kuchnia|restaurac|napoje|życie nocne|nightlife|bary|kawiar)/i, "jedzenie"],
    [/^(buy|zakupy|shopping)/i, "zakupy"],
    [/^(do|rozrywka|aktywn|sport|wydarzen|events?)/i, "wydarzenie"],
    [/^(park|przyroda|natur|plaż|beach)/i, "natura"],
  ];
  const catFor = heads => { for (const h of heads) for (const [re, c] of CAT_RULES) if (re.test(h.trim())) return c; return "inne"; };
  // ikona sekcji w spisie treści
  const SEC_ICON = [
    [/^(understand|charakterystyka|informacje|opis|historia|klimat)/i, "info"], [/^(districts|dzielnice|regiony|regions|cities|miasta)/i, "map"],
    [/^(get in|dojazd|przyjazd)/i, "plane"], [/^(get around|transport|komunikacja|poruszanie)/i, "bus"],
    [/^(see|atrakcje|zobacz|zabytki|zwiedzanie)/i, "landmark"], [/^(do|rozrywka|aktywn)/i, "star"], [/^(buy|zakupy)/i, "cart"],
    [/^(eat|jedzenie|gastronomia|kuchnia)/i, "food"], [/^(drink|napoje|życie nocne)/i, "food"], [/^(sleep|nocleg|zakwaterowanie)/i, "bed"],
    [/^(stay safe|bezpiecze|zdrowie|stay healthy)/i, "shield"], [/^(connect|kontakt|łączność|internet)/i, "phone"],
    [/^(cope|respect|praktyczne|savoir|zwyczaje|etykieta)/i, "users"], [/^(go next|okolice|dalej|w pobliżu|wycieczki)/i, "compass"],
    [/^(talk|język|rozmówki)/i, "chat"], [/^(learn|work|nauka|praca)/i, "doc"],
  ];
  const secIcon = t => { for (const [re, ic] of SEC_ICON) if (re.test(t.trim())) return ic; return "list"; };

  const DROP = "style, script, link, meta, noscript, figure, img, video, audio, iframe, svg, math, .mw-editsection, .mw-references-wrap, .reference, " +
    "sup.reference, .mapdiv, #mapwrap, .thumb, .mw-kartographer-map, .metadata, .ambox, .pagebanner, .wpb, .navbox, .infobox, .listing-sister-icons, " +
    ".listing-metadata, .listing-coordinates, .mw-kartographer-maplink, .geo, .printfooter, .catlinks, .mw-empty-elt, .hatnote.navigation-not-searchable, .sisterproject";
  const KEEP = new Set(["P", "UL", "OL", "LI", "DL", "DT", "DD", "B", "STRONG", "I", "EM", "BR", "H3", "H4", "H5", "BLOCKQUOTE", "TABLE", "TBODY", "THEAD", "TR", "TD", "TH", "SMALL", "SUB", "SUP"]);
  const txt = el => (el ? el.textContent : "").replace(/\s+/g, " ").trim();
  const num = s => { const v = parseFloat(String(s || "").replace(",", ".")); return isFinite(v) ? v : null; };

  function clean(html, lang) {
    const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
    const root = doc.getElementById("root").querySelector(".mw-parser-output") || doc.getElementById("root");
    // nagłówki sekcji (do kategorii obiektów)
    const heads = el => {
      const out = [];
      for (let n = el; n && n !== root; n = n.parentElement) {
        let p = n.previousElementSibling;
        while (p) { const h = p.matches("h2,h3,.mw-heading") ? (p.querySelector("h2,h3") || p) : null; if (h) { out.push(txt(h)); if (/H2/.test(h.tagName)) return out; } p = p.previousElementSibling; }
      }
      return out;
    };
    // 1) obiekty (szablon listing) → osobne dane + znacznik w tekście
    const listings = [];
    root.querySelectorAll(".vcard").forEach(v => {
      if (v.parentElement && v.parentElement.closest(".vcard")) return;
      const name = txt(v.querySelector(".listing-name, .fn"));
      if (!name) return;
      const lat = num(txt(v.querySelector(".geo .latitude"))) ?? num((v.querySelector("[data-lat]") || {}).dataset?.lat);
      const lon = num(txt(v.querySelector(".geo .longitude"))) ?? num((v.querySelector("[data-lon]") || {}).dataset?.lon);
      const urlA = v.querySelector(".listing-url a[href^='http'], .listing-name a.external[href^='http']");
      const L = {
        name: name.slice(0, 120), alt: txt(v.querySelector(".listing-alt")).slice(0, 120),
        address: txt(v.querySelector(".listing-address")).slice(0, 200), directions: txt(v.querySelector(".listing-directions")).slice(0, 200),
        hours: txt(v.querySelector(".listing-hours")).slice(0, 200), price: txt(v.querySelector(".listing-price")).slice(0, 200),
        phone: txt(v.querySelector(".listing-phone")).slice(0, 60), url: urlA ? urlA.getAttribute("href") : "",
        desc: txt(v.querySelector(".listing-content, .description")).slice(0, 1200),
        lat: lat != null && Math.abs(lat) <= 90 ? lat : null, lon: lon != null && Math.abs(lon) <= 180 ? lon : null,
        cat: catFor(heads(v)),
      };
      const k = listings.push(L) - 1;
      const mark = doc.createElement("gd-li"); mark.setAttribute("k", k);
      // obiekt zwykle siedzi w <li> albo <p> – zostaje sam znacznik
      v.replaceWith(mark);
    });
    // „Osobny artykuł: …” – zostaje jako link do kolejnego przewodnika
    root.querySelectorAll(".relarticle, .mainarticle").forEach(r => {
      const a = r.querySelector("a[href^='/wiki/']");
      if (!a) { r.remove(); return; }
      const p = doc.createElement("p"); p.className = "gd-rel"; p.append(a); r.replaceWith(p);
    });
    root.querySelectorAll(DROP).forEach(e => e.remove());
    root.querySelectorAll(".noprint").forEach(e => { if (!e.querySelector("gd-li")) e.remove(); });
    root.querySelectorAll("table").forEach(t => { if (!t.classList.contains("wikitable") || t.querySelector("table")) t.remove(); });

    // 2) bezpieczne HTML: tylko znane znaczniki, bez atrybutów; linki osobno
    const ser = node => {
      let out = "";
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { out += esc(n.nodeValue); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (tag === "GD-LI") { out += `<!--li:${+n.getAttribute("k")}-->`; continue; }
        if (tag === "A") {
          const href = n.getAttribute("href") || "", inner = ser(n);
          const wiki = href.match(/^\/wiki\/([^#?]+)/);
          if (wiki && !/^(Plik|File|Kategoria|Category|Specjalna|Special|Szablon|Template|Wikivoyage|Pomoc|Help|Image|Grafika):/i.test(decodeURIComponent(wiki[1])))
            out += `<a class="gd-wv" data-wv="${esc(decodeURIComponent(wiki[1]).replace(/_/g, " "))}" href="#">${inner}</a>`;
          else if (/^https?:\/\//i.test(href) && !/wikimedia|wikipedia\.org\/wiki\/(File|Plik):/i.test(href)) out += `<a href="${esc(href)}" target="_blank" rel="noopener nofollow">${inner}</a>`;
          else if (/^tel:/i.test(href)) out += `<a href="${esc(href)}">${inner}</a>`;
          else out += inner;
          continue;
        }
        if (/^H[2-6]$/.test(tag)) { const lvl = Math.min(5, +tag[1] + 1); out += `<h${lvl}>${esc(txt(n))}</h${lvl}>`; continue; }
        if (tag === "TD" || tag === "TH") { const sp = +n.getAttribute("colspan") > 1 ? ` colspan="${Math.min(9, +n.getAttribute("colspan"))}"` : ""; out += `<${tag.toLowerCase()}${sp}>${ser(n)}</${tag.toLowerCase()}>`; continue; }
        if (KEEP.has(tag)) { out += tag === "BR" ? "<br>" : `<${tag.toLowerCase()}>${ser(n)}</${tag.toLowerCase()}>`; continue; }
        out += ser(n); // span, div, bdi… – tylko zawartość
      }
      return out;
    };
    const tidy = h => h.replace(/<(p|li|dd|dt)>\s*<\/\1>/g, "").replace(/<(ul|ol|dl)>\s*<\/\1>/g, "").replace(/\n{2,}/g, "\n").trim();

    // 3) podział na sekcje (nagłówki 2. poziomu)
    const sections = [];
    let cur = { t: "", html: "" };
    for (const n of [...root.children]) {
      const h2 = n.matches("h2") ? n : n.matches(".mw-heading2") ? n.querySelector("h2") : null;
      if (h2) { sections.push(cur); cur = { t: txt(h2), html: "" }; continue; }
      if (n.matches(".mw-heading")) { const h = n.querySelector("h3,h4,h5"); if (h) cur.html += ser({ childNodes: [h] }); continue; }
      cur.html += ser({ childNodes: [n] });
    }
    sections.push(cur);
    const out = sections.map(s => ({ t: s.t, html: tidy(s.html) })).filter((s, i) => i === 0 ? s.html : s.html || s.t);
    // pusta sekcja (np. same nagłówki bez treści) – usuń, ale zostaw, jeśli ma obiekty
    return { sections: out.filter(s => s.html.replace(/<[^>]+>/g, "").trim() || /<!--li:/.test(s.html)), listings, lang };
  }

  /* ---------- zapis ---------- */
  const gid = (lang, title) => `${lang}:${title}`;
  async function forTrip(tripId) {
    return (await DB.all(STORE)).filter(g => (g.tripIds || []).includes(tripId)).sort((a, b) => (a.added || "").localeCompare(b.added || ""));
  }
  async function download(tripId, lang, title) {
    const p = await fetchArticle(lang, title);
    if (!p) return null;
    const c = clean(p.text, lang);
    const id = gid(lang, p.title);
    const old = await DB.get(STORE, id);
    const tripIds = [...new Set(((old && old.tripIds) || []).concat(tripId))];
    const rec = { id, lang, title: p.title, revid: p.revid || 0, fetched: new Date().toISOString(), added: (old && old.added) || new Date().toISOString(),
      tripIds, sections: c.sections, listings: c.listings };
    rec.size = JSON.stringify(rec).length;
    await DB.put(STORE, rec);
    return rec;
  }
  // usuń przewodnik z podróży (i z telefonu, gdy żadna podróż go nie używa)
  async function detach(tripId, id) {
    const g = await DB.get(STORE, id);
    if (!g) return;
    const tripIds = (g.tripIds || []).filter(t => t !== tripId);
    if (tripIds.length) await DB.put(STORE, { ...g, tripIds }); else await DB.del(STORE, id);
  }
  async function detachAll(tripId) { for (const g of await forTrip(tripId)) await detach(tripId, g.id); }

  // propozycja: cel podróży (bez kraju po przecinku), potem miasta noclegów
  async function suggestions(trip) {
    const segs = await DB.byIndex("segments", "tripId", trip.id);
    const names = [trip.destination, ...segs.filter(s => s.type === "nocleg").map(s => s.city)]
      .concat(String(trip.destination || "").split(/[,/–-]| i | and /))
      .map(s => String(s || "").trim()).filter(s => s.length >= 2);
    return [...new Set(names.map(s => s.split(",")[0].trim()))].slice(0, 5);
  }

  /* ---------- ekran ---------- */
  const kb = n => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
  const CAT_ICON = { zwiedzanie: "landmark", jedzenie: "food", zakupy: "cart", wydarzenie: "star", natura: "tree", inne: "pin" };
  const norm = s => String(s || "").trim().toLowerCase();

  function listingCard(L, k, inPlan) {
    const lines = [
      L.address && `${I("pin")}<span>${esc(L.address)}${L.directions ? ` <span class="muted">(${esc(L.directions)})</span>` : ""}</span>`,
      L.hours && `${I("clock")}<span>${esc(L.hours)}</span>`,
      L.price && `${I("wallet")}<span>${esc(L.price)}</span>`,
      L.phone && `${I("phone")}<span><a href="tel:${esc(L.phone.replace(/[^\d+]/g, ""))}">${esc(L.phone)}</a></span>`,
    ].filter(Boolean);
    const hasXY = L.lat != null && L.lon != null;
    return `
      <div class="gd-li" data-k="${k}">
        <div class="gd-li-h"><span class="gd-li-ic" aria-hidden="true">${I(CAT_ICON[L.cat] || "pin")}</span>
          <b>${esc(L.name)}</b>${L.alt ? ` <span class="muted">${esc(L.alt)}</span>` : ""}</div>
        ${lines.length ? `<div class="gd-li-meta">${lines.map(l => `<div>${l}</div>`).join("")}</div>` : ""}
        ${L.desc ? `<p class="gd-li-d">${esc(L.desc)}</p>` : ""}
        <div class="gd-li-acts">
          <button type="button" class="btn gd-add${inPlan ? " done" : ""}" data-add="${k}" aria-pressed="${!!inPlan}">${inPlan ? `${I("check")} <span>w planie</span>` : `${I("idea")} <span>Do pomysłów</span>`}</button>
          ${hasXY || L.address ? `<a class="btn gd-nav" href="${esc(App.mapsUrl(hasXY ? `${L.lat},${L.lon}` : `${L.name}, ${L.address}`))}" target="_blank" rel="noopener">${I("navigate")} <span>Nawiguj</span></a>` : ""}
          ${L.url && /^https?:/i.test(L.url) ? `<a class="icon-btn gd-www" href="${esc(L.url)}" target="_blank" rel="noopener nofollow" aria-label="Strona: ${esc(L.name)}">${I("globe")}</a>` : ""}
        </div>
      </div>`;
  }

  function searchForm(value, hint) {
    return `
      <form class="pl-search gd-search" id="gd-form" role="search"><span class="pl-search-ic" aria-hidden="true">${I("search")}</span>
        <input name="q" value="${esc(value)}" placeholder="miasto, region albo kraj" autocomplete="off" aria-label="Miejsce do przewodnika">
        <button class="btn primary" type="submit" aria-label="Pobierz przewodnik">${I("download")}</button></form>
      ${hint ? `<p class="f-hint gd-hint">${hint}</p>` : ""}`;
  }

  App.route(/^\/przewodnik\/([\w-]+)$/, async ([id], q) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/podroze"); return ""; }
    const guides = await forTrip(id);
    const lang = self.I18N && I18N.LANGS[q.l] ? q.l : appLang();

    // dodawanie: brak przewodników albo „+ Dodaj”
    if (!guides.length || q.dodaj != null) {
      const sug = await suggestions(trip);
      const first = q.dodaj || sug[0] || "";
      return {
        title: "Przewodnik",
        html: `
          <div class="gd-intro">
            <div class="empty-ic" aria-hidden="true">${App.icon("compass", "lg")}</div>
            <h2>${guides.length ? "Dodaj przewodnik" : "Przewodnik offline"}</h2>
            <p class="muted">Artykuł z Wikivoyage – co zobaczyć, gdzie zjeść, dojazd, komunikacja, bezpieczeństwo. Pobierasz raz, potem działa bez internetu.</p>
          </div>
          ${searchForm(first, "")}
          ${sug.length > 1 ? `<div class="st-chips gd-sug">${sug.map(s => `<button type="button" class="st-chip" data-sug="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}
          <div class="st-chips gd-lang" role="group" aria-label="Język przewodnika">
            ${GLANGS().map(l => `<a class="st-chip${lang === l ? " on" : ""}" href="#/przewodnik/${id}?${new URLSearchParams({ ...(q.dodaj != null ? { dodaj: q.dodaj } : {}), l })}">${I18N.LANGS[l].name}</a>`).join("")}
          </div>
          <div id="gd-res" aria-live="polite"></div>
          ${guides.length ? `<p class="gd-back"><a href="#/przewodnik/${id}">← Wróć do przewodnika</a></p>` : ""}
          <p class="f-hint gd-lic">Treść: Wikivoyage, licencja CC BY-SA 4.0.</p>`,
        after(view) {
          const f = view.querySelector("#gd-form"), res = view.querySelector("#gd-res");
          const busy = on => { f.querySelector("button").disabled = on; f.q.disabled = on; };
          const get = async (title, l) => {
            busy(true);
            res.innerHTML = `<p class="muted gd-wait">Pobieram „${esc(title)}”…</p>`;
            try {
              const g = await download(id, l, title);
              if (g) { App.toast(`Pobrano przewodnik: ${g.title}`); location.replace(`#/przewodnik/${id}?g=${encodeURIComponent(g.id)}`); return; }
              // brak artykułu o tej nazwie – podobne
              const hits = await searchTitles(l, title);
              const other = l === "pl" ? "en" : "pl";
              res.innerHTML = `
                <h3 class="section">${hits.length ? `Nie ma artykułu „${esc(title)}”. Może chodzi o:` : `Nie znaleziono „${esc(title)}”.`}</h3>
                ${hits.length ? `<div class="list">${hits.map(h => `<button type="button" class="li gd-hit" data-t="${esc(h.title)}" data-l="${l}">
                  <span class="li-main"><b>${esc(h.title)}</b>${h.snippet ? `<small>${esc(h.snippet.slice(0, 120))}…</small>` : ""}</span>${I("chev", "")}</button>`).join("")}</div>` : ""}
                <button type="button" class="btn wide gd-other" data-t="${esc(title)}" data-l="${other}">${other === "en" ? "Szukaj w angielskiej Wikivoyage" : "Szukaj w polskiej Wikivoyage"}</button>`;
              res.querySelectorAll("[data-t]").forEach(b => b.onclick = () => get(b.dataset.t, b.dataset.l));
            } catch (e) {
              res.innerHTML = `<p class="gd-err">${navigator.onLine ? "Wikivoyage nie odpowiada – spróbuj za chwilę." : "Brak internetu – przewodnik pobierzesz, gdy będzie połączenie."}</p>`;
            }
            busy(false);
          };
          f.onsubmit = ev => { ev.preventDefault(); const v = f.q.value.trim(); if (v.length >= 2) get(v, lang); };
          view.querySelectorAll("[data-sug]").forEach(b => b.onclick = () => { f.q.value = b.dataset.sug; get(b.dataset.sug, lang); });
          if (q.dodaj && q.auto === "1") get(q.dodaj, lang); // link w przewodniku do innego artykułu
        },
      };
    }

    // czytanie
    const g = guides.find(x => x.id === q.g) || guides[0];
    const items = await DB.byIndex("planItems", "tripId", id);
    const have = new Map(items.map(i => [norm(i.title), i]));
    let body = "";
    g.sections.forEach((s, i) => {
      const html = s.html.replace(/<!--li:(\d+)-->/g, (m, k) => g.listings[+k] ? listingCard(g.listings[+k], +k, have.has(norm(g.listings[+k].name))) : "");
      const nLi = (s.html.match(/<!--li:\d+-->/g) || []).length;
      if (i === 0 && !s.t) { body += `<div class="gd-lead gd-text">${html}</div>`; return; }
      body += `
        <details class="gd-sec" data-sec="${i}">
          <summary><span class="gd-sec-ic" aria-hidden="true">${I(secIcon(s.t))}</span><span class="gd-sec-t">${esc(s.t)}</span>${nLi ? `<span class="chip">${nLi}</span>` : ""}${I("chev", "pl-sum-chev")}</summary>
          <div class="gd-text">${html}</div>
        </details>`;
    });
    const chips = guides.length > 1 ? `<div class="st-chips gd-chips">${guides.map(x => `<a class="st-chip${x.id === g.id ? " on" : ""}" href="#/przewodnik/${id}?g=${encodeURIComponent(x.id)}"${x.id === g.id ? ' aria-current="true"' : ""}>${esc(x.title)}</a>`).join("")}</div>` : "";
    const nPts = g.listings.filter(L => L.lat != null).length;

    return {
      title: "Przewodnik",
      action: `<a class="icon-btn" href="#/przewodnik/${id}?dodaj=" aria-label="Dodaj przewodnik">${I("plus", "")}</a>`,
      html: `
        ${chips}
        <header class="gd-head">
          <h2>${esc(g.title)}</h2>
          <p class="muted small">Wikivoyage ${g.lang.toUpperCase()} · pobrano ${App.fmtDay(g.fetched.slice(0, 10))} · ${kb(g.size || 0)} · działa offline</p>
          ${g.listings.length ? `<p class="small gd-count">${g.listings.length} ${App.plural(g.listings.length, "miejsce", "miejsca", "miejsc")} z opisem${nPts ? `, ${nPts} na mapie` : ""} – dodasz je jednym dotknięciem do pomysłów.</p>` : ""}
        </header>
        <form class="pl-search gd-find" id="gd-find" role="search"><span class="pl-search-ic" aria-hidden="true">${I("search")}</span>
          <input name="q" type="search" placeholder="Szukaj w przewodniku" autocomplete="off" aria-label="Szukaj w przewodniku"></form>
        <p class="muted small gd-found" id="gd-found" aria-live="polite"></p>
        <div class="gd-body" id="gd-body">${body}</div>
        <div class="gd-foot">
          <button type="button" class="btn" id="gd-refresh">${I("download")} <span>Pobierz ponownie</span></button>
          <button type="button" class="btn danger" id="gd-del">${I("trash")} <span>Usuń przewodnik</span></button>
          <p class="f-hint">Tekst: artykuł <a href="${esc(PAGE(g.lang, g.title))}" target="_blank" rel="noopener">„${esc(g.title)}”</a> z Wikivoyage, <a href="${esc(`https://${g.lang}.wikivoyage.org/w/index.php?title=${encodeURIComponent(g.title)}&action=history`)}" target="_blank" rel="noopener">autorzy</a>, licencja <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.${g.lang}" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Skrócony: bez zdjęć i map.</p>
        </div>`,
      after(view) {
        // dodawanie obiektu do pomysłów (drugie dotknięcie – usuwa pomysł)
        view.querySelectorAll("[data-add]").forEach(b => b.onclick = async () => {
          const L = g.listings[+b.dataset.add], k = norm(L.name);
          const set = on => { b.innerHTML = on ? `${I("check")} <span>w planie</span>` : `${I("idea")} <span>Do pomysłów</span>`; b.classList.toggle("done", on); b.setAttribute("aria-pressed", on); };
          if (have.has(k)) {
            const it = await DB.get("planItems", have.get(k).id);
            if (it && it.date && !confirm(`„${it.title}” jest już w planie na ${App.fmtDay(it.date)}. Usunąć z planu?`)) return;
            if (it) await DB.del("planItems", it.id);
            have.delete(k); set(false);
            App.toast(it && it.date ? "Usunięto z planu" : "Usunięto z pomysłów");
            return;
          }
          const hasXY = L.lat != null && L.lon != null;
          const note = [L.hours && `⏰ ${L.hours}`, L.price && `💰 ${L.price}`, L.desc].filter(Boolean).join(" · ").slice(0, 400);
          const rec = await DB.put("planItems", { tripId: id, date: "", time: "", title: L.name.slice(0, 100), cat: L.cat,
            place: L.address ? `${L.name}, ${L.address}` : `${L.name}, ${g.title}`, ...(hasXY ? { lat: L.lat, lon: L.lon } : {}),
            note, cost: "", currency: "PLN", order: 1e6, source: `wikivoyage:${g.id}` });
          have.set(k, rec); set(true);
          if (navigator.vibrate) navigator.vibrate(15);
          App.toast("Dodano do pomysłów – wybierzesz dzień w planie");
        });
        // link do innego artykułu → pobierz jako kolejny przewodnik (albo otwórz, jeśli już jest)
        view.querySelectorAll("[data-wv]").forEach(a => a.onclick = ev => {
          ev.preventDefault();
          const t = a.dataset.wv, have2 = guides.find(x => x.lang === g.lang && x.title === t);
          if (have2) { location.hash = `#/przewodnik/${id}?g=${encodeURIComponent(have2.id)}`; return; }
          if (!navigator.onLine) { App.toast("Brak internetu – ten artykuł pobierzesz później"); return; }
          location.hash = `#/przewodnik/${id}?${new URLSearchParams({ dodaj: t, l: g.lang, auto: "1" })}`;
        });
        // szukanie w tekście: rozwija pasujące sekcje, ukrywa resztę
        const find = view.querySelector("#gd-find"), found = view.querySelector("#gd-found");
        const secs = [...view.querySelectorAll(".gd-sec")], lead = view.querySelector(".gd-lead");
        find.onsubmit = ev => ev.preventDefault();
        find.q.oninput = () => {
          const v = norm(find.q.value);
          let n = 0;
          view.querySelectorAll("mark.gd-mark").forEach(m => m.replaceWith(m.textContent));
          if (v.length < 2) { secs.forEach(s => { s.hidden = false; s.open = false; }); if (lead) lead.hidden = false; found.textContent = ""; return; }
          for (const s of secs.concat(lead ? [lead] : [])) {
            const hit = norm(s.textContent).includes(v);
            s.hidden = !hit;
            if (s.tagName === "DETAILS") s.open = hit;
            if (hit) { n++; mark(s.querySelector(".gd-text") || s, v); }
          }
          found.textContent = n ? `Znaleziono w ${n} ${App.plural(n, "części", "częściach", "częściach")}` : "Nic nie znaleziono";
        };
        view.querySelector("#gd-refresh").onclick = async ev => {
          const b = ev.currentTarget; b.disabled = true;
          try { const r = await download(id, g.lang, g.title); App.toast(r ? "Przewodnik zaktualizowany" : "Artykułu już nie ma w Wikivoyage"); App.render(); }
          catch (e) { b.disabled = false; App.toast(navigator.onLine ? "Wikivoyage nie odpowiada – spróbuj za chwilę" : "Brak internetu"); }
        };
        view.querySelector("#gd-del").onclick = async () => {
          if (!confirm(`Usunąć przewodnik „${g.title}” z tej podróży? Dodane pomysły zostają.`)) return;
          await detach(id, g.id);
          App.toast("Usunięto przewodnik");
          location.replace(`#/przewodnik/${id}`);
        };
      },
    };
  });

  // podświetlenie wyszukiwanego słowa (tylko w węzłach tekstowych)
  function mark(el, v) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let left = 30;
    for (const n of nodes) {
      const i = n.nodeValue.toLowerCase().indexOf(v);
      if (i < 0 || !left--) continue;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + v.length);
      const m = document.createElement("mark"); m.className = "gd-mark"; r.surroundContents(m);
    }
  }

  App.Guide = { clean, download, forTrip, detach, detachAll, fetchArticle, searchTitles, suggestions };
})();
