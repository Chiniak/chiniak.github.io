# Podróżnik – stan projektu (do kontynuacji w nowej sesji)

Ostatnia aktualizacja: 15 listopada 2026 (noc) – scalone PR #1–#27. **APK testowe 2.6.0 (versionCode 10, cały redesign – etapy 1–9) wysłane 15.11 – czeka na ocenę właściciela.** **TRWA REDESIGN „Premium Light” (9 etapów) – zrobione etapy 1–6, 7a (PR #23, scalony) i 7b (mapa, Odkrywaj, karty, rozmówki, mapa offline, Przygotuj offline + wersja 2.5.0 w „O aplikacji” – PR #24, scalony) 7c (budżet, rozliczenie, dokumenty – PR #25, scalony) 7d (kopia, PIN, przypomnienia, Gmail, udostępnianie, z maila – PR #26, scalony) 8 – szlif (PR #27, scalony) i 9 – testy całości (przegląd 38 ekranów × 5 wariantów, offline 38/38, pełna seria testów, APK 2.6.0 – PR #28). **REDESIGN ZAKOŃCZONY.** Dalej: czekać na ocenę właściciela z telefonu; pomysły z listy „Co zostało” (tryb „W podróży”, przelicznik walut offline, dziennik…) i wersja docelowa APK (klucz właściciela).** Zasady wyglądu, tokeny, decyzje właściciela i opis zrobionych ekranów: **`DESIGN.md` – przeczytaj przed każdą zmianą wyglądu.** Zacznij od tego pliku (sekcja „REDESIGN – TU ZACZNIJ” niżej), potem `DESIGN.md`, `PLAN.md` i `DO-SPRAWDZENIA.md`.

## REDESIGN „Premium Light” – TU ZACZNIJ
- Właściciel 15.11 przysłał pełną specyfikację redesignu (premium, jasny minimalizm, styl magazynu podróżniczego) i zatwierdził
  projekt (makieta + plan etapów; artefakt „Podróżnik Premium Light” na claude.ai – kopia zasad jest w `DESIGN.md`).
- Etapy: 1 design system ✔ (PR #18) · 2 ekran Podróże ✔ (PR #18) + automatyczne zdjęcia celu ✔ (PR #19, `covers.js`, t41)
  · 3 Bilety ✔ (PR #20) · 4 Plan ✔ (PR #21) · 5 Pakowanie ✔ (PR #22) · 6 Ustawienia ✔ (oba w PR #22, scalony) · **7 ekrany dodatkowe** (7a ✔ szczegóły podróży + formularze podróży/odcinka/punktu/rzeczy; 7b ✔ mapa, Odkrywaj, karty, rozmówki, offline; 7c ✔ budżet, rozliczenie, dokumenty; 7d ✔ kopia, PIN, przypomnienia, Gmail, udostępnianie, z maila – opis w DESIGN.md, pamięć `podroznik-v55`) (~25: formularze, szczegóły podróży,
  mapa, Odkrywaj, budżet, rozliczenie, dokumenty, kopia, karty dla kierowcy, rozmówki, offline, Gmail, PIN, okna) ·
  8 szlif (animacje, dostępność, tablet, usunięcie ~50 stylów `style="…"` z JS, skalowanie czcionki) · 9 testy całości.
- Etap 4 (Plan) zrobiony – opis w `DESIGN.md`. Specyfikacja była: osobisty asystent podróży – zakres dat, dzień po dniu, czysta pionowa oś czasu, każdy dzień
  z wyraźną strukturą; karty punktów: zdjęcie, nazwa, adres, godzina, notatka, kategoria, mapa; szybki dostęp do: mapa
  i trasa, Odkrywaj, karty dla kierowcy, import z biletu/screena; pomysły bez dnia wyraźnie oddzielone; przeciąganie zostaje (t5, t6).
  Dalej: Pakowanie – postęp, licznik, zadania przed wyjazdem, kategorie z licznikiem, separatory zamiast ciężkich kart,
  szablony/zakupy/zadania zostają; Ustawienia – grupy Wygląd / Podróżowanie / Bezpieczeństwo / Dane / Integracje / O aplikacji.
- Sposób pracy (właściciel to akceptuje): jeden etap = jeden PR; przed PR pełna seria testów (w tle, ~15 min, serwer
  `python3 -m http.server 8765` w katalogu repo; t3 wymaga `python3 podroznik-testy/make-cam.py`; t11 bywa wolny przy
  obciążeniu – powtórzyć), zrzuty jasny/ciemny/EN/360 px, podbić `CACHE` w `sw.js` (teraz **`podroznik-v55`**), nowe teksty
  do `i18n-en.js` (t26), `node podroznik-app/scripts/copy-web.js`. Po scaleniu: `git checkout -B claude/travel-planning-app-tl9mvf origin/main`.
- Właściciel prosi o scalanie sam w czacie („scalaj”) – wtedy scal PR przez GitHub (merge), potem gałąź od nowa od main.
- APK testowe: `cd podroznik-app && npm run apk` (SDK w /opt/android-sdk już jest), wynik `android/app/build/outputs/apk/debug/app-debug.apk`,
  wysyłać przez SendUserFile (display: attach), nie commitować. Ostatnie wysłane: **2.4.0 (versionCode 8)** – etapy 1–4 + zdjęcia celu.
  Ostatnie wysłane APK: **2.6.0 / versionCode 10** (cały redesign). Przy następnym podbij versionCode/versionName w `build.gradle` **i** `App.VERSION` w app.js (np. 2.7.0 / 11). Etapy 3–4 są w APK 2.4.0 (czeka na ocenę właściciela).
- Właściciel gra czasem w Tibię – prosił, żeby **nie otwierać mu żadnych okien** (bez podglądów/artefaktów otwieranych automatycznie; pliki tylko jako załącznik).
- **Na start następnej sesji:** jeśli właściciel napisze „scalaj” – scal PR #28 (etap 9), potem gałąź od main. Redesign skończony – zapytaj właściciela o wrażenia z APK 2.6.0 i co dalej. **Uwaga:** końcowa pełna seria testów etapu 9 była w toku, gdy właściciel zrobił /clear – przed scaleniem PR #28 uruchom ją jeszcze raz (serwer `python3 -m http.server 8765` w tle z limitem 2 h). Po scaleniu kolejnego PR: `git checkout -B claude/travel-planning-app-tl9mvf origin/main`.
  Etap 7 podzielony na PR: 7a ✔ szczegóły podróży + formularze; 7b ✔ mapa, Odkrywaj,
  karty dla kierowcy, rozmówki, offline; 7c ✔ budżet, rozliczenie, dokumenty; 7d ✔ kopia, PIN, Gmail, przypomnienia, okna/toasty).
  Wersja w „O aplikacji” = `App.VERSION` w app.js (właściciel 15.11 wybrał numer APK; teraz **2.6.0**, build.gradle versionCode 10 / 2.6.0 – podbijaj oba razem).
  APK 2.5.0 zbudowane i wysłane 15.11 (prośba właściciela).
  Serwer testowy: `python3 -m http.server 8765` w tle z długim limitem czasu (domyślny wygasa po 30 min).
- Czeka na ocenę właściciela na telefonie: APK 2.4.0 (etapy 1–4: Podróże, Bilety, Plan; zdjęcia celu – czy filtr nie przepuszcza świątyń).

## Gdzie co jest
- Repozytorium: `chiniak/chiniak.github.io`, gałąź **`claude/travel-planning-app-tl9mvf`**
- Gałąź robocza: po scaleniu PR zacznij ją od nowa od `origin/main` (`git checkout -B claude/travel-planning-app-tl9mvf origin/main`), nie nadpisuj historii (force push zablokowany). Nowy PR po każdej porcji zmian – właściciel scala sam.
- Aplikacja na żywo: https://chiniak.github.io/podroznik/ – wersja 2.6.0 (`App.VERSION`), pamięć offline **`podroznik-v55`**. APK: https://chiniak.github.io/podroznik/Podroznik.apk (zmiany w stronie nie wymagają nowego APK).
- `podroznik/` – aplikacja (PWA, czysty JS bez frameworka, dane w IndexedDB, offline przez service worker)
- `podroznik-app/` – **nowa aplikacja na Androida (Capacitor)**: cały kod w APK + funkcje telefonu; instrukcja i plan kroków w jego README
- `podroznik-android/` – stary projekt APK (Trusted Web Activity, Bubblewrap) – do zastąpienia przez `podroznik-app/`
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
- #13 (scalony 13.11): **odczyt biletów ze zdjęć (OCR)** – zgłoszone 13.11: „wrzucenie planu przez zdjęcie nie uzupełnia pustych pól” (wcześniej czytany był tylko PDF, i to tylko dzień/godzina). `ocr.js` + `lib/ocr/` (Tesseract.js 6, pol+eng, ~6 MB, wersja SIMD gdy telefon umie). `infoFromText` w plan.js: dzień, godzina, nazwa (etykieta „Wydarzenie:” albo pierwszy zwykły wiersz), miejsce (etykieta, także w następnym wierszu; nie numer miejsca siedzącego), cena (etykieta albo jedyna kwota z walutą); tylko puste pola; także dla PDF. Pliki OCR w pamięci `ocr-pliki` (sw.js, najpierw pamięć, nie kasowana przy nowej wersji); krok „🔎 Odczyt biletów ze zdjęć” w Przygotuj offline. `amount()` w email.js rozumie „1.200.000” (VND). Test `t36` (`fx/bilet-screen.png`, `gen-screen.js`).
- #14 (scalony 13.11, **właściciel potwierdził na telefonie: odczyt zdjęcia biletu działa i uzupełnia plan**): zgłoszone 13.11 ze screenem – „po wrzuceniu zdjęcia biletu nic się nie dzieje”. Dwie przyczyny: (1) screen trafił do pola „Zdjęcie” (📷 Własne – zdjęcie miejsca), gdzie OCR nie działał; (2) karta przejazdu w **trybie ciemnym** – Tesseract prawie nic nie czytał. Teraz: `prepare()` w ocr.js – odcienie szarości, ciemne tło odwrócone, rozciągnięty kontrast, małe zdjęcia powiększone (próba z potęgą/gamma pogorszyła wynik – nie wracać); „📷 Własne” w nowym punkcie bez nazwy też czyta tekst, a gdy znajdzie datę/godzinę, przenosi obraz do 🎫 Biletów zamiast zdjęcia miejsca. `infoFromText`: układ „Departs at / Arrives at” (też Odjazd/Przyjazd) → nazwa „A → B” i godzina odjazdu; daty z błędami OCR („1208:2026”); odrzucane „śmieci” („zZh32m”, „2 h 32 m”, „Reservation number”); cena bez etykiety tylko na początku/końcu wiersza. Test `t36` (+ `fx/bilet-ciemny.png`).
- #15 (scalony 15.11): **rzadsza zmiana tła** – zgłoszone 13.11: tło działa, ale zmiana przy każdym ekranie = ekran za często miga. Ustawienie „Nowe zdjęcie” w Ustawienia → Tło: przy uruchomieniu aplikacji (**domyślnie**), co 10 minut, raz dziennie, przy każdej zmianie ekranu (`App.Backdrop.setEvery`, localStorage `podroznik-bg-every`, ostatnie zdjęcie `podroznik-bg-last`). Pobieranie kolejnych zdjęć dalej przy przeglądaniu. Przenikanie 1,2 s zamiast 0,6 s. Test `t29`.
- (gałąź, PR do zrobienia) **prawdziwa aplikacja – krok 1** (właściciel 15.11: „zróbmy to jako prawdziwą aplikację, a nie html”; wybrany Capacitor, bo zostaje cały kod i testy): `podroznik-app/` (Capacitor 8.6.0, kod kopiowany z `podroznik/` skryptem), `native.js` – w aplikacji `navigator.share`/`canShare` z plikami przez wtyczki Filesystem + Share, linki `blob:` (skan PDF) → „Udostępnij”; uprawnienia aparatu i położenia; ikona i ekran startowy; wersja testowa `io.github.chiniak.podroznik.test` (jawny klucz testowy), docelowa `io.github.chiniak.podroznik` versionCode 2 (zastąpi TWA – wymaga klucza właściciela). Test `t37`. APK testowe wysłane właścicielowi w czacie (14 MB – nie w repozytorium).
- (gałąź, ten sam PR) **„📬 Z Gmaila”** (właściciel 15.11: „żeby można było logować się przez email i żeby samo proponowało aktywności z emaila”): `gmail.js` + `GoogleAuthPlugin.java` (Authorization API, `gmail.readonly`, bez serwera). Szuka maili z rezerwacjami (`query()`: nadawcy + słowa w temacie, 400 dni, do 120 maili), czyta treść / .ics / załącznik PDF (`App.Email.parse`), aktywności (wycieczki GetYourGuide/Klook…, restauracje TheFork/OpenTable, koncerty z PDF) przez `App.Plan.infoFromText` + tytuł z tematu (`activityTitle`). Propozycje grupowane według podróży (dzień przed startem…koniec) albo „Nowa podróż” (przerwa > 4 dni = osobna); ➕ Dodaj / Pomiń / Dodaj wszystkie; PDF z maila dołączany jako bilet; to, co już jest w podróżach, nie jest proponowane (`markExisting`). Stan w ustawieniach `gmail` i `gmailSeen` (mail czytany raz). Sprawdzanie samo przy starcie aplikacji co 6 h (tylko APK), karta na ekranie głównym, link w Ustawieniach. W przeglądarce: `WEB_CLIENT_ID` pusty → informacja, że działa w aplikacji. **Wymaga konfiguracji Google Cloud przez właściciela** (instrukcja w `podroznik-app/README.md`) – bez niej logowanie zwraca błąd 10. Przy okazji `infoFromText`: miejsce nie dokleja następnego wiersza z etykietą („Participants: …”). Test `t38` (fixtures `mails/getyourguide.html`, `mails/thefork.txt`). APK 2.1.0 (versionCode 3).
- (gałąź, ten sam PR) **audyt 15.11** (właściciel poprosił przed kolejnym etapem): pełna seria testów – 30/33 bez błędów (t3 – brak wirtualnego aparatu; t11 – przekroczony czas tylko w serii, osobno OK; t12 – celowy 404). Znaleziony i naprawiony błąd: kopia zapasowa zawierała ustawienia `gmail` i `gmailSeen` (adres Gmail, tematy i nadawcy maili) – teraz w `LOCAL_SETTINGS` (backup.js), sprawdza `t38`. APK 2.1.1 (versionCode 4).
- (gałąź, ten sam PR) **limit Gmail API** – zgłoszone 15.11 z telefonu (logowanie zadziałało!): „Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'”. Od 2026 Google obniżył limit na użytkownika (ok. 6000 jednostek/min). Było: 3 równoległe zapytania bez przerw. Teraz `api()` w gmail.js: zapytania po kolei z odstępem (`PACE.gap` 400 ms), po 429/403 „quota/rate” czeka (`Retry-After` albo 65 s) i próbuje dalej (4 razy), potem kończy z zapisem przeczytanych (`partial`, ponowna próba przy starcie po 10 min, bez pętli na ekranie); postęp zapisywany co 10 maili; węższe wyszukiwanie (bez order/zamówieni/tour/check-in/odprawa), do 100 maili. Test `t39`. APK 2.1.2 (versionCode 5). **Właściciel potwierdził 15.11 na telefonie: 2.1.2 zainstalowane, Gmail „działa elegancko”.**
- PR #16 (scalony 15.11): prawdziwa aplikacja, „📬 Z Gmaila”, poprawka kopii, limit Gmail API.
- (gałąź, PR do zrobienia) **powiadomienia w aplikacji** (`reminders.js`, `@capacitor/local-notifications` 8.3.1): najbliższe przypomnienia zaplanowane w telefonie (do 60 / 60 dni, `syncNative`, podpis zmian w localStorage `podroznik-ln-sig`, klucze `podroznik-ln-keys` – `tick()` nie dubluje), odtworzenie, gdy system skasował alarmy; zgoda przy pierwszym uruchomieniu; „⏰ Dokładne godziny”; dotknięcie → ekran; mała ikona `ic_stat_podroznik`. Test `t40`. APK 2.2.0 (versionCode 6).
- (gałąź, PR do zrobienia) **redesign „Premium Light” – etap 1: design system** (właściciel 15.11 przysłał pełną specyfikację redesignu i zatwierdził projekt: makieta + plan 9 etapów). Zasady, tokeny i decyzje w **`DESIGN.md`** – czytaj przed każdą zmianą wyglądu. Nowe: tokeny w `style.css` (turkus `--accent-fill` tylko jako wypełnienie, `--accent` = ciemniejszy do tekstu, `--accent-ink` na turkusie), czcionki w `lib/fonts/` (Plus Jakarta Sans + Newsreader w tytułach), `icons.js` (`App.icon`), nowy dolny pasek, `.topbar.scrolled`. Tło ze zdjęć: nowi użytkownicy – wyłączone, kto już miał (`podroznik-bg-last`) – bez zmian (t29 sprawdza oba). Pełna seria testów zielona. PR #18 otwarty 15.11. **Etap 2 – ekran Podróże** zrobiony na tej samej gałęzi (opis w DESIGN.md, pamięć `podroznik-v45`; t9 sprawdza nowe odliczanie, postęp i odcinek biletu). PR #18 (etapy 1–2) **scalony 15.11** na prośbę właściciela. Potem: **zdjęcia celu podróży** (`covers.js`, t41, pamięć `podroznik-v45`) i APK testowe 2.3.0 (versionCode 7). PR #19 scalony 15.11. **Etap 3 – Bilety** (portfel, szczegóły odcinka, pełny ekran) – opis w DESIGN.md, pamięć `podroznik-v45`. **Etap 4 – Plan** (oś czasu, pasek dni, karta „Dziś”, kafelki szybkiego dostępu, pomysły osobno) – opis w DESIGN.md, pamięć `podroznik-v46`; t5/t6 przewijają do dnia przed przeciąganiem (wyższy nagłówek – wiersze były pod dolnym paskiem); pełna seria testów zielona. PR #21 scalony 15.11, APK 2.4.0 (versionCode 8) wysłane. **Etap 5 – Pakowanie** (pierścień postępu, zakładki z licznikami, najbliższe zadanie, kategorie z separatorami, narzędzia jako lista) – opis w DESIGN.md, pamięć `podroznik-v47`; t7 klika „Szablony” przez `#pk-tpl`. PR #22 otwarty 15.11 (etap 6 dołożony do tego samego PR). **Etap 6 – Ustawienia** (`settings.js`, grupy Wygląd / Podróżowanie / Bezpieczeństwo / Dane / Integracje / O aplikacji) – opis w DESIGN.md, pamięć `podroznik-v48`; t17 czyta wersję z `#app-version`. **Następny: etap 7 – ekrany dodatkowe** (formularze, szczegóły podróży, mapa, Odkrywaj, budżet, rozliczenie, dokumenty, kopia, karty dla kierowcy, rozmówki, offline, Gmail, PIN, okna). Wersja w „O aplikacji” („1.2 · etapy 0–11”) jest nieaktualna – zapytać właściciela, co tam pokazywać (np. wersję APK). PR #22 scalony 15.11. **Etap 7a – szczegóły podróży + formularze** (okładka jak na ekranie głównym, postęp, narzędzia jako lista, oś czasu z nagłówkami dni jak w Planie, formularze w grupach z podglądem okładki na żywo) – opis w DESIGN.md, pamięć `podroznik-v55`; t7 czyta link pakowania z `.td-stats`.
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

## Co zostało (stan na koniec sesji 15.11 – TU ZACZNIJ)
1. **Kolejność ustalona z właścicielem: 1 PR → 2 powiadomienia → 3 wersja docelowa.** 1 i 2 zrobione:
   - PR #16 i #17 scalone (#17 scalony 15.11 na prośbę właściciela). Gałąź robocza: `git checkout -B claude/travel-planning-app-tl9mvf origin/main`.
   - Właściciel dostał **APK testowe 2.2.0** (`io.github.chiniak.podroznik.test`, versionCode 6) – zapytaj, czy działa „Wyślij próbne” i „⏰ Dokładne godziny” (Ustawienia → Przypomnienia) i czy przypomnienia przychodzą przy zamkniętej aplikacji. Na telefonie potwierdzone wcześniej: instalacja 2.1.x, logowanie Google, Gmail („działa elegancko”).
   - **TERAZ: krok 3 – wersja docelowa** (pakiet `io.github.chiniak.podroznik`, zastąpi stary TWA jako aktualizacja). **Czekamy, aż właściciel wyśle w czacie `podroznik-klucz-podpisu.zip`** (keystore + HASLO.txt). Potem:
     a) `podroznik-app`: `signingConfigs.release` czytający keystore i hasło spoza repozytorium (np. zmienne środowiskowe / `keystore.properties` w .gitignore), `./gradlew assembleRelease`, sprawdzić `apksigner verify --print-certs` – SHA-256 musi się zgadzać z `.well-known/assetlinks.json`. **Klucza i hasła NIE commitować** (repo publiczne).
     b) Odczytać SHA-1 prawdziwego klucza (`keytool -list -v`) i poprowadzić właściciela: Google Cloud → Google Auth Platform → Klienci → nowy klient **Android**, pakiet `io.github.chiniak.podroznik` + ten SHA-1 (bez tego Gmail w wersji docelowej da błąd 10).
     c) Dane: wersja docelowa startuje pusta (stara TWA ma dane w Chrome, testowa we własnym WebView) – właściciel robi kopię w **Podróżnik (test)** → po instalacji docelowej przywraca; konto Gmail łączy ponownie (celowo nie ma go w kopii).
     d) APK docelowe: wersja 2.2.x, versionCode > 1 (TWA miał 1). Rozważyć podmianę `podroznik/Podroznik.apk` (link „Aplikacja na Androida” w Ustawieniach, teraz 430 KB TWA) – ~18 MB w repo, zapytać właściciela; ewentualnie wysłać tylko w czacie.
     e) Po przejściu: link do APK w Ustawieniach i tekst „pobierz APK (430 KB)” zaktualizować; usunąć w Google Cloud klienta „test”, jeśli testowa przestanie być potrzebna (jej klucz jest jawny w repo).
   - Dalej (plan w `podroznik-app/README.md`): „Udostępnij → Podróżnik” dla plików (PDF/.ics/zdjęcia), jasność na maks przy bilecie, widżet, ML Kit OCR, natywny odcisk palca (w WebView działa tylko PIN). Strona WWW: logowanie Google wymaga klienta „Web” (`WEB_CLIENT_ID` w gmail.js).
   - Budowanie w chmurze: SDK do `/opt/android-sdk` (cmdline-tools `commandlinetools-linux-9862592_latest.zip` z dl.google.com, `platforms;android-36`, `build-tools;35.0.0`, `platform-tools`), `podroznik-app/android/local.properties` z `sdk.dir`, lustro Maven `~/.gradle/init.d/maven-mirror.gradle` (google() + `maven-central.storage-download.googleapis.com`; repo.maven.apache.org / repo1 dają 404/429) – szczegóły w README aplikacji. `npm install` w `podroznik-app`, potem `npm run apk`. Brak KVM – emulatora nie ma; logikę natywną w JS testują t37–t40 z udawanym Capacitorem. Po każdej zmianie w `podroznik/` przebudować APK i podbić versionCode/versionName.
   - APK wysyłaj właścicielowi przez SendUserFile (nie commitować testowych APK do repo).
2. **Testy na telefonie (właściciel, w toku):** tło (PR #15 – zmiana przy uruchomieniu), „📥 Przygotuj offline”, bilety w planie, odczyt maili. Lista: `DO-SPRAWDZENIA.md`.
3. **Plik podróży z Gmaila** (dostał 13.11) – zapytaj, czy wczytał i czy godziny się zgadzają. Szczegółów podróży nie zapisuj w repozytorium (publiczne).
4. Jeśli odczyt jakiegoś maila wyjdzie źle – poprosić o treść (z zamazanymi danymi), dopisać przykład do `podroznik-testy/mails` ze ZMYŚLONYMI danymi i inną trasą/datą, sprawdzić `t35`.
5. Pomysły na dalej (przedstawione 15.11): tryb „W podróży” (jeden ekran na dziś), przelicznik walut offline, dziennik podróży, przypomnienia o wizach; więcej języków, OCR chińskich/tajskich napisów.
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
| `native.js` | most do aplikacji Capacitor (`PodroznikNative.isNative`, klasa `native-app` na `<html>`); w przeglądarce nic nie robi |
| `ocr.js` | odczyt tekstu ze zdjęć biletów (Tesseract.js w `lib/ocr/`, pliki w pamięci `ocr-pliki`) |
| `prep.js` | „Przygotuj offline” – wszystko na zapas jednym przyciskiem (korzysta z App.Offline, App.Phrases, App.Photos, App.Budget.nbp, App.Weather) |
| `settings.js` | ekran Ustawień (redesign etap 6) |
| `i18n.js`, `i18n-en.js` | języki: „tłumacz ekranu” (MutationObserver) + słownik PL→EN; `I18N.locale` do dat i liczb |
| `sw.js` | offline + powiadomienia w tle (periodicsync) + kliknięcie powiadomienia |
| `lib/` | pdf.js, bwip-js, ZXing, Leaflet, airports.js (OpenFlights), world.js (Natural Earth) – licencje w `lib/` |

## Zasady i pułapki (ważne przy zmianach)
- **Po każdej zmianie plików aplikacji podbij `CACHE` w `sw.js`** (teraz `podroznik-v55`) i dopisz nowe pliki do listy `APP`.
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
- Tło ze zdjęć: `App.Backdrop.next()` wołane na końcu `render()` (nowe zdjęcie tylko gdy `due()` – według ustawienia „jak często”); lista kandydatów `bgPool` (Commons, kategoria Featured pictures, wyszukiwanie po hasłach podróżniczych, odświeżana co 30 dni), zdjęcia w pamięci `tla-zdjecia` (max 100, po jednym przy przejściu; nie przy oszczędzaniu danych). Ustawienie `bgPhotos` + `localStorage podroznik-bg`. **Właściciel nie chce zdjęć religijnych** (dostał obraz Jezusa) – lista `bgPool.v = 2`: hasła tylko natura/miasta, wykluczenia w zapytaniu (`EXCLUDE`) i filtr `BAD` (tytuł, opis, kategorie); zmiana wersji kasuje pobrane zdjęcia. `bgBlocked` – zdjęcia ukryte przyciskiem. Czytelność: `--veil` (mgiełka) i półprzezroczyste paski z rozmyciem (`html.has-bg`).
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
