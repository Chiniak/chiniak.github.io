# Podróżnik – plan aplikacji

Aplikacja (PWA → później APK) do zapamiętywania wszystkich podróży: loty, pociągi, autobusy
i każdy inny transport, bilety do szybkiego pokazania, plan dnia i całej podróży, lista
pakowania i przygotowań, licznik do następnej podróży z przypomnieniami.

- Adres: `https://chiniak.github.io/podroznik/`
- Dane trzymane lokalnie w telefonie (IndexedDB), działa offline.
- Docelowo Android (APK przez TWA, jak KWS).

Legenda: ✅ zrobione · 🔄 w trakcie · ⬜ do zrobienia

---

## Etap 0 – Fundament ✅
1. ✅ Struktura projektu: `index.html`, `app.js`, `db.js`, `style.css`, `manifest.webmanifest`, `sw.js`, ikony.
2. ✅ Działanie offline (service worker) – bilety muszą się otwierać bez internetu.
3. ✅ Baza danych w telefonie (IndexedDB) – miejsce także na PDF-y i zdjęcia biletów.
4. ✅ Dolne menu: **Podróże · Bilety · Plan · Pakowanie · Ustawienia**.
5. ✅ Ciemny / jasny motyw (lub automatyczny), układ pod telefon.

## Etap 1 – Podróże i odcinki transportu ✅
6. ✅ Tworzenie **podróży**: nazwa, cel, daty od–do, zdjęcie/kolor.
7. ✅ Dodawanie **odcinków**: ✈️ lot, 🚆 pociąg, 🚌 autobus, ⛴️ prom, 🚗 auto/wynajem, 🚕 taxi/Uber, 🚇 metro, inne.
8. ✅ Pola odcinka: skąd, dokąd, data i godzina odjazdu/przyjazdu, przewoźnik, nr lotu/pociągu, miejsce/wagon/gate/peron, nr rezerwacji, cena, notatka.
9. ✅ Noclegi jako osobny typ (hotel, adres, check-in/out).
10. ✅ Oś czasu podróży – odcinki w kolejności.
11. ✅ Lista podróży: **nadchodzące / trwające / archiwum**.

## Etap 2 – Bilety do szybkiego pokazania ✅ (bez pkt 16)
12. ✅ Podpinanie do odcinka **zdjęcia, PDF lub zrzutu ekranu** biletu.
13. ✅ Widok „pokaż bilet” – pełny ekran, białe tło, blokada wygaszania. (Jasności strona WWW nie zmienia – do sprawdzenia w APK.)
14. ✅ **Skaner kodu QR / kreskowego** – zapis kodu i wyświetlanie go ostro i czytelnie.
15. ✅ Na ekranie głównym przycisk **„Najbliższy bilet”** – jedno kliknięcie.
16. ⬜ (później) Import kart pokładowych Apple/Google Wallet (.pkpass).

## Etap 3 – Plan dnia i plan podróży ⬜
17. ⬜ Plan dzień po dniu – odcinki transportu wskakują same.
18. ⬜ Własne punkty: godzina, nazwa, miejsce, link do mapy, notatka, koszt.
19. ⬜ Przeciąganie, by zmienić kolejność.
20. ⬜ Przycisk **„Nawiguj”** – otwiera Google Maps z adresem.
21. ⬜ Widok „Dziś”: co teraz, co dalej, ile czasu do następnego punktu.

## Etap 4 – Pakowanie i przygotowanie ⬜
22. ⬜ Lista rzeczy do zabrania z kategoriami (dokumenty, ubrania, elektronika, kosmetyki, leki…).
23. ⬜ Statusy: **do kupienia → do spakowania → spakowane ✅**.
24. ⬜ Osobna lista **„Do zrobienia przed wyjazdem”** (odprawa online, ubezpieczenie, waluta, klucze, ładowarki…).
25. ⬜ **Szablony list** („Weekend”, „Lot z bagażem podręcznym”, „Służbowo”, „Zima”) – kopiowane jednym kliknięciem.
26. ⬜ Pasek postępu („Spakowane 18/25”).

## Etap 5 – Licznik i przypomnienia ⬜
27. ⬜ Duży **licznik do następnej podróży** na ekranie głównym (dni / godz / min).
28. ⬜ Licznik do najbliższego odjazdu w trakcie podróży.
29. ⬜ **Powiadomienia**: dzień przed, 3 h przed, „czas wyjść”, „otwórz odprawę online” (24 h przed lotem), „nie spakowano jeszcze X rzeczy”.
30. ⬜ Ustawienia przypomnień dla każdego typu transportu.

> Uwaga: w PWA powiadomienia przy zamkniętej aplikacji nie zawsze przychodzą punktualnie –
> pewniejsze będą w APK (etap 7). Dodatkowo eksport do kalendarza (.ics) jako zabezpieczenie.

## Etap 6 – Bezpieczeństwo danych ⬜
31. ⬜ **Eksport / import kopii zapasowej** (plik JSON + załączniki).
32. ⬜ Eksport podróży do kalendarza (.ics).
33. ⬜ (opcjonalnie) Blokada PIN / odcisk palca dla biletów i dokumentów.

## Etap 7 – Publikacja ⬜
34. ⬜ Hosting na `chiniak.github.io/podroznik/`.
35. ⬜ Spakowanie do **APK** (TWA, jak KWS) i instalacja na telefonie.

## Etap 8 – Bonusy na później ⬜
36. ⬜ Statystyki: km, liczba lotów, kraje, mapa odwiedzonych miejsc.
37. ⬜ Budżet podróży i wydatki.
38. ⬜ Dokumenty: paszport (ważność + przypomnienie), ubezpieczenie, wiza.
39. ⬜ Wklejenie maila z potwierdzeniem → automatyczne odczytanie danych biletu.
40. ⬜ Pogoda w miejscu docelowym w dniach podróży.

---

## Jak to jest zbudowane (dla kolejnych etapów)

| Plik | Rola |
|---|---|
| `index.html` | Szkielet: nagłówek, miejsce na widok, dolne menu |
| `style.css` | Wygląd, kolory jako zmienne, motyw jasny/ciemny |
| `db.js` | Baza IndexedDB – wszystkie magazyny danych (`DB.put/get/all/byIndex/del`) |
| `app.js` | Rdzeń: router (`App.route`), górny pasek, pomocniki dat, zakładki etapów 2–4, ustawienia |
| `trips.js` | Etap 1: lista podróży, formularze podróży i odcinków, oś czasu |
| `tickets.js` | Etap 2: szczegóły odcinka, bilety, pełny ekran, skaner kodów |
| `lib/` | pdf.js, bwip-js (rysowanie kodów), ZXing (odczyt kodów) – dołączone, działają offline |
| `sw.js` | Offline – przy każdej zmianie plików aplikacji podbić `CACHE` (`podroznik-vN`) |
| `manifest.webmanifest` | Instalacja na ekranie głównym |

Magazyny w bazie (przygotowane od razu, by kolejne etapy nie wymagały migracji):
`trips`, `segments` (transport + noclegi), `files` (bilety: zdjęcia/PDF/kody), `planItems`,
`packItems`, `templates`, `reminders`, `settings`.
