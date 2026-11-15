/* Podróżnik – ikony interfejsu (jeden zestaw w obrysie: 24 px, kreska 1.75, zaokrąglone końce).
   Użycie w widokach: App.icon("plane") → "<svg class="ic">…</svg>" (kolor = currentColor).
   Emoji zostają tylko w treści (kategorie pakowania i planu, nazwy podróży użytkownika). */
(function () {
  const P = {
    trips: '<path d="M3.5 13.5l17-7-4.5 13-3.5-5.5z"/><path d="M13 14l7.5-7.5"/>',
    ticket: '<path d="M4 7.5A1.5 1.5 0 015.5 6h13A1.5 1.5 0 0120 7.5v2.25a2.25 2.25 0 000 4.5v2.25a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 16.5v-2.25a2.25 2.25 0 000-4.5z"/><path d="M14.5 6.5v1.5M14.5 11.25v1.5M14.5 16v1.5"/>',
    plan: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5M8 13.5h3M8 16.5h6"/>',
    pack: '<rect x="5" y="7" width="14" height="13" rx="2.5"/><path d="M9.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2M9 7v13M15 7v13"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plane: '<path d="M12 2.8c.9 0 1.4.9 1.4 2V10l7.1 4.2v2.1l-7.1-2.1v4.2l2.1 1.6v1.6L12 20.6l-3.5 1v-1.6l2.1-1.6v-4.2l-7.1 2.1v-2.1L10.6 10V4.8c0-1.1.5-2 1.4-2z"/>',
    train: '<rect x="6" y="3.5" width="12" height="14" rx="3"/><path d="M6 11h12M9.5 14.5h.01M14.5 14.5h.01M8.5 21l1.5-3.5M15.5 21L14 17.5"/>',
    bus: '<rect x="5" y="4" width="14" height="14" rx="3"/><path d="M5 11h14M8.5 14.5h.01M15.5 14.5h.01M7.5 18v2M16.5 18v2"/>',
    ferry: '<path d="M4 15l1.5 4h13L20 15z"/><path d="M7 15V10h10v5M12 10V6M9.5 6h5"/><path d="M3 21c1.5 0 1.5-.8 3-.8s1.5.8 3 .8 1.5-.8 3-.8 1.5.8 3 .8 1.5-.8 3-.8 1.5.8 3 .8"/>',
    car: '<path d="M5 16.5V12l1.8-4.2A2 2 0 018.6 6.5h6.8a2 2 0 011.8 1.3L19 12v4.5"/><path d="M4 12h16v4.5H4z"/><path d="M7.5 19v-2.5M16.5 19v-2.5M7.5 14h.01M16.5 14h.01"/>',
    bed: '<path d="M3 18.5V7M3 14.5h18v4M21 14.5v-2.5a3 3 0 00-3-3h-7v5.5"/><circle cx="7" cy="11.5" r="1.8"/>',
    pin: '<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0113 0c0 5.3-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    map: '<path d="M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    navigate: '<path d="M20 4L4 11l7 2 2 7z"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
    share: '<path d="M12 15V4M8 7.5L12 3.5l4 4"/><path d="M8 11H6.5A1.5 1.5 0 005 12.5v6A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5v-6a1.5 1.5 0 00-1.5-1.5H16"/>',
    download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19.5h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5M20 14v.01M14 20h.01M17 17.5V20h3v-3"/>',
    scan: '<path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M4 12h16"/>',
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2.2 2.2 0 004 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 016.5 5H17v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M16 13.5h.01"/>',
    doc: '<path d="M7 3.5h7l4.5 4.5v11A1.5 1.5 0 0117 20.5H7A1.5 1.5 0 015.5 19V5A1.5 1.5 0 017 3.5z"/><path d="M13.5 3.5V8.5h5M9 13h6M9 16.5h4"/>',
    clip: '<path d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.1-8.1a3.3 3.3 0 014.7 4.7l-8.1 8.1a1.7 1.7 0 01-2.4-2.4l7.4-7.4"/>',
    camera: '<path d="M4 8.5A1.5 1.5 0 015.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
    image: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4.5 3.5 3.5 2.5-2.5L20 18"/>',
    chat: '<path d="M4.5 6.5A2 2 0 016.5 4.5h11a2 2 0 012 2v8a2 2 0 01-2 2H11l-4.5 3.5v-3.5a2 2 0 01-2-2z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
    taxi: '<path d="M5 16.5V12l1.8-4.2A2 2 0 018.6 6.5h6.8a2 2 0 011.8 1.3L19 12v4.5"/><path d="M4 12h16v4.5H4zM10 6.5V4.5h4v2"/><path d="M7.5 19v-2.5M16.5 19v-2.5"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 01-.6-9A6 6 0 0118 9.6a4.5 4.5 0 01-1 8.9z"/><path d="M12 11v5M9.8 14l2.2 2.2 2.2-2.2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>',
    chart: '<path d="M4 20h16M7 16v-4M12 16V7M17 16v-6"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
    sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>',
    users: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0111 0M15.5 6.2a3 3 0 010 5.6M17 14.2a5.5 5.5 0 013.5 4.8"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17h.01"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cart: '<path d="M3.5 4.5h2.2l2 10.5h10.3l1.8-7.5H6.7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>',
    star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
    undo: '<path d="M5 9h10a4.5 4.5 0 010 9H9"/><path d="M8.5 5.5L5 9l3.5 3.5"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chev: '<path d="M9.5 6l6 6-6 6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    edit: '<path d="M4.5 19.5l1-4L15.5 5.5a2.1 2.1 0 013 3l-10 10z"/><path d="M13.5 7.5l3 3"/>',
    trash: '<path d="M4.5 7h15M10 4h4M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/>',
    more: '<circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>',
    drag: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  };

  /* App.icon(nazwa, klasa?) – gotowy znacznik SVG; nieznana nazwa = pusty tekst */
  function icon(name, cls) {
    const p = P[name];
    if (!p) return "";
    return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${p}</svg>`;
  }
  icon.names = Object.keys(P);

  // ikona rodzaju odcinka (trips.js TYPES) – „_plan” = bilet przypięty do punktu planu
  const TYPE = { lot: "plane", pociag: "train", autobus: "bus", prom: "ferry", auto: "car", taxi: "taxi", metro: "train", nocleg: "bed", inny: "compass", _plan: "ticket" };
  icon.type = (type, cls) => icon(TYPE[type] || "compass", cls);

  if (self.App) App.icon = icon;
  self.Icons = icon;
})();
