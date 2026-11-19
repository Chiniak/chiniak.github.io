/* Tripwillow – powiadomienia o nowych wiadomościach, gdy aplikacja jest zamknięta (tylko aplikacja na Androida).
   Bez serwera: telefon sam co ok. 15 minut pyta Firebase o nowe wpisy (PushWorker / PushCheck w podroznik-app)
   i odszyfrowuje je u siebie. Ta część przekazuje do Androida (wtyczka Push) to, czego do tego trzeba:
   - token odświeżania Firebase (ten sam anonimowy / Google użytkownik co w aplikacji), apiKey, projekt,
   - pokoje wspólnych podróży z kluczami (sync.rooms) i moim identyfikatorem w czacie (sync.me) + nazwy podróży,
   - znajomych (social) z kluczem rozmowy: klucz AES wyliczony z ECDH (ten sam co w social.js, tu jako wartość do eksportu),
   - teksty w języku aplikacji.
   Dane zostają w pamięci aplikacji w telefonie (jak IndexedDB). Ustawienie „pushMsgs” (domyślnie włączone).
   Wysyłane przy starcie i przy każdym zamknięciu / schowaniu aplikacji (nowe pokoje, znajomi, odświeżony token). */
(function () {
  const plugin = () => window.PodroznikNative && PodroznikNative.isNative && window.Capacitor && Capacitor.Plugins.Push;
  const tr = t => self.I18N ? I18N.tr(t) : t;
  const S = () => App.Sync;

  async function enabled() { return (await DB.getSetting("pushMsgs", true)) !== false; }

  // klucz rozmowy ze znajomym (jak social.js sharedKey, ale do eksportu)
  async function pairKey(myPrivJwk, peerPub) {
    const { x, y } = JSON.parse(peerPub);
    const priv = await crypto.subtle.importKey("jwk", myPrivJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
    const pub = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x, y, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const k = await crypto.subtle.deriveKey({ name: "ECDH", public: pub }, priv, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    return S().b64u(new Uint8Array(await crypto.subtle.exportKey("raw", k)));
  }

  /* konfiguracja dla PushCheck; null – nie ma czego sprawdzać (brak wspólnych podróży i znajomych) */
  async function build() {
    if (!S() || !S().configured()) return null;
    const rooms = await DB.getSetting("sync.rooms", {}) || {};
    const social = await DB.getSetting("social", null);
    const friends = Object.entries((social && social.friends) || {}).filter(([, f]) => f.state === "ok" && f.pub);
    const keys = await DB.getSetting("social.keys", null);
    if (!Object.keys(rooms).length && !friends.length && !(social && keys)) return null;
    const f = await S().firebase();
    const u = f.auth.currentUser;
    if (!u || !u.refreshToken) return null;
    const emu = (() => { try { return localStorage.getItem("podroznik-emu"); } catch (e) { return null; } })();
    const cfg = emu ? { apiKey: "demo-key", projectId: "demo-podroznik", authUrl: "http://127.0.0.1:9099/securetoken.googleapis.com", fsUrl: "http://127.0.0.1:8085" }
      : { apiKey: self.SYNC_CONFIG.apiKey, projectId: self.SYNC_CONFIG.projectId };
    const trips = Object.fromEntries((await DB.all("trips")).map(t => [t.id, t.name]));
    await S().init();
    const out = {
      ...cfg, uid: u.uid, refreshToken: u.refreshToken, at: Date.now(), inbox: !!(social && keys),
      rooms: Object.entries(rooms).filter(([id]) => trips[id]).map(([tripId, r]) => ({ tripId, room: r.room, aes: r.key, me: S().me(), name: trips[tripId] })),
      friends: [],
      texts: { reqTitle: tr("Zaproszenie do znajomych"), reqText: tr("{} chce dodać Cię do znajomych"), channel: tr("Wiadomości"), channelDesc: tr("Czat podróży i znajomych") },
    };
    if (keys) for (const [uid, fr] of friends) {
      try { out.friends.push({ uid, name: fr.name || "?", conv: [u.uid, uid].sort().join("_"), aes: await pairKey(keys.priv, fr.pub) }); }
      catch (e) { console.warn("powiadomienia – klucz znajomego:", e); }
    }
    return out;
  }

  let busy = null;
  async function update() {
    const P = plugin();
    if (!P) return false;
    if (busy) return busy;
    busy = (async () => {
      if (!(await enabled())) { await P.configure({ on: false }); return false; }
      const cfg = await build().catch(e => { console.warn("powiadomienia:", e.message || e); return null; });
      if (!cfg) { await P.configure({ on: false }); return false; }
      await P.configure({ on: true, cfg: JSON.stringify(cfg) });
      return true;
    })().finally(() => { busy = null; });
    return busy;
  }

  async function setEnabled(on) {
    await DB.setSetting("pushMsgs", !!on);
    if (on && window.Capacitor && Capacitor.Plugins.LocalNotifications) {
      try { await Capacitor.Plugins.LocalNotifications.requestPermissions(); } catch (e) { /* odmowa */ }
    }
    return update();
  }

  // wiersz w Ustawieniach → Przypomnienia (reminders.js)
  async function settingsHtml() {
    if (!plugin()) return "";
    const on = await enabled();
    return `<h2 class="section">Wiadomości</h2>
      <div class="list rm-push"><label class="sw"><input type="checkbox" id="rm-push" ${on ? "checked" : ""}><span class="sw-ui" aria-hidden="true"></span>
        <span>Nowe wiadomości w czacie podróży i od znajomych – także przy zamkniętej aplikacji</span></label></div>
      <p class="f-hint">Telefon sprawdza co ok. 15 minut (przy internecie). Treść jest odszyfrowywana w telefonie – serwer jej nie zna.</p>`;
  }
  function bindSettings(view) {
    const el = view.querySelector("#rm-push");
    if (el) el.onchange = async () => { await setEnabled(el.checked); App.toast(el.checked ? "Powiadomienia o wiadomościach włączone" : "Powiadomienia o wiadomościach wyłączone"); };
  }

  App.Push = { build, update, enabled, setEnabled, settingsHtml, bindSettings, available: () => !!plugin() };

  if (plugin()) {
    // po starcie (Firebase wczytuje się tylko, gdy są wspólne podróże / znajomi) i przy chowaniu aplikacji
    document.addEventListener("DOMContentLoaded", () => setTimeout(() => update().catch(() => {}), 4000));
    document.addEventListener("visibilitychange", () => { if (document.hidden) update().catch(() => {}); });
  }
})();
