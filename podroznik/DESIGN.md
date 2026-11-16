# Podróżnik – design system „Premium Light”

Zatwierdzony przez właściciela 15.11.2026 (etap 1 redesignu). Wszystkie wartości są tokenami w `style.css` (`:root`);
ciemny motyw redefiniuje tylko kolory. Nowe style buduj z tokenów, bez kolorów i rozmiarów wpisanych na sztywno.

## Kolory
| Token | Jasny | Ciemny | Do czego |
|---|---|---|---|
| `--bg` | #F7F8F6 | #101615 | tło ekranu |
| `--surface` | #FFFFFF | #18201F | karty, listy, pasek dolny |
| `--surface-2` | #F0F3F1 | #1F2928 | tła pomocnicze, wciśnięcie |
| `--text` | #202B2B | #E6ECEA | tekst |
| `--muted` | #5F6C68 | #93A19E | tekst drugorzędny (etap 8: było #66736F – 4,4:1 na szarym tle; spec. #788582 – 3.6:1) |
| `--faint` | #B7C2BF | #4A5755 | nieaktywne, puste pola wyboru |
| `--line` | #E8EEEB | #2A3533 | obramowania, separatory |
| `--accent-fill` | #43BDB5 | #5CCFC6 | **tylko wypełnienia**: przycisk główny, paski postępu, zaznaczenia |
| `--accent` | #177670 | #5CCFC6 | tekst i ikony w kolorze akcentu (etap 8: było #1A7F78 – 4,4:1 na `--accent-soft`) |
| `--accent-ink` | #0E3532 | #0B2A28 | tekst NA turkusie (nie biały – 2.3:1) |
| `--accent-soft` | #EAF7F5 | #16302E | tło aktywnej zakładki, chipów |
| `--ok` / `--ok-text` / `--ok-soft` | #269B73 / #1A7757 | | sukces (etap 8: tekst ciemniejszy, ≥ 4,5:1 na `--ok-soft`) |
| `--warn-fill` / `--warn` / `--warn-soft` | #E6A23C / #9C5A12 | | ostrzeżenie (`--warn` = tekst) |
| `--err` / `--err-text` / `--err-soft` | #DC6262 / #B44444 | | błąd (etap 8: było #C24F4F) |

Turkus oszczędnie: główna akcja ekranu, aktywna zakładka, postęp, zaznaczenie. Nie wszystko turkusowe.
Ekrany „zawsze białe” (bilet na pełnym ekranie, karta dla kierowcy, okienko mapy) mają stałe kolory – skaner na bramce.

## Typografia
- Interfejs: **Plus Jakarta Sans** (`--font`), tytuły ekranów i nazwy podróży: **Newsreader 500** (`--font-display`).
  Pliki w `lib/fonts/` (OFL), z podzbiorami latin, latin-ext, vietnamese.
- Skala (rem – działa systemowe powiększenie): `--fs-cap` 12 · `--fs-sm` 13 · `--fs-body` 15 · `--fs-lg` 17 · `--fs-xl` 20 · `--fs-2xl` 26 · `--fs-3xl` 32.
- Wagi: 400 tekst, 500 etykiety pól i wiersze list, 600 tytuły i przyciski. **700 nie używamy.**
- Etykiety sekcji: `--fs-cap`, wersaliki, `letter-spacing: .08em`, `--muted`.

## Odstępy, zaokrąglenia, cienie
- Odstępy: `--s1`…`--s8` = 4, 8, 12, 16, 20, 24, 32. Margines ekranu 18 px.
- Zaokrąglenia: `--r-xs` 6 · `--r-sm` 10 (chip, pole) · `--r-ctl` 12 (kontrolki) · `--r-btn` 14 (przyciski) · `--radius` 18 (karty) · `--r-feature` 24 (duże karty).
- Cień (`--shadow`, `--shadow-lg`) tylko dla elementów nad treścią (karta bieżącej podróży, arkusz, przycisk pływający). Zwykła karta: obramowanie bez cienia.
- Nie każda informacja w osobnej karcie – listy z separatorami (`.list` / `.li`), hierarchia przez odstęp.

## Ikony
`icons.js` → `App.icon("plane", "sm")` zwraca `<svg class="ic">` (24 px, kreska 1.75, `currentColor`). Lista nazw: `App.icon.names`.
Emoji tylko w treści (kategorie pakowania/planu, rzeczy użytkownika), nie jako ikony interfejsu.
Uwaga: teksty z emoji są kluczami tłumaczeń w `i18n-en.js` – zmieniając tekst przycisku, zmień też klucz (test `t26`).

## Komponenty (style.css)
`.btn` / `.btn.primary` (48 px), `.seg`, `.field`, `.chip` (+ `.accent .ok .warn .err`), `.list` + `.li` (`.li-ico`, `.li-main`),
`.bar`, `.pk-check` (animowane odhaczenie), `.sw` (przełącznik), `.skeleton` (ładowanie), `.tabbar` (aktywna „pigułka”).
Ruch: krótkie przejścia 0.12–0.25 s; `prefers-reduced-motion` wyłącza animacje.

## Etapy redesignu
1. Design system ✔ (ten dokument) · 2. Podróże ✔ · 3. Bilety ✔ · 4. Plan ✔ · 5. Pakowanie ✔ · 6. Ustawienia ✔ · 7. ekrany dodatkowe (7a ✔ szczegóły podróży + formularze, 7b ✔ mapa, Odkrywaj, karty, offline, 7c ✔ budżet, rozliczenie, dokumenty, 7d ✔ kopia, PIN, przypomnienia, Gmail, udostępnianie, z maila) · 8. szlif ✔ (animacje, dostępność, tablet, style z JS) · 9. testy całości ✔.
Makieta zatwierdzona przez właściciela: ekran Podróże – nagłówek z powitaniem, karta bieżącej podróży ze zdjęciem i odliczaniem,
pasek postępu (spakowane / punkty planu / budżet), najbliższy bilet jako odcinek z QR, zadanie przed wyjazdem, nadchodzące
podróże w poziomym rzędzie, szybkie akcje (Nowa podróż, Z Gmaila, Otwórz wspólną). Decyzje: ciemny turkus do tekstu,
dwa kroje, zdjęcia bez motywów religijnych, tło ze zdjęć – nowi użytkownicy gładkie, istniejące ustawienie bez zmian.

## Ekran Podróże (etap 2, `trips.js` – trasa `#/podroze`)
- Nagłówek w trybie znaku: widok zwraca `brand: true` → `.topbar.brand` (ikona + „Podróżnik” małym krojem); akcja = statystyki.
- `.hm-head` powitanie (Newsreader) + data · `.hm-hero` bieżąca/najbliższa podróż: okładka (`data-cover` → `.has-photo`)
  albo gradient z koloru podróży (`--c`) z delikatnym wzorem; odliczanie `#cd-time` (co 15 s) do najbliższego odjazdu tej podróży
  albo do dnia wyjazdu; `.cd-label` = „Najbliższa podróż” / „W trakcie”.
- `.hm-stats` – spakowane (pasek), punkty w planie, wydatki (`App.Budget.summary`) – każdy prowadzi do swojej zakładki.
- `.tk-stub` – najbliższy bilet (`App.Tickets.nearest()`): kod lotniska wyciągany z końca nazwy („Warszawa WAW”), część z QR → pełny ekran.
- Przypomnienia (`App.Reminders.homeCards({ countdown: false })` – bez starego licznika) i karta Gmaila pod biletem.
- `.hm-scroll` pozostałe trwające/nadchodzące (karty 4:3), `.hm-quick` szybkie akcje, archiwum jako `.list`.
- Kolory podróży (`App.Trips.COLORS`) dopasowane do palety; stare zapisane kolory działają dalej.
- **Zdjęcia celu** (`covers.js`, `App.Covers`): podróż bez własnej okładki dostaje zdjęcie celu – artykuł Wikipedii (pl, en),
  zapas: wyróżnione/dobre zdjęcia Commons. Filtr `App.Backdrop.BAD` + kolaże, mapy, flagi; tylko poziome JPEG ≥ 900 px.
  Zapis w podróży (`coverAuto`, `putRaw`), autor pod nagłówkiem szczegółów (`.cover-credit`), „Usuń zdjęcie celu” w formularzu
  (`coverOff` = cel, dla którego usunięto). Własna okładka ma pierwszeństwo. Test t41.

## Bilety (etap 3, `tickets.js`)
- Zakładka `#/bilety` – portfel: wiersz Dokumenty (`.li-ico.ok/.warn/.err` = stan ważności), **najbliższy bilet** jako duża karta
  `.wl-feature` (rodzaj, przewoźnik, trasa z godzinami i czasem podróży, data, miejsce/gate/rezerwacja, perforacja,
  „Pokaż bilet” = `.next-ticket` → pełny ekran, „Szczegóły”), potem `.list` nadchodzących i zwijane „Wykorzystane”.
- Wspólne: `App.Tickets.routeHtml(s, środek)` / `ends(s)` (kody lotnisk z końca nazwy, godziny), `App.icon.type(rodzaj)`.
- Szczegóły odcinka `#/odcinek/:id` – karta `.jr` (`.seg-head`): trasa jak na bilecie albo nocleg (nazwa, adres, siatka
  zameldowanie / wymeldowanie / noce), fakty w `dl.jr-facts`, akcje jako wiersze listy (Nawiguj = `.map-link`, kierowca,
  kalendarz, podróż), kafelki biletów i dodawanie bez zmian.
- Pełny ekran `#/bilet/:id` – zawsze biały (skaner na bramce), stałe kolory zamiast tokenów; ikony zamiast emoji.

## Plan (etap 4, `plan.js` – trasa `#/plan/:id`)
- Tytuł paska „Plan”; nagłówek `.pl-head`: nazwa podróży (Newsreader) – przy kilku podróżach dotknięcie nazwy otwiera
  przełącznik (`#pl-trip`, niewidoczny `select` na nazwie + `.pl-head-chev`); `.pl-info` = zakres dat · „dzień X z Y”
  albo „Do wyjazdu N dni · zakres”; w trakcie podróży cienki pasek postępu (`.bar`).
- `.pl-days` – poziomy pasek dni (`.pl-dchip`: skrót dnia tygodnia, numer, kropka = coś zaplanowane; dziś turkusowy,
  dni spoza podróży z przerywaną ramką, na końcu 💡 z liczbą pomysłów). Dotknięcie przewija do dnia (`data-go`),
  dzień z „Poprzednich dni” najpierw rozwija listę. Pasek startuje przewinięty na dziś.
- Karta „Dziś” (`.today-card`) – biała karta z cieniem: chip „Dziś”, „Teraz · w drodze” (pulsująca kropka) i „Dalej”,
  ikony SVG odcinków (`ico` w `segEvents`), podsumowanie w stopce.
- Szybki dostęp `.pl-tools` – 4 kafelki (`.plan-link.pl-tool`): Mapa i trasa, Odkrywaj, Dla kierowcy, Z biletu
  (`.pl-from-file` + `#pl-from-file`); opis w `title`.
- Dzień: `.pl-day-head` – etykieta „DZIEŃ N” (+ chip „dziś”, pogoda) nad datą w Newsreader; mapa dnia i „+” jako ikony.
- Oś czasu `.pl-list` (`--rail`): godzina po lewej, linia z kropką (punkt – kółko w turkusie, bez godziny – szare,
  dziś wypełnione; odcinek – kółko z ikoną rodzaju), po prawej `.pl-card`. Karta punktu: zdjęcie 60 px, kategoria
  (emoji + nazwa), nazwa, adres z ikoną pinezki, koszt, notatka w szarym polu; po prawej `.pl-acts` (bilet – ikona,
  nawigacja, uchwyt ≡). Odcinki: szara karta bez ramki. Dojścia `.pl-leg` między kartami. Przeciąganie bez zmian (t5, t6).
- „Poprzednie dni” i „Pomysły – bez dnia” jako zwijane `details` z własnym `summary` (chip z liczbą, strzałka).
  Pomysły pod planem dni, wyraźnie oddzielone: szary panel `--r-feature`, karty bez ramki, „+ dzień” do przeniesienia.
- Koszty: dnia `.pl-cost`, razem `.pl-total`.

## Pakowanie (etap 5, `pack.js` – trasa `#/pakowanie/:id`)
- Tytuł „Pakowanie”; nagłówek jak w Planie (`.pl-head`, przełącznik `#pk-trip` na nazwie), pod nim zakres dat · „wyjazd za N dni”.
- Karta postępu `.pk-progress`: pierścień SVG (`.pk-ring`, procent w środku; komplet = zielony + ✓), tytuł w Newsreader
  („Zostało N rzeczy/zadań”, „Wszystko spakowane”), licznik `.pk-prog-top` „Spakowane X/Y” (na zakładce zadań „Zrobione”),
  chipy: do kupienia (tylko Rzeczy), po terminie (tylko Przed wyjazdem). Pusta lista – karty nie ma, jest stan pusty.
- Zakładki `.pk-tabs` z licznikami (Rzeczy X/Y, Przed wyjazdem X/Y). Na zakładce Rzeczy `.pk-next` – najbliższe
  niezrobione zadanie (po terminie: czerwone tło, ikona ostrzeżenia), dotknięcie → zakładka zadań.
- Kategorie bez kart: nagłówek `.pk-cat` (emoji, nazwa wersalikami, licznik `.pk-count`, mini pasek `.pk-mini`; komplet = zielony),
  wiersze `.pk-row` oddzielone liniami. Zadania: grupy „Do zrobienia” i „Zrobione”, termin pod nazwą (`.pk-due`, po terminie czerwony).
- Wózek „do kupienia” = ikona `cart` (nowe ikony: `cart`, `star`, `undo`, `list`).
- Pod listą: przełącznik `.sw` „Ukryj spakowane” (`#pk-hide`) i lista `.list` – Szablony (`#pk-tpl`), Zapisz jako szablon
  (`#pk-save`), Odznacz wszystko (`#pk-reset`); `button.li` = wiersz listy jako przycisk.
- Szablony: dwie `.list.tpl-box` (Twoje / Gotowe), usuwanie ikoną kosza.

## Ustawienia (etap 6, `settings.js` – trasa `#/ustawienia`; uporządkowane 15.11 na prośbę właściciela – „za dużo miejsca, nie wszystko potrzebne”)
- Ekran ok. 1 wysokości telefonu: bez nagłówka z logo, 4 grupy `.set-group` = etykieta sekcji + `.list`:
  **Wygląd** (Motyw `#theme-sel`, Język `#lang-sel`, Tło ze zdjęć – przełącznik `.sw` `#bg-on`; „Nowe zdjęcie” `#bg-every` i `#bg-info` tylko
  przy włączonym tle), **Podróżowanie** (Nawigacja `#nav-app` – krótka podpowiedź tylko dla „Inna aplikacja” / „Amap”, Start w trakcie podróży
  `#start-sel`, Przypomnienia), **Dane i bezpieczeństwo** (Kopia zapasowa, Blokada PIN-em), **Aplikacja** (Gmail – tylko gdy dostępny, APK –
  tylko w przeglądarce, „Podróżnik 2.9.0” `#app-version` + jedna linijka `#storage`: podróże · MB w telefonie · działa offline).
- Wiersz z wyborem `.li.set-row` + `select.set-sel` po prawej (systemowa lista, własna strzałka); wiersz-link: `.li-ico`, tytuł, krótki opis,
  chip stanu (`ok` / `warn`), strzałka. Usunięte: akapity o mapach (porada o mapie offline jest w Przygotuj offline), pasek zajętości
  i „ochrona przed usunięciem” (krok w Przygotuj offline), osobny wiersz „Tryb offline”.
- Ostrzeżenia: brak kopii / stara kopia → chip „zrób kopię” i ikona w kolorze ostrzeżenia; powiadomienia wyłączone → chip „wył.”.

## Szczegóły podróży i formularze (etap 7a)
- `#/podroze/:id` (`trips.js`): tytuł paska „Podróż”, okładka `.trip-head.hm-hero.td-hero` jak karta na ekranie głównym
  (zdjęcie albo kolor podróży; chip stanu `.glass`, cel wersalikami, nazwa w Newsreader, zakres · dzień X z Y, w trakcie biały pasek postępu);
  notatka `.td-note` (szare pole z ikoną info); `.hm-stats.td-stats` – W planie (+ pomysły), Spakowane (+ zadania), Wydatki
  (`.over` = ponad budżet, czerwony); narzędzia jako `.list.td-tools` (Plan, Przygotuj offline, Udostępnij, Do kalendarza `#ics-trip`).
- Oś czasu: sekcja „Trasa i noclegi” z licznikiem, dni `.td-day` z nagłówkiem jak w Planie (`.pl-day-head`, „DZIEŃ N”, data `h3.tl-day`
  w Newsreader), karty `.tl-card`: ikona SVG rodzaju w turkusowym kwadracie, `.tl-kind` (rodzaj wersalikami · przewoźnik · numer,
  bilety jako chip z ikoną `ticket`), trasa/nazwa dużą czcionką, godziny, adres noclegu z pinezką, chipy (bez przewoźnika i numeru –
  `chips(s, true)`). Wymeldowanie: przerywana karta z ikoną `key` (nowa ikona).
- „Dodaj do podróży”: kafelki `.type-btn` z ikoną SVG w kwadracie `--accent-soft`, pod nimi wiersz listy „Z maila”.
- Formularze (podróż, odcinek, punkt planu, rzecz/zadanie): grupy `.fsec` z etykietą sekcji `.section`, podpowiedzi `.f-hint`
  (liczba dni podróży, czas przejazdu / liczba nocy – dla lotu brak, bo strefy), przyciski w `.f-actions` (usuń = ikona kosza).
  Okładka w formularzu podróży = podgląd karty na żywo (`.cover-pick.hm-hero`: nazwa, cel i kolor zmieniają się przy pisaniu),
  przyciski zdjęcia jako `.glass.cp-btn`. Rodzaje odcinka z ikonami SVG zamiast emoji; tytuł formularza bez emoji.
  Paski `.type-chips` przewijają się same do zaznaczonego elementu (`App.render`). Z maila: nad polami ostrzeżenie „sprawdź”.

## Mapa, Odkrywaj, karty dla kierowcy, offline (etap 7b)
- Tytuły pasków krótkie, bez nazwy podróży: „Mapa”, „Odkrywaj”, „Karty i rozmówki”, „Mapa offline”, „Przygotuj offline”.
- Nowe ikony: `locate`, `landmark`, `food`, `tree`, `idea`, `walk`, `phone`, `sparkle`, `shield`, `currency`, `layers`, `volume`, `key`.
- Wyszukiwarka `.pl-search` (mapa, Odkrywaj, pole „Miejsce”): pole 48 px jak `.field`, lupa w środku (`.pl-search-ic`), kwadratowy przycisk.
- Mapa (`places.js`): `.mp-card` z ramką i zaokrągleniem, kontrolki Leaflet białe z cieniem (zoom, `.mp-locate` z ikonami
  `locate` / `landmark`, warstwy), pinezka noclegu ciemna z ikoną łóżka, atrakcje z ikonami SVG; okienko pinezki – przyciski z ikonami
  (zawsze białe). Pod mapą: „Ułóż najkrótszą trasę” (główny przycisk), nagłówek dnia, `.list.mp-list` (numer w kółku, miniatura,
  nazwa · godzina, chev; dojście `.mp-leg` z ikoną `walk`/`taxi`), potem `.list.mp-tools`: Znajdź położenie (`#mp-geo`), Trasa w Mapach
  Google, Mapa offline (`#mp-off`).
- Odkrywaj (`discover.js`): zakładki jako segmentowany przełącznik `.dc-tabs` (linki `.st-chip` zostają – testy), „W pobliżu” jako
  etykieta sekcji + chipy z ikonami (`#dc-gps` – tekst w `.dc-gps-t`), linki do Map Google z ikonami, karty `.dc-card` z ikoną kategorii
  zamiast emoji, przycisk „Do pomysłów” / „w planie” z ikoną; błąd serwerów = panel `.td-note.dc-warn` (t22 czeka na `.dc-warn`).
- Karty i rozmówki (`phrases.js`): nagłówek `.tx-hero` (ikona taxi, opis), lista miejsc `.list.tx-list` z `li-ico` (bed/pin/idea),
  zielony znaczek = karta gotowa, „bez lokalnego adresu” na pomarańczowo; zwroty: lokalne pismo dużą czcionką, polski + wymowa pod spodem.
  Pełny ekran karty bez zmian (zawsze biały), „Nawiguj” z ikoną.
- Mapa offline (`offline.js`): `.tx-hero` z nazwą podróży, `.hm-stats.of-info` (pobrane, wolne miejsce, ostatnio), obszary jako `.list`
  z polami wyboru, stan `.of-state.chip` (ok = pobrana).
- Przygotuj offline (`prep.js`): karta `.pr-sum` (nazwa podróży, X/Y gotowe, tytuł w Newsreader, pasek – komplet zielony),
  ostrzeżenie o Chinach jako panel `--warn-soft`, „Lista kontrolna” `.list.pr-list`: ikona kroku, opis, kółko stanu `.pr-mark`
  (`.ok` zielone z ✓, `.todo` puste, `.na` przerywane, `.busy` kręci się; tekst dla czytnika w `.sr`), strzałka `.pr-go`.

## Budżet, rozliczenie, dokumenty (etap 7c)
- Nowe ikony: `passport`, `idcard`, `card`, `syringe`, `bag`, `box`, `arrow`, `copy`, `bank`. Kategorie wydatków mają `ic` (`App.Budget.CATS`)
  i kolor `--cc` (`.c-transport` niebieski, `.c-nocleg` fiolet, `.c-jedzenie` pomarańcz, `.c-atrakcje` turkus, `.c-zakupy` róż, `.c-inne` szary):
  ikona w kwadracie `.bg-ico` (tło = 14% koloru) i pasek kategorii w tym samym kolorze.
- Budżet (`#/budzet/:id`, tytuł „Budżet”): karta `.bg-sum` (WYDANO wersalikami, kwota w Newsreader 32 px, pasek, „Zostało X z Y”,
  chipy „ok. N na dzień” i liczba dni; ponad budżetem kwota czerwona), brak kursu = panel `.td-note.bg-warn`; „Kategorie” jako `.list`;
  „Rozliczenie” jako wiersz listy; „Dodaj wydatek” – karta `#bg-add` (na co, kwota + waluta, kategoria + dzień, kto/za kogo, przycisk na całą
  szerokość); wydatki wg dni: nagłówek sekcji z sumą dnia, `.list` z `.li.bg-row` (ikona kategorii, nazwa `.bg-row-name`, kategoria · z biletów ·
  kto płaci, kwota + przeliczenie); „Budżet i waluty” – karta `#bg-cfg`, kursy jako lista `.bg-rate-row`.
- Wydatek (`#/wydatek/:id`): grupy `.fsec`, kategorie z ikonami, „Za kogo” jako chipy-przełączniki (`.type-chip` z checkboxem).
- Rozliczenie (tytuł „Rozliczenie”): karta podsumowania jak w budżecie, inicjały osób w kółkach (`.sp-av`, kolor stały wg kolejności),
  „Kto komu oddaje” – `.sp-transfer` (inicjał, A → B, kwota w Newsreader), „Wyślij rozliczenie” jako przycisk główny, salda jako lista.
- Dokumenty: opis pod paskiem, karty `.doc-card` (klasa stanu `st-…` zostaje drugą klasą – t12): ikona SVG rodzaju (tło wg stanu:
  turkus / ostrzeżenie / błąd), tytuł, numer, chip stanu (ważny / wkrótce wygasa / nieważny / bez daty) + tekst ważności, ostrzeżenia
  z ikoną (`tripWarnings` zwraca `{ lvl, txt }`, bez emoji). Podgląd: karta `.doc-head` (ikona, chip, tytuł w Newsreader, numer, pasek
  pozostałej ważności do 10 lat), ostrzeżenia jako panele, „Kopiuj numer”, fakty jako `dl.list`, notatka jako `.td-note`. Formularz: grupy Ważność / Skan i notatka.

## Kopia, blokada, przypomnienia, Gmail, udostępnianie, z maila (etap 7d)
- Wspólny wzór ekranów „informacyjnych”: nagłówek `.tx-hero` (ikona w białym kwadracie na `--accent-soft`, tytuł w Newsreader, opis),
  karta stanu `.pr-sum` z etykietą wersalikami, chipem stanu i listą faktów `dl.bk-facts`, formularze w karcie `.bg-cfg`,
  ustawienia jako `.list` z wierszami (`.li` + `li-ico`), uwagi jako `.td-note` (ikona + tekst; `white-space: normal`, notatki
  użytkownika `.td-note.note` / `.doc-note` zachowują nowe wiersze).
- Kopia (`backup.js`): karta „Ostatnia kopia” (`#bk-last` – data albo „jeszcze nie było”; chip aktualna / stara / są zmiany / brak),
  ostrzeżenie `.bk-warn`, „Zrób kopię” w karcie `#bk-export`, porady `.bk-tips` jako lista z numerami w kółkach, „Przywróć z kopii”.
- Blokada (`lock.js`): nagłówek z chipem wł./wył., „Ustaw PIN” w karcie, ostrzeżenie o PIN-ie; po włączeniu ustawienia jako lista
  (`.lk-row` – czas blokady, odcisk palca jako przełącznik) i „Zmień PIN albo wyłącz”. Ekran blokady bez zmian.
- Przypomnienia (`reminders.js`): karta stanu `.rm-status` (chip działają / nie działają, fakty, przyciski z ikonami), główny przełącznik
  `.rm-master`, rodzaje transportu `.rm-types` z ikoną SVG i opcjami wciętymi o 48 px, „Pakowanie i plan” jako lista, kalendarz w karcie,
  najbliższe przypomnienia `.list.rm-list` (ikona dzwonka, dzień i godzina po prawej).
- Gmail (`gmail.js`): `.gm-intro` = nagłówek + lista rodzajów rezerwacji z ikonami + uwaga o prywatności; konto jako `.pr-sum.gm-account`.
- Udostępnianie (`share.js`) i „Dodaj z maila” (`email.js`): nagłówek `.tx-hero`, przyciski z ikonami, dołączanie biletów jako przełącznik `.sw`.

## Szlif (etap 8)
- **Dostępność:** audyt axe-core (WCAG 2 A/AA + dobre praktyki) na 30 ekranach, jasny i ciemny motyw – 0 problemów. Poprawki: kontrast
  tokenów (tabela wyżej), nagłówki sekcji `.section` to teraz `h2` (pasek = `h1`, podgrupy `h3`) – styl zależy od klasy, nie od znacznika,
  `aria-label` kolorów podróży na polu wyboru, zakładki Pakowania i Odkrywaj bez błędnych ról `tab`/`tablist` (przełączniki z `aria-pressed`).
  Skrypt audytu: scratchpad sesji (axe-core 4.10 z npm + Playwright) – przy kolejnych zmianach powtórzyć.
- **Ruch:** nowy ekran pojawia się z krótkim przenikaniem (`#view.v-in`, 0,2 s, tylko przy zmianie ekranu, tylko `opacity` – transform
  przestawiłby elementy `fixed`), płynne wciśnięcia list/kart/chipów, `prefers-reduced-motion` wyłącza wszystko.
- **Tablet (≥ 752 px):** górny i dolny pasek wyrównane do kolumny treści (720 px), wyższa okładka.
- **Duża czcionka systemowa:** skala w rem; podpisy dolnego paska `min(--fs-cap, 3.1vw)` – mieszczą się przy 130%.
- **Style w JS:** zostały tylko wartości dynamiczne (`--c`, `--pc`, szerokości pasków); stałe przeniesione do CSS.
- Puste stany (`App.empty`) – ikona SVG w miękkim kółku zamiast dużego emoji (mapa `EMPTY_IC` w app.js); statystyki z przełącznikiem `.sw`
  i liczbami w Newsreader.

## Tryb „W podróży” – ekran Dziś (`dzis.js`, po redesignie)
- Trasy `#/dzis` (trwająca podróż, inaczej `pickTrip`) i `#/dzis/:id?d=RRRR-MM-DD` (dzień spoza podróży → dziś / 1. / ostatni dzień).
  Tytuł paska „Dziś”, akcja = Plan. Wejścia: przycisk `.hm-today` pod kartą trwającej podróży na ekranie głównym, link „Cały dzień”
  (`.td-more`) w karcie „Dziś” w Planie (`todayCard(…, { more: true })`), ustawienie **Podróżowanie → Ekran startowy w trakcie podróży**
  (`startScreen`: `dzis` / `podroze`; bez wyboru – w aplikacji (APK, PWA zainstalowana) **„Dziś”** (decyzja właściciela 15.11), w karcie
  przeglądarki „Podróże”; app.js przy starcie z `#/podroze`, tylko gdy podróż trwa).
- Kolejność: `.dz-head` (chip stanu: W podróży / Podgląd / Miniony dzień, nazwa podróży, strzałki dni `.dz-arrow`, „DZIEŃ N Z M”,
  data w Newsreader, pogoda dnia `.dz-wx`, pasek postępu) · karta Teraz/Dalej (tylko dziś, odświeżana co minutę) · nocleg `.dz-stay`
  (`hotelFor`; wymeldowanie bez nowego noclegu = ikona `key` na ostrzegawczym tle; akcje `.dz-acts`: Nawiguj, Zadzwoń – `tel:`, Dla kierowcy;
  ≤ 380 px ikona nad tekstem) · „Bilety na ten dzień” `.dz-ticket` (odcinki i punkty planu z plikiem, turkusowe „Pokaż”) · „Plan dnia”
  `.list.dz-plan` (godzina, ikona, nazwa, adres, Nawiguj; minione dziś przekreślone `.is-done`) · „Wydatki dziś” `.dz-money` (suma dnia
  w Newsreader, chip „ok. X na dzień”, kategorie jako `.type-chip`, kwota + waluta zapamiętana `budgetCur:<id>`) · skróty `.pl-tools.dz-tools`
  (Mapa dnia, W pobliżu, Rozmówki, Dokumenty) · „Jutro” `.dz-next` (do 3 punktów z godziną) albo „Ostatni dzień podróży”.

## Wjazd i wizy (`visas.js`, panel w szczegółach podróży)
- Sekcja „Wjazd i wizy” w `#/podroze/:id` (pod narzędziami, tylko podróże nie zakończone): nagłówek z chipem „N do zrobienia” (`warn`) albo
  „w porządku” (`ok`); `.list.vz-list` – wiersz `.vz-row`: flaga w `li-ico` (`is-act` = tło ostrzegawcze), nazwa kraju + chip rodzaju
  (bez wizy `ok`, formularz / wiza po przylocie `accent`, zezwolenie / e-wiza / sprawdź `warn`, wiza `err`, mam `ok`), opis, dodatki
  (`.vz-bad` przekroczony limit dni / koniec zwolnienia, `.vz-ok` mam, termin przypomnienia), przyciski-pigułki `.vz-acts` (Oficjalna strona,
  Mam – `aria-pressed`), krzyżyk `.vz-x` w rogu = „Nie jadę”. Pod listą `select` „+ Dodaj kraj” (przerywana ramka) i źródło `.vz-src` (MSZ).
- Dane: polski paszport, stan 2026 – orientacyjne, zawsze link do MSZ; linki tylko do oficjalnych stron (pośrednicy).

## Przelicznik walut (`waluty.js`, trasa `#/waluty/:id`)
- Tytuł „Waluty”, akcja = Budżet. Karta `.cv-card` (cień): chip podróży + chip „brak kursu”, pole kwoty `.cv-line` (Newsreader 32 px, przy
  długim tekście `.long` 20 px; liczy `+ − × /` – `App.Money.calc`), pod nim wynik wyrażenia `.cv-calc` i okrągły przycisk zamiany `.cv-swap`,
  wynik `.cv-out` na `--accent-soft` (turkusowy tekst), kurs w obie strony `.cv-rate`, „Dodaj jako wydatek”. Pod kartą chipy walut podróży
  (`.st-chip.on`), „Ściąga: X → Y” – siatka 2 kolumny okrągłych kwot (ok. 1–3000 zł), dotknięcie wpisuje kwotę; „Kursy na drogę” – lista
  z kodem waluty w `li-ico`, źródłem i datą („NBP · 15.11”, „wpisany ręcznie”, „kurs z budżetu”) i polem do wpisania kursu; NBP (wyłączony offline),
  „+ Dodaj walutę”, uwaga o kursie średnim. Wejścia: kafelek „Waluty” na ekranie Dziś (kafelki 3 × 2), wiersz w podróży, link w budżecie,
  krok „Kursy walut” w Przygotuj offline.

## Dziennik podróży (`journal.js`)
- Lista `#/dziennik/:id` (tytuł „Dziennik”): nazwa podróży w Newsreader + „N dni opisanych z M · K zdjęć”; karty dni `.jr-day` od najnowszego
  (etykieta „DZIŚ · DZIEŃ N” w turkusie, data w Newsreader, nastrój emoji po prawej, 3 linie tekstu, miniatury 4 w rzędzie + „+N”);
  dzień pusty = przerywana ramka i „Dopisz wspomnienie”; dziś z cieniem. Pod listą `.list.jr-tools`: pamiątka HTML ze zdjęciami, tekst.
- Dzień `#/dziennik/:id/:data`: nagłówek jak na ekranie Dziś (strzałki, „DZIEŃ N Z M”), nastrój `.jr-moods` – 5 kafelków (emoji wyszarzone,
  wybrane w kolorze na `--accent-soft`), tekst w Newsreader 17 px (`.jr-text`, zapis po 0,7 s i przy wyjściu, „Zapisane”), zdjęcia `.jr-photos`
  3 w rzędzie + kafelek „Dodaj zdjęcia” (przerywana ramka), podgląd `.jr-viewer` czarny pełny ekran, „Co było w planie – podpowiedź”
  `.jr-facts` (szare `details`, rozwinięte, gdy brak tekstu). Na ekranie Dziś karta `.dz-journal` („Jak minął dzień?” / fragment wpisu).

## Testy całości (etap 9)
- Przegląd automatyczny: 38 ekranów × 5 wariantów (jasny, ciemny, angielski, 360 px, tablet 1024 px) – bez błędów JS w konsoli,
  bez elementów wychodzących poza ekran, bez poziomego przewijania; zrzuty obejrzane ręcznie.
- Offline (service worker): wszystkie 38 ekranów działa bez sieci, także po przeładowaniu; wszystkie pliki z `index.html`, czcionki
  i biblioteki ładowane na żądanie są na liście `APP` w `sw.js`.
- Dostępność: axe-core 0 problemów (etap 8). Pełna seria testów Playwright t3–t41 zielona.
- Poprawki z przeglądu: brak tłumaczenia „Plan jako tekst”, tło panelu przy ostrzeżeniach na liście dokumentów.
- **Redesign „Premium Light” zakończony** (etapy 1–9). Dalsze zmiany wyglądu – według zasad z tego pliku.
