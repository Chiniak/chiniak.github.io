/* Podróżnik – ekran „Razem”: wspólne planowanie na żywo (sync.js).
   Trasy:
     #/razem/:tripId?z=czat|pomysly|osoby   czat, pomysły z głosowaniem i komentarzami, uczestnicy i zaproszenie
     #/dolacz/:POKOJ.KLUCZ                  dołączenie z linku zaproszenia
     #/dolacz                               wklejenie linku zaproszenia
   Pomysły to punkty planu bez dnia (planItems bez date) – te same co w Planie. */
(function () {
  const { esc, plural } = App;
  const ic = (n, c) => App.icon(n, c);
  const HUES = ["#43BDB5", "#E6A23C", "#8B7CF6", "#E57B9A", "#4C9BE8", "#6CBF5B", "#D9785B", "#B58BD1"];
  const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; };
  const av = (id, name) => `<span class="rz-av" style="--pc:${hue(id)}" aria-hidden="true">${esc((String(name || "?").trim()[0] || "?").toUpperCase())}</span>`;
  const hhmm = s => new Date(s).toLocaleTimeString(self.I18N ? I18N.locale : "pl-PL", { hour: "2-digit", minute: "2-digit" });
  const dayKey = s => { const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const drafts = {};    // niewysłane wiadomości (przetrwają odświeżenie ekranu po zmianie od innych)
  let openIdea = null;  // rozwinięte komentarze pomysłu

  async function people(tripId) {
    const all = await DB.byIndex("members", "tripId", tripId);
    return all.filter(m => !m.left).sort((a, b) => (a.created || "").localeCompare(b.created || ""));
  }

  /* ================= nie jest jeszcze wspólna ================= */
  async function intro(t) {
    const name = await App.Sync.myName();
    const on = App.Sync.configured();
    return {
      title: "Razem",
      back: `#/podroze/${t.id}`,
      html: `
        <section class="tx-hero">
          <span class="tx-hero-ic" aria-hidden="true">${ic("users")}</span>
          <div><h2>Planujcie razem</h2>
          <p>Zaproś osoby, z którymi jedziesz. Każdy widzi zmiany od razu: loty, noclegi, plan dnia, pakowanie i wydatki.
            Do tego <b>wspólny czat</b> i <b>pomysły z głosowaniem</b>.</p></div>
        </section>
        ${on ? `
        <form id="rz-start" class="bg-cfg sh-box" autocomplete="off">
          <label class="field"><span>Twoje imię – zobaczą je inni</span><input name="name" required maxlength="30" value="${esc(name)}" placeholder="np. Kasia"></label>
          <button class="btn primary wide">${ic("users", "sm")} Zaproś do wspólnego planowania</button>
        </form>
        <p class="td-note sh-note">${ic("shield", "sm")}<span>Szyfrowanie end-to-end: klucz jest tylko w linku zaproszenia, serwer widzi wyłącznie szyfr.
          Bilety, zdjęcia i dziennik zostają tylko w Twoim telefonie.</span></p>
        <p class="error" id="err" hidden></p>`
        : App.empty("🛠️", "Już wkrótce", "Wspólne planowanie na żywo uruchomimy w jednej z następnych wersji. Na razie możesz wysłać podróż jako plik.",
          `<a class="btn" href="#/udostepnij/${t.id}">${ic("share", "sm")} Wyślij podróż</a>`)}
        <div class="list rz-alt">
          <a class="li" href="#/udostepnij/${t.id}"><span class="li-ico">${ic("share")}</span><span class="li-main"><b>Wyślij jako plik albo tekst</b><small>bez serwera – jednorazowo, przez WhatsApp lub mail</small></span>${ic("chev")}</a>
        </div>`,
      after(view) {
        const f = view.querySelector("#rz-start");
        if (!f) return;
        f.onsubmit = async e => {
          e.preventDefault();
          const btn = f.querySelector("button"), err = view.querySelector("#err");
          btn.disabled = true; err.hidden = true;
          try {
            await DB.setSetting("myName", f.name.value.trim());
            await App.Sync.share(t.id);
            location.replace(`#/razem/${t.id}?z=osoby`);
          } catch (x) {
            err.textContent = navigator.onLine ? (x.message || String(x)) : "Brak internetu – połącz się, żeby zacząć wspólne planowanie.";
            err.hidden = false; btn.disabled = false;
          }
        };
      },
    };
  }

  /* ================= czat ================= */
  async function chatTab(t) {
    const me = App.Sync.me();
    const [msgs, items] = await Promise.all([DB.byIndex("chat", "tripId", t.id), DB.byIndex("planItems", "tripId", t.id)]);
    msgs.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
    const ideaOf = Object.fromEntries(items.map(i => [i.id, i]));
    let last = "", prevBy = "", html = "";
    for (const m of msgs) {
      const day = dayKey(m.at);
      if (day !== last) { html += `<div class="rz-day">${App.fmtDayLong(day)}</div>`; last = day; prevBy = ""; }
      if (m.sys) { html += `<div class="rz-sys">${esc(m.name || "Ktoś")} ${esc(m.text)} · ${hhmm(m.at)}</div>`; prevBy = ""; continue; }
      const mine = m.by === me, cont = prevBy === m.by;
      const idea = m.ideaId && ideaOf[m.ideaId];
      html += `
        <div class="rz-msg${mine ? " me" : ""}${cont ? " cont" : ""}">
          ${mine ? "" : cont ? `<span class="rz-av-sp"></span>` : av(m.by, m.name)}
          <div class="rz-bub">
            ${!mine && !cont ? `<b class="rz-who" style="color:${hue(m.by)}">${esc(m.name || "?")}</b>` : ""}
            ${idea ? `<a class="rz-ref" href="#/razem/${t.id}?z=pomysly&p=${idea.id}">💡 ${esc(idea.title)}</a>` : ""}
            <span class="rz-txt">${esc(m.text)}</span><time>${hhmm(m.at)}</time>
          </div>
        </div>`;
      prevBy = m.by;
    }
    if (!msgs.some(m => !m.sys)) html += `<p class="rz-empty muted">Napisz pierwszą wiadomość – np. „Kto rezerwuje nocleg?”</p>`;
    if (msgs.length) await DB.setSetting(`chatRead.${t.id}`, msgs[msgs.length - 1].at);
    return {
      html: `<div class="rz-chat" id="rz-chat">${html}</div>
        <form class="rz-send" id="rz-send" autocomplete="off">
          <label class="sr" for="rz-in">Wiadomość</label>
          <textarea id="rz-in" rows="1" maxlength="2000" placeholder="Wiadomość do wszystkich…">${esc(drafts[t.id] || "")}</textarea>
          <button class="icon-btn rz-go" aria-label="Wyślij">${ic("send")}</button>
        </form>`,
      after(view) {
        const f = view.querySelector("#rz-send"), inp = f.querySelector("textarea");
        const grow = () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 140) + "px"; };
        inp.oninput = () => { drafts[t.id] = inp.value; grow(); };
        grow();
        inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } };
        f.onsubmit = async e => {
          e.preventDefault();
          const text = inp.value.trim();
          if (!text) return;
          inp.value = ""; drafts[t.id] = "";
          await DB.put("chat", { tripId: t.id, at: new Date().toISOString(), by: App.Sync.me(), name: await App.Sync.myName(), text });
          await App.render();
          const again = document.querySelector("#rz-in");
          if (again) again.focus();
        };
        requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
      },
    };
  }

  /* ================= pomysły ================= */
  async function ideasTab(t, query) {
    const me = App.Sync.me();
    const [items, votes, msgs] = await Promise.all([DB.byIndex("planItems", "tripId", t.id), DB.byIndex("votes", "tripId", t.id), DB.byIndex("chat", "tripId", t.id)]);
    if (query.p) openIdea = query.p;
    const ideas = items.filter(i => !i.date);
    const score = {}, mineV = {};
    for (const v of votes) if (v.v) { score[v.ideaId] = (score[v.ideaId] || 0) + 1; if (v.by === me) mineV[v.ideaId] = 1; }
    const comments = {};
    for (const m of msgs) if (m.ideaId && !m.sys) (comments[m.ideaId] = comments[m.ideaId] || []).push(m);
    ideas.sort((a, b) => (score[b.id] || 0) - (score[a.id] || 0) || (a.created || "").localeCompare(b.created || ""));
    const days = [];
    if (t.start) for (let d = t.start; d <= (t.end || t.start) && days.length < 60; d = App.addDays(d, 1)) days.push(d);
    const dayOpts = days.map(d => `<option value="${d}">${App.fmtDay(d)}</option>`).join("");
    const CATS = App.Plan.CATS;
    const card = it => {
      const cs = (comments[it.id] || []).sort((a, b) => a.at.localeCompare(b.at));
      const open = openIdea === it.id;
      return `
        <article class="rz-idea" id="idea-${it.id}">
          <a class="rz-idea-main" href="#/punkt/${it.id}">
            <span class="rz-idea-ic" aria-hidden="true">${(CATS[it.cat] || CATS.inne).icon}</span>
            <span><b>${esc(it.title)}</b>
              ${it.place && !/^https?:/i.test(it.place) ? `<small>${esc(it.place)}</small>` : ""}
              ${it.byName ? `<small>dodał(a): ${esc(it.byName)}</small>` : ""}</span>
          </a>
          ${it.note ? `<p class="rz-idea-note">${esc(it.note)}</p>` : ""}
          <div class="rz-idea-acts">
            <button type="button" class="rz-vote" data-vote="${it.id}" aria-pressed="${mineV[it.id] ? "true" : "false"}" aria-label="Podoba mi się – ${score[it.id] || 0}">👍 <b>${score[it.id] || 0}</b></button>
            <button type="button" class="rz-cm" data-cm="${it.id}" aria-expanded="${open}">💬 <b>${cs.length}</b></button>
            ${days.length ? `<label class="rz-move"><span class="sr">Dodaj do dnia</span><select data-move="${it.id}"><option value="">+ do planu</option>${dayOpts}</select></label>` : ""}
          </div>
          ${open ? `<div class="rz-comments">
            ${cs.map(m => `<p class="rz-c">${av(m.by, m.name)}<span><b>${esc(m.name || "?")}</b> ${esc(m.text)} <time>${hhmm(m.at)}</time></span></p>`).join("")}
            <form class="rz-cform" data-idea="${it.id}" autocomplete="off"><input maxlength="500" placeholder="Komentarz…" aria-label="Komentarz"><button class="icon-btn" aria-label="Wyślij komentarz">${ic("send")}</button></form>
          </div>` : ""}
        </article>`;
    };
    return {
      html: `
        <form class="rz-add" id="rz-add" autocomplete="off">
          <input name="title" maxlength="120" placeholder="Nowy pomysł: miejsce, restauracja, atrakcja…" aria-label="Nowy pomysł">
          <button class="btn primary" aria-label="Dodaj pomysł">${ic("plus", "sm")}</button>
        </form>
        ${ideas.length ? ideas.map(card).join("") : App.empty("💡", "Brak pomysłów", "Dodajcie miejsca, które warto zobaczyć. Głosujcie 👍 – najpopularniejsze są na górze.")}
        <p class="rz-hint muted">Pomysły to punkty planu bez dnia – zobaczysz je też w Planie. Szczegóły (adres, koszt, zdjęcie) dodasz, dotykając pomysłu.</p>`,
      after(view) {
        const add = view.querySelector("#rz-add");
        add.onsubmit = async e => {
          e.preventDefault();
          const title = add.title.value.trim();
          if (!title) return;
          await DB.put("planItems", { tripId: t.id, title, date: "", time: "", cat: "zwiedzanie", order: 1e6, by: App.Sync.me(), byName: await App.Sync.myName() });
          App.render();
        };
        view.querySelectorAll("[data-vote]").forEach(b => b.onclick = async () => {
          const id = `${b.dataset.vote}:${App.Sync.me()}`, cur = await DB.get("votes", id);
          await DB.put("votes", { id, tripId: t.id, ideaId: b.dataset.vote, by: App.Sync.me(), v: cur && cur.v ? 0 : 1 });
          App.render();
        });
        view.querySelectorAll("[data-cm]").forEach(b => b.onclick = () => { openIdea = openIdea === b.dataset.cm ? null : b.dataset.cm; App.render(); });
        view.querySelectorAll(".rz-cform").forEach(f => f.onsubmit = async e => {
          e.preventDefault();
          const inp = f.querySelector("input"), text = inp.value.trim();
          if (!text) return;
          await DB.put("chat", { tripId: t.id, at: new Date().toISOString(), by: App.Sync.me(), name: await App.Sync.myName(), text, ideaId: f.dataset.idea });
          App.render();
        });
        view.querySelectorAll("[data-move]").forEach(s => s.onchange = async () => {
          if (!s.value) return;
          const it = await DB.get("planItems", s.dataset.move);
          const rec = await DB.put("planItems", { ...it, date: s.value, time: "", order: 1e6 });
          await App.Plan.placeInDay(rec);
          App.toast(`Dodano do planu: ${App.fmtDay(s.value)}`);
          App.render();
        });
        if (query.p) { const el = view.querySelector(`#idea-${CSS.escape(query.p)}`); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "center" })); }
      },
    };
  }

  /* ================= osoby i zaproszenie ================= */
  async function peopleTab(t) {
    const me = App.Sync.me(), link = App.Sync.link(t.id), list = await people(t.id), name = await App.Sync.myName();
    return {
      html: `
        <section class="rz-invite">
          <h2 class="section">Zaproś</h2>
          <p class="muted">Wyślij link osobom, z którymi jedziesz. Kto ma link, może oglądać i zmieniać tę podróż – wysyłaj go tylko swoim.</p>
          <div class="rz-qr"><canvas id="rz-qr" aria-label="Kod QR z zaproszeniem"></canvas></div>
          <div class="rz-btns">
            <button type="button" class="btn primary" id="rz-share">${ic("share", "sm")} Wyślij zaproszenie</button>
            <button type="button" class="btn" id="rz-copy">${ic("copy", "sm")} Kopiuj link</button>
          </div>
        </section>
        <h2 class="section">W podróży (${list.length})</h2>
        <div class="list">
          ${list.map(m => `<div class="li rz-person">${av(m.by, m.name)}<span class="li-main"><b>${esc(m.name || "?")}${m.by === me ? " <span class=\"chip\">Ty</span>" : ""}</b></span></div>`).join("")}
        </div>
        <form class="rz-name" id="rz-name" autocomplete="off">
          <label class="field"><span>Twoje imię</span><input name="name" required maxlength="30" value="${esc(name)}"></label>
          <button class="btn">Zapisz</button>
        </form>
        <button type="button" class="btn danger wide" id="rz-leave">Opuść wspólną podróż</button>
        <p class="td-note sh-note">${ic("shield", "sm")}<span>Zmiany są szyfrowane w telefonie – serwer (Google Firebase) widzi tylko szyfr. Bilety, zdjęcia i dziennik nie są wysyłane.
          Po wyjściu podróż zostaje u Ciebie, ale przestaje się aktualizować.</span></p>`,
      after(view) {
        (async () => {
          await App.loadScript("lib/bwip-js.min.js");
          try { bwipjs.toCanvas(view.querySelector("#rz-qr"), { bcid: "qrcode", text: link, scale: 4, padding: 2, backgroundcolor: "FFFFFF" }); } catch (e) { console.warn(e); }
        })();
        const text = `Planujmy razem „${t.name}” w Podróżniku: ${link}`;
        view.querySelector("#rz-share").onclick = async () => {
          if (navigator.share) { try { await navigator.share({ title: t.name, text }); return; } catch (e) { if (e.name === "AbortError") return; } }
          try { await navigator.clipboard.writeText(text); App.toast("Skopiowano zaproszenie – wklej w wiadomości"); } catch (e) { prompt("Skopiuj zaproszenie:", text); }
        };
        view.querySelector("#rz-copy").onclick = async () => {
          try { await navigator.clipboard.writeText(link); App.toast("Skopiowano link"); } catch (e) { prompt("Skopiuj link:", link); }
        };
        const nf = view.querySelector("#rz-name");
        nf.onsubmit = async e => {
          e.preventDefault();
          const n = nf.name.value.trim();
          if (!n) return;
          await DB.setSetting("myName", n);
          await DB.put("members", { id: `${t.id}:${me}`, tripId: t.id, by: me, name: n });
          App.toast("Zapisano"); App.render();
        };
        view.querySelector("#rz-leave").onclick = async () => {
          if (!confirm("Opuścić wspólną podróż? Zostanie u Ciebie w obecnym stanie, ale zmiany innych przestaną przychodzić.")) return;
          await App.Sync.leave(t.id);
          App.toast("Opuszczono wspólną podróż");
          location.replace(`#/podroze/${t.id}`);
        };
      },
    };
  }

  /* ================= ekran Razem ================= */
  const TABS = { czat: "Czat", pomysly: "Pomysły", osoby: "Osoby" };
  App.route(/^\/razem\/([\w-]+)$/, async ([id], query) => {
    const t = await DB.get("trips", id);
    if (!t) { location.replace("#/podroze"); return ""; }
    if (!(await App.Sync.isShared(id))) return intro(t);
    const z = TABS[query.z] ? query.z : "czat";
    const [unread, items, list] = await Promise.all([App.Sync.unread(id), DB.byIndex("planItems", "tripId", id), people(id)]);
    const counts = { czat: z === "czat" ? 0 : unread, pomysly: items.filter(i => !i.date).length, osoby: list.length };
    const tab = await (z === "czat" ? chatTab(t) : z === "pomysly" ? ideasTab(t, query) : peopleTab(t));
    return {
      title: t.name,
      back: `#/podroze/${id}`,
      html: `
        <nav class="seg rz-seg" aria-label="Razem">
          ${Object.entries(TABS).map(([k, n]) => `<a href="#/razem/${id}?z=${k}" ${k === z ? `aria-current="page"` : ""} class="${k === z ? "on" : ""}">${n}${counts[k] ? ` <span class="${k === "czat" ? "rz-badge" : "rz-n"}">${counts[k]}</span>` : ""}</a>`).join("")}
        </nav>
        <div class="rz-body rz-${z}">${tab.html}</div>`,
      after: tab.after,
    };
  });

  /* ================= dołączanie ================= */
  async function joinForm(code) {
    const name = await App.Sync.myName();
    return {
      title: "Dołącz do podróży",
      back: "#/podroze",
      html: `
        <section class="tx-hero">
          <span class="tx-hero-ic" aria-hidden="true">${ic("users")}</span>
          <div><h2>Wspólna podróż</h2><p>Ktoś zaprasza Cię do wspólnego planowania. Po dołączeniu podróż pojawi się na Twojej liście,
            a zmiany będą się aktualizować na żywo u wszystkich.</p></div>
        </section>
        <form id="rz-join" class="bg-cfg sh-box" autocomplete="off">
          ${code ? "" : `<label class="field"><span>Link zaproszenia</span><textarea name="link" rows="3" required placeholder="https://chiniak.github.io/podroznik/dolacz.html#…"></textarea></label>`}
          <label class="field"><span>Twoje imię – zobaczą je inni</span><input name="name" required maxlength="30" value="${esc(name)}" placeholder="np. Tomek"></label>
          <button class="btn primary wide">Dołącz</button>
        </form>
        <p class="error" id="err" hidden></p>
        <p class="td-note sh-note">${ic("shield", "sm")}<span>Dane podróży są szyfrowane – klucz jest tylko w linku. Twoje bilety, zdjęcia i dziennik nie są wysyłane.</span></p>`,
      after(view) {
        const f = view.querySelector("#rz-join");
        f.onsubmit = async e => {
          e.preventDefault();
          const btn = f.querySelector("button"), err = view.querySelector("#err");
          btn.disabled = true; btn.textContent = "Łączenie…"; err.hidden = true;
          try {
            const r = await App.Sync.join(code || f.link.value, f.name.value.trim());
            App.toast(r.already ? "Ta podróż jest już wspólna" : "Dołączono do podróży");
            location.replace(`#/razem/${r.tripId}?z=czat`);
          } catch (x) {
            err.textContent = navigator.onLine ? (x.message || String(x)) : "Brak internetu – połącz się, żeby dołączyć.";
            err.hidden = false; btn.disabled = false; btn.textContent = "Dołącz";
          }
        };
      },
    };
  }
  App.route(/^\/dolacz\/([\w-]+\.[\w-]+)$/, ([code]) => joinForm(code));
  App.route(/^\/dolacz$/, () => joinForm(""));

  /* ================= zmiany od innych ================= */
  // odśwież ekran tej podróży (bez formularzy – nie przerywamy pisania) i pokaż nowe wiadomości
  const LIVE = /^#\/(razem|podroze|plan|pakowanie|budzet|rozliczenie|dzis)\/([\w-]+)(\?.*)?$/;
  let timer = null;
  App.Sync && App.Sync.on(async (tripId, changed) => {
    const m = LIVE.exec(location.hash);
    const here = m && m[2] === tripId;
    if (changed.has("chat") && !(here && m[1] === "razem" && /z=czat|^$/.test(m[3] ? m[3].slice(1) : ""))) {
      const msgs = (await DB.byIndex("chat", "tripId", tripId)).filter(x => x.by !== App.Sync.me() && !x.sys).sort((a, b) => a.at.localeCompare(b.at));
      const last = msgs[msgs.length - 1];
      if (last && Date.now() - new Date(last.at) < 120000) App.toast(`💬 ${last.name}: ${last.text.slice(0, 80)}`);
    }
    if (!here) return;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.id !== "rz-in") return; // nie przerywaj pisania w formularzu
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const typing = document.activeElement && document.activeElement.id === "rz-in";
      await App.render();
      const inp = typing && document.querySelector("#rz-in");
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 300);
  });

  App.Razem = { people };
})();
