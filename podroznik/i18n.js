/* Tripwillow – języki: polski (napisany w kodzie), angielski (słownik i18n-en.js) i słowniki i18n-de/es/it/pt/zh.js (ładowane tylko dla wybranego języka – patrz skrypt w index.html).
   Działa jak „tłumacz ekranu”: po każdej zmianie widoku podmienia teksty, podpowiedzi (placeholder), opisy (aria-label, title),
   okienka confirm/prompt/alert i tytuł strony. Daty i liczby: App/I18N.locale ("pl-PL", "en-GB", "de-DE"…).
   Wybór: Ustawienia → Język (localStorage "podroznik-lang": pl | en | de | es | it | pt | zh | auto; auto = pierwszy obsługiwany język telefonu, inaczej angielski).
   W service workerze (powiadomienia) język czytany z bazy (ustawienie "lang"). */
(function (root) {
  const isWin = typeof document !== "undefined";

  /* ---------- języki: polski (w kodzie), angielski (i18n-en.js), pozostałe: i18n-<kod>.js → I18N_DICTS[kod] ---------- */
  const LANGS = {
    pl: { name: "Polski", locale: "pl-PL" }, en: { name: "English", locale: "en-GB" }, de: { name: "Deutsch", locale: "de-DE" },
    es: { name: "Español", locale: "es-ES" }, it: { name: "Italiano", locale: "it-IT" }, pt: { name: "Português", locale: "pt-PT" }, zh: { name: "中文", locale: "zh-CN" },
  };
  const dictOf = l => l === "en" ? (root.I18N_EN || {}) : ((root.I18N_DICTS || {})[l] || {});

  // auto = pierwszy obsługiwany język telefonu (kolejność jak na liście języków telefonu), w innym wypadku angielski
  function pickLang(pref) {
    if (LANGS[pref]) return pref;
    const nav = (root.navigator && (navigator.languages || [navigator.language])) || [];
    if (!nav.length || nav.some(l => /^pl\b/i.test(l || ""))) return "pl"; // kto ma polski na liście, dostaje polski (jak dotąd)
    for (const l of nav) { const c = String(l || "").slice(0, 2).toLowerCase(); if (LANGS[c]) return c; }
    return "en";
  }
  let pref = "auto";
  try { pref = (isWin && localStorage.getItem("podroznik-lang")) || "auto"; } catch (e) { /* brak dostępu */ }
  let lang = pickLang(pref);

  /* ---------- wzorce z {} (budowane dla bieżącego języka) ---------- */
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let DICT = {}, patterns = [];
  function build() {
    DICT = lang === "en" ? dictOf("en") : { ...dictOf("en"), ...dictOf(lang) }; patterns = []; // brak tłumaczenia → angielski (nie polski)
    for (const [k, v] of Object.entries(DICT)) {
      if (!k.includes("{}")) continue;
      const parts = k.split("{}");
      const statics = parts.join("");
      if (!/[^\s·:,.()–\-—/%×+]/.test(statics)) continue; // same znaki interpunkcyjne – za ogólne
      const re = new RegExp("^" + parts.map(esc).join("([\\s\\S]*?)") + "$");
      const longest = parts.slice().sort((a, b) => b.length - a.length)[0];
      patterns.push({ re, v, n: parts.length - 1, longest, weight: statics.length });
    }
    patterns.sort((a, b) => b.weight - a.weight);
  }
  build();
  if (lang !== "pl" && lang !== "en" && !Object.keys(dictOf(lang)).length) { lang = "en"; build(); } // brak pliku słownika (np. offline) – angielski

  const fill = (tpl, args) => {
    let i = 0;
    return tpl.replace(/\{(\d*)\}/g, (_, d) => (d !== "" ? args[+d] : args[i++]) ?? "");
  };

  const cache = new Map();
  function tr(s, depth = 0) {
    if (lang === "pl" || s == null) return s;
    const str = String(s);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
    const core = m[2].replace(/\s+/g, " ");
    if (!core || !/[A-Za-zÀ-ž]/.test(core)) return str;
    if (cache.has(core)) return m[1] + cache.get(core) + m[3];
    let out = null;
    if (Object.prototype.hasOwnProperty.call(DICT, core)) out = DICT[core];
    if (out == null && depth < 6) {
      for (const p of patterns) {
        if (p.longest && !core.includes(p.longest)) continue;
        const mm = p.re.exec(core);
        if (!mm) continue;
        const r = fill(p.v, mm.slice(1).map(a => tr(a, depth + 1)));
        if (r === core) continue; // wzorzec pasuje, ale nic nie zmienia – spróbuj innego
        out = r;
        break;
      }
      // znak / ikona na początku („· dzień 2”, „– wydano 30 PLN”, „⚠️ Brak…”) albo nawias / kropka na końcu
      if (out == null) {
        const pre = /^((?:[·–\-—•,:;(+]|\p{Extended_Pictographic}|\uFE0F|\u200D)\s*)+/u.exec(core);
        if (pre && pre[0].length < core.length) { const r = tr(core.slice(pre[0].length), depth + 1); if (r !== core.slice(pre[0].length)) out = pre[0] + r; }
      }
      if (out == null) {
        const post = /\s*[).:,;]+$/.exec(core);
        if (post && post.index > 0) { const r = tr(core.slice(0, post.index), depth + 1); if (r !== core.slice(0, post.index)) out = r + post[0]; }
      }
      // liczba + słowo: „2 odcinki”, „3 dni”
      if (out == null) {
        const num = /^([−\-+]?\d[\d\s.,:%/]*)\s+(\D.*)$/.exec(core);
        if (num) { const r = tr(num[2], depth + 1); if (r !== num[2]) out = num[1] + " " + r; }
      }
      // złożone teksty: „Lot · LO 281 · przyjazd 10:50” – część po części
      if (out == null) {
        for (const sep of [" · ", " – ", ": ", ", "]) {
          if (!core.includes(sep)) continue;
          const bits = core.split(sep), t = bits.map(b => tr(b, depth + 1));
          if (t.some((x, i) => x !== bits[i])) { out = t.join(sep); break; }
        }
      }
    }
    if (out == null) out = core;
    if (cache.size > 5000) cache.clear();
    cache.set(core, out);
    return m[1] + out + m[3];
  }
  // tekst wielowierszowy (plan do wysłania, rozliczenie)
  const trText = s => lang === "pl" ? s : String(s).split("\n").map(l => tr(l)).join("\n");

  const I18N = root.I18N = {
    get lang() { return lang; },
    get pref() { return pref; },
    get locale() { return LANGS[lang].locale; },
    LANGS,
    // języki do zapytań o artykuły (Wikipedia, Wikivoyage): najpierw język aplikacji, potem polski i angielski
    dataLangs() { return [...new Set([lang, "pl", "en"])]; },
    tr, trText,
    setLang(p) {
      pref = p; lang = pickLang(p);
      // service worker: słowniki są wczytane na starcie (importScripts), brak = angielski
      if (lang !== "pl" && lang !== "en" && !Object.keys(dictOf(lang)).length) lang = "en";
      build(); cache.clear();
    },
  };

  if (!isWin) return; // service worker – tylko tr()

  /* ---------- tłumaczenie ekranu ---------- */
  const ATTRS = ["placeholder", "aria-label", "title", "alt"];
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]); // tekst wewnątrz – nie tłumaczymy (np. notatka)
  function skip(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (SKIP.has(e.tagName) || e.isContentEditable || (e.getAttribute && e.getAttribute("translate") === "no")) return true;
    }
    return false;
  }
  const trAttrs = el => { for (const a of ATTRS) if (el.hasAttribute(a)) { const v = el.getAttribute(a), t = tr(v); if (t !== v) el.setAttribute(a, t); } };
  function trNode(n) {
    if (n.nodeType === 3) {
      const p = n.parentElement;
      if (!p || skip(p)) return;
      const v = n.nodeValue, t = tr(v);
      if (t !== v) n.nodeValue = t;
    } else if (n.nodeType === 1) {
      if (n.closest && n.closest("[translate=no]")) return;
      trAttrs(n); // także pola formularza: podpowiedź (placeholder), opis
      if (SKIP.has(n.tagName)) return;
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let x;
      while ((x = w.nextNode())) {
        if (x.nodeType === 3) trNode(x);
        else if (!(x.closest && x.closest("[translate=no]"))) trAttrs(x);
      }
    }
  }
  I18N.translate = (node = document.body) => { if (lang !== "pl") trNode(node); };

  if (lang !== "pl") {
    document.documentElement.lang = lang;
    const obs = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") trNode(m.target);
        else if (m.type === "attributes") trNode(m.target.nodeType === 1 ? m.target : m.target.parentElement);
        else m.addedNodes.forEach(trNode);
      }
      if (document.title) { const t = tr(document.title); if (t !== document.title) document.title = t; }
    });
    const start = () => {
      trNode(document.body);
      obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    };
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
    // okienka systemowe
    const c = window.confirm.bind(window), p = window.prompt.bind(window), a = window.alert.bind(window);
    window.confirm = msg => c(tr(msg));
    window.prompt = (msg, def) => p(tr(msg), def);
    window.alert = msg => a(tr(msg));
  }
})(self);
