# Futbol – stan projektu (26.11.2026, po południu)

Aplikacja: https://chiniak.github.io/futbol/ (PWA, działa offline). Kod w `futbol/`, interfejs po polsku.
Użytkownik mieszka w Anglii – zakłady w £, ostrzeżenie UK Gambling Commission.

## Pliki
- `index.html`, `style.css`, `app.js` – interfejs (zakładki: Mecze, Tabela, Kluby, Typuj, Typy, Dane)
- `model.js` – model: Poisson + Dixon-Coles, ważenie świeżości, Elo, symulacja sezonu, test wsteczny, rynki zakładów
- `data.js` – wczytywanie i łączenie danych z `dane/`
- `sw.js` – offline; **przy każdej zmianie plików podbij `CACHE`** (teraz `futbol-v10`)
- `dane/` – pliki odświeżane przez GitHub Action (nie edytować ręcznie)

## Dane (`.github/workflows/futbol-dane.yml`, co 3 godziny, commit tylko przy zmianie)
- `futbol-espn.mjs` → `dane/espn.json`: wyniki, terminarze, kluby z logami – PL, LaLiga, Bundesliga, Serie A, Ligue 1,
  Eredivisie, Liga Portugal, Championship, Liga Mistrzów, Liga Europy (publiczne, nieudokumentowane API ESPN;
  `dates=RRRR&limit=1000` działa, zakresy dat zwracają 400). Kursy DraftKings przy nadchodzących meczach.
  Od 26.11.2026 także strzały i strzały celne każdego rozegranego meczu (`s`) – z nich „xG ze strzałów”.
- `dane/kursy.json` – archiwum przedmeczowych kursów (ESPN kasuje je po meczu); zbierane od 26.11.2026
- `futbol-fpl.mjs` → `dane/fpl.json`: Fantasy Premier League – kontuzje, forma, xG/xA zawodników PL
- `futbol-xg.mjs` → `dane/xg.json`: xG drużyn mecz po meczu w PL (suma xG zawodników; Opta przez FPL); pobiera tylko po nowych meczach
- `futbol-fd.mjs` → `dane/fd.json`: football-data.co.uk (darmowe CSV, bez klucza) – xG 8 lig (od sezonu 2026-27) i kursy
  bet365 (zamknięcia) rozegranych meczów z 2 sezonów; kluby dopasowane do ID ESPN głosowaniem (data ±1 dzień + wynik).
  Pucharów (LM, LE) tam nie ma. W aplikacji: kursy rozegranych meczów i xG mają pierwszeństwo przed ESPN/FPL.
  Środowisko chmurowe ma dozwolone hosty `football-data.co.uk` i `www.football-data.co.uk` (przekierowuje bez www).
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

## Odrzucone (sprawdzone, nie działało)
- ClubElo – nie odpowiada ani z chmury, ani z GitHub Actions
- Championship w modelu PL i ligi zagraniczne w modelu PL – pogarszały PL
- openfootball (opóźniony) i football-data.org (potrzebny klucz) – zastąpione przez ESPN
- Ekstraklasa – brak w darmowych źródłach (ESPN, openfootball)
- Transfermarkt / Opta / bet365 bezpośrednio – brak publicznego API, regulamin zabrania pobierania

## Pomysły na dalej
- (odrzucone przez użytkownika 26.11.2026) kursy bet365 przez API-Football z kluczem
- archiwum `kursy.json` (DraftKings z ESPN) przyda się głównie dla LM i LE – ligi mają już kursy bet365 z football-data
- football-data ma też `fixtures.csv` z kursami bet365 na nadchodzące mecze (użytkownik na razie nie chce bet365 przez API-Football)
- ewentualnie: prognoza z kursów rynku jako główna, model jako drugie zdanie (rynek jest trafniejszy)
- Remote Control: użytkownik chce później połączyć komputer (Claude Desktop → Ustawienia → Claude Code → Remote Control)

## Sposób pracy
Gałąź `claude/football-prediction-app-ps2t97` (po scaleniu odtwarzana od `main`). Każdą zmianę testuję w przeglądarce
(Playwright, serwer `python3 -m http.server` w katalogu repozytorium), potem push; PR i scalenie – na prośbę użytkownika.
