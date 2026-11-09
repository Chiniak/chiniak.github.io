/* Podróżnik – etap 8 (pkt 38): dokumenty podróżne z datą ważności.
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

  const TYPES = {
    paszport: { icon: "🛂", name: "Paszport" },
    dowod: { icon: "🪪", name: "Dowód osobisty" },
    prawo_jazdy: { icon: "🚗", name: "Prawo jazdy" },
    ubezpieczenie: { icon: "🩺", name: "Ubezpieczenie / EKUZ" },
    wiza: { icon: "📄", name: "Wiza / ESTA / eTA" },
    karta: { icon: "💳", name: "Karta płatnicza" },
    szczepienie: { icon: "💉", name: "Szczepienie" },
    inne: { icon: "📁", name: "Inny dokument" },
  };
  const typeOf = d => TYPES[d.type] || TYPES.inne;
  const title = d => `${typeOf(d).name}${d.person ? ` – ${d.person}` : ""}`;

  // stan ważności: expired | soon (≤ 90 dni) | ok | none (bez daty)
  function validity(d, today = App.todayStr()) {
    if (!d.expires) return { st: "none", txt: "bez daty ważności" };
    const days = App.dayDiff(today, d.expires);
    if (days < 0) return { st: "expired", txt: `wygasł ${App.fmtRange(d.expires)}`, days };
    if (days === 0) return { st: "expired", txt: "ważny tylko dziś", days };
    const when = days < 60 ? `${days} ${plural(days, "dzień", "dni", "dni")}` : days < 730 ? `${Math.round(days / 30.4)} mies.` : `${Math.round(days / 365)} lat`;
    return { st: days <= 90 ? "soon" : "ok", txt: `ważny jeszcze ${when} (do ${App.fmtRange(d.expires)})`, days };
  }

  // paszport: wiele krajów wymaga ważności min. 3–6 mies. po powrocie
  function tripWarnings(d, trips, today = App.todayStr()) {
    if (!d.expires) return [];
    const out = [];
    for (const t of trips) {
      if (t.end < today) continue;
      if (d.expires < t.end) out.push(`❗ Wygaśnie przed końcem podróży „${t.name}” (${App.fmtRange(t.start, t.end)})`);
      else if (d.type === "paszport" && d.expires < App.addDays(t.end, 182)) out.push(`⚠️ Ważny krócej niż 6 mies. po powrocie z „${t.name}” – część krajów tego wymaga`);
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
      html: rows.map(({ d, v, w }) => `
        <a class="doc-card st-${v.st}" href="#/dokument/${d.id}">
          <div class="doc-ico" aria-hidden="true">${typeOf(d).icon}</div>
          <div class="doc-main">
            <div class="doc-title">${esc(title(d))}</div>
            ${d.number ? `<div class="doc-num">${esc(d.number)}</div>` : ""}
            <div class="doc-valid">${v.txt}</div>
            ${w.map(x => `<div class="doc-warn">${esc(x)}</div>`).join("")}
          </div>
          ${d.blob ? `<span class="doc-clip" title="Ma zdjęcie / skan" aria-label="ma skan">📎</span>` : ""}
        </a>`).join("") + add,
    };
  });

  /* ================= PODGLĄD ================= */
  App.route(/^\/dokument\/([\w-]+)$/, async ([id]) => {
    const [d, trips] = await Promise.all([DB.get("docs", id), DB.all("trips")]);
    if (!d) { location.replace("#/dokumenty"); return ""; }
    const v = validity(d), w = tripWarnings(d, trips);
    let url = null;
    const row = (k, val) => val ? `<div class="row"><span class="muted">${k}</span><b>${esc(val)}</b></div>` : "";
    return {
      title: typeOf(d).name,
      back: "#/dokumenty",
      action: `<a class="icon-btn" href="#/dokument/${id}/edytuj" aria-label="Edytuj">${App.Trips.editIcon}</a>`,
      html: `
        <div class="doc-head st-${v.st}">
          <div class="doc-big-ico" aria-hidden="true">${typeOf(d).icon}</div>
          <div class="doc-title">${esc(title(d))}</div>
          ${d.number ? `<div class="doc-big-num" id="doc-num">${esc(d.number)}</div>` : ""}
          <div class="doc-valid">${v.txt}</div>
          ${w.map(x => `<div class="doc-warn">${esc(x)}</div>`).join("")}
        </div>
        <div class="card">
          ${row("Kraj", d.country)}
          ${row("Wydany", d.issued ? App.fmtRange(d.issued) : "")}
          ${row("Ważny do", d.expires ? App.fmtRange(d.expires) : "")}
          ${row("Przypomnienie", d.expires && +d.remind ? `${d.remind} dni przed wygaśnięciem` : d.expires ? "wyłączone" : "")}
          ${d.note ? `<p class="note" style="white-space:pre-wrap;margin:8px 0 0">${esc(d.note)}</p>` : ""}
        </div>
        ${d.number ? `<button type="button" class="btn wide" id="doc-copy">📋 Kopiuj numer</button>` : ""}
        <div id="doc-scan"></div>`,
      after(view) {
        const box = view.querySelector("#doc-scan");
        if (d.blob) {
          url = URL.createObjectURL(d.blob);
          box.innerHTML = /pdf/.test(d.blob.type)
            ? `<a class="btn wide" href="${url}" target="_blank" rel="noopener" style="margin-top:10px">📄 Otwórz skan (PDF)</a>`
            : `<h3 class="section">Skan / zdjęcie</h3><img class="doc-img" src="${url}" alt="Skan dokumentu">`;
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
    const types = Object.entries(TYPES).map(([k, T]) => `
      <label class="type-chip"><input type="radio" name="type" value="${k}" ${k === v.type ? "checked" : ""}>
        <span><b aria-hidden="true">${T.icon}</b>${T.name}</span></label>`).join("");
    const REMIND = [[0, "bez przypomnienia"], [30, "30 dni przed"], [60, "60 dni przed"], [90, "90 dni przed"], [180, "6 miesięcy przed"]];
    return {
      title: d ? "Edytuj dokument" : "Nowy dokument",
      back: d ? `#/dokument/${d.id}` : "#/dokumenty",
      html: `
        <form id="doc-form" class="form" novalidate>
          <div class="type-chips" role="radiogroup" aria-label="Rodzaj">${types}</div>
          <div class="grid2">
            <label class="field"><span>Czyj</span><input name="person" maxlength="40" placeholder="np. Jan, Ania" value="${esc(v.person)}"></label>
            <label class="field"><span>Kraj</span><input name="country" maxlength="40" placeholder="np. Polska" value="${esc(v.country)}"></label>
          </div>
          <label class="field"><span>Numer</span><input name="number" maxlength="40" autocapitalize="characters" placeholder="np. EA1234567" value="${esc(v.number)}"></label>
          <div class="grid2">
            <label class="field"><span>Data wydania</span><input type="date" name="issued" value="${esc(v.issued)}"></label>
            <label class="field"><span>Ważny do</span><input type="date" name="expires" value="${esc(v.expires)}"></label>
          </div>
          <label class="rm-sel"><span>Przypomnij przed wygaśnięciem</span>
            <select name="remind">${REMIND.map(([k, n]) => `<option value="${k}" ${+v.remind === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <div class="field"><span>Skan / zdjęcie (opcjonalnie, zostaje tylko w telefonie)</span>
            <div class="doc-file">
              <span id="doc-file-name" class="muted small">${d && d.blob ? "📎 dodano skan" : "brak"}</span>
              <label class="btn">📷 Wybierz<input type="file" id="doc-pick" accept="image/*,application/pdf,.pdf" hidden></label>
              ${d && d.blob ? `<button type="button" class="btn" id="doc-rm">Usuń skan</button>` : ""}
            </div>
          </div>
          <label class="field"><span>Notatka</span><textarea name="note" rows="2" placeholder="np. numer polisy, telefon alarmowy ubezpieczyciela">${esc(v.note)}</textarea></label>
          <p class="error" id="err" hidden></p>
          <button class="btn primary wide" type="submit">${d ? "Zapisz zmiany" : "Dodaj dokument"}</button>
          ${d ? `<button class="btn danger wide" type="button" id="del">Usuń dokument</button>` : ""}
        </form>`,
      after(view) {
        const f = view.querySelector("#doc-form");
        view.querySelector("#doc-pick").addEventListener("change", e => {
          const file = e.target.files[0];
          if (!file) return;
          newBlob = file;
          view.querySelector("#doc-file-name").textContent = `📎 ${file.name}`;
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
