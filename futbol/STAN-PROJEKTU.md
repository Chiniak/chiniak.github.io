# Futbol – stan projektu (26.11.2026)

Aplikacja: https://chiniak.github.io/futbol/ (PWA, działa offline). Kod w `futbol/`, interfejs po polsku.
Użytkownik mieszka w Anglii – zakłady w £, ostrzeżenie UK Gambling Commission.

## Pliki
- `index.html`, `style.css`, `app.js` – interfejs (zakładki: Mecze, Tabela, Kluby, Typuj, Typy, Dane)
- `model.js` – model: Poisson + Dixon-Coles, ważenie świeżości, Elo, symulacja sezonu, test wsteczny, rynki zakładów
- `data.js` – wczytywanie i łączenie danych z `dane/`
- `sw.js` – offline; **przy każdej zmianie plików podbij `CACHE`** (teraz `futbol-v9`)
- `dane/` – pliki odświeżane przez GitHub Action (nie edytować ręcznie)

## Dane (`.github/workflows/futbol-dane.yml`, co 3 godziny, commit tylko przy zmianie)
- `futbol-espn.mjs` → `dane/espn.json`: wyniki, terminarze, kluby z logami – PL, LaLiga, Bundesliga, Serie A, Ligue 1,
  Eredivisie, Liga Portugal, Championship, Liga Mistrzów, Liga Europy (publiczne, nieudokumentowane API ESPN;
  `dates=RRRR&limit=1000` działa, zakresy dat zwracają 400). Kursy DraftKings przy nadchodzących meczach.
- `dane/kursy.json` – archiwum przedmeczowych kursów (ESPN kasuje je po meczu); zbierane od 26.11.2026
- `futbol-fpl.mjs` → `dane/fpl.json`: Fantasy Premier League – kontuzje, forma, xG/xA zawodników PL
- `futbol-xg.mjs` → `dane/xg.json`: xG drużyn mecz po meczu w PL (suma xG zawodników; Opta przez FPL); pobiera tylko po nowych meczach
- W chmurowym środowisku Node potrzebuje `NODE_USE_ENV_PROXY=1`, żeby skrypty sięgnęły do sieci.

## Model – decyzje i wyniki testu wstecznego (mecze od 15.09.2025, tylko dane sprzed meczu)
- mecz ligowy: dopasowanie na danej lidze + LM + LE; puchary i kluby z różnych lig: wszystkie ligi
- xG w PL: 70% xG / 30% goli (Brier 0,6228 → 0,6183 na 80 meczach)
- zmęczenie: ≤ 3 dni przerwy i rywal odpoczywał dłużej → atak −3%, +6% straconych (48,7% → 49,4% trafności)
- kontuzje (tylko PL, mecze w 10 dniach): atak −udział brakujących w xG+xA ×0,6 (maks. −25%), obrona do +20%; nietestowalne (brak historii)
- beniaminkowie: start −0,25 ataku i obrony
- razem: 4043 mecze, trafność 1X2 51,0%, Brier 0,601 (od 44% Championship do 58% LM)
- kalibracja: najpewniejszy zakład w meczu (65–87%) – model 80,5%, weszło 78,4%; kupon z 3 – model 52%, weszło 47%

## Odrzucone (sprawdzone, nie działało)
- ClubElo – nie odpowiada ani z chmury, ani z GitHub Actions
- Championship w modelu PL i ligi zagraniczne w modelu PL – pogarszały PL
- openfootball (opóźniony) i football-data.org (potrzebny klucz) – zastąpione przez ESPN
- Ekstraklasa – brak w darmowych źródłach (ESPN, openfootball)
- Transfermarkt / Opta / bet365 bezpośrednio – brak publicznego API, regulamin zabrania pobierania

## Pomysły na dalej
- kursy bet365: przez API-Football (api-sports.io, darmowy plan 100 zapytań/dzień) – wymaga klucza użytkownika
  zapisanego jako secret w GitHub Actions; najpierw sprawdzić, czy darmowy plan daje bet365 dla bieżącego sezonu
- gdy archiwum `kursy.json` urośnie: policzyć rzeczywisty zwrot z „najpewniejszych zakładów” i „okazji”
- Remote Control: użytkownik chce później połączyć komputer (Claude Desktop → Ustawienia → Claude Code → Remote Control)

## Sposób pracy
Gałąź `claude/football-prediction-app-ps2t97` (po scaleniu odtwarzana od `main`). Każdą zmianę testuję w przeglądarce
(Playwright, serwer `python3 -m http.server` w katalogu repozytorium), potem push; PR i scalenie – na prośbę użytkownika.
