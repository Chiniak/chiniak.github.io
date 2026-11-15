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
| `--muted` | #66736F | #93A19E | tekst drugorzędny (spec. #788582 – za mały kontrast, 3.6:1) |
| `--faint` | #B7C2BF | #4A5755 | nieaktywne, puste pola wyboru |
| `--line` | #E8EEEB | #2A3533 | obramowania, separatory |
| `--accent-fill` | #43BDB5 | #5CCFC6 | **tylko wypełnienia**: przycisk główny, paski postępu, zaznaczenia |
| `--accent` | #1A7F78 | #5CCFC6 | tekst i ikony w kolorze akcentu (4.8:1) |
| `--accent-ink` | #0E3532 | #0B2A28 | tekst NA turkusie (nie biały – 2.3:1) |
| `--accent-soft` | #EAF7F5 | #16302E | tło aktywnej zakładki, chipów |
| `--ok` / `--ok-text` / `--ok-soft` | #269B73 / #1E8463 | | sukces |
| `--warn-fill` / `--warn` / `--warn-soft` | #E6A23C / #9C5A12 | | ostrzeżenie (`--warn` = tekst) |
| `--err` / `--err-text` / `--err-soft` | #DC6262 / #C24F4F | | błąd |

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
1. Design system ✔ (ten dokument) · 2. Podróże ✔ · 3. Bilety · 4. Plan · 5. Pakowanie · 6. Ustawienia · 7. ekrany dodatkowe · 8. szlif (animacje, dostępność, tablet, style z JS) · 9. testy całości.
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
