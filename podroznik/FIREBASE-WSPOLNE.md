# Wspólne planowanie (Razem) – założenie projektu Firebase

Cel: włączyć w Podróżniku wspólne planowanie na żywo (czat, pomysły z głosowaniem, zmiany widoczne od razu u wszystkich).
Kod jest gotowy, ale potrzebuje Twojego projektu w Google Firebase. Darmowy plan (Spark) wystarczy z dużym zapasem
i **nie wymaga karty płatniczej**.

Czas: ok. 10 minut, najlepiej na komputerze. Na końcu przysyłasz Claude'owi jeden blok tekstu (`firebaseConfig`).

> Polecam **osobny projekt** (nie „Podróżnik” z Google Cloud, w którym trwa weryfikacja Gmaila), żeby nie mieszać
> ustawień i nie utrudnić weryfikacji.

---

## Krok 1. Nowy projekt

1. Wejdź na https://console.firebase.google.com i zaloguj się na swoje konto Google.
2. **Utwórz projekt** (albo „Rozpocznij od projektu Firebase”).
3. Nazwa: `podroznik-razem` → Dalej.
4. Gemini i Google Analytics: **wyłącz** (niepotrzebne) → **Utwórz projekt** → Dalej.

## Krok 2. Logowanie anonimowe

Każdy telefon dostaje losowy, anonimowy identyfikator – bez e-maila i hasła. Reguły bazy go wymagają.

1. Menu po lewej: **Kompilacja (Build) → Authentication** → **Rozpocznij**.
2. Karta **Metoda logowania (Sign-in method)** → **Anonimowo (Anonymous)** → przełącznik **Włącz** → **Zapisz**.

## Krok 3. Baza danych Firestore

1. Menu: **Kompilacja → Firestore Database** → **Utwórz bazę danych**.
2. Wersja: **Standard**.
3. Lokalizacja: **`eur3 (Europe)`** – ważne: w polityce prywatności piszemy, że dane są w UE. Lokalizacji nie da się później zmienić.
4. Tryb: **produkcyjny (production mode)** → **Utwórz**.

## Krok 4. Reguły bezpieczeństwa

1. Firestore Database → karta **Reguły (Rules)**.
2. Usuń wszystko, co tam jest, i wklej:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{room}/ops/{op} {
      allow list, get: if request.auth != null;
      allow create: if request.auth != null
        && room.size() >= 16 && room.size() <= 32
        && request.resource.data.keys().hasOnly(['by', 't', 'c', 'v'])
        && request.resource.data.by == request.auth.uid
        && request.resource.data.t == request.time
        && request.resource.data.c is string
        && request.resource.data.c.size() < 200000
        && request.resource.data.v == 1;
      allow update, delete: if false;
    }
  }
}
```

3. **Opublikuj (Publish)**.

Co robią: zapisywać mogą tylko zalogowane (anonimowo) telefony, tylko zaszyfrowane wpisy i tylko dopisywać –
nikt nie zmieni ani nie usunie cudzych wpisów i nie wylistuje cudzych podróży.
(Ten sam plik jest w repozytorium: `podroznik-app/firebase/firestore.rules`.)

## Krok 5. Konfiguracja dla aplikacji – przyślij ją Claude'owi

1. Koło zębate obok „Przegląd projektu” → **Ustawienia projektu** → karta **Ogólne**.
2. Na dole „Twoje aplikacje” → ikona **`</>`** (Sieć / Web).
3. Pseudonim: `Podróżnik` → **bez** zaznaczania Firebase Hosting → **Zarejestruj aplikację**.
4. Pojawi się kod z blokiem `const firebaseConfig = { apiKey: "…", authDomain: "…", projectId: "…", … };`
5. **Skopiuj cały blok `firebaseConfig` i wklej go Claude'owi w czacie.**
   To nie są hasła (identyfikują projekt, każda aplikacja Firebase ma je jawnie) – dane chronią reguły z kroku 4 i szyfrowanie.

Claude wpisze to do `sync-config.js`, zbuduje nowe APK i sprawdzi na Twoim projekcie, że działa.

---

## Krok 6 (nieobowiązkowy). Ograniczenie klucza API

Google Cloud Console (https://console.cloud.google.com) → u góry wybierz projekt `podroznik-razem` →
**Interfejsy API i usługi → Dane logowania** → klucz „Browser key (auto created by Firebase)” →
**Ograniczenia interfejsów API → Ogranicz klucz** → zaznacz tylko: **Identity Toolkit API**, **Token Service API**,
**Cloud Firestore API** → Zapisz.

## Limity darmowego planu

Dziennie: 20 000 zapisów, 50 000 odczytów, 1 GB miejsca. Jedna zmiana w podróży to jeden zapis,
więc nawet kilka grup podróżujących codziennie mieści się z dużym zapasem. Po przekroczeniu limitu synchronizacja
staje do północy czasu pacyficznego (nic nie jest płatne bez Twojej zgody).

## Jak to działa (dla ciekawych)

- Zapraszający dostaje link `https://chiniak.github.io/podroznik/dolacz.html#POKÓJ.KLUCZ`. Klucz (AES-256) jest
  tylko w linku, po znaku `#` – przeglądarka nie wysyła tej części do żadnego serwera.
- Każda zmiana (lot, punkt planu, rzecz do spakowania, wydatek, wiadomość, głos) jest szyfrowana w telefonie
  i dopisywana do „pokoju” w Firestore. Pozostałe telefony ją odbierają i odszyfrowują – wygrywa nowsza wersja.
- Offline: zmiany czekają w telefonie i wysyłają się po powrocie internetu.
- Nie są wysyłane: bilety i ich pliki, zdjęcia, dziennik, dokumenty, przypomnienia, dane z Gmaila.
- W aplikacji na Androida link zaproszenia otwiera od razu Podróżnika (App Links, ten sam klucz co `assetlinks.json`).
