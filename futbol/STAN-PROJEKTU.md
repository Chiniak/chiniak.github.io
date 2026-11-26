# Futbol – stan projektu (26.11.2026, po południu)

Aplikacja: https://chiniak.github.io/futbol/ (PWA, działa offline). Kod w `futbol/`, interfejs po polsku.
Użytkownik mieszka w Anglii – zakłady w £, ostrzeżenie UK Gambling Commission.

## Pliki
- `index.html`, `style.css`, `app.js` – interfejs (zakładki: Mecze, Tabela, Kluby, Typuj, Typy, Dane)
  Kluby = „Moje kluby”: ulubione (gwiazdka, localStorage `futbol.fav`) z najbliższym meczem i prognozą, formą, ostatnim
  wynikiem; wyszukiwarka wszystkich klubów; niżej siatka klubów wybranych rozgrywek. Typuj – wybór klubów z wyszukiwarką.
- `model.js` – model: Poisson + Dixon-Coles, ważenie świeżości, Elo, symulacja sezonu, test wsteczny, rynki zakładów
- `data.js` – wczytywanie i łączenie danych z `dane/`
- `sw.js` – offline; **przy każdej zmianie plików podbij `CACHE`** (teraz `futbol-v18`)
- `dane/` – pliki odświeżane przez GitHub Action (nie edytować ręcznie)

## Dane (`.github/workflows/futbol-dane.yml`, co 3 godziny, commit tylko przy zmianie)
- `futbol-espn.mjs` → `dane/espn.json`: wyniki, terminarze, kluby z logami – PL, LaLiga, Bundesliga, Serie A, Ligue 1,
  Eredivisie, Liga Portugal, Championship, Liga Mistrzów, Liga Europy, Liga Konferencji (`uefa.europa.conf`, kod `ECL`, od 27.11.2026)
  (publiczne, nieudokumentowane API ESPN;
  `dates=RRRR&limit=1000` działa, zakresy dat zwracają 400). Kursy DraftKings przy nadchodzących meczach.
  Od 26.11.2026 także strzały i strzały celne każdego rozegranego meczu (`s`) – z nich „xG ze strzałów”,
  oraz id meczu ESPN (`i`, tylko nierozegrane) – do pobierania składów i kursów na żywo.
- `dane/kursy.json` – archiwum przedmeczowych kursów (ESPN kasuje je po meczu); zbierane od 26.11.2026
- `futbol-fpl.mjs` → `dane/fpl.json`: Fantasy Premier League – kontuzje, forma, xG/xA zawodników PL
- `futbol-xg.mjs` → `dane/xg.json`: xG drużyn mecz po meczu w PL (suma xG zawodników; Opta przez FPL); pobiera tylko po nowych meczach
- `futbol-fd.mjs` → `dane/fd.json`: football-data.co.uk (darmowe CSV, bez klucza) – xG 8 lig (od sezonu 2026-27) i kursy
  bet365 (zamknięcia) rozegranych meczów z 2 sezonów; kluby dopasowane do ID ESPN głosowaniem (data ±1 dzień + wynik).
  Pucharów (LM, LE) tam nie ma. W aplikacji: kursy rozegranych meczów i xG mają pierwszeństwo przed ESPN/FPL.
  `n` – kursy bet365 na nadchodzące mecze z `fixtures.csv` (plik uzupełniany ok. 2× w tygodniu; mają pierwszeństwo przed DraftKings).
  Środowisko chmurowe ma dozwolone hosty `football-data.co.uk` i `www.football-data.co.uk` (przekierowuje bez www).
- `futbol-ekstraklasa.mjs` → `dane/ekstraklasa.json`: Ekstraklasa z football-data.co.uk (`new/POL.csv` – wyniki i kursy
  zamknięcia bet365, a gdy brak – średnia rynku; `new_league_fixtures.csv` – najbliższe mecze, ok. 2 dni wcześniej).
  Godziny w plikach są czasu brytyjskiego. ESPN nie ma Ekstraklasy (`pol.1` → 400). Herby klubów i logo ligi z meczów
  TheSportsDB (`strHomeTeamBadge`, wariant `/small`; `lookup_all_teams` na darmowym kluczu zwraca złą ligę).
  Terminarz 3 najbliższych kolejek z TheSportsDB (darmowy klucz `123`, liga 4422: `eventsnextleague` → numer kolejki,
  `eventsround` → pełna kolejka; `eventsseason` na darmowym kluczu oddaje tylko 15 meczów). Godziny w UTC, nazwy
  dopasowane do football-data (słowa nazwy z football-data zawarte w nazwie TheSportsDB). Host `www.thesportsdb.com`
  dodany do środowiska chmurowego 27.11.2026. Brak xG, strzałów, składów, logo
  (barwy i polskie nazwy w `data.js`, `EK_TEAMS`; polskie nazwy są wzorcowe także dla danych ESPN – Legia, Lech, Raków
  i Jagiellonia łączą się z meczami w pucharach i mają z nich logo; `key()` zamienia „ł” na „l”).
  Pełnego terminarza brak – symulacja tabeli dopisuje brakujące pary (każdy z każdym u siebie i na wyjeździe, `rr: true`).
  Test: model 42,2% trafności (Brier 0,653), kursy 45,9% (0,632) – liga bardzo nieprzewidywalna.
- W chmurowym środowisku Node potrzebuje `NODE_USE_ENV_PROXY=1`, żeby skrypty sięgnęły do sieci.

## Model – decyzje i wyniki testu wstecznego (mecze od 15.09.2025, tylko dane sprzed meczu)
- 26.11.2026: xG w 8 ligach (70%) + „xG ze strzałów” tam, gdzie xG brak (40%; 0,194 × celne + 0,072 × pozostałe,
  dopasowane do xG Opta, R² 0,57), ściąganie 6 → 3, okres półtrwania 240 → 320 dni: trafność 51,0% → 52,1%, Brier 0,601 → 0,596.
  Prawdziwe xG i xG ze strzałów dają praktycznie to samo (0,5964 vs 0,5963).
- mecz ligowy: dopasowanie na danej lidze + LM + LE; puchary i kluby z różnych lig: wszystkie ligi
- xG w PL: 70% xG / 30% goli (Brier 0,6228 → 0,6183 na 80 meczach)
- zmęczenie: ≤ 3 dni przerwy i rywal odpoczywał dłużej → atak −3%, +6% straconych (48,7% → 49,4% trafności)
- kontuzje (tylko PL, mecze w 10 dniach): atak −udział brakujących w xG+xA ×0,6 (maks. −25%), obrona do +20%; nietestowalne (brak historii)
- beniaminkowie: start −0,25 ataku i obrony
- razem: 4043 mecze, trafność 1X2 52,1%, Brier 0,596 (od 45% Championship do 61% LM)
- kalibracja: najpewniejszy zakład w meczu (65–87%) – model 80,3%, weszło 78,9%; kupon z 3 najpewniejszych z dnia – model 59%, weszło 53%

## Zakłady na prawdziwych kursach (bet365, 3527 meczów ligowych) – wniosek: model nie bije rynku
- bukmacher przewiduje lepiej: trafność 52,7% vs 51,2%, Brier 0,585 vs 0,600; mieszanka model+rynek jest gorsza od samego rynku
- zwrot przy stałej stawce: najpewniejszy zakład −3,1% (kurs podwójnej szansy przybliżony), „okazje” (przewaga 8–35%) −11%,
  zawsze faworyt bukmachera −4,5%. Liczone w aplikacji na żywo: Typy → „Czy model mówi prawdę?”
- kurs podwójnej szansy z 1X2: szansa bez marży × (1 + marża/2) – zwykłe sumowanie 1/kurs liczyło marżę podwójnie

## Prognoza z kursów (26.11.2026) – główna prognoza na stronie
- `model.fromOdds`: z kursów 1X2 (+ linia 2,5 gola) po zdjęciu marży dopasowane oczekiwane gole obu drużyn → pełny rozkład wyników
- test na 3527 meczach (bet365): trafniejsza od modelu na każdym rynku, także pochodnych (BTTS, 1,5/3,5 gola);
  każda domieszka modelu pogarszała wynik. Model zostaje jako drugie zdanie, ostrzeżenie przy różnicy ≥ 10 pkt proc.,
  przełącznik w Danych. Najpewniejszy zakład z kursów: weszło 80,9% (zapowiedź 80,4%), zwrot −2,3%; kupon z 3 – 61%
- karta meczu pobiera na żywo z ESPN (`summary?event=`) potwierdzone składy i najnowsze kursy DraftKings (z kursem otwarcia);
  w PL pokazuje kluczowych zawodników (FPL: ≥ 8% xG+xA drużyny albo ≥ 75% minut lidera) poza pierwszym składem.
  ESPN odpowiada 403 przeglądarce testowej (Playwright, także przez proxy) – w zwykłych przeglądarkach 200 z CORS `*`
  (użytkownik potwierdził 26.11.2026: na telefonie najnowsze kursy się pokazują);
  ważne: zwykłe `fetch` bez nagłówków (z `cache: "no-cache"` przeglądarka wysyła OPTIONS, którego ESPN nie obsługuje)
- puchary: bez poprawki Dixona-Colesa (`rho: 0`; Brier LM 0,552 → 0,549, LE 0,587 → 0,583)

## Karta klubu – ostatnie 5 meczów z prognozami
`historyHtml`/`preMatch` w `app.js`: prognoza sprzed meczu z kursów zamknięcia (gdy są), inaczej model z testu wstecznego
(tylko dane sprzed meczu); podsumowanie trafień 1X2, dokładnego wyniku i samego modelu.

## Odrzucone (sprawdzone, nie działało)
- osobna przewaga własnego boiska dla każdego klubu (ściąganie 10–40 pseudo-meczów) – bez poprawy
- dostrajanie poprawki na remisy w ligach (rho od −0,16 do 0) – różnice ±0,0005 Briera
- ruch kursów jako osobny sygnał – prognoza i tak bierze najnowsze kursy
- ClubElo – nie odpowiada ani z chmury, ani z GitHub Actions
- Championship w modelu PL i ligi zagraniczne w modelu PL – pogarszały PL
- openfootball (opóźniony) i football-data.org (potrzebny klucz) – zastąpione przez ESPN
- Ekstraklasa w ESPN i openfootball – brak (dodana z football-data.co.uk)
- Transfermarkt / Opta / bet365 bezpośrednio – brak publicznego API, regulamin zabrania pobierania

## Pomysły na dalej
- (odrzucone przez użytkownika 26.11.2026) kursy bet365 przez API-Football z kluczem
- archiwum `kursy.json` (DraftKings z ESPN) przyda się głównie dla LM i LE – ligi mają już kursy bet365 z football-data
- football-data ma też `fixtures.csv` z kursami bet365 na nadchodzące mecze (użytkownik na razie nie chce bet365 przez API-Football)
- Remote Control: użytkownik chce później połączyć komputer (Claude Desktop → Ustawienia → Claude Code → Remote Control)

## Test
`node .github/scripts/futbol-test.mjs` (ok. 1 s, bez sieci): składnia plików, liczba meczów w każdych rozgrywkach, łączenie
polskich klubów, kursy i xG, test wsteczny PL/LaLiga/Ekstraklasa z progami, prognoza z kursów. Workflow `futbol-test.yml`
uruchamia go przy każdej zmianie w `futbol/` i w PR. Ustawienia modelu w teście (FIT) muszą być takie jak w `app.js`.

## Sposób pracy
Gałąź `claude/football-prediction-app-ps2t97` (po scaleniu odtwarzana od `main`). Każdą zmianę testuję w przeglądarce
(Playwright, serwer `python3 -m http.server` w katalogu repozytorium), potem push; PR i scalenie – na prośbę użytkownika.
