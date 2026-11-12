/* Podróżnik – karty dla kierowcy i rozmówki (Chiny, Laos, Wietnam, Tajlandia).
   Trasa:
     #/karty/:tripId                 noclegi i punkty planu z położeniem + rozmówki
     #/karty/:tripId?k=s:ID / p:ID   od razu karta noclegu (segment) / punktu planu na pełnym ekranie
     #/karty/:tripId?j=th            rozmówki w wybranym języku
   Karta: nazwa i adres w lokalnym piśmie (do pokazania taksówkarzowi) + „Proszę mnie tu zawieźć”.
   Lokalny adres – wyszukiwarka OpenStreetMap (Nominatim, reverse) w języku kraju; zapisany w rekordzie
   (pole `local`), więc karta działa potem bez internetu. Zwroty – stała lista poniżej (wymowa uproszczona). */
(function () {
  const { esc, plural } = App;
  const hasXY = p => p && p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon);

  // język lokalnego adresu wg kraju (kod ISO z wyszukiwarki)
  const LANG_OF = { cn: "zh", tw: "zh", hk: "zh", mo: "zh", sg: "zh", la: "lo", vn: "vi", th: "th", jp: "ja", kr: "ko", kh: "km", mm: "my",
    ru: "ru", ua: "uk", by: "be", bg: "bg", rs: "sr", mk: "mk", gr: "el", ge: "ka", am: "hy", il: "he", eg: "ar", ma: "ar", ae: "ar", jo: "ar", ir: "fa", np: "ne", lk: "si", mn: "mn" };
  const BIG_ENDIAN = new Set(["zh", "ja", "ko"]); // adres od województwa do numeru domu

  /* ---------- rozmówki ---------- */
  const LANGS = {
    zh: { name: "中文", pl: "chiński", flag: "🇨🇳" },
    th: { name: "ไทย", pl: "tajski", flag: "🇹🇭" },
    vi: { name: "Tiếng Việt", pl: "wietnamski", flag: "🇻🇳" },
    lo: { name: "ລາວ", pl: "laotański", flag: "🇱🇦" },
  };
  // [klucz, tekst polski, { język: [zapis lokalny, wymowa] }]
  const PHRASES = [
    ["take", "Proszę mnie zawieźć pod ten adres", {
      zh: ["请带我去这个地址", "qǐng dài wǒ qù zhège dìzhǐ"], th: ["กรุณาไปที่อยู่นี้", "ka-ru-naa pai thii-yuu nii"],
      vi: ["Làm ơn đưa tôi đến địa chỉ này", ""], lo: ["ກະລຸນາໄປບ່ອນນີ້", "ka-lu-naa pai bòn nii"] }],
    ["hello", "Dzień dobry", { zh: ["你好", "nǐ hǎo"], th: ["สวัสดีครับ / ค่ะ", "sa-wat-dii khrap (m.) / kha (k.)"], vi: ["Xin chào", ""], lo: ["ສະບາຍດີ", "sa-baai-dii"] }],
    ["thanks", "Dziękuję", { zh: ["谢谢", "xièxie"], th: ["ขอบคุณครับ / ค่ะ", "khop-khun khrap / kha"], vi: ["Cảm ơn", ""], lo: ["ຂອບໃຈ", "khop jai"] }],
    ["sorry", "Przepraszam", { zh: ["不好意思", "bù hǎoyìsi"], th: ["ขอโทษครับ / ค่ะ", "khor-thoot khrap / kha"], vi: ["Xin lỗi", ""], lo: ["ຂໍໂທດ", "khor thoot"] }],
    ["price", "Ile to kosztuje?", { zh: ["多少钱？", "duōshao qián?"], th: ["เท่าไหร่", "thao-rai?"], vi: ["Bao nhiêu tiền?", ""], lo: ["ລາຄາເທົ່າໃດ", "laa-khaa thao-dai?"] }],
    ["expensive", "Za drogo", { zh: ["太贵了", "tài guì le"], th: ["แพงเกินไป", "phaeng koen pai"], vi: ["Đắt quá", ""], lo: ["ແພງໂພດ", "phaeng phoot"] }],
    ["meter", "Proszę włączyć taksometr", { zh: ["请打表", "qǐng dǎ biǎo"], th: ["เปิดมิเตอร์ด้วยครับ / ค่ะ", "poet mi-toe duay khrap / kha"], vi: ["Làm ơn bật đồng hồ tính tiền", ""] }],
    ["stop", "Proszę się tu zatrzymać", { zh: ["请在这里停车", "qǐng zài zhèlǐ tíngchē"], th: ["จอดตรงนี้ครับ / ค่ะ", "jot trong nii khrap / kha"], vi: ["Dừng ở đây", ""], lo: ["ຈອດຢູ່ນີ້", "jot yuu nii"] }],
    ["bill", "Proszę o rachunek", { zh: ["买单", "mǎidān"], th: ["เช็คบิลครับ / ค่ะ", "chek bin khrap / kha"], vi: ["Tính tiền", ""], lo: ["ເກັບເງິນແດ່", "kep ngoen dae"] }],
    ["notspicy", "Nie ostre, proszę", { zh: ["不要辣", "bú yào là"], th: ["ไม่เผ็ด", "mai phet"], vi: ["Không cay", ""], lo: ["ບໍ່ເຜັດ", "bor phet"] }],
    ["peanuts", "Mam alergię na orzeszki ziemne", { zh: ["我对花生过敏", "wǒ duì huāshēng guòmǐn"], th: ["แพ้ถั่วลิสง", "phae thua-li-song"], vi: ["Tôi bị dị ứng đậu phộng (lạc)", ""], lo: ["ແພ້ຖົ່ວດິນ", "phae thua-din"] }],
    ["toilet", "Gdzie jest toaleta?", { zh: ["厕所在哪里？", "cèsuǒ zài nǎlǐ?"], th: ["ห้องน้ำอยู่ที่ไหน", "hong-naam yuu thii-nai?"], vi: ["Nhà vệ sinh ở đâu?", ""], lo: ["ຫ້ອງນ້ຳຢູ່ໃສ", "hong-naam yuu sai?"] }],
    ["dontknow", "Nie rozumiem", { zh: ["我听不懂", "wǒ tīng bu dǒng"], th: ["ไม่เข้าใจ", "mai khao-jai"], vi: ["Tôi không hiểu", ""], lo: ["ບໍ່ເຂົ້າໃຈ", "bor khao-jai"] }],
    ["doctor", "Potrzebuję lekarza", { zh: ["我需要医生", "wǒ xūyào yīshēng"], th: ["ต้องการหมอ", "tong-kaan mor"], vi: ["Tôi cần bác sĩ", ""], lo: ["ຕ້ອງການໝໍ", "tong-kaan mor"] }],
  ];
  const takeMe = lang => { const p = PHRASES[0][2][lang]; return p ? p[0] : ""; };

  /* ---------- lokalny adres (internet, raz – potem offline) ---------- */
  function localAddress(a, lang, name) {
    const pick = (...k) => k.map(x => a[x]).find(Boolean) || "";
    const road = [a.road, a.house_number].filter(Boolean);
    if (BIG_ENDIAN.has(lang)) {
      const parts = [pick("state", "province", "region"), pick("city", "town", "municipality", "county"), pick("city_district", "district", "county"),
        pick("suburb", "quarter", "neighbourhood"), (a.road || "") + (a.house_number ? `${a.house_number}号` : "")];
      return parts.filter((p, i) => p && parts.indexOf(p) === i && p !== name).join("");
    }
    const parts = [road.reverse().join(" "), pick("suburb", "quarter", "neighbourhood", "village"), pick("city_district", "district", "county"),
      pick("city", "town", "municipality"), pick("state", "province")];
    return parts.filter((p, i) => p && parts.indexOf(p) === i && p !== name).join(", ");
  }
  async function localize(store, rec) {
    const osm = App.Places.osm;
    const at = { lat: rec.lat, lon: rec.lon };
    const en = await osm("reverse", { lat: rec.lat, lon: rec.lon, zoom: "18", addressdetails: "1", "accept-language": "en" });
    const cc = en && en.address ? String(en.address.country_code || "").toLowerCase() : "";
    const lang = LANG_OF[cc] || null;
    let local = { ...at, cc, lang, at: Date.now() };
    if (lang) {
      const x = await osm("reverse", { lat: rec.lat, lon: rec.lon, zoom: "18", addressdetails: "1", namedetails: "1", "accept-language": lang });
      const nd = (x && x.namedetails) || {};
      const name = nd[`name:${lang}`] || nd.name || "";
      local = { ...local, name, addr: localAddress((x && x.address) || {}, lang, name) };
    }
    const cur = await DB.get(store, rec.id);
    if (cur) await DB.putRaw(store, { ...cur, local });
    return local;
  }
  const fresh = r => r.local && r.local.lat === r.lat && r.local.lon === r.lon;

  /* ---------- karta na pełnym ekranie ---------- */
  const xIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  let wake = null;
  const lockScreen = async () => { if (navigator.wakeLock) { try { wake = await navigator.wakeLock.request("screen"); } catch (e) { /* brak zgody */ } } };
  const unlockScreen = () => { if (wake) { wake.release().catch(() => {}); wake = null; } };
  function overlay(view, html) {
    close(view);
    const d = document.createElement("div");
    d.className = "tv tx-full"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
    d.innerHTML = `<div class="tv-top"><button type="button" class="tv-btn" id="tx-close" aria-label="Zamknij">${xIcon}</button></div>${html}`;
    view.appendChild(d);
    d.querySelector("#tx-close").onclick = () => close(view);
    lockScreen();
    return d;
  }
  function close(view) { const o = view.querySelector(".tx-full"); if (o) o.remove(); unlockScreen(); }

  function cardHtml(e) {
    const L0 = e.rec.local || {};
    const lat = (+e.rec.lat).toFixed(6), lon = (+e.rec.lon).toFixed(6);
    const localTxt = L0.lang ? `
        <div class="tx-ask" lang="${L0.lang}" translate="no">${esc(takeMe(L0.lang) || "")}</div>
        ${L0.name ? `<div class="tx-name" lang="${L0.lang}" translate="no">${esc(L0.name)}</div>` : ""}
        ${L0.addr ? `<div class="tx-addr" lang="${L0.lang}" translate="no">${esc(L0.addr)}</div>` : ""}` : "";
    return `
      <div class="tx-body">
        ${e.rec.photo && e.rec.photo.data ? `<img class="tx-photo" src="${e.rec.photo.data}" alt="">` : ""}
        ${localTxt || `<div class="tx-name">${esc(e.title)}</div>`}
        <div class="tx-latin">
          ${localTxt ? `<b>${esc(e.title)}</b>` : ""}
          ${e.addr && e.addr !== e.title ? `<span>${esc(e.addr)}</span>` : ""}
          <span class="tx-xy" translate="no">${lat}, ${lon}</span>
        </div>
        ${!L0.lang && !e.rec.local ? `<p class="tx-note">Lokalny adres pojawi się po „Przygotuj karty” (internet).</p>` : ""}
        ${e.rec.local && !L0.lang ? `<p class="tx-note">W tym kraju pismo jest łacińskie – pokaż nazwę i adres powyżej.</p>` : ""}
      </div>
      <div class="tv-foot">
        <a class="tv-link" href="${esc(App.mapsUrl(`${lat},${lon}`))}" target="_blank" rel="noopener">🧭 Nawiguj</a>
        <a class="tv-link" href="${esc(e.href)}">Szczegóły</a>
      </div>`;
  }
  function phraseHtml(p, lang) {
    const [loc, pron] = p[2][lang];
    return `<div class="tx-body"><div class="tx-name tx-phrase" lang="${lang}" translate="no">${esc(loc)}</div>
      ${pron ? `<div class="tx-pron" translate="no">${esc(pron)}</div>` : ""}<div class="tx-latin"><b>${esc(p[1])}</b></div></div>`;
  }

  /* ================= EKRAN ================= */
  App.route(/^\/karty\/([\w-]+)$/, async ([id], q) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/podroze"); return ""; }
    const [items, segs] = await Promise.all([DB.byIndex("planItems", "tripId", id), DB.byIndex("segments", "tripId", id)]);
    const entries = [];
    segs.filter(s => s.type === "nocleg").sort((a, b) => String(a.depart).localeCompare(String(b.depart))).forEach(s => entries.push({
      key: `s:${s.id}`, store: "segments", rec: s, icon: "🏨", title: s.name || "Nocleg", addr: s.address || "",
      when: s.depart ? App.fmtDay(s.depart) : "", href: `#/odcinek/${s.id}`, group: "Noclegi" }));
    items.slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.order ?? 0) - (b.order ?? 0)).forEach(i => entries.push({
      key: `p:${i.id}`, store: "planItems", rec: i, icon: i.date ? "📍" : "💡", title: i.title, addr: i.place && !/^https?:/i.test(i.place) ? i.place : "",
      when: i.date ? App.fmtDay(i.date) : "pomysł", href: `#/punkt/${i.id}`, group: i.date ? "Plan" : "Pomysły" }));
    const located = entries.filter(e => hasXY(e.rec));
    const noXY = entries.filter(e => !hasXY(e.rec)).length;
    const todo = located.filter(e => !fresh(e.rec));

    // języki rozmówek: z kart podróży, inaczej wszystkie
    const tripLangs = [...new Set(located.map(e => e.rec.local && e.rec.local.lang).filter(l => LANGS[l]))];
    const lang = LANGS[q.j] ? q.j : tripLangs[0] || "zh";
    const order = [...tripLangs, ...Object.keys(LANGS).filter(l => !tripLangs.includes(l))];

    const row = e => {
      const L0 = e.rec.local;
      const loc = L0 && L0.lang && fresh(e.rec) ? (L0.name || L0.addr) : "";
      return `<button type="button" class="tx-row" data-k="${e.key}">
          ${e.rec.photo && e.rec.photo.data ? `<img class="tx-thumb" src="${e.rec.photo.data}" alt="" loading="lazy" decoding="async">` : `<span class="tx-ic" aria-hidden="true">${e.icon}</span>`}
          <span class="tx-main"><b>${esc(e.title)}</b><span class="muted small">${esc(e.when)}${loc ? ` · <span lang="${L0.lang}" translate="no">${esc(loc)}</span>` : fresh(e.rec) ? "" : " · bez lokalnego adresu"}</span></span>
          <b class="tx-go" aria-hidden="true">›</b></button>`;
    };
    let list = "";
    for (const g of ["Noclegi", "Plan", "Pomysły"]) {
      const es = located.filter(e => e.group === g);
      if (es.length) list += `<h3 class="section">${g}</h3><div class="card tx-list">${es.map(row).join("")}</div>`;
    }

    return {
      title: `Karty i rozmówki · ${trip.name}`,
      back: `#/plan/${id}`,
      html: `
        <p class="muted small">Karta pokazuje nazwę i adres w lokalnym piśmie – pokaż ją taksówkarzowi albo kierowcy tuk-tuka. Działa bez internetu.</p>
        ${todo.length ? `<button type="button" class="btn primary wide" id="tx-prep">🚕 Przygotuj karty (${todo.length}) – internet</button>
          <p class="muted small" id="tx-prog"></p>` : ""}
        ${located.length ? list : App.empty("🚕", "Brak miejsc z położeniem", "Dodaj nocleg z adresem albo punkt planu wybrany z wyszukiwarki – wtedy pojawi się tu jego karta.")}
        ${noXY ? `<p class="muted small">${noXY} ${plural(noXY, "miejsce nie ma", "miejsca nie mają", "miejsc nie ma")} położenia na mapie – <a href="#/mapa/${id}?d=wszystko">znajdź je na mapie</a>.</p>` : ""}

        <h3 class="section">Rozmówki</h3>
        <div class="st-chips">${order.map(l => `<a class="st-chip${l === lang ? " on" : ""}" href="#/karty/${id}?j=${l}" ${l === lang ? 'aria-current="true"' : ""}>${LANGS[l].flag} <span translate="no">${LANGS[l].name}</span></a>`).join("")}</div>
        <div class="card tx-list">
          ${PHRASES.filter(p => p[2][lang]).map(p => `<button type="button" class="tx-row tx-ph" data-p="${p[0]}">
            <span class="tx-main"><span class="tx-loc" lang="${lang}" translate="no">${esc(p[2][lang][0])}</span>
              <span class="muted small"><span>${esc(p[1])}</span>${p[2][lang][1] ? ` · <i translate="no">${esc(p[2][lang][1])}</i>` : ""}</span></span>
            <b class="tx-go" aria-hidden="true">›</b></button>`).join("")}
        </div>
        <p class="muted small"><span>Dotknij zwrotu, by pokazać go dużymi literami. Wymowa jest uproszczona.</span>
          ${lang === "th" ? `<span>Po tajsku mężczyzna kończy zdanie „khrap”, kobieta „kha”.</span>` : ""}
          ${lang === "lo" ? `<span>W Laosie tuk-tuki nie mają taksometrów – cenę ustal przed jazdą.</span>` : ""}</p>`,
      after(view) {
        const open = e => {
          const d = overlay(view, cardHtml(e));
          // karta bez lokalnego adresu i jest internet – dociągnij od razu
          if (!fresh(e.rec) && navigator.onLine) localize(e.store, e.rec).then(local => {
            e.rec.local = local;
            if (d.isConnected) overlay(view, cardHtml(e));
          }).catch(() => {});
        };
        view.querySelectorAll(".tx-row[data-k]").forEach(b => b.onclick = () => open(located.find(e => e.key === b.dataset.k)));
        view.querySelectorAll(".tx-ph").forEach(b => b.onclick = () => overlay(view, phraseHtml(PHRASES.find(p => p[0] === b.dataset.p), lang)));
        if (q.k) { const e = located.find(x => x.key === q.k); if (e) open(e); }

        const prep = view.querySelector("#tx-prep");
        if (prep) prep.onclick = async () => {
          if (!navigator.onLine) { App.toast("Brak internetu"); return; }
          prep.disabled = true;
          const prog = view.querySelector("#tx-prog");
          let done = 0, failed = 0;
          for (const e of todo) {
            if (!prep.isConnected) return;
            prog.textContent = `Szukam… ${done + 1}/${todo.length}`;
            try { await localize(e.store, e.rec); } catch (err) { failed++; }
            done++;
          }
          App.toast(failed ? `Gotowe · nie udało się ${failed}` : "Karty gotowe – działają bez internetu");
          App.render();
        };
      },
      cleanup() { unlockScreen(); },
    };
  });

  App.Phrases = { PHRASES, LANGS, localize, localAddress };
})();
