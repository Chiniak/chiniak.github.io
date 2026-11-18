/* Podróżnik – konto: zakładanie konta przez Google lub Facebooka i łączenie kont (rdzeń w social.js).
   Trasa #/konto (Ustawienia → Twoje konto; link też z karty konta w Znajomych).
   Konto = profil w Podróżniku (znajomi, czaty, widoczność podróży). Można do niego podpiąć Google i Facebooka naraz –
   wtedy zalogujesz się którymkolwiek z nich i zawsze trafisz do tego samego profilu. Plany podróży i tak zostają na telefonie.
   App.Account.signIn(provider) – wspólne logowanie z pytaniami (przejście na inny profil, ten sam e-mail u innego dostawcy). */
(function () {
  const { esc } = App;
  const ic = (n, c = "sm") => App.icon(n, c);
  const SO = () => App.Social;
  const NAME = { "google.com": "Google", "facebook.com": "Facebook" };
  const GLOGO = App.icon("google", "ac-logo"), FLOGO = App.icon("facebook", "ac-logo");
  const LOGO = { "google.com": GLOGO, "facebook.com": FLOGO };

  const errMsg = e => e && e.code === "noconfig" ? "Konta nie są jeszcze włączone w tej wersji aplikacji."
    : !navigator.onLine ? "Brak internetu – spróbuj, gdy będzie połączenie."
    : e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request" || e.code === "CANCELED" || e.code === "switch-canceled") ? "Anulowano"
    : e && e.code === "auth/operation-not-allowed" ? "Ten sposób logowania nie jest jeszcze włączony w Firebase"
    : e && e.code === "auth/requires-recent-login" ? "Zaloguj się ponownie i spróbuj jeszcze raz."
    : e && e.code === "last-provider" ? e.message
    : `Nie udało się: ${(e && (e.message || e.code)) || "błąd"}`;

  // pytanie przed przejściem na profil, do którego to konto Google/Facebook już należy
  const confirmSwitch = ({ hasAcc, hasFriends }) => Promise.resolve(confirm(
    "To konto jest już połączone z innym profilem w Podróżniku (np. z poprzedniego telefonu). Przełączyć się na tamten profil? " +
    (hasAcc ? "Obecny profil wróci, gdy zalogujesz się jego kontem." : hasFriends ? "Znajomi z obecnego profilu bez konta znikną z tego telefonu." : "")));

  // logowanie / łączenie: provider "google.com" | "facebook.com"; zwraca konto albo null (anulowano)
  async function signIn(provider, opts = {}) {
    const go = p => p === "facebook.com" ? SO().signInFacebook({ confirmSwitch, ...opts }) : SO().signInGoogle({ confirmSwitch, ...opts });
    try { return await go(provider); }
    catch (e) {
      if (e.code !== "other-provider") throw e;
      // ten sam e-mail ma już konto przez innego dostawcę – zaloguj tamtym i dołącz ten
      const other = provider === "facebook.com" ? "google.com" : "facebook.com";
      if (other === "facebook.com" && !SO().fbAvailable()) throw e;
      if (!confirm(`Adres ${e.email || "e-mail"} ma już konto w Podróżniku przez ${NAME[other]}. Zalogować się przez ${NAME[other]} i połączyć z ${NAME[provider]}?`))
        throw Object.assign(new Error("Anulowano"), { code: "CANCELED" });
      return SO()[other === "facebook.com" ? "signInFacebook" : "signInGoogle"]({ confirmSwitch, pending: e.pending });
    }
  }
  App.Account = { signIn, errMsg };

  App.route(/^\/konto$/, async () => {
    if (!SO() || !SO().available()) return {
      title: "Twoje konto",
      html: App.empty("👤", "Już wkrótce", "Konto przez Google lub Facebooka uruchomimy razem ze znajomymi i wspólnym planowaniem. Bez konta wszystko działa – plany zostają na telefonie."),
    };
    let acc = null, err = null, st = {};
    try { await SO().enable(); acc = await SO().account(); st = await SO().state(); } catch (e) { err = e; }
    const fbOn = SO().fbAvailable();

    const btn = (p, label, cls = "") => `<button type="button" class="btn wide ac-btn ${cls}" data-sign="${p}">${LOGO[p]} <span>${label}</span></button>`;
    let body;
    if (err) body = `<p class="gd-err">${esc(errMsg(err))}</p>`;
    else if (!acc) body = `
      <section class="card ac-hero">
        <h2 class="ac-h">Załóż konto albo zaloguj się</h2>
        <p class="muted">Jedno dotknięcie – bez nowego hasła. Jeśli masz już konto, zalogujesz się do niego.</p>
        ${btn("google.com", "Kontynuuj z Google", "primary")}
        ${fbOn ? btn("facebook.com", "Kontynuuj z Facebookiem")
          : `<button type="button" class="btn wide ac-btn" disabled>${FLOGO} <span>Facebook – już wkrótce</span></button>`}
        <ul class="ac-why">
          <li>${ic("users")} <span>znajomi i czaty przejdą z Tobą na nowy telefon</span></li>
          <li>${ic("search")} <span>znajomi znajdą Cię po adresie e-mail</span></li>
          <li>${ic("chat")} <span>z Facebookiem – zobaczysz znajomych, którzy też mają Podróżnika</span></li>
        </ul>
        <p class="f-hint">Bez konta też wszystko działa – plany, bilety i dokumenty zostają na telefonie. Konto nie wysyła nigdzie Twoich planów.</p>
      </section>`;
    else {
      const prov = [["google.com", acc.google, acc.gEmail || acc.email], ["facebook.com", acc.facebook, acc.fbName || acc.fbEmail]];
      const count = prov.filter(x => x[1]).length;
      const row = ([p, on, who]) => (p === "facebook.com" && !on && !fbOn) ? "" : `
        <div class="li ac-row" data-prov="${p}"><span class="li-ico ac-ico">${LOGO[p]}</span>
          <span class="li-main"><b>${NAME[p]}</b><small>${on ? `<span translate="no">${esc(who || "połączone")}</span>` : "niepołączone"}</small></span>
          ${on ? `<span class="chip ok">połączone</span>${count > 1 ? `<button type="button" class="btn small" data-unlink="${p}">Odłącz</button>` : ""}`
            : `<button type="button" class="btn small primary" data-sign="${p}">Połącz</button>`}</div>`;
      body = `
      <section class="card ac-me">
        <div class="zn-acc-h"><span class="li-ico">${ic("lock")}</span><span class="li-main"><b>${esc(acc.name || "Twoje konto")}</b><small translate="no">${esc(acc.email)}</small></span></div>
      </section>
      <h2 class="section">Połączone konta</h2>
      <div class="list ac-list">${prov.map(row).join("")}</div>
      <p class="f-hint">Połączone konta to jeden profil – zalogujesz się którymkolwiek z nich i zobaczysz tych samych znajomych i czaty.${count < 2 ? " Połącz drugie konto, żeby nie stracić dostępu, gdy jedno przestanie działać." : ""}</p>
      <div class="list zn-more">
        <a class="li" href="#/znajomi"><span class="li-ico">${ic("users")}</span><span class="li-main"><b>Znajomi</b>
          <small>${st.findable !== false ? "znajdą Cię po e-mailu" : "e-mail ukryty"} · ${st.vault !== false ? "kopia na koncie włączona" : "bez kopii na koncie"}</small></span>${ic("chev", "")}</a>
      </div>
      <button type="button" class="btn wide danger ac-out" id="ac-out">Wyloguj z tego telefonu</button>`;
    }
    return {
      title: "Twoje konto",
      html: body,
      after(view) {
        view.querySelectorAll("[data-sign]").forEach(b => b.onclick = async () => {
          b.disabled = true;
          try {
            const a = await signIn(b.dataset.sign);
            App.toast(acc ? `Połączono z ${NAME[b.dataset.sign]}` : `Zalogowano${a && a.email ? ": " + a.email : ""}`);
          } catch (e) { App.toast(errMsg(e)); }
          App.render();
        });
        view.querySelectorAll("[data-unlink]").forEach(b => b.onclick = async () => {
          const p = b.dataset.unlink;
          if (!confirm(`Odłączyć ${NAME[p]}? Nie zalogujesz się już przez ${NAME[p]} – tylko drugim połączonym kontem.`)) return;
          b.disabled = true;
          try { await SO().unlink(p); App.toast(`Odłączono ${NAME[p]}`); } catch (e) { App.toast(errMsg(e)); }
          App.render();
        });
        const out = view.querySelector("#ac-out");
        if (out) out.onclick = async () => {
          if (!confirm("Wylogować konto na tym telefonie? Znajomi i czaty znikną z telefonu" + (st.vault !== false ? ", ale wrócą po ponownym zalogowaniu." : " (kopia na koncie jest wyłączona – nie wrócą).")))
            return;
          try { await SO().signOut(); App.toast("Wylogowano"); } catch (e) { App.toast(errMsg(e)); }
          App.render();
        };
      },
    };
  });
})();
