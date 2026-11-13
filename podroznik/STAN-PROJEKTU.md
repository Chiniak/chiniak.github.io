# Podróżnik – stan projektu (do kontynuacji w nowej sesji)

Ostatnia aktualizacja: 13 listopada 2026 – scalone PR #1–#12; na gałęzi czeka: odczyt biletów ze zdjęć (OCR) – PR #13 do zrobienia. Zacznij od przeczytania tego pliku, potem `PLAN.md` i `DO-SPRAWDZENIA.md`.

## Gdzie co jest
- Repozytorium: `chiniak/chiniak.github.io`, gałąź **`claude/travel-planning-app-tl9mvf`**
- Gałąź robocza: po scaleniu PR zacznij ją od nowa od `origin/main` (`git checkout -B claude/travel-planning-app-tl9mvf origin/main`), nie nadpisuj historii (force push zablokowany). Nowy PR po każdej porcji zmian – właściciel scala sam.
- Aplikacja na żywo: https://chiniak.github.io/podroznik/ – wersja „1.2 · etapy 0–11”, pamięć offline **`podroznik-v34`**. APK: https://chiniak.github.io/podroznik/Podroznik.apk (zmiany w stronie nie wymagają nowego APK).
- `podroznik/` – aplikacja (PWA, czysty JS bez frameworka, dane w IndexedDB, offline przez service worker)
- `podroznik-android/` – projekt APK (Trusted Web Activity, Bubblewrap), instrukcja w jego README
- `podroznik-testy/` – testy Playwright + przykładowe dane, instrukcja w README (serwer: `python3 -m http.server 8765` w katalogu repo)
- `.well-known/assetlinks.json` – odciski kluczy KWS i Podróżnika (aplikacje bez paska adresu)
- Drugie repozytorium sesji: `chiniak/kws` (aplikacja KWS – nie była zmieniana)

## Historia PR
- #1–#2: etapy 0–10 · #3–#4: poprawki Odkrywaj · #5: GPS, mapa na właściwym celu, Azja (mapy/nawigacja/waluty), język angielski
- #6: etap 11 – karty dla kierowcy (adres w lokalnym piśmie), rozmówki zh/th/vi/lo, mapa offline
- #7: zdjęcia miejsc w planie i pomysłach (`photos.js`, Wikipedia/Commons/własne)
- #8: tło ze zdjęć zmieniane przy każdej zmianie ekranu (`backdrop.js`)
- #9: szybsze Odkrywaj („📍 Tutaj”: Wikipedia od razu, serwery map wyścigiem), mapa: pinezka + zapis jednym dotknięciem, 🏛️ atrakcje na mapie
- #10: tło tylko natura i miasta – **bez zdjęć religijnych** (filtr, kasowanie starych, „🚫 Nie pokazuj tego zdjęcia”)
- (gałąź, PR do zrobienia): zdjęcia miejsc na mapie (okienko pinezki: zdjęcie, „Otwórz”, „🧭 Nawiguj”; miniatury na liście pod mapą) i na kartach dla kierowcy (miniatura na liście, zdjęcie nad lokalnym adresem); test `t31`
- (gałąź, ten sam PR): **„📥 Przygotuj offline”** (`prep.js`, `#/przygotuj/:id`, link na ekranie podróży) – lista kontrolna i jeden przycisk: ochrona danych, karty dla kierowcy, zdjęcia, kursy NBP (waluty też z kraju: CNY/THB/VND/LAK…), pogoda, mapa offline; ostrzeżenie przed Chinami; test `t32`. Przy okazji: naprawiony przycisk NBP w budżecie, zdjęcie, którego nie da się pobrać, nie jest pobierane w kółko
- (gałąź, ten sam PR): **kopia poza telefonem** – przypomnienie 3 dni przed wyjazdem o 18:00, gdy dane zmieniły się od ostatniej kopii (`Reminders.newestChange/backupStale`, ustawienie `backup`); krok „💾 Kopia poza telefonem” w Przygotuj offline (robi go użytkownik – Dysk Google / mail); ekran kopii: ostrzeżenie o zmianach, porady (drugi telefon, hasło), `?wroc=` do listy; test `t33`
- (gałąź, ten sam PR): **mapa** – drugie dotknięcie tej samej pinezki od razu otwiera punkt, nazwa i zdjęcie w okienku też (okienko pinezki ma `closeOnClick: false`, inaczej Leaflet zamyka je przed obsługą dotknięcia); **rozmówki** – 26 zwrotów w grupach (`GROUPS`, 4. pole zwrotu): nowe m.in. „Nie jem mięsa”, „Bez lodu”, „Proszę napisać cenę”, „Czy mogę zapłacić kartą?”, „Pomocy!”, apteka, szpital, policja; test `t31`

- (gałąź, ten sam PR): **naprawa czarnego tła** (zgłoszone z telefonu 13.11: „pobrane 0/100”) – filtr `BAD` sprawdzał też ukryte kategorie Commons („Pages with maps”, „Media with locations”), które ma prawie każde zdjęcie, więc lista była pusta. Teraz tylko tytuł, nazwa, opis i widoczne kategorie; krótsze `EXCLUDE` (limit 300 znaków zapytania); pojedynczy błąd nie przerywa szukania; pusta lista – kolejna próba po 10 min; `bgPool.v = 3`; w Ustawieniach → Tło przyczyna, gdy brak zdjęć (oszczędzanie danych / błąd Commons / pusta lista). Test t29 z realistycznymi kategoriami.

- #11 (scalony 13.11): wszystko z sesji 12–13.11 – naprawa tła, Przygotuj offline, kopia przed wyjazdem, zdjęcia na mapie, rozmówki.
- (gałąź, PR do zrobienia): **bilety w planie** – „📎 Z biletu lub screena” w planie (zdjęcie, screen, PDF, .pkpass → nowy punkt, kategoria Wydarzenie, dzień i godzina odczytane z tekstu PDF – `whenFromText`), sekcja „🎫 Bilety i zdjęcia” w formularzu punktu, 🎫 przy punkcie w planie (jedno dotknięcie → pełny ekran), takie bilety też w zakładce Bilety i w „Najbliższy bilet”. Plik w `files` z `segmentId: "p:<id punktu>"` (`App.Tickets.planSeg`); usunięcie punktu usuwa jego bilety. Test `t34` (fixture `fx/koncert.pdf`).
- (gałąź, ten sam PR): **nowy odczyt rezerwacji z maili i plików** (`email.js`) – Booking.com (lot, hotel), Gotogate, Trip.com (lot, pociąg w Chinach), Trainline, Rail Europe, Agoda, Airbnb, AirAsia, 12Go. HTML → tekst (`normalize`); loty: numer + para lotnisk przed numerem (albo po nim) + godzina „przy” lotnisku (`timeNear`; kilka godzin pod rząd = zmiana rozkładu → ostatnia); przesiadki w jednym wierszu; ~70 linii azjatyckich; odrzucane fałszywe numery (VAT „FR 58 …”, „Airbus A320”, pociąg „D8661”, lot bez lotniska); pociągi z przesiadkami (`parseLegs`); hotele: adres z kilku wierszy, telefon, godziny 12 h; PNR ważniejszy niż nr zamówienia; cena przy pierwszym odcinku. Ekran „Z maila”: „📎 Z pliku” – PDF (dołączany jako bilet pierwszego odcinka), .ics, .eml. Test `t35`.
- #12 (scalony 13.11): bilety i screeny w planie + nowy odczyt maili i plików.
- (gałąź, PR #13 do zrobienia): **odczyt biletów ze zdjęć (OCR)** – zgłoszone 13.11: „wrzucenie planu przez zdjęcie nie uzupełnia pustych pól” (wcześniej czytany był tylko PDF, i to tylko dzień/godzina). `ocr.js` + `lib/ocr/` (Tesseract.js 6, pol+eng, ~6 MB, wersja SIMD gdy telefon umie). `infoFromText` w plan.js: dzień, godzina, nazwa (etykieta „Wydarzenie:” albo pierwszy zwykły wiersz), miejsce (etykieta, także w następnym wierszu; nie numer miejsca siedzącego), cena (etykieta albo jedyna kwota z walutą); tylko puste pola; także dla PDF. Pliki OCR w pamięci `ocr-pliki` (sw.js, najpierw pamięć, nie kasowana przy nowej wersji); krok „🔎 Odczyt biletów ze zdjęć” w Przygotuj offline. `amount()` w email.js rozumie „1.200.000” (VND). Test `t36` (`fx/bilet-screen.png`, `gen-screen.js`).
- **Prywatność:** repozytorium jest publiczne – przykłady w `podroznik-testy/mails` mają zmyślone dane i inne trasy/daty niż prawdziwe rezerwacje właściciela. Nie wpisuj tu jego planów podróży (właściciel dostał 13.11 plik podróży zrobiony z jego Gmaila – poza repozytorium).

## Właściciel – preferencje i uwagi
- Pisze po polsku, krótko; woli małe kroki, podsumowanie po każdej zmianie, potem pytanie o PR (zwykle odpowiada „tak”).
- Leci do **Chin, Laosu, Wietnamu i Tajlandii** – stąd mapy z napisami łacińskimi, mapa offline, Amap/geo:, NBP tabela B, karty dla kierowcy, rozmówki.
- Apka ma być **o podróżowaniu** – w tle tylko natura i miasta, **żadnych motywów religijnych** (dostał obraz Jezusa – naprawione w PR #10).
- Zgłoszone problemy (12.11): „📍 Tutaj” szukało bardzo długo, na mapie „nie dało się nic oznaczyć” – poprawione w PR #9, **czeka na jego ocenę** na telefonie (jeśli dalej źle – dopytać, co chce robić na mapie).
- Chciał zdjęć miejsc (zrobione w planie i pomysłach) i tła ze zdjęć, „żeby nie było takie czarne”.

## Testy na telefonie (właściciel, 11.11)
- Działa: APK bez paska adresu, przypomnienia, bilet na pełnym ekranie, mapa, Odkrywaj, pomysły, rozliczenie, wyszukiwarka miejsc.
- Nie sprawdzone: wysyłanie podróży plikiem (brak drugiej osoby), .pkpass (brak biletu), wszystko z etapu 11 i PR #7–#10.
- Wszystko od PR #6 testowane tylko w przeglądarce z symulowaną siecią (w środowisku chmurowym nie ma dostępu do OSM/Wikipedii/CARTO).

## Co zostało (stan na koniec sesji 13.11 – TU ZACZNIJ)
1. **PR #13** – odczyt biletów ze zdjęć (OCR); jeśli jeszcze nie istnieje, zapytaj właściciela. Właściciel scala PR sam z telefonu.
2. **Testy na telefonie (właściciel, w toku):** tło po naprawie z PR #11 – czy pojawiają się zdjęcia (przy 0/100 w Ustawienia → Tło jest teraz podana przyczyna); „📥 Przygotuj offline”; potem po PR #12 – bilety w planie i odczyt maili. Lista: `DO-SPRAWDZENIA.md` (sekcje od 12.11).
3. **Właściciel dostał w czacie plik podróży z jego Gmaila** (do wczytania: Podróże → „📥 Otwórz podróż od kogoś”) – zapytaj, czy wczytał i czy godziny się zgadzają. Szczegółów podróży nie zapisuj w repozytorium (publiczne).
4. Jeśli odczyt jakiegoś maila wyjdzie źle – poprosić o treść (z zamazanymi danymi), dopisać przykład do `podroznik-testy/mails` ze ZMYŚLONYMI danymi i inną trasą/datą, sprawdzić `t35`.
5. Pomysły na dalej: więcej języków (słownik jak `i18n-en.js`), edycja na żywo przez kilka osób (wymagałaby serwera), licznik w APK według strefy lotniska, udostępnianie plików (PDF/.ics) wprost do aplikacji (share_target z plikami).
6. Znane: test t5 bywa czerwony blisko północy (godziny liczone od „teraz”) – także na niezmienionym kodzie; t3 wymaga wirtualnego aparatu; t23 trwa ~26 s. Pełna seria testów trwa > 10 min – uruchamiaj w tle albo porcjami.

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
| `ocr.js` | odczyt tekstu ze zdjęć biletów (Tesseract.js w `lib/ocr/`, pliki w pamięci `ocr-pliki`) |
| `prep.js` | „Przygotuj offline” – wszystko na zapas jednym przyciskiem (korzysta z App.Offline, App.Phrases, App.Photos, App.Budget.nbp, App.Weather) |
| `i18n.js`, `i18n-en.js` | języki: „tłumacz ekranu” (MutationObserver) + słownik PL→EN; `I18N.locale` do dat i liczb |
| `sw.js` | offline + powiadomienia w tle (periodicsync) + kliknięcie powiadomienia |
| `lib/` | pdf.js, bwip-js, ZXing, Leaflet, airports.js (OpenFlights), world.js (Natural Earth) – licencje w `lib/` |

## Zasady i pułapki (ważne przy zmianach)
- **Po każdej zmianie plików aplikacji podbij `CACHE` w `sw.js`** (teraz `podroznik-v34`) i dopisz nowe pliki do listy `APP`.
- Nowy magazyn danych = podbić `VERSION` w `db.js` i dodać do `STORES` (aktualizacja zachowuje dane – test t12).
- Nasłuch zdarzeń podpinaj do elementów widoku, **nie do `#view`** (zostaje między ekranami → podwójne akcje).
- Router ignoruje wolniej wczytany starszy ekran (`renderSeq` w `app.js`).
- `r.cleanup` w widoku – sprzątanie (kamera, liczniki, blokada ekranu).
- Polska odmiana: `App.plural(n, "1", "2–4", "5+")`.
- **Nowy tekst na ekranie = dopisz tłumaczenie do `i18n-en.js`** (klucz = tekst polski, `{}` = wstawiana wartość). Brakujące teksty pokazuje test `t26` (ekrany po angielsku).
- Daty/liczby: `self.I18N ? I18N.locale : "pl-PL"` zamiast "pl-PL". Testy ustawiają `locale: 'pl-PL'` (inaczej aplikacja przejdzie na angielski).
- Ustawienia: `navApp` (google/geo/amap → `App.mapsUrl`), `mapLayer` (latin/osm), `lang` (też w localStorage `podroznik-lang`).
- Mapa offline: pamięć `mapa-offline-<id podróży>` (tylko CARTO, zapis z adresem `a.basemaps…` bez parametrów); sw.js szuka kafelka we wszystkich pamięciach (`caches.match` z kluczem `canon()`), zapytania z `?podroznik-off=1` puszcza wprost do sieci. Usuwana razem z podróżą.
- Odkrywaj: `overpass()` pyta serwery wyścigiem (kolejny po 2 s albo po błędzie, całość ≤ 15 s); `attractions(c, onPartial)` – Wikipedia równolegle, pierwsze wyniki od razu, potem połączone z OSM. Mapa: `popupFor`/`save` w places.js (zapis bez formularza), `keepNext`/`lastView` – odświeżenie bez przeskoku widoku, `pois` – atrakcje na mapie (🏛️). `.mp-map` ma własny kontekst warstw (`isolation`), żeby nie zasłaniać komunikatów.
- Tło ze zdjęć: `App.Backdrop.next()` wołane na końcu `render()`; lista kandydatów `bgPool` (Commons, kategoria Featured pictures, wyszukiwanie po hasłach podróżniczych, odświeżana co 30 dni), zdjęcia w pamięci `tla-zdjecia` (max 100, po jednym przy przejściu; nie przy oszczędzaniu danych). Ustawienie `bgPhotos` + `localStorage podroznik-bg`. **Właściciel nie chce zdjęć religijnych** (dostał obraz Jezusa) – lista `bgPool.v = 2`: hasła tylko natura/miasta, wykluczenia w zapytaniu (`EXCLUDE`) i filtr `BAD` (tytuł, opis, kategorie); zmiana wersji kasuje pobrane zdjęcia. `bgBlocked` – zdjęcia ukryte przyciskiem. Czytelność: `--veil` (mgiełka) i półprzezroczyste paski z rozmyciem (`html.has-bg`).
- Zdjęcia miejsc: pole `photo` { data (JPEG data URL ~360 px), page, credit, auto } w punkcie planu; `photoTry` = ostatnia próba (bez trafienia – nowa za 7 dni), `photoOff` = usunięte ręcznie, `photoUrl`/`wikiUrl` z Odkrywaj. Plan dociąga brakujące w tle (`App.Photos.fill`) i wstawia miniatury bez przeładowania (`data-pid`). Zmiana nazwy/położenia kasuje zdjęcie automatyczne.
- Test t5 bywa czerwony blisko północy (godziny liczone od „teraz”) – także na niezmienionym kodzie. t3 wymaga wirtualnego aparatu (`make-cam.py`). Stare testy biorą katalog danych jako argument: `node podroznik-testy/t12.js podroznik-testy`.
- „Ostatnia zmiana danych” liczona z pola `updated` (DB.put). Pobrane w tle dane (adresy kart, zdjęcia, kursy, mapa) zapisuj przez `putRaw`, żeby nie unieważniały kopii.
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
