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

## Znane ograniczenia (nie błędy, ale do oceny)
- Godziny są „na zegarku” (czas lokalny z biletu) – czas lotu między strefami czasowymi może wyjść o godzinę za dużo / za mało
- Zdjęcie podróży (pkt 6 planu) – na razie tylko kolor
- Karty z Apple/Google Wallet (.pkpass) – jeszcze nie ma (pkt 16)
