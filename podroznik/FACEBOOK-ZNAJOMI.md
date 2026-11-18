# Znajomi z Facebooka – założenie aplikacji na Facebooku (etap 3)

Cel: w Podróżniku przycisk „Zaloguj przez Facebooka” i lista **znajomych z Facebooka, którzy też używają Podróżnika**
(jednym dotknięciem „Zaproś”). Kod jest gotowy; potrzebuje Twojej aplikacji na Facebooku.

> Najpierw musi działać projekt Firebase z `FIREBASE-WSPOLNE.md` (przysłany `firebaseConfig`).
> Facebook pokazuje tylko znajomych, którzy **też** zalogowali się do Podróżnika przez Facebooka. Lista znajomych
> (`user_friends`) wymaga **przeglądu aplikacji przez Facebooka (App Review)** – do tego czasu działa tylko dla Ciebie
> i osób dodanych jako testerzy.

Czas: ok. 20 minut + oczekiwanie na przegląd (zwykle kilka dni). Na komputerze.

---

## Krok 1. Konto dewelopera i aplikacja

1. Wejdź na https://developers.facebook.com → zaloguj się swoim Facebookiem → **Zacznij** (jeśli pierwszy raz:
   potwierdź numer telefonu / e-mail).
2. **Moje aplikacje → Utwórz aplikację**.
3. Przypadek użycia: **„Uwierzytelniaj i proś użytkowników o dane za pomocą Logowania przez Facebooka”** → Dalej.
4. Nazwa aplikacji: `Podróżnik`, e-mail kontaktowy: Twój → **Utwórz aplikację**.

## Krok 2. Podstawowe ustawienia

**Ustawienia aplikacji → Podstawowe**:

| Pole | Wpisz |
|---|---|
| Domeny aplikacji | `chiniak.github.io` |
| Adres URL Polityki prywatności | `https://chiniak.github.io/podroznik/prywatnosc.html` |
| Adres URL instrukcji usuwania danych | `https://chiniak.github.io/podroznik/prywatnosc.html#usuwanie` |
| Kategoria | Podróże |
| Ikona (1024×1024) | `podroznik/icon-512.png` powiększona – Claude może przygotować |

Na dole **+ Dodaj platformę → Android**:
- Nazwa pakietu: `io.github.chiniak.podroznik`
- Nazwa klasy: `io.github.chiniak.podroznik.MainActivity`
- Skróty kluczy (Key hashes): `hB5KCayuM1a3KeLF/S3+F39lKMw=`

**+ Dodaj platformę → Witryna**: `https://chiniak.github.io/podroznik/` → **Zapisz zmiany**.

## Krok 3. Logowanie przez Facebooka ↔ Firebase

1. W konsoli Firebase (projekt `podroznik-razem`): **Authentication → Metoda logowania → Dodaj nowego dostawcę → Facebook** → Włącz.
2. Wklej **Identyfikator aplikacji** i **Klucz tajny aplikacji** z Facebooka (Ustawienia aplikacji → Podstawowe → „Pokaż”).
   Klucz tajny wklejasz **tylko do Firebase** – nie przysyłaj go Claude'owi.
3. Skopiuj z okna Firebase adres **„URI przekierowania OAuth”** (kończy się na `/__/auth/handler`) → **Zapisz**.
4. Na Facebooku: **Przypadki użycia → Uwierzytelnianie… → Dostosuj → Ustawienia** → **Prawidłowe URI przekierowania OAuth** →
   wklej ten adres → **Zapisz zmiany**.
5. W tym samym miejscu (**Uprawnienia**) dodaj: `email`, `public_profile` (są od razu) i **`user_friends`**.

## Krok 4. Przyślij Claude'owi dwie wartości

- **Identyfikator aplikacji** (App ID) – Ustawienia aplikacji → Podstawowe,
- **Token klienta** (Client token) – Ustawienia aplikacji → Zaawansowane → Bezpieczeństwo.

To nie są hasła (są wbudowywane w każdą aplikację z logowaniem Facebooka). Claude doda bibliotekę Facebooka do aplikacji
na Androida, wpisze je i zbuduje nowe APK.

## Krok 5. Testy i publikacja

1. Do czasu przeglądu: **Role aplikacji → Testerzy** → dodaj Facebooki osób, z którymi testujesz (muszą zaakceptować
   zaproszenie na developers.facebook.com).
2. **Przegląd aplikacji → Prośby o uprawnienia → `user_friends` → Poproś o zaawansowany dostęp**: opis (Claude przygotuje
   tekst po angielsku) + krótki film: logowanie przez Facebooka w Podróżniku → „Znajomi z Facebooka w Podróżniku” → zaproszenie.
   Facebook może poprosić o weryfikację firmy/osoby.
3. Po akceptacji: przełącznik u góry **Tryb aplikacji: Na żywo (Live)**.

## Jak to działa (dla ciekawych)

- Logowanie: na Androidzie natywnie (biblioteka Facebooka), w przeglądarce okno Facebooka; token trafia do Firebase
  Authentication i łączy konto Facebook z Twoim profilem znajomych (te same znajomi i czaty – jak przy Google).
- Telefon pyta Facebooka o listę znajomych (`/me/friends` – tylko ci, którzy też połączyli Podróżnika) i sprawdza w bazie
  `fbids/{id}`, który profil Podróżnika do nich należy. Lista znajomych nie jest nigdzie zapisywana; nic nie jest publikowane na Facebooku.
