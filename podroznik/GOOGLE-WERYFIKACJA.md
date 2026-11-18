# Weryfikacja Google dla Gmaila (droga C) – instrukcja krok po kroku

Cel: żeby **każdy** użytkownik Tripwillow mógł połączyć Gmaila, bez limitu 100 osób i bez ostrzeżenia
„Google nie zweryfikował tej aplikacji”. Uprawnienie `gmail.readonly` jest u Google **zastrzeżone** (restricted),
więc trzeba przejść weryfikację aplikacji i – jeśli Google tego zażąda – ocenę bezpieczeństwa (CASA).

Wszystko poniżej robisz w przeglądarce, zalogowany na konto Google, na którym jest projekt „Tripwillow” w Google Cloud.
Gotowe teksty do wklejenia są po angielsku, bo Google weryfikuje po angielsku.

---

## Co już jest gotowe (zrobił Claude)

| Wymaganie Google | Gdzie |
|---|---|
| Strona główna aplikacji | https://chiniak.github.io/podroznik/aplikacja.html |
| Polityka prywatności (PL + EN, z klauzulą Limited Use) | https://chiniak.github.io/podroznik/prywatnosc.html |
| Link do polityki w aplikacji | Ustawienia → Aplikacja → Polityka prywatności; ekran „Z Gmaila” |
| Logo 120×120 | `podroznik/strona/logo-120.png` (w repozytorium) |
| Uprawnienie tylko do odczytu, dane tylko na telefonie | `gmail.js` – jeden zakres `gmail.readonly`, brak serwera |

Strony zaczną działać pod tymi adresami, gdy zmiany trafią do gałęzi `main` (po scaleniu PR).

---

## Krok 1. Potwierdź, że domena jest Twoja (Google Search Console) – ok. 5 min

1. Wejdź na https://search.google.com/search-console → **Dodaj usługę** → wybierz **Prefiks URL** → wpisz
   `https://chiniak.github.io/` → Dalej.
2. Wybierz metodę **Plik HTML** → pobierz plik (nazwa w stylu `google1234abcd.html`).
3. **Wyślij ten plik Claude'owi w czacie** – wrzuci go do głównego katalogu strony.
4. Gdy Claude potwierdzi, że plik jest online, kliknij w Search Console **Zweryfikuj**.

> Domena musi być zweryfikowana na **tym samym koncie Google**, które jest właścicielem projektu w Google Cloud.

## Krok 2. Klient Android dla wersji docelowej – ok. 3 min

Google Cloud → **Google Auth Platform** → **Klienci** → **Utwórz klienta** → typ **Android**:
- Nazwa: `Tripwillow (docelowa)`
- Nazwa pakietu: `io.github.chiniak.podroznik`
- Odcisk SHA-1: `84:1E:4A:09:AC:AE:33:56:B7:29:E2:C5:FD:2D:FE:17:7F:65:28:CC`

(Gdy aplikacja trafi do Google Play, dojdzie trzeci klient z odciskiem klucza Google Play – Claude go poda.)

## Krok 3. Branding (ekran zgody) – ok. 5 min

Google Auth Platform → **Branding**:

| Pole | Wpisz |
|---|---|
| App name | `Tripwillow` |
| User support email | Twój adres Gmail |
| App logo | `logo-120.png` (Claude wyśle albo pobierz z repozytorium) |
| Application home page | `https://chiniak.github.io/podroznik/aplikacja.html` |
| Application privacy policy link | `https://chiniak.github.io/podroznik/prywatnosc.html` |
| Application terms of service link | zostaw puste (nieobowiązkowe) |
| Authorized domains | `chiniak.github.io` |
| Developer contact information | Twój adres Gmail |

Zapisz.

## Krok 4. Zakres danych (Data Access) – ok. 5 min

Google Auth Platform → **Data Access** → **Add or remove scopes** → zaznacz
`https://www.googleapis.com/auth/gmail.readonly` → Update → Save.

W polu uzasadnienia (**How will the scopes be used?**) wklej:

```
Tripwillow is a travel planner for Android. The optional "From Gmail" feature uses the read-only
gmail.readonly scope to find booking confirmations the user already received (flights, trains,
buses, hotels, tours, restaurant and event bookings) and suggest adding them to the user's trips.

The app searches only for messages from known booking senders or with booking-related words in
the subject, from the last ~400 days. It reads the message body and PDF/.ics attachments to extract
dates, places, times and booking references. All processing happens on the user's device: the app
has no backend server and Gmail data is never transmitted to us or any third party. Nothing is sent,
deleted, labelled or modified in the mailbox. The user reviews every suggestion and decides what to
add. Only the items the user adds and a list of already-checked message IDs (with subject, sender
and date, so they are not suggested twice) are stored locally on the device; the user can disconnect
at any time in the app, which revokes the token and deletes that list.

A narrower scope is not sufficient: gmail.metadata does not give access to the message body or
attachments, where the booking details (dates, times, booking reference, e-ticket PDF) are located,
and gmail.send/modify are not needed. Using the Gmail API search (q=) with read-only access is the
minimum required to read only booking confirmation emails.
```

## Krok 5. Film demonstracyjny – ok. 15 min (nagrywasz Ty, na telefonie)

Google wymaga filmu na YouTube (może być **niepubliczny** – „Unlisted”), pokazującego:

1. **Uruchomienie aplikacji** Tripwillow 2.11.1 (docelowej, nie „test”).
2. Wejście w **Ustawienia → Konto Google (Gmail)** i kliknięcie **„Zaloguj się kontem Google”**.
3. **Cały ekran zgody Google** – tak, żeby było widać nazwę aplikacji „Tripwillow” i uprawnienie
   „Wyświetlanie e-maili…”. **Telefon w języku angielskim** (Ustawienia Androida → Język → English)
   – Google prosi, by ekran zgody był po angielsku.
4. Po zgodzie: aplikacja szuka maili i pokazuje **propozycje** (np. lot, hotel) → dodanie jednej
   propozycji do podróży → pokazanie jej w planie podróży.
5. Na koniec: **„Disconnect” (Odłącz konto)** – że można cofnąć dostęp.

Nagrywanie ekranu: rozwiń górny pasek Androida → „Nagrywanie ekranu”. Film wrzuć na YouTube jako
„Niepubliczny” i skopiuj link.

> Uwaga na prywatność: w filmie widać Twoje maile. Najlepiej nagrać na koncie z kilkoma testowymi
> potwierdzeniami rezerwacji (Claude może przygotować przykładowe maile do wysłania sobie).

## Krok 6. Wyślij do weryfikacji – ok. 5 min

1. Google Auth Platform → **Audience** → **Publishing status** → **Publish app** (z „Testing” na
   „In production”).
2. Google Auth Platform → **Verification Center** → **Prepare for verification** / **Submit**.
3. Wklej link do filmu z kroku 5 i potwierdź dane z kroków 3–4.

Potem Google pisze maile na adres kontaktowy – **odpowiadaj w ciągu kilku dni** (Claude pomoże
z odpowiedziami). Weryfikacja trwa zwykle od kilku dni do kilku tygodni.

## Krok 7. Ocena bezpieczeństwa (CASA) – jeśli Google jej zażąda

Dla zakresów zastrzeżonych Google zwykle wymaga corocznej oceny bezpieczeństwa (CASA,
Cloud Application Security Assessment) wykonywanej przez niezależną firmę z listy
https://appdefensealliance.dev/casa. Google w mailu napisze, czy jest potrzebna i na jakim poziomie (tier).

- Tripwillow **nie ma serwera** i przetwarza maile tylko na telefonie – w zgłoszeniu warto to podkreślić;
  to Google decyduje, czy i jaki audyt jest potrzebny.
- Koszt zależy od firmy i poziomu – zwykle od kilkuset dolarów rocznie w górę. Ocenę powtarza się co
  12 miesięcy.
- Przy audycie Claude przygotuje odpowiedzi na kwestionariusz i poprawi to, co audytor wskaże.

---

## Co możesz zlecić Claude'owi

- wgranie pliku weryfikacyjnego z kroku 1 (wyślij plik w czacie),
- przykładowe maile z rezerwacjami do nagrania filmu,
- odpowiedzi na maile od zespołu weryfikacji Google,
- pomoc przy kwestionariuszu CASA.

## Do zapamiętania

- Do czasu zakończenia weryfikacji Gmail działa jak dotąd: dla Ciebie i do 100 użytkowników
  testowych (z ostrzeżeniem przy logowaniu).
- Każda zmiana zakresów albo sposobu użycia danych z Gmaila może wymagać ponownej weryfikacji –
  przed taką zmianą zaktualizuj politykę prywatności.
