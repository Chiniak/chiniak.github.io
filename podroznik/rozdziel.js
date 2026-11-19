/* Tripwillow – „Rozdziel na osobne punkty”: jeden punkt planu z całym dniem w tytule / notatce
   (np. „Pociągiem do Kunming, wieczór nad jeziorem Cuihu” – z przewodnika, biblioteki planów albo wklejonego planu)
   → osobne punkty, każdy z własną godziną i kategorią.
   Trasa: #/punkt/:id/rozdziel   (przycisk w edycji punktu, gdy w tytule lub notatce jest kilka rzeczy) */
(function () {
  const { esc } = App;
  const I = (n, c = "sm") => App.icon(n, c);
  const TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/;

  // części tekstu: przecinki, średniki, „ / ”, myślniki, kropki między zdaniami, „ i ” przed małą literą
  function parts(text) {
    return String(text || "")
      .split(/\s*[,;]\s*|\s+[–—-]\s+|\s+\/\s+|(?<=[.!?])\s+|\s+i\s+(?=\p{Ll})|\s+oraz\s+|\s+potem\s+|\s+a potem\s+|\n+/u)
      .map(x => x.replace(/[.!?]+$/, "").trim()).filter(x => x.length >= 2);
  }
  const cap = s => s.charAt(0).toLocaleUpperCase("pl") + s.slice(1);
  // godzina z tekstu („Przylot 18:40” → 18:40, „Przylot”)
  function row(text) {
    const m = TIME.exec(text);
    const t = m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
    const title = cap((m ? text.replace(m[0], " ") : text).replace(/\s+(o|ok\.?|około|godz\.?)\s*$/i, "").replace(/\s{2,}/g, " ").trim());
    return { time: t, title };
  }
  const CAT_WORDS = [
    [/kolacj|obiad|śniadani|lunch|jedzeni|restaurac|kaw[ay]|herbat|bar\b|street ?food|knajp|targ nocny|nocny targ|food|dinner|breakfast/i, "jedzenie"],
    [/muze|świątyn|klasztor|pagod|zamek|pałac|zabyt|zwiedz|katedr|kości|meczet|stare miasto|starówk|museum|temple|palace/i, "zwiedzanie"],
    [/park|jezior|gór[ayę]|plaż|spacer|wodospad|las\b|ogród|rzek|widok|natur|lake|beach|hike|trek/i, "natura"],
    [/zakup|targ|bazar|market|sklep|shopping|mall/i, "zakupy"],
    [/koncert|teatr|show|spektakl|mecz|festiwal|wystaw|bilet/i, "wydarzenie"],
  ];
  const catFor = t => { for (const [re, c] of CAT_WORDS) if (re.test(t)) return c; return "inne"; };
  // czy warto proponować rozdzielenie
  const splittable = it => it && (parts(it.title).length >= 2 || parts(it.note).length >= 2);

  App.route(/^\/punkt\/([\w-]+)\/rozdziel$/, async ([id]) => {
    const it = await DB.get("planItems", id);
    if (!it) { location.replace("#/plan"); return ""; }
    const fromTitle = parts(it.title).map(row);
    const fromNote = parts(it.note).map(row);
    const start = fromTitle.length >= 2 ? fromTitle : fromNote.length ? fromNote : fromTitle;
    const rowHtml = r => `<div class="rd-row">
        <input type="time" name="t" value="${esc(r.time)}" aria-label="Godzina">
        <input name="n" maxlength="100" value="${esc(r.title)}" aria-label="Co" placeholder="np. Muzeum, kolacja">
        <button type="button" class="icon-btn rd-x" aria-label="Usuń wiersz">${I("close")}</button>
      </div>`;
    return {
      title: "Rozdziel na punkty",
      back: `#/punkt/${id}`,
      html: `
        <section class="tx-hero">
          <span class="tx-hero-ic" aria-hidden="true">${I("list", "")}</span>
          <div><h2>${esc(it.title)}</h2>
          <p>Każdy wiersz będzie osobnym punktem ${it.date ? `dnia ${App.fmtDay(it.date)}` : "w pomysłach"}. Wpisz godzinę, o której chcesz to zobaczyć – albo zostaw pustą.</p></div>
        </section>
        ${it.note ? `<div class="td-note rd-src">${I("info")}<div><b>Notatka</b><p class="small rd-note">${esc(it.note)}</p>
          ${fromNote.length ? `<button type="button" class="btn small" id="rd-note">${I("plus")} Dodaj z notatki (${fromNote.length})</button>` : ""}</div></div>` : ""}
        <form id="rd-form" class="form">
          <div class="rd-rows" id="rd-rows">${start.map(rowHtml).join("")}</div>
          <button type="button" class="btn wide" id="rd-add">${I("plus")} Dodaj wiersz</button>
          <label class="sw"><input type="checkbox" name="del" checked><span class="sw-ui" aria-hidden="true"></span><span>Usuń punkt „${esc(it.title.slice(0, 40))}${it.title.length > 40 ? "…" : ""}” po rozdzieleniu</span></label>
          <p class="f-hint">Miejsce${it.place ? ` („${esc(it.place)}”)` : ""} i dzień zostają takie same – zmienisz je potem w każdym punkcie. Punkty z godziną ułożą się według godzin.</p>
          <div class="f-actions"><button class="btn primary wide" type="submit">${I("check")} Utwórz punkty</button></div>
        </form>`,
      after(view) {
        const box = view.querySelector("#rd-rows"), f = view.querySelector("#rd-form");
        const bind = () => box.querySelectorAll(".rd-x").forEach(b => b.onclick = () => b.closest(".rd-row").remove());
        bind();
        view.querySelector("#rd-add").onclick = () => { box.insertAdjacentHTML("beforeend", rowHtml({ time: "", title: "" })); bind(); box.lastElementChild.querySelector("[name=n]").focus(); };
        const nb = view.querySelector("#rd-note");
        if (nb) nb.onclick = () => { box.insertAdjacentHTML("beforeend", fromNote.map(rowHtml).join("")); bind(); nb.remove(); };
        f.addEventListener("submit", async e => {
          e.preventDefault();
          const rows = [...box.querySelectorAll(".rd-row")].map(r => ({ time: r.querySelector("[name=t]").value, title: r.querySelector("[name=n]").value.trim() })).filter(r => r.title);
          if (!rows.length) { App.toast("Wpisz co najmniej jeden punkt"); return; }
          // kolejność: na miejscu oryginału (punkty bez godziny), z godziną – i tak według godziny
          const base = it.order ?? 0;
          let k = 0;
          for (const r of rows) {
            const rec = { tripId: it.tripId, date: it.date || "", time: it.date ? r.time : "", title: r.title.slice(0, 100), cat: catFor(r.title),
              place: it.place || "", order: base + (++k) / 100 };
            if (it.lat != null && it.lon != null) { rec.lat = it.lat; rec.lon = it.lon; }
            if (it.local) rec.local = it.local;
            await DB.put("planItems", rec);
          }
          if (f.del.checked) {
            // bilety przypięte do punktu przechodzą do pierwszego nowego punktu
            const first = (await DB.byIndex("planItems", "tripId", it.tripId)).find(x => x.order === base + 1 / 100 && x.title === rows[0].title.slice(0, 100));
            if (first) for (const x of await DB.byIndex("files", "segmentId", `p:${it.id}`)) await DB.put("files", { ...x, segmentId: `p:${first.id}` });
            await DB.del("planItems", it.id);
          }
          App.toast(`Utworzono ${rows.length} ${App.plural(rows.length, "punkt", "punkty", "punktów")}`);
          location.replace(`#/plan/${it.tripId}`);
        });
      },
    };
  });

  App.Divide = { parts, row, catFor, splittable };
})();
