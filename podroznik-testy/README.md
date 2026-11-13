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
| t22 | Odkrywaj, gdy serwery map nie odpowiadają (zapasowe serwery, Wikipedia, Nominatim) |
| t23 | „📍 Tutaj”: zgoda, brak zgody, GPS bez odpowiedzi, linki do map |
| t24 | mapa: cel z Nominatim (nie San Juan), 📍, dotknięcie mapy → punkt, wyszukiwanie |
| t25 | Azja: nazwy, odznaczanie pomysłów, podkład łaciński, kafelki offline, nawigacja geo:/Amap, NBP tabela B |
| t27 | karty dla kierowcy (lokalny adres – Nominatim symulowany), rozmówki, mapa offline: pobieranie, mapa bez internetu, usuwanie |
| t28 | zdjęcia miejsc: Wikipedia (w pobliżu i po nazwie), Commons, z Odkrywaj, własne, usuwanie, offline (sieć symulowana) |
| t29 | tło ze zdjęć: lista z Commons (symulowana), pobieranie, zmiana przy przejściu, ustawienia, offline, wyłączenie |
| t30 | mapa: pinezka i zapis jednym dotknięciem, widok zostaje, 🏛️ atrakcje; Odkrywaj: szybkie wyniki z Wikipedii, wyścig serwerów |
| t31 | zdjęcia miejsc: okienko pinezki (zdjęcie, Otwórz, Nawiguj, drugie dotknięcie = punkt), miniatury pod mapą, zdjęcie na karcie dla kierowcy; rozmówki w grupach |
| t32 | „Przygotuj offline”: lista kontrolna, jeden przycisk (karty, zdjęcia, NBP, pogoda, mapa), ostrzeżenie przed Chinami, karta bez sieci |
| t33 | kopia poza telefonem: przypomnienie przed wyjazdem tylko przy zmianach, krok w Przygotuj offline, ostrzeżenie i porady na ekranie kopii, wyłącznik |
| t34 | bilety w planie: „Z biletu lub screena” → punkt (dzień i godzina z PDF), 🎫 w planie, pełny ekran, QR ze screena, zakładka Bilety, usunięcie z biletami |
| t35 | odczyt rezerwacji: Booking.com, Gotogate, Trip.com (lot, pociąg w Chinach), Trainline, Rail Europe, Agoda, Airbnb, AirAsia, 12Go, HTML; pliki PDF / .ics / .eml |
| t26 | angielski: wszystkie ekrany, wypisuje teksty, które zostały po polsku (powinno być „OK”) |

Testy ustawiają `locale: 'pl-PL'` – bez tego aplikacja (język „Auto”) przełączy się na angielski.

## Pliki pomocnicze
- `fx/` – przykładowe kody i bilety, `gen-kody.js` – jak zostały wygenerowane (bwip-js)
- `mails/` – przykładowe maile z potwierdzeniami (zmyślone)
- `build-geo.js` – buduje `podroznik/lib/airports.js` i `lib/world.js` (npm: airport-codes, world-atlas, topojson-client)
- `gen-twa.js` – generowanie projektu Androida (npm: @bubblewrap/core@1.22.5)
