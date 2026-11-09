/* Podróżnik – etap 8 (pkt 40): pogoda w miejscu docelowym w dniach podróży.
   Źródło: Open-Meteo (bez klucza). Prognoza sięga 16 dni naprzód; dla dalszych podróży pokazujemy,
   jaka pogoda była rok wcześniej w tych samych dniach (archiwum), z wyraźnym opisem.
   Miejsce: cel podróży (pole „Cel”), a gdy go nie ma – miejsce przylotu/przyjazdu pierwszego odcinka.
   Zapis w ustawieniu "weather:<id podróży>": { at, key, kind: "forecast" | "lastyear", place, days: { "RRRR-MM-DD": [kod, max, min, opady %] } }
   Odświeżane w tle przy otwarciu ekranu, gdy dane mają ponad 3 h (i jest internet); bez internetu – ostatnie zapisane. */
(function () {
  const { esc } = App;
  const MAX_AHEAD = 15;

  // kody pogody WMO → ikona i opis
  function wmo(c) {
    if (c === 0) return ["☀️", "bezchmurnie"];
    if (c === 1) return ["🌤️", "przeważnie słonecznie"];
    if (c === 2) return ["⛅", "częściowe zachmurzenie"];
    if (c === 3) return ["☁️", "pochmurno"];
    if (c === 45 || c === 48) return ["🌫️", "mgła"];
    if (c >= 51 && c <= 57) return ["🌦️", "mżawka"];
    if (c >= 61 && c <= 67) return ["🌧️", "deszcz"];
    if (c >= 71 && c <= 77) return ["🌨️", "śnieg"];
    if (c >= 80 && c <= 82) return ["🌦️", "przelotne opady"];
    if (c === 85 || c === 86) return ["🌨️", "przelotny śnieg"];
    if (c >= 95) return ["⛈️", "burza"];
    return ["🌡️", ""];
  }
  const t = v => `${Math.round(v)}°`;

  async function place(trip) {
    const L = App.Stats && App.Stats.locate;
    if (!L) return null;
    if (trip.destination) { const p = await L(trip.destination, { online: navigator.onLine }); if (p) return { ...p, label: trip.destination }; }
    const segs = (await DB.byIndex("segments", "tripId", trip.id)).filter(s => s.depart && s.type !== "nocleg").sort((a, b) => a.depart.localeCompare(b.depart));
    for (const s of segs.slice(0, 1)) {
      const p = await L(s.to, { online: navigator.onLine });
      if (p) return { ...p, label: s.to };
    }
    return null;
  }

  async function fetchDays(lat, lon, start, end, archive) {
    const base = archive ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast";
    const daily = archive ? "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" : "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`${base}?latitude=${lat}&longitude=${lon}&daily=${daily}&timezone=auto&start_date=${start}&end_date=${end}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`pogoda: ${r.status}`);
      const j = await r.json();
      const d = j.daily, out = {};
      d.time.forEach((day, i) => {
        if (d.temperature_2m_max[i] == null) return;
        out[day] = [d.weather_code[i], d.temperature_2m_max[i], d.temperature_2m_min[i],
          archive ? (d.precipitation_sum[i] > 0.5 ? 100 : 0) : d.precipitation_probability_max[i]];
      });
      return out;
    } finally { clearTimeout(timer); }
  }

  const shiftYear = (s, n) => `${+s.slice(0, 4) + n}${s.slice(4)}`.replace(/-02-29$/, "-02-28");

  // zwraca zapisane dane od razu; refresh() pobiera nowe, jeśli trzeba (true = coś się zmieniło)
  async function get(trip) {
    const key = `weather:${trip.id}`;
    const saved = await DB.getSetting(key, null);
    const today = App.todayStr();
    const tag = `${trip.start}|${trip.end}|${trip.destination || ""}`;
    const valid = saved && saved.key === tag ? saved : null;

    async function refresh() {
      if (!navigator.onLine || trip.end < today) return false;
      if (valid && Date.now() - valid.at < 3 * 3600 * 1000) return false;
      const p = await place(trip);
      if (!p) return false;
      const last = App.addDays(today, MAX_AHEAD);
      let data;
      if (trip.start <= last) {
        const from = trip.start < today ? today : trip.start, to = trip.end > last ? last : trip.end;
        data = { kind: "forecast", days: await fetchDays(p.lat, p.lon, from, to, false) };
      } else {
        data = { kind: "lastyear", days: await fetchDays(p.lat, p.lon, shiftYear(trip.start, -1), shiftYear(trip.end, -1), true) };
      }
      await DB.setSetting(key, { ...data, at: Date.now(), key: tag, place: p.name || p.label });
      return true;
    }
    return { data: valid, refresh };
  }

  // pasek pogody na stronę podróży
  function strip(data, trip) {
    if (!data || !data.days || !Object.keys(data.days).length) return "";
    const days = Object.entries(data.days).sort();
    if (data.kind === "lastyear") {
      const max = Math.max(...days.map(d => d[1][1])), min = Math.min(...days.map(d => d[1][2]));
      const wet = days.filter(d => d[1][3] >= 50).length;
      const icon = wmo(days.map(d => d[1][0]).sort((a, b) => days.filter(x => x[1][0] === b).length - days.filter(x => x[1][0] === a).length)[0])[0];
      const left = App.dayDiff(App.todayStr(), trip.start) - MAX_AHEAD;
      return `
        <div class="wx wx-last">
          <span class="wx-big" aria-hidden="true">${icon}</span>
          <div><b>${esc(data.place || "")}: rok temu w tych dniach ${t(min)}–${t(max)}</b>
            <span class="muted small">${wet ? `opady w ${wet} z ${days.length} dni` : "bez opadów"} · prognoza pojawi się za ${left} ${App.plural(left, "dzień", "dni", "dni")}</span></div>
        </div>`;
    }
    return `
      <div class="wx">
        <div class="wx-head"><b>Pogoda · ${esc(data.place || "")}</b><span class="muted small">prognoza</span></div>
        <div class="wx-days">${days.map(([day, [c, mx, mn, pp]]) => `
          <div class="wx-day" title="${wmo(c)[1]}">
            <span class="muted small">${App.fmtDay(day).split(",")[0]} ${+day.slice(8)}</span>
            <span class="wx-ico" aria-hidden="true">${wmo(c)[0]}</span>
            <b>${t(mx)}</b><span class="muted small">${t(mn)}</span>
            ${pp >= 30 ? `<span class="wx-rain">💧${pp}%</span>` : ""}
          </div>`).join("")}</div>
      </div>`;
  }

  // krótka pogoda do nagłówka dnia w planie
  function dayBadge(data, day) {
    if (!data || data.kind !== "forecast" || !data.days || !data.days[day]) return "";
    const [c, mx, mn, pp] = data.days[day];
    return `<span class="wx-badge" title="${wmo(c)[1]}${pp >= 30 ? `, opady ${pp}%` : ""}">${wmo(c)[0]} ${t(mx)}/${t(mn)}</span>`;
  }

  App.Weather = { get, strip, dayBadge, wmo };
})();
