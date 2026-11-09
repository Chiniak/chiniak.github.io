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

## Znane ograniczenia (nie błędy, ale do oceny)
- Godziny są „na zegarku” (czas lokalny z biletu) – czas lotu między strefami czasowymi może wyjść o godzinę za dużo / za mało
- Zdjęcie podróży (pkt 6 planu) – na razie tylko kolor
- Karty z Apple/Google Wallet (.pkpass) – jeszcze nie ma (pkt 16)
- Blokada PIN chroni przed podejrzeniem, ale dane w pamięci przeglądarki nie są szyfrowane (zaszyfrowana może być kopia zapasowa)
- Powiadomienia w tle: aplikacja internetowa nie może sama obudzić się o dokładnej godzinie – Chrome sprawdza „kilka razy na dobę”; pewny jest kalendarz (.ics) albo wersja APK
