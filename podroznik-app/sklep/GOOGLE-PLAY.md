# Tripwillow w Google Play – instrukcja krok po kroku

Pakiet: `io.github.chiniak.podroznik` · wersja 2.17.0 (versionCode 26) · plik **`Tripwillow-2.17.0.aab`** (dostajesz go od Claude'a).
Teksty do sklepu w 7 językach: **`OPISY.md`** (obok). Grafiki: paczka **`Tripwillow-sklep-grafiki.zip`** od Claude'a (ikona, grafika promocyjna i 8 zrzutów ekranu w każdym z 7 języków – nie trzymamy ich w repozytorium, bo są duże; skrypt do odtworzenia: `zrzuty-sklep.js`).

---

## 1. Konto dewelopera (raz)
1. Wejdź na **play.google.com/console** i zaloguj się kontem Google, które ma być właścicielem aplikacji.
2. Rodzaj konta: **Osobiste** („Dla siebie”).
3. Opłata **25 USD** (jednorazowo) i weryfikacja tożsamości (dowód osobisty, adres). Weryfikacja trwa od kilku godzin do kilku dni.
4. Adres e-mail kontaktowy dla użytkowników (widoczny w sklepie) – najlepiej osobny adres, np. `tripwillow…@gmail.com`.

## 2. Utworzenie aplikacji
**Wszystkie aplikacje → Utwórz aplikację**
- Nazwa: `Tripwillow – planer podróży`
- Język domyślny: **polski (pl-PL)**
- Aplikacja / gra: **Aplikacja** · Bezpłatna / płatna: **Bezpłatna**
- Zaznacz oświadczenia (zasady dla deweloperów, przepisy eksportowe USA).

## 3. Podpisywanie (WAŻNE – zachowujemy Twój obecny klucz)
Dzięki temu osoby, które już mają Tripwillow z pliku APK, dostaną aktualizację ze sklepu **bez odinstalowania i utraty danych**,
a logowanie Google i otwieranie linków działa bez zmian.

1. **Testowanie → Testy zamknięte → Utwórz ścieżkę** (albo przy pierwszym wydaniu) → sekcja **Podpisywanie aplikacji przez Google Play**.
2. Wybierz **„Użyj innego klucza podpisywania aplikacji”** → **„Eksportuj i prześlij klucz z magazynu kluczy Java”**.
3. Pobierz z tej strony **`pepk.jar`** i **klucz szyfrowania** (`encryption_public_key.pem`) i **wyślij oba pliki Claude'owi**.
4. Claude przygotuje zaszyfrowany plik **`private_key.pepk`** – prześlesz go w tym samym miejscu.
   (Jeśli wolisz, Google może wygenerować nowy klucz – wtedy obecne instalacje z APK trzeba odinstalować, a Claude doda nowe odciski do Google Cloud i `assetlinks.json`.)

## 4. Test zamknięty (wymagany dla nowych kont osobistych)
Google wymaga: **co najmniej 12 testerów, którzy są zapisani do testu przez 14 dni z rzędu**, zanim pozwoli opublikować aplikację dla wszystkich.

1. **Testowanie → Testy zamknięte → Zarządzaj ścieżką → Testerzy** → utwórz listę e-mail (adresy kont Google testerów, min. 12 – lepiej 14–15 na zapas).
2. **Utwórz wersję** → prześlij `Tripwillow-2.17.0.aab` → informacje o wersji z `OPISY.md` → **Zapisz → Sprawdź wersję → Rozpocznij wdrażanie**.
3. Kraje: **wszystkie**.
4. Skopiuj **link dla testerów** („Dołącz w Androidzie” / „Dołącz w internecie”) i wyślij testerom. Każdy musi: otworzyć link → **„Zostań testerem”** → zainstalować z Google Play.
5. Testerzy nie mogą się wypisać przez te 14 dni. Dobrze, żeby kilka razy otworzyli aplikację – Google o to pyta przy wniosku.
6. Po 14 dniach: **Panel → Wnioski o dostęp do wersji produkcyjnej** – odpowiedzi do formularza są w punkcie 9.

## 5. Strona aplikacji w Sklepie Play
**Rozwój → Strona aplikacji w Sklepie Play → Główna strona**
- Nazwa, krótki opis, pełny opis – z `OPISY.md` (polski). Tłumaczenia: **Zarządzaj tłumaczeniami → Dodaj własne tłumaczenia** → en-US, de-DE, es-ES, it-IT, pt-BR, zh-CN – teksty z `OPISY.md`.
- Ikona aplikacji (512×512): `ikona-512.png`
- Grafika (1024×500): `grafika-1024x500-pl.jpg` (w tłumaczeniach – plik z kodem danego języka: `-en`, `-de`, `-es`, `-it`, `-pt`, `-zh`)
- Zrzuty ekranu telefonu (8 sztuk): katalog `zrzuty-pl/` dla polskiego, w tłumaczeniach `zrzuty-en/`, `zrzuty-de/`, `zrzuty-es/`, `zrzuty-it/`, `zrzuty-pt/`, `zrzuty-zh/`.
- Kategoria: **Podróże i informacje lokalne** · Tagi: Planowanie podróży, Podróże.
- Kontakt: e-mail (z punktu 1), strona: `https://chiniak.github.io/podroznik/aplikacja.html`

## 6. Zawartość aplikacji (Zasady → Zawartość aplikacji)
| Pozycja | Odpowiedź |
|---|---|
| Polityka prywatności | `https://chiniak.github.io/podroznik/prywatnosc.html` |
| Reklamy | **Nie**, aplikacja nie zawiera reklam |
| Dostęp do aplikacji | **Wszystkie funkcje są dostępne bez specjalnego dostępu** – instrukcja dla recenzentów niżej (wklej w „Dodaj instrukcje”, jeśli formularz o nie poprosi) |
| Ocena treści | kwestionariusz IARC – odpowiedzi niżej |
| Grupa docelowa | **18 lat i więcej** (nie dla dzieci – unikamy dodatkowych zasad „Rodzina”) |
| Aplikacja informacyjna | **Nie** |
| Aplikacje rządowe | **Nie** |
| Funkcje finansowe | **Brak** (budżet i przelicznik to tylko notatki, bez płatności) |
| Zdrowie | **Nie** (szczepienia to tylko notatka o dokumencie) |
| Usuwanie konta | URL: `https://chiniak.github.io/podroznik/usun-konto.html` – w aplikacji: Ustawienia → Twoje konto → „Usuń konto i dane z serwera” |
| Bezpieczeństwo danych | odpowiedzi w punkcie 7 |

**Instrukcja dla recenzentów** (Dostęp do aplikacji):
```
No login is required. All planning features work offline without an account.
Optional features: "Friends" and "Together" use an anonymous Firebase account created automatically;
"Your account" (Settings) lets the user sign in with Google to keep friends on a new phone, and to delete the account.
Gmail import (Settings → Google account (Gmail)) is optional and read-only; while Google's OAuth verification is in progress,
it works only for listed test users – all other features are fully usable without it.
```

**Ocena treści (IARC):** kategoria **Wszystkie inne typy aplikacji** → przemoc, seks, wulgaryzmy, narkotyki, hazard: **Nie** wszędzie.
- „Czy użytkownicy mogą się ze sobą komunikować lub wymieniać treściami?” → **Tak** (czat ze znajomymi, udostępnianie podróży).
- „Czy aplikacja udostępnia innym użytkownikom bieżącą lokalizację użytkownika?” → **Nie**.
- „Czy aplikacja umożliwia zakupy produktów cyfrowych?” → **Nie**.

## 7. Bezpieczeństwo danych (Data safety)
**Ogólne:**
- Czy aplikacja zbiera lub udostępnia dane użytkowników? → **Tak**
- Czy wszystkie dane są szyfrowane podczas przesyłania? → **Tak**
- Czy użytkownicy mogą poprosić o usunięcie danych? → **Tak** (URL z punktu 6)
- Konto: **„Aplikacja umożliwia tworzenie konta”** → sposoby: **Logowanie przez Google / Facebook** i **inne (anonimowe)**; usuwanie konta – URL jak wyżej.

**Rodzaje danych** – zaznacz tylko te (wszystkie: *zbierane*, **nie** udostępniane, **opcjonalne**, cel: **Funkcje aplikacji** + **Zarządzanie kontem** tam, gdzie dotyczy):
| Kategoria → typ | Dlaczego |
|---|---|
| Dane osobowe → **Imię i nazwisko** | imię w profilu znajomych (wpisuje użytkownik) |
| Dane osobowe → **Adres e-mail** | logowanie Google/Facebook, szukanie znajomych po e-mailu |
| Dane osobowe → **Identyfikatory użytkownika** | identyfikator konta Firebase |
| Wiadomości → **Inne wiadomości w aplikacji** | czat ze znajomymi (szyfrowany end-to-end) |
| Aktywność w aplikacji → **Inne treści użytkownika** | udostępnione podróże i wspólne planowanie (szyfrowane end-to-end) |
| Lokalizacja → **Przybliżona** i **Dokładna** | „W pobliżu”, pogoda, mapa – współrzędne idą do Wikipedii/OpenStreetMap/pogody tylko na chwilę (zaznacz **„przetwarzane tymczasowo”**), nie zapisujemy ich |

**Nie zaznaczaj**: e-maile (Gmail jest czytany tylko na telefonie i nic nie wychodzi), zdjęcia, pliki, kontakty, finanse, zdrowie, dane o aplikacji i wydajności (brak analityki i raportów awarii), identyfikatory urządzenia.

## 8. Uprawnienia, o które Google może zapytać
| Uprawnienie | Do czego |
|---|---|
| Aparat | skanowanie kodów i zdjęć biletów |
| Lokalizacja | „W pobliżu”, mapa i nawigacja – tylko gdy aplikacja jest otwarta |
| Powiadomienia, alarmy, start po uruchomieniu telefonu | przypomnienia (odprawa, wyjazd, ważność dokumentów) |
Lokalizacji **w tle** aplikacja nie używa – nie trzeba wypełniać deklaracji.

## 9. Wniosek o wersję produkcyjną (po 14 dniach testu)
Gotowe odpowiedzi (Google pyta po angielsku – można odpowiadać po angielsku):
- *How did you recruit testers?* – `Friends, family and fellow travellers who plan real trips.`
- *How easy was it to recruit?* – według prawdy.
- *Describe how testers used the app* – `Planning real trips: adding tickets, day plans, packing lists, budgets; testing offline mode, reminders and sharing trips with friends.`
- *Feedback and changes* – Claude przygotuje listę poprawek z okresu testu.
- *Who is the app for?* – `Travellers who want all tickets, plans and documents on the phone, offline, without ads.`
- *How is it different?* – `Works fully offline, keeps data on the device, end-to-end encrypted sharing, 7 languages, no ads or tracking.`
- *Expected installs in the first year* – np. `1,000–10,000`.
Po akceptacji: **Produkcja → Utwórz wersję** (ten sam AAB albo nowszy) → kraje: **wszystkie** → wdrażanie.

## 10. Co ważne później
- Każda nowa wersja: wyższy `versionCode` (Claude podbija sam) i nowy plik AAB do Play Console.
- **Chiny**: Google Play tam nie działa; Firebase (Znajomi, Razem) też nie.
- Gmail dla wszystkich – dopiero po zakończeniu weryfikacji Google (`podroznik/GOOGLE-WERYFIKACJA.md`).
- Po publikacji można dodać na stronie link „Pobierz z Google Play” zamiast pliku APK.
