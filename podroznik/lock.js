/* Podróżnik – etap 6: blokada PIN-em (opcjonalnie odciskiem palca).
   Trasa ustawień: #/ustawienia/blokada
   Ustawienie "lock" (tylko na tym telefonie, nie trafia do kopii):
     { salt, hash, iter, len, timeout: minut w tle do ponownej blokady (0 = od razu), bio: id klucza odcisku | null }
   PIN jest zapisany jako skrót PBKDF2 (nie wprost). Blokada chroni przed podejrzeniem w telefonie –
   dane w pamięci przeglądarki nie są szyfrowane. Ekran blokady to nakładka nad całą aplikacją (także po kliknięciu powiadomienia).
   W <head> index.html jest mały skrypt, który od razu ukrywa treść, jeśli blokada jest włączona (bez mignięcia danych). */
(function () {
  const enc = new TextEncoder();
  const b64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const mirror = on => { try { if (on) localStorage.setItem("podroznik-lock", "1"); else localStorage.removeItem("podroznik-lock"); } catch (e) { /* tryb prywatny */ } };

  async function hashPin(pin, salt, iter) {
    const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
    return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
  }
  async function makePin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 150000;
    return { salt: b64(salt), iter, hash: await hashPin(pin, salt, iter), len: pin.length };
  }
  const checkPin = async (pin, cfg) => (await hashPin(pin, unb64(cfg.salt), cfg.iter)) === cfg.hash;

  /* ---------- odcisk palca (WebAuthn, klucz w telefonie) ---------- */
  async function bioAvailable() {
    try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
  }
  async function bioRegister() {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Podróżnik" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "podroznik", displayName: "Podróżnik" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60000, attestation: "none",
    } });
    return b64(cred.rawId);
  }
  async function bioCheck(id) {
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: unb64(id) }],
      userVerification: "required", timeout: 60000,
    } });
    return !!cred;
  }

  /* ---------- ekran blokady ---------- */
  let cfg = null, locked = false, hiddenAt = null, fails = 0, waitUntil = 0;

  function unlock() {
    locked = false; fails = 0;
    const el = document.getElementById("lock");
    if (el) el.remove();
    document.documentElement.classList.remove("lock-pending");
  }

  function showLock() {
    if (locked || !cfg) return;
    locked = true;
    let pin = "";
    const el = document.createElement("div");
    el.id = "lock";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Aplikacja zablokowana");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", cfg.bio ? "bio" : "", "0", "del"];
    el.innerHTML = `
      <div class="lk-box">
        <img src="icon-192.png" alt="" class="lk-icon">
        <h2>Podróżnik</h2>
        <p class="lk-msg" id="lk-msg" aria-live="polite">Podaj PIN</p>
        <div class="lk-dots" id="lk-dots" aria-hidden="true">${"<i></i>".repeat(cfg.len)}</div>
        <div class="lk-pad">
          ${keys.map(k => k === "" ? "<span></span>"
            : k === "del" ? `<button type="button" data-k="del" aria-label="Usuń cyfrę">⌫</button>`
            : k === "bio" ? `<button type="button" data-k="bio" aria-label="Odblokuj odciskiem palca">👆</button>`
            : `<button type="button" data-k="${k}">${k}</button>`).join("")}
        </div>
        <button type="button" class="lk-forgot" id="lk-forgot">Nie pamiętam PIN-u</button>
      </div>`;
    document.body.appendChild(el);
    document.documentElement.classList.remove("lock-pending");
    const msg = el.querySelector("#lk-msg"), dots = el.querySelector("#lk-dots");
    const paint = () => dots.querySelectorAll("i").forEach((d, i) => d.classList.toggle("on", i < pin.length));

    async function tryBio() {
      try { if (await bioCheck(cfg.bio)) unlock(); } catch (e) { msg.textContent = "Odcisk nie zadziałał – podaj PIN"; }
    }
    async function press(k) {
      if (k === "bio") return tryBio();
      if (Date.now() < waitUntil) { msg.textContent = `Za dużo prób – poczekaj ${Math.ceil((waitUntil - Date.now()) / 1000)} s`; return; }
      if (k === "del") { pin = pin.slice(0, -1); paint(); return; }
      if (pin.length >= cfg.len) return;
      pin += k; paint();
      if (pin.length === cfg.len) {
        if (await checkPin(pin, cfg)) return unlock();
        fails++;
        pin = ""; paint();
        dots.classList.remove("shake"); void dots.offsetWidth; dots.classList.add("shake");
        if (navigator.vibrate) navigator.vibrate(120);
        if (fails % 5 === 0) { waitUntil = Date.now() + 30000; msg.textContent = "Za dużo prób – poczekaj 30 s"; }
        else msg.textContent = "Błędny PIN";
      }
    }
    el.querySelector(".lk-pad").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) press(b.dataset.k); });
    el.addEventListener("keydown", e => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    });
    el.tabIndex = -1; el.focus();
    el.querySelector("#lk-forgot").onclick = () => alert(
      "PIN-u nie da się odzyskać ani obejść.\n\nMożesz usunąć dane aplikacji (Chrome → ⋮ → Ustawienia → Ustawienia witryn → Wszystkie witryny → chiniak.github.io → Wyczyść dane), " +
      "a potem przywrócić podróże z kopii zapasowej (Ustawienia → Kopia zapasowa).");
    if (cfg.bio) tryBio();
  }

  document.addEventListener("visibilitychange", () => {
    if (!cfg) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (!locked && hiddenAt && Date.now() - hiddenAt >= (cfg.timeout || 0) * 60000) showLock();
  });

  async function start() {
    try { cfg = await DB.getSetting("lock", null); } catch (e) { cfg = null; }
    mirror(!!cfg);
    if (cfg) showLock(); else document.documentElement.classList.remove("lock-pending");
  }
  document.addEventListener("DOMContentLoaded", start);

  /* ================= USTAWIENIA BLOKADY ================= */
  const pinField = (name, label) => `
    <label class="field"><span>${label}</span>
      <input type="password" name="${name}" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" required></label>`;

  App.route(/^\/ustawienia\/blokada$/, async () => {
    const cur = await DB.getSetting("lock", null);
    const bioOk = await bioAvailable();
    const TIMEOUTS = [[0, "od razu"], [1, "po 1 min"], [5, "po 5 min"], [15, "po 15 min"], [60, "po 1 h"]];

    const off = `
      <div class="card">
        <h2>🔒 Blokada PIN-em</h2>
        <p class="small muted" style="margin-top:0">Po włączeniu aplikacja przy otwarciu poprosi o PIN (4–6 cyfr)${bioOk ? " albo odcisk palca" : ""}.
          Chroni bilety i dane rezerwacji, gdy ktoś inny weźmie telefon.</p>
        <form id="lk-set" class="form" novalidate>
          ${pinField("p1", "Nowy PIN (4–6 cyfr)")}
          ${pinField("p2", "Powtórz PIN")}
          <p class="error" id="lk-err" hidden></p>
          <button class="btn primary wide" type="submit">Włącz blokadę</button>
        </form>
        <p class="small muted"><b>PIN-u nie da się odzyskać.</b> Gdy go zapomnisz, trzeba wyczyścić dane aplikacji i przywrócić je z kopii zapasowej – zrób ją najpierw.</p>
      </div>`;

    const on = cur ? `
      <div class="card">
        <h2>🔒 Blokada włączona</h2>
        <form id="lk-opts">
          <label class="rm-sel"><span>Blokuj po wyjściu z aplikacji</span>
            <select name="timeout">${TIMEOUTS.map(([v, n]) => `<option value="${v}" ${cur.timeout === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          ${bioOk ? `<label class="sw"><input type="checkbox" name="bio" ${cur.bio ? "checked" : ""}><span class="sw-ui" aria-hidden="true"></span><span>Odblokowanie odciskiem palca</span></label>` : ""}
        </form>
        <p class="small muted">Blokada chroni przed podejrzeniem danych w telefonie. Dane w pamięci przeglądarki nie są szyfrowane.</p>
      </div>
      <div class="card">
        <h2>Zmień PIN albo wyłącz</h2>
        <form id="lk-change" class="form" novalidate>
          ${pinField("old", "Obecny PIN")}
          ${pinField("p1", "Nowy PIN (zostaw puste, by tylko wyłączyć)").replace(" required", "")}
          ${pinField("p2", "Powtórz nowy PIN").replace(" required", "")}
          <p class="error" id="lk-err" hidden></p>
          <button class="btn primary wide" type="submit" name="act" value="change">Zmień PIN</button>
          <button class="btn danger wide" type="submit" name="act" value="off">Wyłącz blokadę</button>
        </form>
      </div>` : "";

    return {
      title: "Blokada",
      back: "#/ustawienia",
      html: cur ? on : off,
      after(view) {
        const err = m => { const p = view.querySelector("#lk-err"); p.textContent = m; p.hidden = !m; };
        const valid = p => /^\d{4,6}$/.test(p);

        const set = view.querySelector("#lk-set");
        if (set) set.addEventListener("submit", async e => {
          e.preventDefault();
          if (!valid(set.p1.value)) return err("PIN musi mieć od 4 do 6 cyfr.");
          if (set.p1.value !== set.p2.value) return err("PIN-y się różnią.");
          const rec = { ...(await makePin(set.p1.value)), timeout: 1, bio: null };
          await DB.setSetting("lock", rec);
          cfg = rec; mirror(true);
          App.toast("Blokada włączona");
          App.render();
        });

        const opts = view.querySelector("#lk-opts");
        if (opts) opts.addEventListener("change", async e => {
          const next = { ...cur, timeout: +opts.timeout.value };
          if (e.target.name === "bio") {
            if (e.target.checked) {
              try { next.bio = await bioRegister(); App.toast("Odcisk palca dodany"); }
              catch (e2) { e.target.checked = false; App.toast("Nie udało się dodać odcisku"); return; }
            } else next.bio = null;
          }
          await DB.setSetting("lock", next);
          Object.assign(cur, next); cfg = { ...next };
          if (e.target.name !== "bio") App.toast("Zapisano");
        });

        const ch = view.querySelector("#lk-change");
        if (ch) ch.addEventListener("submit", async e => {
          e.preventDefault();
          const act = e.submitter ? e.submitter.value : "change";
          if (!(await checkPin(ch.old.value, cur))) return err("Obecny PIN jest błędny.");
          if (act === "off") {
            if (!confirm("Wyłączyć blokadę PIN-em?")) return;
            await DB.del("settings", "lock");
            cfg = null; mirror(false);
            App.toast("Blokada wyłączona");
            return App.render();
          }
          if (!valid(ch.p1.value)) return err("Nowy PIN musi mieć od 4 do 6 cyfr.");
          if (ch.p1.value !== ch.p2.value) return err("Nowe PIN-y się różnią.");
          const next = { ...cur, ...(await makePin(ch.p1.value)) };
          await DB.setSetting("lock", next);
          cfg = next;
          App.toast("PIN zmieniony");
          App.render();
        });
      },
    };
  });

  App.Lock = { status: async () => !!(await DB.getSetting("lock", null)), lockNow: () => { if (cfg) showLock(); } };
})();
