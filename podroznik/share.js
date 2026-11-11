/* Podróżnik – etap 10: wspólna podróż bez serwera (namiastka „collaboration” z Wanderlog).
   Trasy:
     #/udostepnij/:tripId   wyślij podróż (plik .json) albo plan jako tekst do komunikatora
     #/udostepnij           otwórz plik podróży od kogoś – dołącza ją albo aktualizuje
   Plik podróży: { app: "podroznik", kind: "trip", format: 1, exportedAt, from, stores: { trips: [t], segments, planItems, packItems, expenses, files? } }
   Scalanie: rekordy o tym samym id – zostaje nowszy (pole "updated"); nowe są dodawane. Usunięcia się nie przenoszą.
   Dane nie przechodzą przez żaden serwer – plik idzie tak, jak go wyślesz (WhatsApp, mail, Bluetooth…). */
(function () {
  const { esc, plural } = App;
  const STORES = ["segments", "planItems", "packItems", "expenses"];
  const slug = s => String(s || "podroz").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "podroz";

  async function buildPackage(tripId, { withFiles }) {
    const trip = await DB.get("trips", tripId);
    const out = { app: "podroznik", kind: "trip", format: 1, exportedAt: new Date().toISOString(), stores: { trips: [trip] } };
    for (const st of STORES) out.stores[st] = await DB.byIndex(st, "tripId", tripId);
    if (withFiles) {
      const files = await DB.byIndex("files", "tripId", tripId);
      out.stores.files = await Promise.all(files.map(async f => {
        if (!(f.blob instanceof Blob)) return f;
        const { blob, ...rest } = f;
        return { ...rest, blobData: await App.Backup.blobToDataUrl(blob), blobName: blob.name || f.name || "", blobType: blob.type || f.mime || "" };
      }));
    }
    return out;
  }

  async function mergePackage(data) {
    if (!data || data.app !== "podroznik" || data.kind !== "trip" || !data.stores || !Array.isArray(data.stores.trips) || !data.stores.trips[0])
      throw new Error("To nie jest plik podróży z Podróżnika.");
    if (data.format > 1) throw new Error("Plik z nowszej wersji aplikacji – zaktualizuj aplikację.");
    const tripId = data.stores.trips[0].id;
    const res = { added: 0, updated: 0, kept: 0, tripId, isNew: !(await DB.get("trips", tripId)) };
    for (const st of ["trips", ...STORES, "files"]) {
      for (const r of data.stores[st] || []) {
        if (!r || !r.id || (st !== "trips" && r.tripId !== tripId)) continue; // tylko rekordy tej podróży
        const cur = await DB.get(st, r.id);
        if (cur && (cur.updated || "") >= (r.updated || "")) { res.kept++; continue; }
        let rec = r;
        if (r.blobData) {
          const { blobData, blobName, blobType, ...rest } = r;
          const blob = App.Backup.dataUrlToBlob(blobData);
          rec = { ...rest, blob: new File([blob], blobName || rest.name || "bilet", { type: blobType || blob.type }) };
        }
        await DB.putRaw(st, rec);
        cur ? res.updated++ : res.added++;
      }
    }
    return res;
  }

  // czytelny plan do wysłania w komunikatorze
  async function planText(tripId) {
    const t = await DB.get("trips", tripId);
    const [segs, items] = await Promise.all([DB.byIndex("segments", "tripId", tripId), DB.byIndex("planItems", "tripId", tripId)]);
    const days = new Map();
    const push = (day, at, line) => { if (!days.has(day)) days.set(day, []); days.get(day).push([at, line]); };
    for (const s of segs) {
      if (!s.depart) continue;
      const T = App.Trips.typeOf(s);
      if (s.type === "nocleg") {
        push(s.depart.slice(0, 10), s.depart, `${T.icon} ${App.time(s.depart)} zameldowanie: ${s.name || "nocleg"}${s.address ? ` (${s.address})` : ""}`);
        if (s.arrive) push(s.arrive.slice(0, 10), s.arrive, `🔑 ${App.time(s.arrive)} wymeldowanie: ${s.name || "nocleg"}`);
      } else push(s.depart.slice(0, 10), s.depart, `${T.icon} ${App.time(s.depart)}${s.arrive ? `–${App.time(s.arrive)}` : ""} ${s.from || "?"} → ${s.to || "?"}${s.number ? ` (${s.number})` : ""}`);
    }
    const CATS = App.Plan.CATS;
    items.filter(i => i.date).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((i, k) =>
      push(i.date, i.time ? `${i.date}T${i.time}` : `${i.date}T99:${String(k).padStart(4, "0")}`, `${(CATS[i.cat] || CATS.inne).icon} ${i.time ? i.time + " " : ""}${i.title}${i.place && !/^https?:/i.test(i.place) ? ` – ${i.place}` : ""}`));
    let txt = `🧳 ${t.name}${t.destination ? ` · ${t.destination}` : ""}\n📅 ${App.fmtRange(t.start, t.end)}\n`;
    for (const day of [...days.keys()].sort()) {
      txt += `\n${App.fmtDayLong(day)}\n` + days.get(day).sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1]).join("\n") + "\n";
    }
    const ideas = items.filter(i => !i.date);
    if (ideas.length) txt += `\n💡 Pomysły\n${ideas.map(i => `• ${i.title}`).join("\n")}\n`;
    return txt.trim();
  }

  /* ================= WYSYŁANIE ================= */
  App.route(/^\/udostepnij\/([\w-]+)$/, async ([id]) => {
    const t = await DB.get("trips", id);
    if (!t) { location.replace("#/podroze"); return ""; }
    const nFiles = (await DB.byIndex("files", "tripId", id)).length;
    return {
      title: "Udostępnij podróż",
      back: `#/podroze/${id}`,
      html: `
        <div class="card">
          <h2>📤 Wspólna podróż</h2>
          <p class="small">Wyślij plik podróży osobie, z którą jedziesz (WhatsApp, mail, Messenger…). U niej: <b>Podróże → 📥 Otwórz podróż od kogoś</b>.
            Gdy ktoś coś zmieni i odeśle plik – zmiany dołączą się do Twojej podróży (nowsza wersja wygrywa).</p>
          ${nFiles ? `<label class="pk-toggle"><input type="checkbox" id="sh-files"> Dołącz bilety i zdjęcia (${nFiles}) – plik będzie większy</label>` : ""}
          <button type="button" class="btn primary wide" id="sh-file" style="margin-top:8px">📤 Wyślij podróż (plik)</button>
        </div>
        <div class="card" style="margin-top:12px">
          <h2>📝 Plan jako tekst</h2>
          <p class="small muted">Do wklejenia w wiadomość – loty, noclegi i plan dnia po dniu.</p>
          <button type="button" class="btn wide" id="sh-text">📝 Wyślij plan jako tekst</button>
        </div>
        <p class="muted small">Dane nie przechodzą przez żaden serwer. Usunięcie czegoś u jednej osoby nie usuwa tego u drugiej.</p>`,
      after(view) {
        view.querySelector("#sh-file").onclick = async () => {
          const box = view.querySelector("#sh-files");
          const pkg = await buildPackage(id, { withFiles: !!(box && box.checked) });
          const file = new File([JSON.stringify(pkg)], `podroz-${slug(t.name)}.json`, { type: "application/json" });
          const r = await App.Backup.deliver(file);
          if (r !== "cancel") App.toast(r === "shared" ? "Wysłano" : "Zapisano plik – wyślij go dalej");
        };
        view.querySelector("#sh-text").onclick = async () => {
          const text = await planText(id);
          if (navigator.share) { try { await navigator.share({ title: t.name, text }); return; } catch (e) { if (e.name === "AbortError") return; } }
          try { await navigator.clipboard.writeText(text); App.toast("Skopiowano plan – wklej w wiadomości"); } catch (e) { prompt("Skopiuj plan:", text); }
        };
      },
    };
  });

  /* ================= ODBIÓR ================= */
  App.route(/^\/udostepnij$/, async () => ({
    title: "Podróż od kogoś",
    back: "#/podroze",
    html: `
      <div class="card">
        <h2>📥 Otwórz plik podróży</h2>
        <p class="small">Wybierz plik <b>podroz-….json</b>, który ktoś Ci wysłał z Podróżnika. Nowa podróż zostanie dodana,
          a jeśli już ją masz – dołączą się zmiany (nowsza wersja każdej pozycji wygrywa).</p>
        <label class="btn primary wide">📂 Wybierz plik<input type="file" id="sh-in" accept="application/json,.json" hidden></label>
        <p class="error" id="err" hidden></p>
      </div>`,
    after(view) {
      view.querySelector("#sh-in").onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        const err = view.querySelector("#err");
        try {
          let data;
          try { data = JSON.parse(await file.text()); } catch (x) { throw new Error("To nie jest plik podróży (zły format)."); }
          if (data && data.app === "podroznik" && data.kind !== "trip") throw new Error("To jest kopia zapasowa – otwórz ją w Ustawienia → Kopia zapasowa.");
          const r = await mergePackage(data);
          App.toast(r.isNew ? "Dodano podróż" : r.added + r.updated ? `Zaktualizowano: ${r.added + r.updated} ${plural(r.added + r.updated, "zmiana", "zmiany", "zmian")}` : "Bez zmian – masz już najnowszą wersję");
          location.replace(`#/podroze/${r.tripId}`);
        } catch (x) { err.textContent = x.message; err.hidden = false; }
      };
    },
  }));

  App.Share = { buildPackage, mergePackage, planText };
})();
