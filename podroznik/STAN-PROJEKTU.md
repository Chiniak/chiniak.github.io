# Podróżnik – stan projektu (do kontynuacji w nowej sesji)

Ostatnia aktualizacja: 12 listopada 2026 – PR #6 i #7 scalone; na gałęzi: tło ze zdjęć (`backdrop.js`). Zacznij od przeczytania tego pliku, potem `PLAN.md` i `DO-SPRAWDZENIA.md`.

## Gdzie co jest
- Repozytorium: `chiniak/chiniak.github.io`, gałąź **`claude/travel-planning-app-tl9mvf`**
- Wszystko scalone na `main`: PR #1 (etapy 0–8), #2 (etapy 7, 9, 10), #3 i #4 (poprawki Odkrywaj),
  #5 (GPS w Odkrywaj, mapa na właściwym celu, dodawanie punktu z mapy, Azja: mapy/nawigacja/waluty, odznaczanie pomysłów, **język angielski**).
- Aplikacja na żywo: https://chiniak.github.io/podroznik/ (wersja „1.1 · etapy 0–10”, pamięć offline `podroznik-v21`; po PR #6: „1.2 · etapy 0–11”, `podroznik-v22`; po PR #7 `podroznik-v23`; na gałęzi `podroznik-v24`).
- Gałąź robocza: po scaleniu PR zacząć ją od nowa od `origin/main` (git checkout -B … origin/main), nie nadpisywać historii (force push zablokowany).
- Aplikacja https://chiniak.github.io/podroznik/ , APK https://chiniak.github.io/podroznik/Podroznik.apk
- `podroznik/` – aplikacja (PWA, czysty JS bez frameworka, dane w IndexedDB, offline przez service worker)
- `podroznik-android/` – projekt APK (Trusted Web Activity, Bubblewrap), instrukcja w jego README
- `podroznik-testy/` – testy Playwright + przykładowe dane, instrukcja w README
- `.well-known/assetlinks.json` – odciski kluczy KWS i Podróżnika (aplikacje bez paska adresu)
- Drugie repozytorium sesji: `chiniak/kws` (aplikacja KWS – nie była zmieniana)

## Co jest zrobione
Wszystkie etapy 0–10 z `PLAN.md` (✅), w tym APK, strefy czasowe, tło podróży, .pkpass i funkcje jak w Wanderlog
(mapa i trasa dnia, pomysły, odkrywanie, rozliczenie w grupie, wspólna podróż plikiem). Szczegóły: `PLAN.md`.
**Etap 11** (PR #6): karty dla kierowcy z adresem w lokalnym piśmie, rozmówki (zh/th/vi/lo), mapa offline. Na gałęzi: **zdjęcia miejsc** w planie i pomysłach (`photos.js`).
Nic nie było jeszcze testowane na prawdziwym telefonie – lista: `DO-SPRAWDZENIA.md`.

## Testy na telefonie (właściciel, 11.11)
- Działa: APK bez paska adresu, przypomnienia, bilet na pełnym ekranie, mapa, Odkrywaj (+ „📍 Tutaj” po poprawce), pomysły, rozliczenie, wyszukiwarka miejsc.
- Nie sprawdzone: wysyłanie podróży plikiem (brak drugiej osoby), .pkpass (brak biletu).
- Do sprawdzenia przez właściciela (po scaleniu PR #5): mapa nie skacze na San Juan, dotknięcie mapy → punkt, Ustawienia → Język → English, Nawigacja → Organic Maps.
- Właściciel leci do **Chin, Laosu, Wietnamu i Tajlandii** – stąd mapy z napisami łacińskimi, kafelki offline, Amap/geo:, NBP tabela B.

## Co zostało
1. **Właściciel:** scalić PR #1, zainstalować APK, przejść `DO-SPRAWDZENIA.md` i zgłosić błędy.
2. Pomysły na dalej: więcej języków (słownik jak `i18n-en.js`), edycja na żywo przez kilka osób (wymagałaby serwera, np. Firebase), licznik w APK według strefy lotniska.
3. Poprawki po testach na telefonie (najbardziej prawdopodobne: odczyt maili od prawdziwych przewoźników – `email.js`).

## Pliki aplikacji (`podroznik/`)
| Plik | Rola |
|---|---|
| `index.html` | szkielet, kolejność skryptów, skrypt blokady w `<head>` |
| `app.js` | router (`App.route`), pomocniki dat, ustawienia, start aplikacji, odbiór udostępnionego tekstu |
| `db.js` | IndexedDB, **wersja 2**: trips, segments, files, planItems, packItems, templates, reminders, settings, docs, expenses |
| `trips.js` | podróże, odcinki (9 rodzajów), oś czasu |
| `tickets.js` | bilety: pliki, kody (bwip-js / ZXing / BarcodeDetector), pełny ekran, skaner |
| `plan.js` | plan dnia, karta „Dziś”, przeciąganie |
| `pack.js` | pakowanie, szablony |
| `reminders-core.js` | wyliczanie przypomnień – działa też w service workerze |
| `reminders.js` | licznik, powiadomienia, ustawienia przypomnień, eksport .ics |
| `backup.js`, `lock.js` | kopia zapasowa (opcjonalnie AES-GCM), blokada PIN / odcisk palca |
| `docs.js`, `budget.js`, `stats.js`, `weather.js`, `email.js` | etap 8: dokumenty, budżet, statystyki i mapa, pogoda, odczyt maili |
| `places.js`, `discover.js`, `split.js`, `share.js` | etap 10: mapa i trasa dnia, odkrywanie, rozliczenie w grupie, wspólna podróż |
| `phrases.js`, `offline.js` | etap 11: karty dla kierowcy + rozmówki; mapa offline |
| `i18n.js`, `i18n-en.js` | języki: „tłumacz ekranu” (MutationObserver) + słownik PL→EN; `I18N.locale` do dat i liczb |
| `sw.js` | offline + powiadomienia w tle (periodicsync) + kliknięcie powiadomienia |
| `lib/` | pdf.js, bwip-js, ZXing, Leaflet, airports.js (OpenFlights), world.js (Natural Earth) – licencje w `lib/` |

## Zasady i pułapki (ważne przy zmianach)
- **Po każdej zmianie plików aplikacji podbij `CACHE` w `sw.js`** (teraz `podroznik-v24`) i dopisz nowe pliki do listy `APP`.
- Nowy magazyn danych = podbić `VERSION` w `db.js` i dodać do `STORES` (aktualizacja zachowuje dane – test t12).
- Nasłuch zdarzeń podpinaj do elementów widoku, **nie do `#view`** (zostaje między ekranami → podwójne akcje).
- Router ignoruje wolniej wczytany starszy ekran (`renderSeq` w `app.js`).
- `r.cleanup` w widoku – sprzątanie (kamera, liczniki, blokada ekranu).
- Polska odmiana: `App.plural(n, "1", "2–4", "5+")`.
- **Nowy tekst na ekranie = dopisz tłumaczenie do `i18n-en.js`** (klucz = tekst polski, `{}` = wstawiana wartość). Brakujące teksty pokazuje test `t26` (ekrany po angielsku).
- Daty/liczby: `self.I18N ? I18N.locale : "pl-PL"` zamiast "pl-PL". Testy ustawiają `locale: 'pl-PL'` (inaczej aplikacja przejdzie na angielski).
- Ustawienia: `navApp` (google/geo/amap → `App.mapsUrl`), `mapLayer` (latin/osm), `lang` (też w localStorage `podroznik-lang`).
- Mapa offline: pamięć `mapa-offline-<id podróży>` (tylko CARTO, zapis z adresem `a.basemaps…` bez parametrów); sw.js szuka kafelka we wszystkich pamięciach (`caches.match` z kluczem `canon()`), zapytania z `?podroznik-off=1` puszcza wprost do sieci. Usuwana razem z podróżą.
- Tło ze zdjęć: `App.Backdrop.next()` wołane na końcu `render()`; lista kandydatów `bgPool` (Commons, kategoria Featured pictures, wyszukiwanie po hasłach podróżniczych, odświeżana co 30 dni), zdjęcia w pamięci `tla-zdjecia` (max 100, po jednym przy przejściu; nie przy oszczędzaniu danych). Ustawienie `bgPhotos` + `localStorage podroznik-bg`. Czytelność: `--veil` (mgiełka) i półprzezroczyste paski z rozmyciem (`html.has-bg`).
- Zdjęcia miejsc: pole `photo` { data (JPEG data URL ~360 px), page, credit, auto } w punkcie planu; `photoTry` = ostatnia próba (bez trafienia – nowa za 7 dni), `photoOff` = usunięte ręcznie, `photoUrl`/`wikiUrl` z Odkrywaj. Plan dociąga brakujące w tle (`App.Photos.fill`) i wstawia miniatury bez przeładowania (`data-pid`). Zmiana nazwy/położenia kasuje zdjęcie automatyczne.
- Test t5 bywa czerwony blisko północy (godziny liczone od „teraz”) – także na niezmienionym kodzie.
- Karty dla kierowcy: pole `local` { lat, lon, cc, lang, name, addr } w noclegu / punkcie planu (Nominatim reverse: najpierw kraj po angielsku, potem adres w języku kraju – `LANG_OF` w phrases.js); nieaktualne, gdy zmieni się położenie. Zapytania Nominatim idą przez wspólną kolejkę `App.Places.osm`.
- Kafelki mapy w pamięci `mapa-kafelki` (sw.js, do 4000) – nie zaczyna się od „podroznik-”, więc nie jest kasowana przy nowej wersji.
- Godziny zapisywane jako czas lokalny miejsca: `"RRRR-MM-DDTGG:MM"`.
- Pogoda i wyszukiwanie miast używają Open-Meteo (bez klucza); po błędzie 10 min przerwy.
- Etap 10: miejsca – Nominatim (najwyżej 1 zapytanie/s, kolejka w `places.js`), atrakcje – Overpass API, opisy – Wikipedia, podkład mapy – kafelki OpenStreetMap. Wszystko bez klucza, tylko online.
- Strefy czasowe odcinków (`tzFrom`, `tzTo`, `tzKey`) uzupełnia `App.Stats.fillTz` przy otwarciu podróży; czas trwania: `App.segMinutes`.
- Tło podróży = rekord w `files` z `segmentId: "cover"`. Pomysł = punkt planu z `date: ""`.

## APK i klucz
- Pakiet `io.github.chiniak.podroznik`, wersja 1.0.0 (versionCode 1), odcisk SHA-256 w `assetlinks.json`.
- **Klucz podpisu i hasło NIE są w repozytorium** – właściciel dostał plik `podroznik-klucz-podpisu.zip` (keystore + HASLO.txt). Do nowej wersji APK trzeba go poprosić o ten plik.
- Środowisko chmurowe **„Chiniak – Android”** ma dostęp do dl.google.com (Android SDK). SDK instaluje się poleceniami z `podroznik-android/README.md` (cmdline-tools, `platforms;android-36`, `build-tools;35.0.0`); Maven przez mirror `repo.maven.apache.org` (jcenter wycofany, repo1 zwracał 429).
- Zmiany w stronie nie wymagają nowego APK (aplikacja wczytuje stronę).

## Historia ważnych zdarzeń
- Etapy 3–8 robione bez dostępu do GitHuba (błąd 403 przez kilka godzin); wszystko zostało wypchnięte po ponownym połączeniu.
- Właściciel woli robić wszystko krok po kroku, po polsku, z podsumowaniem po każdym etapie i listą rzeczy do sprawdzenia.
