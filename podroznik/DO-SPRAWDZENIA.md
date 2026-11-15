# Podróżnik – do sprawdzenia na telefonie

Wszystko poniżej było testowane tylko w przeglądarce na komputerze (symulacja telefonu Pixel 7,
wirtualny aparat, wygenerowane kody). Te rzeczy trzeba sprawdzić na prawdziwym telefonie.
Po sprawdzeniu zmień ⬜ na ✅, a jeśli coś nie działa – na ❌ i dopisz, co się stało.

Adres (po scaleniu pull requesta): https://chiniak.github.io/podroznik/

---

## Przed testami
- ⬜ Pull request #1 scalony, strona otwiera się pod adresem powyżej
- ⬜ Etap 3 wysłany na GitHub (push był zablokowany – błąd 403, trzeba ponownie połączyć GitHub)

## Etap 0 – Fundament
- ⬜ „Dodaj do ekranu głównego” w Chrome – ikona samolocika, aplikacja otwiera się bez paska przeglądarki
- ⬜ Działa w trybie samolotowym (po jednym otwarciu z internetem)
- ⬜ Motyw: Auto / Jasny / Ciemny – zostaje po zamknięciu aplikacji
- ⬜ Ustawienia → „Ochrona przed usunięciem: tak” (jeśli „nie” – dane mogą zniknąć przy braku miejsca)
- ⬜ Dolne menu nie zasłania treści, nic nie wychodzi poza ekran (także na „notchu” / pasku gestów)

## Etap 1 – Podróże i odcinki
- ⬜ Wybór daty i godziny (kalendarz Androida) w formularzu odcinka jest wygodny
- ⬜ Nowy odcinek: kalendarz otwiera się na pierwszym dniu podróży
- ⬜ Przycisk ‹ (wstecz) w aplikacji i systemowy „wstecz” Androida prowadzą tam, gdzie trzeba
- ⬜ Długie nazwy (np. „Lizbona Santa Apolónia → Porto Campanhã”) mieszczą się na ekranie
- ⬜ Usuwanie podróży i odcinka (okienko potwierdzenia)

## Etap 2 – Bilety
- ⬜ **Skaner aparatem** – zgoda na aparat, szybkość odczytu (telefon używa wbudowanego czytnika BarcodeDetector, na komputerze testowany był tylko zapasowy ZXing)
- ⬜ Skan prawdziwej karty pokładowej (PDF417) z PDF-a od linii lotniczej
- ⬜ Skan prawdziwego biletu kolejowego (Aztec, np. PKP Intercity) – **czy bramka/konduktor przyjmie kod narysowany od nowa**; jeśli nie – działa „Oryginał”?
- ⬜ Zrzut ekranu biletu z aplikacji przewoźnika – czy kod zostaje wykryty automatycznie
- ⬜ Bilet w PDF – wyświetla się ostro, da się przewijać strony
- ⬜ Pełny ekran biletu: **ekran nie gaśnie**, dopóki bilet jest otwarty
- ⬜ Jasność trzeba podkręcić ręcznie (strona nie umie) – sprawdzić, czy to przeszkadza
- ⬜ Przesuwanie palcem między biletami (np. dwie osoby)
- ⬜ „Najbliższy bilet” na ekranie głównym otwiera właściwy bilet
- ⬜ Bilety otwierają się w trybie samolotowym
- ⬜ Duże zdjęcia / wiele biletów – aplikacja nie zwalnia

## Etap 3 – Plan dnia
- ⬜ **Przeciąganie ≡ palcem** – czy nie przewija przy okazji strony, czy łatwo trafić
- ⬜ Przycisk „Nawiguj” otwiera aplikację **Google Maps** z trasą (a nie stronę w przeglądarce)
- ⬜ Wklejony link z Google Maps („Udostępnij” → kopiuj link) jako miejsce punktu – nawigacja działa
- ⬜ Karta „Dziś” w trakcie prawdziwej podróży – „teraz / dalej / za ile” zgadza się z rzeczywistością
- ⬜ Licznik w karcie „Dziś” odświeża się sam (co minutę)
- ⬜ Pole godziny (zegar Androida) i daty w formularzu punktu
- ⬜ Koszty z przecinkiem (np. 12,50) liczą się poprawnie

## Etap 4 – Pakowanie
- ⬜ Szybkie dodawanie: po dodaniu rzeczy klawiatura zostaje otwarta i można wpisywać dalej
- ⬜ Odhaczanie kółkiem i 🛒 „do kupienia” – łatwo trafić palcem, strona nie przeskakuje
- ⬜ Wybór kategorii (lista rozwijana) i daty zadania obok pola tekstowego – mieszczą się na wąskim ekranie
- ⬜ Szablony: dodanie kilku po kolei, rzeczy się nie dublują
- ⬜ „⭐ Zapisz jako szablon” – okienko z nazwą działa w aplikacji zainstalowanej na ekranie głównym
- ⬜ Zadanie z terminem w przeszłości jest na czerwono „po terminie”
- ⬜ Czy gotowe szablony mają sensowne rzeczy – co dodać / usunąć?

## Etap 5 – Licznik i przypomnienia
- ⬜ Ustawienia → Przypomnienia → „Włącz powiadomienia” – okienko zgody Androida, potem „Wyślij próbne” pojawia się na pasku
- ⬜ Dotknięcie powiadomienia otwiera aplikację na właściwym ekranie (lot, pakowanie…)
- ⬜ **Powiadomienia przy zamkniętej aplikacji** – czy „Sprawdzanie w tle” pokazuje „włączone” po dodaniu do ekranu głównego i kilku dniach używania; czy przypomnienia przychodzą bez otwierania aplikacji (i z jakim opóźnieniem)
- ⬜ Po otwarciu aplikacji zaległe przypomnienia pokazują się od razu (i baner na ekranie głównym)
- ⬜ Licznik na ekranie głównym tyka, liczby mieszczą się na wąskim ekranie
- ⬜ Eksport .ics → „Udostępnij” → aplikacja Kalendarz (Samsung / inna) importuje wydarzenia **z alarmami**
- ⬜ Godziny w kalendarzu – czy zgadzają się przy wyjeździe za granicę (plik ma czas „na zegarku”, bez strefy czasowej)
- ⬜ „📅 Dodaj do Google Kalendarza” na stronie lotu/pociągu otwiera aplikację Google Kalendarz z wypełnionym wydarzeniem
- ⬜ Czy domyślne przypomnienia (np. 3 h przed lotem, 1 h przed pociągiem, dzień wcześniej o 19:00) pasują – co zmienić?

## Etap 6 – Kopia zapasowa i blokada
- ⬜ „💾 Zapisz kopię” → menu „Udostępnij” → **Dysk Google** – plik zapisuje się (sprawdź rozmiar przy wielu biletach)
- ⬜ Przywrócenie kopii na **drugim telefonie / po wyczyszczeniu danych** – bilety (zdjęcia, PDF) otwierają się jak wcześniej
- ⬜ Kopia z hasłem: złe hasło = komunikat, dobre = dane wracają
- ⬜ Blokada PIN: po zamknięciu i otwarciu aplikacji pojawia się klawiatura PIN, nie widać przez chwilę danych
- ⬜ Blokada po powrocie z innej aplikacji (ustawienie „po 1 min” itd.) – na komputerze nie dało się tego przetestować
- ⬜ **Odcisk palca** (jeśli telefon pozwala) – włączenie w ustawieniach blokady i odblokowanie palcem
- ⬜ Blokada a powiadomienie: dotknięcie przypomnienia przy zablokowanej aplikacji pokazuje PIN, potem właściwy ekran

## Etap 8 – Bonusy
- ⬜ **Aktualizacja bazy**: po wgraniu nowej wersji na telefon z danymi z etapów 0–6 nic nie znika (baza przechodzi z wersji 1 na 2)
- ⬜ Dokumenty: dodanie paszportu ze zdjęciem z aparatu, kopiowanie numeru, ostrzeżenie o ważności przy podróży
- ⬜ Przypomnienie o wygasającym dokumencie przychodzi (np. ustaw dokument wygasający za 20 dni z przypomnieniem 30 dni)
- ⬜ Budżet: szybkie dodawanie wydatku w podróży (kwota z przecinkiem, waluta zapamiętana), pole waluty i kategorii mieszczą się na ekranie
- ⬜ „🏦 Pobierz kursy z NBP” działa na telefonie z internetem (w testach nie było dostępu do sieci)
- ⬜ Statystyki: „🔎 Uzupełnij położenie” na telefonie z internetem znajduje dworce i miasta (w testach wyszukiwarka była symulowana)
- ⬜ Mapa w statystykach czytelna na telefonie, kraje po polsku z flagami
- ⬜ Pogoda: na telefonie z internetem pojawia się prognoza przy podróży w ciągu 16 dni (w testach serwis był symulowany) i ikonki w planie dnia
- ⬜ **Z maila – na prawdziwych mailach** (LOT, Ryanair, Wizz Air, PKP Intercity, FlixBus, Booking.com, Airbnb…): które odczytuje dobrze, a które źle? Zapisz przewoźnika – poprawię wzorce (testowane na 5 przykładowych mailach)
- ⬜ Gmail → ⋮ → „Udostępnij” / zaznacz tekst → „Udostępnij” → Podróżnik (działa tylko w aplikacji dodanej do ekranu głównego)

## Etap 7 – APK na Androida
- ⬜ Pobranie `Podroznik.apk` (Ustawienia → „Aplikacja na Androida” albo https://chiniak.github.io/podroznik/Podroznik.apk) i instalacja (zgoda na instalację z nieznanych źródeł)
- ⬜ **Brak paska adresu** u góry aplikacji – jeśli jest, `assetlinks.json` nie został jeszcze odczytany (poczekaj kilka minut po scaleniu, odinstaluj i zainstaluj ponownie)
- ⬜ Powiadomienia: Android pyta o zgodę, przypomnienia przychodzą jako „Podróżnik”
- ⬜ Gmail → Udostępnij → **Podróżnik** na liście aplikacji
- ⬜ Dane: aplikacja z APK i strona w Chrome korzystają z tych samych danych (ta sama przeglądarka) – sprawdzić, czy podróże są w obu

## Etap 11 – Przed Azją (karty, rozmówki, mapa offline)
- ⬜ Plan → 🚕 Karty dla kierowcy → „Przygotuj karty” (internet): nocleg w Bangkoku / Luang Prabang / Hanoi / Chinach ma nazwę i adres w lokalnym piśmie
- ⬜ **Czy adres jest właściwy** – porównaj z Mapami Google (wyszukiwarka OSM bierze najbliższy obiekt; może podać sąsiedni budynek)
- ⬜ Karta otwiera się w trybie samolotowym, ekran nie gaśnie, litery czytelne z odległości
- ⬜ Strona noclegu → „🚕 Pokaż kierowcy” otwiera kartę od razu
- ⬜ Rozmówki: pismo tajskie / laotańskie / chińskie wyświetla się poprawnie (bez kwadracików) – **najlepiej poprosić miejscowego o sprawdzenie zwrotów**
- ⬜ Mapa → „⬇️ Mapa offline”: pobranie przez Wi-Fi (ile trwa, ile MB), potem tryb samolotowy → mapa planu widoczna przy zbliżeniu ulic
- ⬜ Mapa offline zostaje po zamknięciu aplikacji i po aktualizacji; „Usuń mapę offline” zwalnia miejsce

## Zdjęcia miejsc
- ⬜ Plan z internetem: przy znanych miejscach (atrakcje, świątynie, muzea) po chwili pojawiają się miniatury – **czy to właściwe miejsca?**
- ⬜ Miejsca bez artykułu (restauracje, hotele) – zdjęcie „okolica” z Wikimedia Commons: przydatne czy myli? (można je usunąć w punkcie)
- ⬜ Punkt → „🔎 Znajdź” / „📷 Własne” (aparat albo galeria) / „Usuń” – usunięte nie wraca samo
- ⬜ Zdjęcia widoczne w trybie samolotowym; plan nie zwalnia przy wielu punktach

## Tło ze zdjęć
- ⬜ Po otwarciu z internetem w tle pojawia się zdjęcie, a przy każdym przejściu na inny ekran zmienia się na inne
- ⬜ Tekst jest czytelny na jasnych i ciemnych zdjęciach (motyw jasny i ciemny) – czy mgiełka nie jest za mocna / za słaba?
- ⬜ Po aktualizacji zdjęcia w tle tylko natura i miasta (stare, w tym obraz religijny, znikają same) – jeśli trafi się coś nie tak: Ustawienia → Tło → „🚫 Nie pokazuj tego zdjęcia”
- ⬜ Ustawienia → Tło → „Bez zdjęć” wyłącza; licznik „pobrane N/100” rośnie; w trybie samolotowym tło nadal się zmienia
- ⬜ Aplikacja nie zwalnia przy przechodzeniu między ekranami

## Mapa i Odkrywaj (poprawki)
- ⬜ Odkrywaj → „📍 Tutaj”: ile trwa do pierwszych wyników (powinny być po kilku sekundach, potem dochodzą kolejne z „⏳ Uzupełniam…”)
- ⬜ Mapa: dotknięcie → czerwona pinezka „＋” i nazwa miejsca; „💡 Do pomysłów” / „📅 dzień” zapisuje od razu, mapa zostaje w tym samym miejscu
- ⬜ Mapa: 🏛️ pokazuje gwiazdki atrakcji; dotknięcie gwiazdki → zdjęcie, nazwa i dodanie; dodane robią się zielone; drugi raz 🏛️ chowa
- ⬜ Okienka na mapie czytelne w ciemnym motywie, łatwo trafić palcem

## Znane ograniczenia (nie błędy, ale do oceny)
- Godziny są „na zegarku” (czas lokalny z biletu) – czas lotu między strefami czasowymi może wyjść o godzinę za dużo / za mało
- Zdjęcie podróży (pkt 6 planu) – na razie tylko kolor
- Odczyt z maila jest „wzorcowy” (bez sztucznej inteligencji) – nietypowy układ maila może nie zostać rozpoznany; wtedy dodaj ręcznie
- Karty z Apple/Google Wallet (.pkpass) – jeszcze nie ma (pkt 16)
- Blokada PIN chroni przed podejrzeniem, ale dane w pamięci przeglądarki nie są szyfrowane (zaszyfrowana może być kopia zapasowa)
- Powiadomienia w tle: aplikacja internetowa nie może sama obudzić się o dokładnej godzinie – Chrome sprawdza „kilka razy na dobę”; pewny jest kalendarz (.ics) albo wersja APK


## Zdjęcia na mapie i kartach (12.11)
- [ ] Mapa dnia: dotknięcie pinezki punktu otwiera okienko ze zdjęciem, nazwą, dniem i godziną (zamiast od razu przechodzić do punktu)
- [ ] W okienku „Otwórz” prowadzi do punktu, „🧭 Nawiguj” otwiera nawigację
- [ ] Lista pod mapą ma miniatury zdjęć
- [ ] Karty i rozmówki: miniatura zamiast ikonki 📍; na karcie dla kierowcy zdjęcie nad adresem w lokalnym piśmie

## Przygotuj offline (13.11)
- [ ] Na ekranie podróży jest „📥 Przygotuj offline” (tylko dla podróży, które się nie skończyły)
- [ ] Dla podróży do Chin widać ostrzeżenie „Przed wjazdem do Chin”
- [ ] „Przygotuj wszystko” przez Wi-Fi: karty, zdjęcia, kursy, pogoda i mapa dostają ✅
- [ ] Po włączeniu trybu samolotowego: karta dla kierowcy, zdjęcia i mapa działają
- [ ] „Ochrona danych” – w APK powinna się włączyć; jeśli nie, napisz
- [ ] Budżet: „🏦 Pobierz kursy z NBP” działa

## Kopia poza telefonem (13.11)
- [ ] „Przygotuj offline” ma krok „💾 Kopia poza telefonem” i przycisk „Zrób kopię poza telefonem”
- [ ] Zapis kopii z hasłem na Dysk Google (menu Udostępnij) – potem krok ma ✅ „z hasłem”
- [ ] Po dodaniu biletu/noclegu krok znowu ⬜, a na ekranie kopii jest ostrzeżenie o zmianach
- [ ] 3 dni przed wyjazdem o 18:00 przychodzi przypomnienie o kopii (jeśli były zmiany); wyłącznik w Ustawienia → Przypomnienia
- [ ] Drugi telefon: wczytanie kopii przez „Wybierz plik kopii” → „Dołącz”

## Mapa i rozmówki (13.11)
- [ ] Mapa: dotknięcie pinezki – okienko; drugie dotknięcie tej samej pinezki – od razu punkt
- [ ] W okienku nazwa (ze strzałką ›) i zdjęcie też otwierają punkt
- [ ] Rozmówki w grupach: Podstawy, Taksówka, Jedzenie i picie, Zakupy, Pomoc i zdrowie
- [ ] Nowe zwroty po tajsku/laotańsku/wietnamsku/chińsku – jeśli ktoś miejscowy poprawi, zapisz poprawkę

## Tło – naprawa (13.11)
- [ ] Po scaleniu PR: zamknij i otwórz aplikację, przełącz kilka zakładek – tło ze zdjęć (natura, miasta)
- [ ] Ustawienia → Tło: „pobrane” rośnie; jeśli dalej 0/100, przepisz komunikat pod spodem (przyczyna)

## Bilety w planie (13.11)
- [ ] Plan → „📎 Z biletu lub screena” → wybierz screen biletu albo PDF → otwiera się nowy punkt z plikiem
- [ ] Przy PDF z datą: dzień i godzina wpisują się same (komunikat „Z biletu: …”) – sprawdź, czy dobrze
- [ ] Po zapisaniu przy punkcie jest 🎫 – dotknięcie pokazuje bilet na pełnym ekranie; kod QR ze screena rysuje się ostro
- [ ] Bilet jest też w zakładce Bilety
- [ ] W istniejącym punkcie: „📎 Dodaj zdjęcie, screen lub PDF”

## Odczyt z maili i plików (13.11)
- [ ] Wczytaj plik podróży przysłany w czacie (Podróże → 📥 Otwórz podróż od kogoś) – sprawdź godziny
- [ ] Gmail → mail z rezerwacją → zaznacz tekst → Udostępnij → Podróżnik (albo skopiuj i wklej w „Z maila”)
- [ ] „📎 Z pliku”: PDF biletu pobrany z Gmaila – odcinek + PDF dołączony jako bilet
- [ ] Jeśli coś odczyta źle – prześlij treść maila (dane możesz zamazać)

## Odczyt biletów ze zdjęć (13.11)
- [ ] Plan → „📎 Z biletu lub screena” → screen biletu: pod plikiem „🔎 Czytam tekst ze zdjęcia… %”, potem same wpisują się nazwa, dzień, godzina, miejsce, cena (komunikat „Z biletu: … – sprawdź”)
- [ ] Za pierwszym razem pobiera ok. 6 MB (najlepiej Wi-Fi) – potem działa bez internetu
- [ ] Wpisana wcześniej nazwa zostaje (uzupełniane są tylko puste pola)
- [ ] „📥 Przygotuj offline” ma krok „🔎 Odczyt biletów ze zdjęć” – po pobraniu ✅
- [ ] Jeśli coś wpisze źle – prześlij screen (dane możesz zamazać)
- [ ] Screen w trybie ciemnym (np. karta pociągu z Gmaila/Google) – odczytuje „A → B”, dzień, godzinę odjazdu
- [ ] Screen wrzucony przez „📷 Własne” w nowym punkcie – też czyta tekst; bilet przenosi się do „🎫 Bilety i zdjęcia”

## Rzadsza zmiana tła (13.11)
- [ ] Po scaleniu: przełączanie zakładek nie zmienia tła; nowe zdjęcie po ponownym uruchomieniu aplikacji
- [ ] Ustawienia → Tło → „Nowe zdjęcie”: przy uruchomieniu / co 10 minut / raz dziennie / przy każdej zmianie ekranu
