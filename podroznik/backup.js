/* Podróżnik – etap 6: kopia zapasowa.
   Trasa: #/ustawienia/kopia
   Plik kopii (JSON): { app: "podroznik", format: 1, exportedAt, counts, stores: { trips: [...], files: [...], ... } }
     pliki biletów zapisane jako data URL (pole blobData), więc jedna kopia zawiera wszystko.
   Z hasłem: { app: "podroznik", format: 1, encrypted: { salt, iv, iter, data } } – AES-GCM, klucz z hasła (PBKDF2-SHA-256).
   Do kopii NIE trafiają: blokada PIN (lock) i stan na tym telefonie (pokazane przypomnienia, ostatnio otwarte podróże). */
(function () {
  const { esc, plural } = App;
  const LOCAL_SETTINGS = new Set(["lock", "remShown", "remDismissed", "planTrip", "packTrip", "lastBackup"]);
  const COUNT_LABELS = [["trips", "podróże", "podróż", "podróży"], ["segments", "odcinki", "odcinek", "odcinków"], ["files", "bilety", "bilet", "biletów"],
    ["planItems", "punkty planu", "punkt planu", "punktów planu"], ["packItems", "rzeczy i zadania", "rzecz/zadanie", "rzeczy i zadań"],
    ["docs", "dokumenty", "dokument", "dokumentów"], ["expenses", "wydatki", "wydatek", "wydatków"]];

  /* ---------- base64 i szyfrowanie ---------- */
  function bytesToB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const b64ToBytes = b64 => { const s = atob(b64), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
  const blobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  function dataUrlToBlob(url) {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
    if (!m) throw new Error("Uszkodzony plik biletu w kopii");
    const bytes = m[2] ? b64ToBytes(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3]));
    return new Blob([bytes], { type: m[1] || "application/octet-stream" });
  }
  async function keyFrom(password, salt, iter) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encrypt(text, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 250000;
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(password, salt, iter), new TextEncoder().encode(text));
    return { salt: bytesToB64(salt), iv: bytesToB64(iv), iter, data: bytesToB64(new Uint8Array(data)) };
  }
  async function decrypt(enc, password) {
    try {
      const key = await keyFrom(password, b64ToBytes(enc.salt), enc.iter);
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(enc.iv) }, key, b64ToBytes(enc.data)));
    } catch (e) { throw new Error("Złe hasło albo uszkodzony plik."); }
  }

  /* ---------- eksport ---------- */
  async function snapshot() {
    const out = { app: "podroznik", format: 1, exportedAt: new Date().toISOString(), counts: {}, stores: {} };
    for (const st of DB.stores) {
      let rows = await DB.all(st);
      if (st === "settings") rows = rows.filter(r => !LOCAL_SETTINGS.has(r.key));
      rows = await Promise.all(rows.map(async f => {
        if (!(f.blob instanceof Blob)) return f;
        const { blob, ...rest } = f;
        return { ...rest, blobData: await blobToDataUrl(blob), blobName: blob.name || f.name || "", blobType: blob.type || f.mime || "" };
      }));
      out.stores[st] = rows;
      out.counts[st] = rows.length;
    }
    return out;
  }

  async function deliver(file) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return "shared"; } catch (e) { if (e.name === "AbortError") return "cancel"; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    return "downloaded";
  }

  async function exportBackup(password) {
    const snap = await snapshot();
    let body = JSON.stringify(snap);
    if (password) body = JSON.stringify({ app: "podroznik", format: 1, exportedAt: snap.exportedAt, counts: snap.counts, encrypted: await encrypt(body, password) });
    const name = `podroznik-kopia-${App.todayStr()}${password ? "-zaszyfrowana" : ""}.json`;
    const res = await deliver(new File([body], name, { type: "application/json" }));
    if (res !== "cancel") await DB.setSetting("lastBackup", { at: new Date().toISOString(), counts: snap.counts, bytes: body.length, encrypted: !!password });
    return { res, name, bytes: body.length };
  }

  /* ---------- import ---------- */
  async function readBackup(file, askPassword) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { throw new Error("To nie jest plik kopii Podróżnika (zły format)."); }
    if (!data || data.app !== "podroznik") throw new Error("To nie jest plik kopii Podróżnika.");
    if (data.format > 1) throw new Error("Kopia z nowszej wersji aplikacji – zaktualizuj aplikację.");
    if (data.encrypted) {
      const pw = await askPassword();
      if (pw == null) return null;
      data = JSON.parse(await decrypt(data.encrypted, pw));
    }
    if (!data.stores || typeof data.stores !== "object") throw new Error("Plik kopii jest niekompletny.");
    return data;
  }

  async function restore(data, mode) {
    const known = new Set(DB.stores);
    if (mode === "replace") {
      for (const st of DB.stores) {
        if (st === "settings") {
          for (const r of await DB.all("settings")) if (!LOCAL_SETTINGS.has(r.key)) await DB.del("settings", r.key);
        } else await DB.clear(st);
      }
    }
    let n = 0;
    for (const [st, rows] of Object.entries(data.stores)) {
      if (!known.has(st) || !Array.isArray(rows)) continue;
      for (const r of rows) {
        if (st === "settings" ? (!r.key || LOCAL_SETTINGS.has(r.key)) : !r.id) continue;
        let rec = r;
        if (r.blobData) {
          const { blobData, blobName, blobType, ...rest } = r;
          const blob = dataUrlToBlob(blobData);
          rec = { ...rest, blob: new File([blob], blobName || rest.name || "bilet", { type: blobType || blob.type }) };
        }
        await DB.putRaw(st, rec);
        n++;
      }
    }
    await DB.setSetting("remShown", {}); // przypomnienia przeliczą się od nowa
    return n;
  }

  // [magazyn, 2–4, 1, 5+]
  const countsText = c => COUNT_LABELS.filter(([k]) => c && c[k]).map(([k, few, one, many]) => `${c[k]} ${plural(c[k], one, few, many)}`)
    .join(" · ") || "brak danych";

  /* ================= EKRAN KOPII ================= */
  App.route(/^\/ustawienia\/kopia$/, async () => {
    const last = await DB.getSetting("lastBackup", null);
    const counts = {};
    for (const [k] of COUNT_LABELS) counts[k] = await DB.count(k);
    const age = last ? Math.floor((Date.now() - new Date(last.at)) / 86400000) : null;
    const lastTxt = last
      ? `${new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(last.at))}${age > 0 ? ` (${age} ${plural(age, "dzień", "dni", "dni")} temu)` : ""}`
      : "jeszcze nie było";
    const mb = n => (n / 1048576).toFixed(1).replace(".", ",") + " MB";

    return {
      title: "Kopia zapasowa",
      back: "#/ustawienia",
      html: `
        <div class="card">
          <h2>💾 Zrób kopię</h2>
          <div class="row"><span class="muted">W aplikacji</span><b>${countsText(counts)}</b></div>
          <div class="row"><span class="muted">Ostatnia kopia</span><b class="${!last || age > 30 ? "warn-txt" : ""}">${lastTxt}</b></div>
          ${last ? `<div class="row"><span class="muted">Rozmiar</span><b>${mb(last.bytes || 0)}${last.encrypted ? " · zaszyfrowana" : ""}</b></div>` : ""}
          <form id="bk-export" class="form" style="margin-top:12px">
            <label class="field"><span>Hasło do pliku (opcjonalnie)</span>
              <input type="password" name="pw" autocomplete="new-password" placeholder="bez hasła plik da się odczytać"></label>
            <label class="field" id="pw2-box" hidden><span>Powtórz hasło</span><input type="password" name="pw2" autocomplete="new-password"></label>
            <p class="error" id="bk-err" hidden></p>
            <button class="btn primary wide" type="submit">💾 Zapisz kopię (z biletami)</button>
          </form>
          <p class="small muted">Jeden plik z podróżami, biletami (zdjęcia, PDF, kody), planem, pakowaniem i ustawieniami.
            Na telefonie otworzy się menu „Udostępnij” – wybierz np. <b>Dysk Google</b>, mail do siebie albo „Zapisz w Plikach”.
            Plik bez hasła zawiera Twoje bilety i dane rezerwacji – trzymaj go w bezpiecznym miejscu. <b>Hasła nie da się odzyskać.</b></p>
        </div>

        <div class="card">
          <h2>📥 Przywróć z kopii</h2>
          <p class="small muted" style="margin-top:0">Np. po zmianie telefonu albo wyczyszczeniu danych przeglądarki.</p>
          <label class="btn wide">📂 Wybierz plik kopii (.json)<input type="file" id="bk-file" accept=".json,application/json" hidden></label>
          <div id="bk-preview"></div>
        </div>`,
      after(view) {
        const f = view.querySelector("#bk-export"), err = view.querySelector("#bk-err");
        f.pw.addEventListener("input", () => { view.querySelector("#pw2-box").hidden = !f.pw.value; });
        f.addEventListener("submit", async e => {
          e.preventDefault();
          err.hidden = true;
          const pw = f.pw.value;
          if (pw && pw.length < 6) { err.textContent = "Hasło musi mieć co najmniej 6 znaków."; err.hidden = false; return; }
          if (pw && pw !== f.pw2.value) { err.textContent = "Hasła się różnią."; err.hidden = false; return; }
          const btn = f.querySelector("button[type=submit]");
          btn.disabled = true; btn.textContent = "Przygotowuję…";
          try {
            const r = await exportBackup(pw);
            if (r.res === "downloaded") App.toast(`Zapisano ${r.name} (${mb(r.bytes)})`);
            else if (r.res === "shared") App.toast("Kopia gotowa");
            if (r.res !== "cancel") App.render();
          } catch (e2) {
            err.textContent = "Nie udało się zrobić kopii: " + e2.message; err.hidden = false;
          } finally { btn.disabled = false; btn.textContent = "💾 Zapisz kopię (z biletami)"; }
        });

        const prev = view.querySelector("#bk-preview");
        view.querySelector("#bk-file").addEventListener("change", async e => {
          const file = e.target.files[0];
          e.target.value = "";
          if (!file) return;
          prev.innerHTML = `<p class="muted small">Czytam plik…</p>`;
          let data;
          try {
            data = await readBackup(file, () => Promise.resolve(prompt("Ta kopia jest zaszyfrowana. Podaj hasło:")));
          } catch (e2) { prev.innerHTML = `<p class="error">${esc(e2.message)}</p>`; return; }
          if (!data) { prev.innerHTML = ""; return; }
          const c = {};
          for (const [k] of COUNT_LABELS) c[k] = (data.stores[k] || []).length;
          const when = data.exportedAt ? new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(data.exportedAt)) : "?";
          prev.innerHTML = `
            <div class="bk-box">
              <div class="row"><span class="muted">Kopia z</span><b>${when}</b></div>
              <div class="row"><span class="muted">Zawiera</span><b>${countsText(c)}</b></div>
              <button type="button" class="btn primary wide" data-mode="merge">Dołącz do obecnych danych</button>
              <button type="button" class="btn wide" data-mode="replace">Zastąp wszystko kopią</button>
              <p class="small muted">„Dołącz” dodaje brakujące i nadpisuje te same pozycje wersją z kopii. „Zastąp” najpierw usuwa wszystko z aplikacji.</p>
            </div>`;
          prev.querySelectorAll("[data-mode]").forEach(b => b.onclick = async () => {
            const mode = b.dataset.mode;
            if (mode === "replace" && !confirm("Usunąć wszystkie obecne dane z aplikacji i wczytać kopię? Tego nie da się cofnąć.")) return;
            prev.querySelectorAll("button").forEach(x => { x.disabled = true; });
            try {
              const n = await restore(data, mode);
              App.toast(`Przywrócono ${n} ${plural(n, "pozycję", "pozycje", "pozycji")}`);
              if (App.Reminders) App.Reminders.tick();
              location.replace("#/podroze");
            } catch (e2) {
              prev.insertAdjacentHTML("beforeend", `<p class="error">Błąd przywracania: ${esc(e2.message)}</p>`);
            }
          });
        });
      },
    };
  });

  App.Backup = { exportBackup, readBackup, restore, snapshot, encrypt, decrypt, blobToDataUrl, dataUrlToBlob, deliver };
})();
