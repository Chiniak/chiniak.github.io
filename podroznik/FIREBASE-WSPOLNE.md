# Wspólne planowanie (Razem) – założenie projektu Firebase

Cel: włączyć w Podróżniku wspólne planowanie na żywo (czat, pomysły z głosowaniem, zmiany widoczne od razu u wszystkich)
oraz **znajomych** (dodawanie przez link/QR, czat 1:1, podgląd planów i historii podróży – prywatne / dla znajomych / publiczne).
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

## Krok 2b. Logowanie kontem Google (znajomi na nowym telefonie, szukanie po e-mailu)

1. **Authentication → Metoda logowania → Dodaj nowego dostawcę → Google** → włącz → e-mail pomocy: Twój Gmail → **Zapisz**.
2. W tym samym oknie Google rozwiń **„Dodaj do listy dozwolonych identyfikatory klienta z projektów zewnętrznych”**
   (Safelist client IDs from external projects) i wklej **pełny identyfikator klienta Android** z projektu „Podróżnik”
   w Google Cloud (Google Auth Platform → Klienci → „Podróżnik (docelowa)”, zaczyna się od `765781512100-u5k4…`) → **Zapisz**.
   Dzięki temu aplikacja na Androida loguje się do Firebase tym samym kontem Google co do Gmaila.
3. **Authentication → Ustawienia → Autoryzowane domeny** → **Dodaj domenę** → `chiniak.github.io` (logowanie w przeglądarce).

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
// Podróżnik – reguły Firestore.
// 1) Wspólne planowanie (podroznik/sync.js): dane zaszyfrowane w telefonie (AES-256-GCM, klucz tylko w linku zaproszenia).
//    Operacje można tylko dopisywać; odczyt tylko pojedynczego pokoju, którego losowy identyfikator jest w linku.
// 2) Znajomi (podroznik/social.js): profil (imię + klucz publiczny), zaproszenia, czat 1:1 i podróże dla znajomych /
//    publiczne. Czat i podróże są zaszyfrowane end-to-end – serwer przechowuje sam szyfr.
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isUid(id) { return id is string && id.size() >= 20 && id.size() <= 40 && id.matches('^[A-Za-z0-9]+$'); }

    match /rooms/{room}/ops/{op} {
      allow list, get: if signedIn();
      allow create: if signedIn()
        && room.size() >= 16 && room.size() <= 32
        && request.resource.data.keys().hasOnly(['by', 't', 'c', 'v'])
        && request.resource.data.by == request.auth.uid
        && request.resource.data.t == request.time
        && request.resource.data.c is string
        && request.resource.data.c.size() < 200000
        && request.resource.data.v == 1;
      allow update, delete: if false;
    }

    // profil: czyta każdy zalogowany, ale tylko po identyfikatorze (z linku / QR znajomego); bez listowania
    match /people/{uid} {
      allow get: if signedIn();
      allow list: if false;
      allow create, update: if signedIn() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['name', 'pub', 'v'])
        && request.resource.data.name is string && request.resource.data.name.size() <= 40
        && request.resource.data.pub is string && request.resource.data.pub.size() <= 300
        && request.resource.data.v == 1;
      allow delete: if signedIn() && request.auth.uid == uid;

      // zaproszenia / odpowiedzi: dokument nazwany identyfikatorem nadawcy; czyta i usuwa tylko odbiorca
      match /inbox/{from} {
        allow get, list, delete: if signedIn() && request.auth.uid == uid;
        allow create, update: if signedIn() && request.auth.uid == from && from != uid && isUid(uid)
          && request.resource.data.keys().hasOnly(['kind', 'name', 'pub', 't'])
          && request.resource.data.kind in ['req', 'ok', 'bye']
          && request.resource.data.name is string && request.resource.data.name.size() <= 40
          && request.resource.data.pub is string && request.resource.data.pub.size() <= 300
          && request.resource.data.t == request.time;
      }
    }

    // czat 1:1: rozmowa „uidA_uidB” (posortowane) – czytają i piszą tylko te dwie osoby; wiadomości tylko dopisywane
    match /dm/{conv}/msgs/{id} {
      allow get, list: if signedIn() && request.auth.uid in conv.split('_');
      allow create: if signedIn() && request.auth.uid in conv.split('_') && conv.split('_').size() == 2
        && request.resource.data.keys().hasOnly(['by', 't', 'c', 'v'])
        && request.resource.data.by == request.auth.uid
        && request.resource.data.t == request.time
        && request.resource.data.c is string && request.resource.data.c.size() < 20000
        && request.resource.data.v == 1;
      allow update, delete: if false;
    }

    // podróże udostępnione: zaszyfrowane migawki; odczyt po identyfikatorze (z listy kluczy albo z linku), pisze tylko właściciel
    match /pub/{uid}/trips/{doc} {
      allow get: if signedIn();
      allow list: if signedIn() && request.auth.uid == uid;
      allow create, update: if signedIn() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['c', 't', 'v'])
        && request.resource.data.c is string && request.resource.data.c.size() < 900000
        && request.resource.data.t == request.time && request.resource.data.v == 1;
      allow delete: if signedIn() && request.auth.uid == uid;
    }
    // szukanie znajomych po e-mailu (etap 2): dokument = dokładny adres z konta Google zalogowanej osoby; bez listowania
    match /emails/{email} {
      allow get: if signedIn();
      allow list: if false;
      allow create, update: if signedIn() && request.auth.token.email != null && request.auth.token.email_verified == true
        && email == request.auth.token.email.lower()
        && request.resource.data.keys().hasOnly(['uid']) && request.resource.data.uid == request.auth.uid;
      allow delete: if signedIn() && resource.data.uid == request.auth.uid;
    }
    // kopia klucza i listy znajomych na koncie (tylko konto Google / Facebook – nie anonimowe); czyta i pisze wyłącznie właściciel
    match /vault/{uid} {
      allow get, create, update, delete: if signedIn() && request.auth.uid == uid
        && request.auth.token.firebase.identities.keys().hasAny(['google.com', 'facebook.com']);
      allow list: if false;
    }
    // znajomi z Facebooka (etap 3): identyfikator Facebooka (przypisany do aplikacji) → profil; zapisuje tylko właściciel tego konta Facebook
    match /fbids/{fbid} {
      allow get: if signedIn();
      allow list: if false;
      allow create, update: if signedIn() && 'facebook.com' in request.auth.token.firebase.identities
        && fbid in request.auth.token.firebase.identities['facebook.com']
        && request.resource.data.keys().hasOnly(['uid']) && request.resource.data.uid == request.auth.uid;
      allow delete: if signedIn() && resource.data.uid == request.auth.uid;
    }
    // lista kluczy podróży dla jednego znajomego (zaszyfrowana kluczem tej pary)
    match /pub/{uid}/keys/{friend} {
      allow get: if signedIn() && (request.auth.uid == uid || request.auth.uid == friend);
      allow list: if signedIn() && request.auth.uid == uid;
      allow create, update: if signedIn() && request.auth.uid == uid && isUid(friend)
        && request.resource.data.keys().hasOnly(['c', 't', 'v'])
        && request.resource.data.c is string && request.resource.data.c.size() < 100000
        && request.resource.data.t == request.time && request.resource.data.v == 1;
      allow delete: if signedIn() && request.auth.uid == uid;
    }
  }
}
```

3. **Opublikuj (Publish)**.

Co robią: zapisywać mogą tylko zalogowane (anonimowo) telefony, tylko zaszyfrowane wpisy i tylko dopisywać –
nikt nie zmieni ani nie usunie cudzych wpisów i nie wylistuje cudzych podróży. Te same reguły obsługują **znajomych**
(profil, zaproszenia, czat 1:1, podróże dla znajomych / publiczne): czat czytają tylko te dwie osoby, a podróże są zaszyfrowane.
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
