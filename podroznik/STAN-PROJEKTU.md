# Podróżnik – stan projektu (do kontynuacji w nowej sesji)

Ostatnia aktualizacja: 9 listopada 2026. Zacznij od przeczytania tego pliku, potem `PLAN.md` i `DO-SPRAWDZENIA.md`.

## Gdzie co jest
- Repozytorium: `chiniak/chiniak.github.io`, gałąź **`claude/travel-planning-app-tl9mvf`**
- Pull request: **#1** https://github.com/Chiniak/chiniak.github.io/pull/1 (otwarty, czeka na scalenie przez właściciela)
- Po scaleniu: aplikacja https://chiniak.github.io/podroznik/ , APK https://chiniak.github.io/podroznik/Podroznik.apk
- `podroznik/` – aplikacja (PWA, czysty JS bez frameworka, dane w IndexedDB, offline przez service worker)
- `podroznik-android/` – projekt APK (Trusted Web Activity, Bubblewrap), instrukcja w jego README
- `podroznik-testy/` – testy Playwright + przykładowe dane, instrukcja w README
- `.well-known/assetlinks.json` – odciski kluczy KWS i Podróżnika (aplikacje bez paska adresu)
- Drugie repozytorium sesji: `chiniak/kws` (aplikacja KWS – nie była zmieniana)

## Co jest zrobione
Wszystkie etapy 0–8 z `PLAN.md` (✅), w tym APK. Szczegóły: `PLAN.md`.
Nic nie było jeszcze testowane na prawdziwym telefonie – lista: `DO-SPRAWDZENIA.md`.

## Co zostało
1. **Właściciel:** scalić PR #1, zainstalować APK, przejść `DO-SPRAWDZENIA.md` i zgłosić błędy.
2. Drobiazgi (nie zrobione):
   - **strefy czasowe** – czas lotu między strefami liczony „na zegarku”; `lib/airports.js` ma już strefę (IANA) każdego lotniska, więc można liczyć dokładnie (Intl z timeZone),
   - **zdjęcie jako tło podróży** (pkt 6 planu – jest tylko kolor),
   - **karty .pkpass** z Apple/Google Wallet (pkt 16).
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
| `sw.js` | offline + powiadomienia w tle (periodicsync) + kliknięcie powiadomienia |
| `lib/` | pdf.js, bwip-js, ZXing, airports.js (OpenFlights), world.js (Natural Earth) – licencje w `lib/` |

## Zasady i pułapki (ważne przy zmianach)
- **Po każdej zmianie plików aplikacji podbij `CACHE` w `sw.js`** (teraz `podroznik-v13`) i dopisz nowe pliki do listy `APP`.
- Nowy magazyn danych = podbić `VERSION` w `db.js` i dodać do `STORES` (aktualizacja zachowuje dane – test t12).
- Nasłuch zdarzeń podpinaj do elementów widoku, **nie do `#view`** (zostaje między ekranami → podwójne akcje).
- Router ignoruje wolniej wczytany starszy ekran (`renderSeq` w `app.js`).
- `r.cleanup` w widoku – sprzątanie (kamera, liczniki, blokada ekranu).
- Polska odmiana: `App.plural(n, "1", "2–4", "5+")`.
- Godziny zapisywane jako czas lokalny miejsca: `"RRRR-MM-DDTGG:MM"`.
- Pogoda i wyszukiwanie miejsc używają Open-Meteo (bez klucza); po błędzie 10 min przerwy.

## APK i klucz
- Pakiet `io.github.chiniak.podroznik`, wersja 1.0.0 (versionCode 1), odcisk SHA-256 w `assetlinks.json`.
- **Klucz podpisu i hasło NIE są w repozytorium** – właściciel dostał plik `podroznik-klucz-podpisu.zip` (keystore + HASLO.txt). Do nowej wersji APK trzeba go poprosić o ten plik.
- Środowisko chmurowe **„Chiniak – Android”** ma dostęp do dl.google.com (Android SDK). SDK instaluje się poleceniami z `podroznik-android/README.md` (cmdline-tools, `platforms;android-36`, `build-tools;35.0.0`); Maven przez mirror `repo.maven.apache.org` (jcenter wycofany, repo1 zwracał 429).
- Zmiany w stronie nie wymagają nowego APK (aplikacja wczytuje stronę).

## Historia ważnych zdarzeń
- Etapy 3–8 robione bez dostępu do GitHuba (błąd 403 przez kilka godzin); wszystko zostało wypchnięte po ponownym połączeniu.
- Właściciel woli robić wszystko krok po kroku, po polsku, z podsumowaniem po każdym etapie i listą rzeczy do sprawdzenia.
