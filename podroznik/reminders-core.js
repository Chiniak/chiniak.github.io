/* Podróżnik – etap 5: wyliczanie przypomnień.
   Ten plik działa i w aplikacji (okno), i w service workerze (sprawdzanie w tle), dlatego nie używa DOM ani App.
   Przypomnienie: { id, at: "RRRR-MM-DDTGG:MM", eventAt, title, body, href, tripId }
     at       – kiedy powiadomić (czas lokalny)
     eventAt  – do kiedy przypomnienie ma sens (np. odjazd); po tym czasie nie jest już pokazywane
   Ustawienia (DB "reminders") – patrz DEFAULTS; które już pokazano: DB "remShown" { "id@at": kiedy } */
(function (root) {
  const pad = n => String(n).padStart(2, "0");
  const fmtLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const parse = s => {
    const [d, t = "00:00"] = s.split("T");
    const [y, m, dd] = d.split("-").map(Number);
    const [h, mi] = t.split(":").map(Number);
    return new Date(y, m - 1, dd, h || 0, mi || 0);
  };
  const addMin = (s, m) => fmtLocal(new Date(parse(s).getTime() + m * 60000));
  const prevDayAt = (s, hhmm) => { const d = parse(s); d.setDate(d.getDate() - 1); return `${fmtLocal(d).slice(0, 10)}T${hhmm}`; };
  const nowStr = () => fmtLocal(new Date());
  const dur = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
  const fmtDay = s => new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "short" }).format(parse(s));
  const minutesBetween = (a, b) => Math.round((parse(b) - parse(a)) / 60000);

  // [ikona, nazwa, słowo na start]
  const TYPES = {
    lot: ["✈️", "Lot", "Wylot"], pociag: ["🚆", "Pociąg", "Odjazd"], autobus: ["🚌", "Autobus", "Odjazd"],
    prom: ["⛴️", "Prom", "Wypłynięcie"], auto: ["🚗", "Auto", "Odbiór"], taxi: ["🚕", "Taxi", "Odbiór"],
    metro: ["🚇", "Metro / tramwaj", "Odjazd"], inny: ["🧭", "Inny", "Start"], nocleg: ["🏨", "Nocleg", "Zameldowanie"],
  };

  // day: dzień wcześniej o 19:00 · before: minut przed odjazdem (0 = wył.) · checkin: odprawa online 24 h przed lotem
  const DEFAULTS = {
    enabled: true,
    types: {
      lot: { day: true, before: 180, checkin: true },
      pociag: { day: true, before: 60 },
      autobus: { day: true, before: 60 },
      prom: { day: true, before: 120 },
      auto: { day: false, before: 60 },
      taxi: { day: false, before: 30 },
      metro: { day: false, before: 0 },
      inny: { day: false, before: 60 },
      nocleg: { day: true, checkout: true },
    },
    packDays: 2,   // przypomnienie o pakowaniu N dni przed wyjazdem o 18:00 (0 = wył.)
    todos: true,   // zadania „przed wyjazdem” z terminem – o 9:00 w dniu terminu
    plan: 0,       // punkty planu z godziną – minut przed (0 = wył.)
  };

  function config(saved) {
    const c = JSON.parse(JSON.stringify(DEFAULTS));
    if (!saved) return c;
    for (const k of ["enabled", "packDays", "todos", "plan"]) if (k in saved) c[k] = saved[k];
    if (saved.types) for (const t in c.types) Object.assign(c.types[t], saved.types[t] || {});
    return c;
  }

  function compute(data, cfg, now = nowStr()) {
    const out = [];
    // „Jutro” pokazane z opóźnieniem (np. po otwarciu aplikacji rano) zamienia się w „Dziś”
    const dayWord = at => (now.slice(0, 10) === at.slice(0, 10) ? "Dziś" : "Jutro");
    const trips = Object.fromEntries(data.trips.map(t => [t.id, t]));
    const firstDepart = {};
    for (const s of data.segments) {
      if (!s.depart || !trips[s.tripId]) continue;
      if (s.type !== "nocleg" && (!firstDepart[s.tripId] || s.depart < firstDepart[s.tripId])) firstDepart[s.tripId] = s.depart;
      const T = TYPES[s.type] || TYPES.inny, c = cfg.types[s.type] || cfg.types.inny;
      const time = s.depart.slice(11, 16), base = { tripId: s.tripId, href: `/odcinek/${s.id}` };

      if (s.type === "nocleg") {
        const name = s.name || "nocleg";
        if (c.day) out.push({ ...base, id: `seg:${s.id}:day`, at: prevDayAt(s.depart, "19:00"), eventAt: s.depart,
          title: `${dayWord(s.depart)} zameldowanie: ${name}`, body: `Od ${time}${s.address ? ` · ${s.address}` : ""}` });
        if (c.checkout && s.arrive) {
          let at = `${s.arrive.slice(0, 10)}T08:00`;
          if (addMin(s.arrive, -120) < at) at = addMin(s.arrive, -120);
          out.push({ ...base, id: `seg:${s.id}:out`, at, eventAt: s.arrive,
            title: `Dziś wymeldowanie: ${name}`, body: `Do ${s.arrive.slice(11, 16)} – spakuj się i sprawdź pokój (ładowarki!).` });
        }
        continue;
      }

      const route = `${s.from || "?"} → ${s.to || "?"}`;
      const info = [s.number, s.car ? `wagon ${s.car}` : "", s.seat ? `miejsce ${s.seat}` : "",
        s.platform ? `peron ${s.platform}` : "", s.gate ? `gate ${s.gate}` : ""].filter(Boolean).join(" · ");
      if (c.day) out.push({ ...base, id: `seg:${s.id}:day`, at: prevDayAt(s.depart, "19:00"), eventAt: s.depart,
        title: `${dayWord(s.depart)}: ${T[0]} ${route}`, body: `${T[2]} ${time}${info ? ` · ${info}` : ""}. Bilet masz w aplikacji.` });
      if (c.before > 0) out.push({ ...base, id: `seg:${s.id}:b${c.before}`, at: addMin(s.depart, -c.before), eventAt: s.depart,
        title: `Za ${dur(c.before)}: ${T[0]} ${route}`, body: `Czas się zbierać – ${T[2].toLowerCase()} ${time}${s.from ? ` z: ${s.from}` : ""}.` });
      if (s.type === "lot" && c.checkin) out.push({ ...base, id: `seg:${s.id}:checkin`, at: addMin(s.depart, -1440), eventAt: addMin(s.depart, -60),
        title: `Odprawa online: ${T[0]} ${s.number || route}`,
        body: `Odprawa zwykle otwiera się 24 h przed wylotem (${fmtDay(s.depart)} ${time}). Kartę pokładową dodaj w Biletach.` });
    }

    for (const t of data.trips) {
      const items = data.packItems.filter(i => i.tripId === t.id);
      const pack = items.filter(i => i.list !== "todo"), left = pack.filter(i => i.status !== "done");
      if (cfg.packDays > 0 && left.length) {
        const d = parse(t.start); d.setDate(d.getDate() - cfg.packDays);
        const buy = left.filter(i => i.status === "buy").length;
        out.push({ id: `pack:${t.id}:${cfg.packDays}`, tripId: t.id, href: `/pakowanie/${t.id}`,
          at: `${fmtLocal(d).slice(0, 10)}T18:00`, eventAt: firstDepart[t.id] || `${t.start}T12:00`,
          title: `Pakowanie: ${t.name} za ${cfg.packDays === 1 ? "1 dzień" : `${cfg.packDays} dni`}`,
          body: `Nie spakowano jeszcze ${left.length} z ${pack.length} rzeczy${buy ? ` (do kupienia: ${buy})` : ""}.` });
      }
      if (cfg.todos) for (const i of items) {
        if (i.list !== "todo" || i.status === "done" || !i.due) continue;
        out.push({ id: `todo:${i.id}`, tripId: t.id, href: `/pakowanie/${t.id}?l=todo`,
          at: `${i.due}T09:00`, eventAt: `${i.due}T23:59`, title: `Dziś: ${i.name}`, body: `Zadanie przed wyjazdem – ${t.name}.` });
      }
    }

    if (cfg.plan > 0) for (const i of data.planItems) {
      if (!i.time || !i.date || !trips[i.tripId]) continue;
      const ev = `${i.date}T${i.time}`;
      out.push({ id: `plan:${i.id}`, tripId: i.tripId, href: `/plan/${i.tripId}`, at: addMin(ev, -cfg.plan), eventAt: ev,
        title: `Za ${dur(cfg.plan)}: ${i.title}`, body: i.place && !/^https?:/i.test(i.place) ? i.place : trips[i.tripId].name });
    }
    // dokumenty (etap 8): N dni przed wygaśnięciem i jeszcze raz 14 dni przed
    const DOCS = { paszport: "Paszport", dowod: "Dowód osobisty", prawo_jazdy: "Prawo jazdy", ubezpieczenie: "Ubezpieczenie",
      wiza: "Wiza", karta: "Karta płatnicza", szczepienie: "Szczepienie", inne: "Dokument" };
    for (const d of data.docs || []) {
      if (!d.expires || !(+d.remind > 0)) continue;
      const name = `${DOCS[d.type] || "Dokument"}${d.person ? ` (${d.person})` : ""}`;
      // ile dni naprawdę zostało (przypomnienie pokazane później nie może kłamać)
      const left = Math.max(0, Math.round((parse(d.expires) - parse(now.slice(0, 10))) / 86400000));
      const leftTxt = left === 0 ? "dziś" : left === 1 ? "jutro" : `za ${left} dni`;
      for (const days of [...new Set([+d.remind, 14])].filter(x => x <= +d.remind)) {
        const day = parse(d.expires); day.setDate(day.getDate() - days);
        out.push({ id: `doc:${d.id}:${days}`, href: `/dokument/${d.id}`, at: `${fmtLocal(day).slice(0, 10)}T10:00`, eventAt: `${d.expires}T23:59`,
          title: `${name} traci ważność ${leftTxt}`, body: `Ważny do ${fmtDay(d.expires)}. Sprawdź, ile trwa wyrobienie nowego.` });
      }
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }

  // przypomnienia aktywne teraz; z kilku dla tego samego odcinka zostaje najnowsze (np. „za 1 h” zamiast „jutro”)
  function active(list, now = nowStr()) {
    const due = list.filter(r => r.at <= now && now < r.eventAt), best = {};
    for (const r of due) {
      const key = r.id.startsWith("seg:") ? r.id.split(":").slice(0, 2).join(":") + (r.id.endsWith(":out") ? ":out" : "")
        : r.id.startsWith("doc:") ? r.id.split(":").slice(0, 2).join(":") : r.id;
      if (!best[key] || best[key].at < r.at) best[key] = r;
    }
    return Object.values(best).sort((a, b) => a.at.localeCompare(b.at));
  }

  async function load() {
    const [trips, segments, packItems, planItems, docs, saved] = await Promise.all([
      DB.all("trips"), DB.all("segments"), DB.all("packItems"), DB.all("planItems"), DB.all("docs"), DB.getSetting("reminders", null)]);
    const cfg = config(saved);
    return { cfg, list: cfg.enabled ? compute({ trips, segments, packItems, planItems, docs }, cfg) : [] };
  }

  // pokazuje przypomnienia, których czas właśnie minął (i jeszcze nie były pokazane); zwraca wszystkie aktywne
  async function check(show) {
    const { list } = await load();
    const now = nowStr();
    const due = active(list, now);
    const shown = await DB.getSetting("remShown", {});
    let changed = false;
    for (const r of due) {
      const key = `${r.id}@${r.at}`;
      if (shown[key]) continue;
      if (await show(r)) { shown[key] = now; changed = true; }
    }
    const old = addMin(now, -60 * 24 * 30);
    for (const k in shown) if (shown[k] < old) { delete shown[k]; changed = true; }
    if (changed) await DB.setSetting("remShown", shown);
    return due;
  }

  root.Reminders = { DEFAULTS, TYPES, config, compute, active, load, check, addMin, nowStr, dur, parse, minutesBetween };
})(self);
