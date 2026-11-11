# Testy Podróżnika (Playwright)

Testy całej aplikacji w Chromium z emulacją telefonu (Pixel 7). Nie są publikowane na stronie (`_config.yml` → exclude).

## Uruchomienie
```
cd chiniak.github.io
python3 -m http.server 8765 &          # strona pod http://localhost:8765/podroznik/
python3 podroznik-testy/make-cam.py    # raz: wirtualny aparat dla t3
node podroznik-testy/t9.js podroznik-testy
```
Każdy test drukuje wyniki i na końcu `errors: [...]` (powinno być puste; `ERR_TUNNEL…` = brak internetu do pogody – OK).
Zrzuty ekranu lądują w `podroznik-testy/` (ignorowane przez git). Wymaga `playwright` (Chromium);
testy powiadomień (t9, t11–t16) używają `chromium.launch({ channel: 'chromium' })`, bo stary tryb headless blokuje powiadomienia.

| Test | Co sprawdza |
|---|---|
| t3 | bilety: zrzut ekranu (QR), PDF (PDF417), skaner aparatem (Aztec), pełny ekran, offline, kod narysowany = te same bajty |
| t5 | plan dnia: dodawanie punktów, kolejność, przeciąganie, karta „Dziś”, nawigacja, koszty |
| t6 | przeciąganie palcem (dotyk) |
| t7 | pakowanie: szablony, szybkie dodawanie, statusy, zadania z terminem, własny szablon |
| t9 | przypomnienia: wyliczanie, powiadomienia (strona i service worker), licznik, baner, ustawienia, .ics, Google Kalendarz |
| t11 | kopia zapasowa (zwykła i z hasłem) przeniesiona do „drugiego telefonu”, blokada PIN |
| t12 | aktualizacja bazy v1→v2, dokumenty, ostrzeżenia, przypomnienia o ważności |
| t13 | budżet: wydatki, waluty, kursy, przekroczenie |
| t14 | statystyki i mapa (wyszukiwarka Open-Meteo symulowana) |
| t15 | pogoda (Open-Meteo symulowane): prognoza, „rok temu”, brak ponownego pobierania, offline |
| t16 | odczyt 5 przykładowych maili (`mails/`), udostępnianie tekstu do aplikacji |
| t17 | link do APK w ustawieniach, APK i assetlinks.json serwowane |
| t18 | strefy czasowe lotów (czas lotu, różnica czasu), zdjęcie w tle podróży |
| t19 | import karty .pkpass (`fx/karta.pkpass`, generowana przez `gen-pkpass.js`) |
| t20 | wyszukiwarka miejsc, mapa i trasa dnia, układanie trasy, pomysły, odkrywanie (sieć symulowana) |
| t21 | rozliczenie w grupie, wspólna podróż plikiem (dwa „telefony”), plan jako tekst |

## Pliki pomocnicze
- `fx/` – przykładowe kody i bilety, `gen-kody.js` – jak zostały wygenerowane (bwip-js)
- `mails/` – przykładowe maile z potwierdzeniami (zmyślone)
- `build-geo.js` – buduje `podroznik/lib/airports.js` i `lib/world.js` (npm: airport-codes, world-atlas, topojson-client)
- `gen-twa.js` – generowanie projektu Androida (npm: @bubblewrap/core@1.22.5)
