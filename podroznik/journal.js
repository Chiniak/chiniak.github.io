/* Tripwillow – dziennik podróży.
   Trasy:
     #/dziennik/:tripId            lista dni (najnowsze na górze; w trakcie podróży na górze „Dziś”), pamiątka (HTML ze zdjęciami), tekst
     #/dziennik/:tripId/:data      dzień: nastrój, tekst (zapis sam w trakcie pisania), zdjęcia, „co było w planie”, strzałki dni
   Magazyny (db.js v3): journal { id, tripId, date, text, mood } – lekki (czyta go też service worker do przypomnienia o 21:00),
   journalPhotos { id, tripId, date, blob } – zdjęcia zmniejszone do 1600 px (App.resizeImage). Oba w kopii zapasowej, usuwane z podróżą. */
(function () {
  const { esc, plural } = App;
  const I = (n, c) => App.icon(n, c);
  const MOODS = [["5", "😍", "świetny"], ["4", "🙂", "dobry"], ["3", "😐", "taki sobie"], ["2", "😕", "słaby"], ["1", "😫", "ciężki"]];
  const moodOf = m => MOODS.find(x => x[0] === String(m)) || null;
  const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

  async function entry(tripId, date) {
    return (await DB.byIndex("journal", "tripId", tripId)).find(e => e.date === date) || null;
  }
  async function save(tripId, date, patch) {
    const cur = await entry(tripId, date);
    return DB.put("journal", { ...(cur || { tripId, date, text: "", mood: "" }), ...patch });
  }
  // podsumowanie podróży: ile dni opisanych, ile zdjęć (do wiersza w podróży i karty na ekranie Dziś)
  async function summary(tripId) {
    const [es, ps] = await Promise.all([DB.byIndex("journal", "tripId", tripId), DB.byIndex("journalPhotos", "tripId", tripId)]);
    const days = new Set(es.filter(e => (e.text || "").trim() || e.mood).map(e => e.date).concat(ps.map(p => p.date)));
    return { days: days.size, photos: ps.length, entries: es };
  }

  // dni, które można opisać: od startu do dziś (albo do końca podróży)
  function daysOf(trip) {
    const last = trip.end < App.todayStr() ? trip.end : App.todayStr();
    const out = [];
    for (let d = trip.start; d <= last; d = App.addDays(d, 1)) out.push(d);
    return out;
  }

  /* ================= LISTA DNI ================= */
  App.route(/^\/dziennik\/([\w-]+)$/, async ([id]) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/podroze"); return ""; }
    const [es, ps] = await Promise.all([DB.byIndex("journal", "tripId", id), DB.byIndex("journalPhotos", "tripId", id)]);
    const today = App.todayStr(), total = App.dayDiff(trip.start, trip.end) + 1;
    const days = daysOf(trip).reverse();
    const byDay = d => ({ e: es.find(x => x.date === d), ph: ps.filter(p => p.date === d).sort((a, b) => (a.created || "").localeCompare(b.created || "")) });
    const urls = [];
    const thumb = p => { const u = URL.createObjectURL(p.blob); urls.push(u); return `<img src="${u}" alt="" loading="lazy">`; };
    const written = days.filter(d => { const { e, ph } = byDay(d); return (e && ((e.text || "").trim() || e.mood)) || ph.length; }).length;

    const card = d => {
      const { e, ph } = byDay(d), m = e && moodOf(e.mood), txt = e && (e.text || "").trim();
      const n = App.dayDiff(trip.start, d) + 1;
      const empty = !txt && !m && !ph.length;
      return `
        <a class="jr-day${empty ? " is-empty" : ""}${d === today ? " is-today" : ""}" href="#/dziennik/${id}/${d}">
          <span class="jr-day-h"><span class="jr-n">${d === today ? "Dziś · " : ""}dzień ${n}</span><b>${App.fmtDayLong(d)}</b>${m ? `<span class="jr-mood" title="${m[2]}">${m[1]}</span>` : ""}</span>
          ${txt ? `<span class="jr-txt">${esc(txt)}</span>` : empty ? `<span class="jr-add">${I("plus", "sm")}<span>${d === today ? "Jak minął dzień? Dopisz" : "Dopisz wspomnienie"}</span></span>` : ""}
          ${ph.length ? `<span class="jr-thumbs">${ph.slice(0, 4).map(thumb).join("")}${ph.length > 4 ? `<span class="jr-more">+${ph.length - 4}</span>` : ""}</span>` : ""}
        </a>`;
    };

    const html = !days.length
      ? `${App.empty("🧭", "Dziennik podróży", `Pierwszy wpis dodasz ${App.fmtDayLong(trip.start)} – w dniu wyjazdu. Tekst, nastrój i zdjęcia z każdego dnia, wszystko w telefonie.`)}`
      : `
      <header class="jr-head">
        <h2>${esc(trip.name)}</h2>
        <p>${written} ${plural(written, "dzień opisany", "dni opisane", "dni opisanych")} z ${total} · ${ps.length} ${plural(ps.length, "zdjęcie", "zdjęcia", "zdjęć")}</p>
      </header>
      <div class="jr-list">${days.map(card).join("")}</div>
      ${written ? `<div class="list jr-tools">
        <button type="button" class="li" id="jr-html"><span class="li-ico">${I("download")}</span><span class="li-main"><b>Zapisz dziennik ze zdjęciami</b><small>jeden plik HTML – do zachowania albo wysłania</small></span>${I("chev")}</button>
        <button type="button" class="li" id="jr-text"><span class="li-ico">${I("copy")}</span><span class="li-main"><b>Udostępnij jako tekst</b><small>bez zdjęć – do wiadomości albo notatek</small></span>${I("chev")}</button>
      </div>` : ""}`;

    return {
      title: "Dziennik",
      back: `#/podroze/${id}`,
      html,
      after(v) {
        const asText = () => [`${trip.name} (${App.fmtRange(trip.start, trip.end)})`, ""].concat(daysOf(trip).flatMap(d => {
          const { e } = byDay(d), m = e && moodOf(e.mood), txt = e && (e.text || "").trim();
          return txt || m ? [`— ${App.fmtDayLong(d)} (dzień ${App.dayDiff(trip.start, d) + 1})${m ? " " + m[1] : ""}`, txt || "", ""] : [];
        })).join("\n").trim();
        const tb = v.querySelector("#jr-text");
        if (tb) tb.onclick = async () => {
          const text = asText();
          try { if (navigator.share) { await navigator.share({ title: trip.name, text }); return; } } catch (e) { if (e.name === "AbortError") return; }
          try { await navigator.clipboard.writeText(text); App.toast("Skopiowano dziennik"); } catch (e) { App.toast("Nie udało się skopiować"); }
        };
        const hb = v.querySelector("#jr-html");
        if (hb) hb.onclick = async () => {
          hb.disabled = true;
          try {
            const file = await exportHtml(trip, es, ps);
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              try { await navigator.share({ files: [file], title: trip.name }); return; } catch (e) { if (e.name === "AbortError") return; }
            }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            App.toast("Zapisano plik dziennika");
          } finally { hb.disabled = false; }
        };
      },
      cleanup() { urls.forEach(u => URL.revokeObjectURL(u)); },
    };
  });

  // pamiątka: jeden plik HTML, zdjęcia wbudowane (zmniejszone do 1200 px), czytelny w każdej przeglądarce
  async function exportHtml(trip, es, ps) {
    const days = daysOf(trip);
    let body = "";
    for (const d of days) {
      const e = es.find(x => x.date === d), m = e && moodOf(e.mood), txt = e && (e.text || "").trim();
      const ph = ps.filter(p => p.date === d).sort((a, b) => (a.created || "").localeCompare(b.created || ""));
      if (!txt && !m && !ph.length) continue;
      const imgs = [];
      for (const p of ph) imgs.push(await App.Backup.blobToDataUrl(await App.resizeImage(p.blob, 1200, 0.78)));
      body += `<section><h2><small>Dzień ${App.dayDiff(trip.start, d) + 1}</small>${esc(App.fmtDayLong(d))}${m ? ` <span>${m[1]}</span>` : ""}</h2>
        ${txt ? txt.split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, "<br>")}</p>`).join("") : ""}
        ${imgs.map(src => `<img src="${src}" alt="">`).join("")}</section>`;
    }
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(trip.name)} – dziennik</title><style>
body{margin:0;background:#F7F8F6;color:#202B2B;font:17px/1.6 Georgia,serif}main{max-width:720px;margin:0 auto;padding:32px 18px 64px}
header{margin-bottom:32px}header h1{font-weight:500;font-size:36px;line-height:1.15;margin:0}header p{color:#5F6C68;font-family:system-ui,sans-serif;font-size:14px}
section{margin:0 0 40px}h2{font-weight:500;font-size:24px;margin:0 0 10px}h2 small{display:block;font:600 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#177670}
img{display:block;width:100%;height:auto;border-radius:14px;margin:14px 0}
@media (prefers-color-scheme:dark){body{background:#101615;color:#E6ECEA}header p{color:#93A19E}h2 small{color:#5CCFC6}}
</style></head><body><main><header><h1>${esc(trip.name)}</h1><p>${esc([trip.destination, App.fmtRange(trip.start, trip.end)].filter(Boolean).join(" · "))} · dziennik z aplikacji Tripwillow</p></header>
${body}</main></body></html>`;
    const name = `dziennik-${(trip.name || "podroz").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "podroz"}.html`;
    return new File([html], name, { type: "text/html" });
  }

  /* ================= DZIEŃ ================= */
  App.route(/^\/dziennik\/([\w-]+)\/([\d-]+)$/, async ([id, date]) => {
    const trip = await DB.get("trips", id);
    if (!trip || !isDay(date)) { location.replace(trip ? `#/dziennik/${id}` : "#/podroze"); return ""; }
    const [e, ps, items, segs, bud] = await Promise.all([entry(id, date), DB.byIndex("journalPhotos", "tripId", id), DB.byIndex("planItems", "tripId", id),
      DB.byIndex("segments", "tripId", id), App.Budget ? App.Budget.load(id).catch(() => null) : null]);
    const photos = ps.filter(p => p.date === date).sort((a, b) => (a.created || "").localeCompare(b.created || ""));
    const n = App.dayDiff(trip.start, date) + 1, total = App.dayDiff(trip.start, trip.end) + 1;
    const last = trip.end < App.todayStr() ? trip.end : App.todayStr();
    const prev = date > trip.start ? App.addDays(date, -1) : null, next = date < last ? App.addDays(date, 1) : null;
    const arrow = (d, ico, label) => d ? `<a class="icon-btn dz-arrow" href="#/dziennik/${id}/${d}" aria-label="${label}: ${App.fmtDay(d)}">${I(ico)}</a>`
      : `<span class="icon-btn dz-arrow off" aria-hidden="true">${I(ico)}</span>`;

    // co było w planie: odcinki i punkty z tego dnia, wydatki
    const P = App.Plan;
    const evs = P ? P.segEvents(segs).filter(x => x.at.slice(0, 10) === date) : [];
    const its = items.filter(i => i.date === date).sort(P ? P.byOrder : () => 0);
    const facts = evs.map(x => [App.time(x.at), x.ico || x.icon, x.title]).concat(its.map(i => [i.time || "", P ? P.catOf(i).icon : "", i.title]))
      .sort((a, b) => (a[0] || "99").localeCompare(b[0] || "99"));
    const spent = bud ? bud.items.filter(i => i.date === date).reduce((s, i) => s + (i.home || 0), 0) : 0;
    const urls = [];
    const ph = p => { const u = URL.createObjectURL(p.blob); urls.push(u); return `<button type="button" class="jr-ph" data-ph="${p.id}" aria-label="Zdjęcie – pokaż"><img src="${u}" alt=""></button>`; };
    const m = e && e.mood;

    const html = `
      <header class="dz-head jr-dhead">
        <div class="dz-day">
          ${arrow(prev, "back", "Poprzedni dzień")}
          <div class="dz-day-t"><span class="dz-n">dzień ${n} z ${total}</span><h2>${App.fmtDayLong(date)}</h2></div>
          ${arrow(next, "chev", "Następny dzień")}
        </div>
      </header>
      <div class="jr-moods" role="radiogroup" aria-label="Jaki był dzień?">${MOODS.map(([k, emo, label]) => `
        <label class="jr-mood-opt"><input type="radio" name="mood" value="${k}" ${String(m) === k ? "checked" : ""}><span title="${label}"><b aria-hidden="true">${emo}</b><small>${label}</small></span></label>`).join("")}
      </div>
      <label class="jr-text"><span class="sr">Wspomnienia z dnia</span>
        <textarea id="jr-txt" rows="8" placeholder="Co dziś było najlepsze? Gdzie jedliście, kogo spotkaliście, co Was zaskoczyło…">${esc(e ? e.text : "")}</textarea></label>
      <p class="jr-saved" id="jr-saved" aria-live="polite">${e && e.updated ? "Zapisane" : ""}</p>
      <div class="sec-h"><h2 class="section">Zdjęcia</h2>${photos.length ? `<span class="chip">${photos.length}</span>` : ""}</div>
      <div class="jr-photos">${photos.map(ph).join("")}
        <label class="jr-ph jr-ph-add">${I("camera")}<span>Dodaj zdjęcia</span><input type="file" id="jr-file" accept="image/*" multiple hidden></label>
      </div>
      ${facts.length || spent ? `
        <details class="jr-facts"${(e && (e.text || "").trim()) ? "" : " open"}>
          <summary>${I("plan", "sm")}<span>Co było w planie – podpowiedź</span>${I("chev", "pl-sum-chev")}</summary>
          <ul>${facts.map(([t, ic, title]) => `<li><b>${t || "–"}</b><span class="dz-ico" aria-hidden="true">${ic}</span><span>${esc(title)}</span></li>`).join("")}
            ${spent ? `<li><b>${I("wallet", "sm")}</b><span></span><span>Wydano ${App.Budget.money(spent, bud.home)}</span></li>` : ""}</ul>
        </details>` : ""}
      <div class="jr-viewer" id="jr-viewer" hidden role="dialog" aria-label="Zdjęcie">
        <img id="jr-big" alt="">
        <div class="jr-viewer-bar">
          <button type="button" class="btn" id="jr-close">${I("close", "sm")} Zamknij</button>
          <button type="button" class="btn" id="jr-del">${I("trash", "sm")} Usuń zdjęcie</button>
        </div>
      </div>`;

    let tm = null, pending = null;
    const flush = async () => { if (pending) { const p = pending; pending = null; await save(id, date, p); } };
    return {
      title: "Dziennik",
      back: `#/dziennik/${id}`,
      html,
      after(v) {
        const $ = s => v.querySelector(s);
        const ta = $("#jr-txt"), saved = $("#jr-saved");
        ta.addEventListener("input", () => {
          pending = { ...(pending || {}), text: ta.value };
          saved.textContent = "Zapisuję…";
          clearTimeout(tm);
          tm = setTimeout(async () => { await flush(); if (saved.isConnected) saved.textContent = "Zapisane"; }, 700);
        });
        ta.addEventListener("blur", () => { clearTimeout(tm); flush().then(() => { if (saved.isConnected) saved.textContent = "Zapisane"; }); });
        v.querySelectorAll("input[name=mood]").forEach(r => r.onchange = async () => { await save(id, date, { mood: r.value }); saved.textContent = "Zapisane"; });

        $("#jr-file").onchange = async ev => {
          const files = [...ev.target.files].filter(f => /^image\//.test(f.type));
          ev.target.value = "";
          if (!files.length) return;
          App.toast(`Dodaję ${files.length} ${plural(files.length, "zdjęcie", "zdjęcia", "zdjęć")}…`);
          await flush();
          for (const f of files) {
            const blob = await App.resizeImage(f, 1600, 0.82).catch(() => f);
            await DB.put("journalPhotos", { tripId: id, date, blob });
          }
          await save(id, date, {}); // data zmiany wpisu – kopia zapasowa wie, że są nowe dane
          App.render();
        };

        // podgląd zdjęcia na pełnym ekranie
        const viewer = $("#jr-viewer"), big = $("#jr-big");
        let cur = null;
        v.querySelectorAll("[data-ph]").forEach(b => b.onclick = () => { cur = b.dataset.ph; big.src = b.querySelector("img").src; viewer.hidden = false; $("#jr-close").focus(); });
        $("#jr-close").onclick = () => { viewer.hidden = true; cur = null; };
        $("#jr-del").onclick = async () => {
          if (!cur || !confirm("Usunąć to zdjęcie z dziennika?")) return;
          await DB.del("journalPhotos", cur);
          App.toast("Usunięto zdjęcie");
          App.render();
        };
      },
      cleanup() { clearTimeout(tm); flush(); urls.forEach(u => URL.revokeObjectURL(u)); },
    };
  });

  App.Journal = { entry, save, summary, MOODS, moodOf };
})();
