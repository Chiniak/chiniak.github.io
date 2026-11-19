/* Tripwillow – etap 8 (pkt 38): dokumenty podróżne z datą ważności.
   Trasy:
     #/dokumenty              lista (wygasłe i wygasające na górze)
     #/dokumenty/nowy         nowy dokument
     #/dokument/:id           podgląd (numer, daty, zdjęcie)
     #/dokument/:id/edytuj    edycja i usuwanie
   Dokument (magazyn "docs"):
     { id, type, person, number, country, issued, expires, remind (dni przed, 0 = bez), note, blob? (zdjęcie / PDF) }
   Przypomnienia o ważności liczy reminders-core.js (te same powiadomienia co w etapie 5). */
(function () {
  const { esc, plural } = App;

  /* Każdy rodzaj dokumentu ma własne etykiety i podpowiedzi (formularz zmienia się po wyborze rodzaju).
     g – rodzaj gramatyczny do „ważny / ważna / ważne”; num [etykieta, podpowiedź]; country (null = pole ukryte); issued / expires – etykiety dat;
     nm [etykieta, podpowiedź] – dodatkowe pole „Nazwa” (null = brak); note – podpowiedź do notatki; trip – ostrzegaj, gdy wygasa przed końcem podróży. */
  const TYPES = {
    paszport: { icon: "🛂", ic: "passport", name: "Paszport", g: "m", num: ["Numer paszportu", "np. EA1234567"], country: "Kraj wydania", issued: "Data wydania", expires: "Ważny do", nm: null, note: "np. do kogo dzwonić w razie utraty", trip: true },
    dowod: { icon: "🪪", ic: "idcard", name: "Dowód osobisty", g: "m", num: ["Numer dowodu", "np. ABC123456"], country: "Kraj wydania", issued: "Data wydania", expires: "Ważny do", nm: null, note: "np. do kogo dzwonić w razie utraty", trip: true },
    prawo_jazdy: { icon: "🚗", ic: "car", name: "Prawo jazdy", g: "n", num: ["Numer prawa jazdy", "np. 01234/56/7890"], country: "Kraj wydania", issued: "Data wydania", expires: "Ważny do", nm: null, note: "np. kategorie B i C, międzynarodowe prawo jazdy", trip: true },
    ubezpieczenie: { icon: "🩺", ic: "shield", name: "Ubezpieczenie / EKUZ", g: "n", num: ["Numer polisy", "np. ABC-12345678"], country: "Kraj", issued: "Początek ochrony", expires: "Koniec ochrony", nm: ["Ubezpieczyciel", "np. Allianz, PZU"], note: "np. numer polisy, telefon alarmowy ubezpieczyciela", trip: true },
    wiza: { icon: "🌍", ic: "globe", name: "Wiza / ESTA / eTA", g: "f", num: ["Numer wizy / wniosku", "np. numer wniosku ESTA"], country: "Kraj, którego dotyczy", issued: "Ważna od", expires: "Ważna do", nm: ["Rodzaj wizy", "np. turystyczna, ESTA"], note: "np. liczba wjazdów, maksymalny pobyt", trip: true },
    karta: { icon: "💳", ic: "card", name: "Karta płatnicza", g: "f", num: ["Ostatnie 4 cyfry karty", "np. 1234"], country: null, issued: null, expires: "Ważna do", nm: null, note: "np. do kogo dzwonić w razie utraty", trip: true, hint: "Nie wpisuj pełnego numeru karty – tylko ostatnie 4 cyfry." },
    szczepienie: { icon: "💉", ic: "syringe", name: "Szczepienie", g: "n", num: ["Nr certyfikatu / serii", "np. numer certyfikatu"], country: "Kraj szczepienia", issued: "Data szczepienia", expires: "Następna dawka / ważne do", nm: ["Nazwa szczepienia", "np. żółta febra, WZW A"], note: "np. numer partii szczepionki, dawka 2 z 3", trip: false },
    inne: { icon: "📁", ic: "doc", name: "Inny dokument", g: "m", num: ["Numer", "np. numer dokumentu"], country: "Kraj", issued: "Data wydania", expires: "Ważny do", nm: ["Nazwa dokumentu", "np. zaświadczenie lekarskie"], note: "np. numer polisy, telefon alarmowy ubezpieczyciela", trip: true },
  };
  const typeOf = d => TYPES[d.type] || TYPES.inne;
  // „ważny / ważna / ważne” – zależnie od rodzaju dokumentu
  const GEN = {
    m: { exp: "wygasł", today: "ważny tylko dziś", left: "ważny jeszcze", bad: "nieważny", ok: "ważny" },
    f: { exp: "wygasła", today: "ważna tylko dziś", left: "ważna jeszcze", bad: "nieważna", ok: "ważna" },
    n: { exp: "wygasło", today: "ważne tylko dziś", left: "ważne jeszcze", bad: "nieważne", ok: "ważne" },
  };
  const stChip = v => {
    const g = GEN[v.g] || GEN.m;
    const T = { expired: ["err", g.bad], soon: ["warn", "wkrótce wygasa"], ok: ["ok", g.ok], none: ["", "bez daty"] }[v.st];
    return `<span class="chip ${T[0]} doc-st">${T[1]}</span>`;
  };
  const warnHtml = w => w.map(x => `<div class="doc-warn ${x.lvl}">${App.icon("alert", "sm")}<span>${esc(x.txt)}</span></div>`).join("");
  const title = d => `${d.name || typeOf(d).name}${d.person ? ` – ${d.person}` : ""}`;
  // numer karty pokazujemy zamaskowany (zapisane są tylko ostatnie cyfry)
  const numShow = d => d.type === "karta" && d.number ? `•••• ${d.number}` : d.number || "";

  // stan ważności: expired | soon (≤ 90 dni) | ok | none (bez daty)
  function validity(d, today = App.todayStr()) {
    const g = typeOf(d).g, G = GEN[g] || GEN.m;
    if (!d.expires) return { st: "none", txt: "bez daty ważności", g };
    const days = App.dayDiff(today, d.expires);
    if (days < 0) return { st: "expired", txt: `${G.exp} ${App.fmtRange(d.expires)}`, days, g };
    if (days === 0) return { st: "expired", txt: G.today, days, g };
    const when = days < 60 ? `${days} ${plural(days, "dzień", "dni", "dni")}` : days < 730 ? `${Math.round(days / 30.4)} mies.` : `${Math.round(days / 365)} lat`;
    return { st: days <= 90 ? "soon" : "ok", txt: `${G.left} ${when} (do ${App.fmtRange(d.expires)})`, days, g };
  }

  // paszport: wiele krajów wymaga ważności min. 3–6 mies. po powrocie
  function tripWarnings(d, trips, today = App.todayStr()) {
    if (!d.expires || !typeOf(d).trip) return [];
    const out = [];
    for (const t of trips) {
      if (t.end < today) continue;
      if (d.expires < t.end) out.push({ lvl: "err", txt: `Wygaśnie przed końcem podróży „${t.name}” (${App.fmtRange(t.start, t.end)})` });
      else if (d.type === "paszport" && d.expires < App.addDays(t.end, 182)) out.push({ lvl: "warn", txt: `Ważny krócej niż 6 mies. po powrocie z „${t.name}” – część krajów tego wymaga` });
    }
    return out;
  }

  async function summary() {
    const docs = await DB.all("docs");
    const v = docs.map(d => validity(d).st);
    return { total: docs.length, expired: v.filter(s => s === "expired").length, soon: v.filter(s => s === "soon").length };
  }

  /* ================= LISTA ================= */
  App.route(/^\/dokumenty$/, async () => {
    const [docs, trips] = await Promise.all([DB.all("docs"), DB.all("trips")]);
    const add = `<a class="fab" href="#/dokumenty/nowy" aria-label="Dodaj dokument">${App.Trips.plusIcon}<span>Dokument</span></a>`;
    if (!docs.length) return {
      title: "Dokumenty",
      back: "#/bilety",
      html: App.empty("🛂", "Dokumenty podróżne",
        "Paszport, dowód, ubezpieczenie, wiza – z datą ważności. Aplikacja przypomni, zanim wygasną, i ostrzeże, gdy paszport nie wystarczy na podróż.",
        `<a class="btn primary" href="#/dokumenty/nowy">${App.Trips.plusIcon} Dodaj dokument</a>`),
    };
    const rank = { expired: 0, soon: 1, ok: 2, none: 3 };
    const rows = docs.map(d => ({ d, v: validity(d), w: tripWarnings(d, trips) }))
      .sort((a, b) => rank[a.v.st] - rank[b.v.st] || (a.d.expires || "9").localeCompare(b.d.expires || "9"));
    return {
      title: "Dokumenty",
      back: "#/bilety",
      html: `<p class="f-hint doc-intro">Aplikacja przypomni, zanim dokument wygaśnie, i ostrzeże, gdy paszport nie wystarczy na podróż.</p>` + rows.map(({ d, v, w }) => `
        <a class="doc-card st-${v.st}" href="#/dokument/${d.id}">
          <div class="doc-ico" aria-hidden="true">${App.icon(typeOf(d).ic)}</div>
          <div class="doc-main">
            <div class="doc-top"><span class="doc-title">${esc(title(d))}</span>${d.blob ? `<span class="doc-clip" title="Ma zdjęcie / skan" aria-label="ma skan">${App.icon("clip", "sm")}</span>` : ""}</div>
            ${d.number ? `<div class="doc-num">${esc(numShow(d))}</div>` : ""}
            <div class="doc-valid-row">${stChip(v)}<span class="doc-valid">${v.txt}</span></div>
            ${warnHtml(w)}
          </div>
        </a>`).join("") + add,
    };
  });

  /* ================= PODGLĄD ================= */
  App.route(/^\/dokument\/([\w-]+)$/, async ([id]) => {
    const [d, trips] = await Promise.all([DB.get("docs", id), DB.all("trips")]);
    if (!d) { location.replace("#/dokumenty"); return ""; }
    const v = validity(d), w = tripWarnings(d, trips);
    let url = null;
    const row = (k, val) => val ? `<div class="doc-fact"><dt>${k}</dt><dd>${esc(val)}</dd></div>` : "";
    return {
      title: typeOf(d).name,
      back: "#/dokumenty",
      action: `<a class="icon-btn" href="#/dokument/${id}/edytuj" aria-label="Edytuj">${App.Trips.editIcon}</a>`,
      html: `
        <div class="doc-head st-${v.st}">
          <div class="doc-head-top"><span class="doc-big-ico" aria-hidden="true">${App.icon(typeOf(d).ic)}</span>${stChip(v)}</div>
          <div class="doc-title">${esc(title(d))}</div>
          ${d.name ? `<div class="doc-kind">${esc(typeOf(d).name)}</div>` : ""}
          ${d.number ? `<div class="doc-big-num" id="doc-num">${esc(numShow(d))}</div>` : ""}
          <div class="doc-valid">${v.txt}</div>
          ${d.expires && v.days != null && v.days >= 0 ? `<div class="bar doc-bar" aria-hidden="true"><i style="width:${Math.max(4, Math.min(100, Math.round(v.days / 3650 * 100)))}%"></i></div>` : ""}
        </div>
        ${warnHtml(w)}
        ${d.number && d.type !== "karta" ? `<button type="button" class="btn wide doc-copy" id="doc-copy">${App.icon("copy", "sm")} Kopiuj numer</button>` : ""}
        <dl class="list doc-facts">
          ${row(typeOf(d).country || "Kraj", d.country)}
          ${row(typeOf(d).issued || "Data wydania", d.issued ? App.fmtRange(d.issued) : "")}
          ${row(typeOf(d).expires, d.expires ? App.fmtRange(d.expires) : "")}
          ${row("Przypomnienie", d.expires && +d.remind ? `${d.remind} dni przed wygaśnięciem` : d.expires ? "wyłączone" : "")}
        </dl>
        ${d.note ? `<p class="td-note doc-note">${App.icon("info", "sm")}<span>${esc(d.note)}</span></p>` : ""}
        <div id="doc-scan"></div>`,
      after(view) {
        const box = view.querySelector("#doc-scan");
        if (d.blob) {
          url = URL.createObjectURL(d.blob);
          box.innerHTML = /pdf/.test(d.blob.type)
            ? `<a class="btn wide doc-pdf" href="${url}" target="_blank" rel="noopener">${App.icon("doc", "sm")} Otwórz skan (PDF)</a>`
            : `<h2 class="section">Skan / zdjęcie</h2><img class="doc-img" src="${url}" alt="Skan dokumentu">`;
        }
        const c = view.querySelector("#doc-copy");
        if (c) c.onclick = async () => {
          try { await navigator.clipboard.writeText(d.number); App.toast("Skopiowano numer"); } catch (e) { App.toast("Nie udało się skopiować"); }
        };
      },
      cleanup() { if (url) URL.revokeObjectURL(url); },
    };
  });

  /* ================= FORMULARZ ================= */
  async function form(id) {
    const d = id ? await DB.get("docs", id) : null;
    if (id && !d) { location.replace("#/dokumenty"); return ""; }
    const v = d || { type: "paszport", person: "", number: "", country: "", issued: "", expires: "", remind: 90, note: "" };
    let newBlob = undefined; // undefined = bez zmian, null = usuń
    // nowy dokument z udostępnionego pliku (udostepnione.js)
    if (!id && App.sharedDoc) { newBlob = App.sharedDoc; App.sharedDoc = null; }
    const types = Object.entries(TYPES).map(([k, T]) => `
      <label class="type-chip"><input type="radio" name="type" value="${k}" ${k === v.type ? "checked" : ""}>
        <span><b aria-hidden="true">${App.icon(T.ic, "sm")}</b>${T.name}</span></label>`).join("");
    const REMIND = [[0, "bez przypomnienia"], [30, "30 dni przed"], [60, "60 dni przed"], [90, "90 dni przed"], [180, "6 miesięcy przed"]];
    return {
      title: d ? "Edytuj dokument" : "Nowy dokument",
      back: d ? `#/dokument/${d.id}` : "#/dokumenty",
      html: `
        <form id="doc-form" class="form" novalidate>
          <div class="type-chips" role="radiogroup" aria-label="Rodzaj">${types}</div>
          <div class="fsec">
            <label class="field" id="f-name"><span id="l-name">Nazwa</span><input name="name" maxlength="60" value="${esc(v.name || "")}"></label>
            <div class="grid2">
              <label class="field"><span>Czyj</span><input name="person" maxlength="40" placeholder="np. Jan, Ania" value="${esc(v.person)}"></label>
              <label class="field" id="f-country"><span id="l-country">Kraj</span><input name="country" maxlength="40" placeholder="np. Polska" value="${esc(v.country)}"></label>
            </div>
            <label class="field"><span id="l-number">Numer</span><input name="number" maxlength="40" inputmode="text" value="${esc(v.number)}"></label>
            <p class="f-hint" id="h-type" hidden></p>
          </div>
          <div class="fsec"><h2 class="section">Ważność</h2>
            <div class="grid2">
              <label class="field" id="f-issued"><span id="l-issued">Data wydania</span><input type="date" name="issued" value="${esc(v.issued)}"></label>
              <label class="field"><span id="l-expires">Ważny do</span><input type="date" name="expires" value="${esc(v.expires)}"></label>
            </div>
            <label class="field"><span>Przypomnij przed wygaśnięciem</span>
              <select name="remind">${REMIND.map(([k, n]) => `<option value="${k}" ${+v.remind === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          </div>
          <div class="fsec"><h2 class="section">Skan i notatka</h2>
            <div class="field"><span>Skan / zdjęcie (opcjonalnie, zostaje tylko w telefonie)</span>
              <div class="doc-file">
                <span id="doc-file-name" class="muted small">${newBlob ? esc(newBlob.name || "udostępniony plik") : d && d.blob ? "dodano skan" : "brak"}</span>
                <label class="btn">${App.icon("camera", "sm")} Wybierz<input type="file" id="doc-pick" accept="image/*,application/pdf,.pdf" hidden></label>
                ${d && d.blob ? `<button type="button" class="btn" id="doc-rm">${App.icon("trash", "sm")} Usuń skan</button>` : ""}
              </div>
            </div>
            <label class="field"><span>Notatka</span><textarea name="note" rows="2">${esc(v.note)}</textarea></label>
          </div>
          <p class="error" id="err" hidden></p>
          <div class="f-actions">
            <button class="btn primary wide" type="submit">${d ? "Zapisz zmiany" : "Dodaj dokument"}</button>
            ${d ? `<button class="btn danger wide" type="button" id="del">${App.icon("trash", "sm")} Usuń dokument</button>` : ""}
          </div>
        </form>`,
      after(view) {
        const f = view.querySelector("#doc-form");
        // po wyborze rodzaju zmieniają się etykiety, podpowiedzi i widoczne pola
        const q = s => view.querySelector(s);
        const applyType = k => {
          const T = TYPES[k] || TYPES.inne;
          q("#l-number").textContent = T.num[0]; f.number.placeholder = T.num[1];
          q("#l-country").textContent = T.country || "Kraj"; q("#f-country").hidden = !T.country;
          q("#l-issued").textContent = T.issued || "Data wydania"; q("#f-issued").hidden = !T.issued;
          q("#l-expires").textContent = T.expires;
          q("#f-name").hidden = !T.nm;
          if (T.nm) { q("#l-name").textContent = T.nm[0]; f.elements.name.placeholder = T.nm[1]; }
          f.note.placeholder = T.note;
          const h = q("#h-type"); h.hidden = !T.hint; if (T.hint) h.textContent = T.hint;
        };
        f.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener("change", () => applyType(r.value)));
        applyType(v.type);
        view.querySelector("#doc-pick").addEventListener("change", e => {
          const file = e.target.files[0];
          if (!file) return;
          newBlob = file;
          view.querySelector("#doc-file-name").textContent = file.name;
        });
        const rm = view.querySelector("#doc-rm");
        if (rm) rm.onclick = () => { newBlob = null; view.querySelector("#doc-file-name").textContent = "skan zostanie usunięty"; };
        f.addEventListener("submit", async e => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(f));
          for (const k in data) data[k] = String(data[k]).trim();
          if (data.issued && data.expires && data.expires < data.issued) {
            const p = view.querySelector("#err"); p.textContent = "Data ważności jest przed datą wydania."; p.hidden = false; return;
          }
          data.remind = +data.remind;
          data.number = data.number.toUpperCase();
          const T = TYPES[data.type] || TYPES.inne;
          if (!T.nm) data.name = "";
          if (!T.country) data.country = "";
          if (!T.issued) data.issued = "";
          if (data.type === "karta") data.number = data.number.replace(/\D/g, "").slice(-4);
          const rec = { ...(d || {}), ...data };
          if (newBlob !== undefined) { if (newBlob) rec.blob = newBlob; else delete rec.blob; }
          const saved = await DB.put("docs", rec);
          App.toast(d ? "Zapisano" : "Dodano dokument");
          if (d) App.back(`#/dokument/${saved.id}`); else location.replace(`#/dokument/${saved.id}`);
        });
        const del = view.querySelector("#del");
        if (del) del.onclick = async () => {
          if (!confirm(`Usunąć „${title(d)}”?`)) return;
          await DB.del("docs", d.id);
          App.toast("Usunięto");
          location.replace("#/dokumenty");
        };
      },
    };
  }
  App.route(/^\/dokumenty\/nowy$/, () => form(null));
  App.route(/^\/dokument\/([\w-]+)\/edytuj$/, ([id]) => form(id));

  App.Docs = { summary, validity, TYPES };
})();
