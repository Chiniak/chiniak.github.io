# Tripwillow – prawdziwa aplikacja na Androida (Capacitor)

Następca `podroznik-android/` (TWA). Tamten APK tylko otwierał stronę w Chrome; ten ma **cały kod aplikacji
w środku** (działa od pierwszego uruchomienia bez internetu) i może korzystać z funkcji telefonu
przez wtyczki Capacitora.

Kod aplikacji jest dalej jeden: `../podroznik/`. Skrypt `scripts/copy-web.js` kopiuje go do `www/`
(bez `*.apk` i `*.md`), a Capacitor wkłada `www/` do APK. Różnice między przeglądarką a aplikacją
obsługuje `podroznik/native.js` (w przeglądarce nic nie robi).

## Co już działa inaczej niż w TWA
- Pliki (kopia zapasowa, .ics, wspólna podróż, rozliczenie, skan PDF) – natywne „Udostępnij” (wtyczki Filesystem + Share),
  bo WebView nie umie pobierać plików ani `navigator.share` z plikami.
- Uprawnienia aparatu (skaner kodów) i położenia („📍 Tutaj”) – w `AndroidManifest.xml`.
- Ikona i ekran startowy Tripwillow (wygenerowane z `podroznik/icon-512.png`).

## Powiadomienia (wersja 2.2)
`@capacitor/local-notifications`: `reminders.js` planuje w telefonie najbliższe przypomnienia (do 60, na 60 dni) –
przychodzą o czasie przy zamkniętej aplikacji i po restarcie telefonu. Plan odświeża się przy starcie, po każdej zmianie
ekranu (z opóźnieniem 3 s) i przy chowaniu aplikacji; bez zmian nic nie jest planowane od nowa, chyba że system skasował
alarmy (np. po aktualizacji aplikacji). Zgoda pytana przy pierwszym uruchomieniu, gdy są przypomnienia; „⏰ Dokładne godziny”
(uprawnienie „Alarmy i przypomnienia”, Android 12+) w Ustawienia → Przypomnienia – bez niego telefon może opóźniać o kilka minut.
Mała ikona: `res/drawable-*/ic_stat_podroznik.png` (samolot z ikony aplikacji).

## Wersje
| | pakiet | nazwa | podpis |
|---|---|---|---|
| testowa (`assembleDebug`) | `io.github.chiniak.podroznik.test` | Tripwillow (test) | `android/app/podroznik-test.keystore` – **jawny klucz tylko do testów** (hasło `podroznik-test`) |
| docelowa (`assembleRelease`) | `io.github.chiniak.podroznik` | Tripwillow | prawdziwy klucz właściciela (`podroznik-klucz-podpisu.zip`, nie w repozytorium) |

Wersja testowa instaluje się **obok** obecnego Tripwillow. Docelowa (ten sam pakiet i klucz co TWA,
`versionCode 2`) zainstaluje się jako **aktualizacja** starej aplikacji.

**Dane:** stara aplikacja trzyma dane w Chrome (adres chiniak.github.io), nowa – we własnym WebView
(adres `https://localhost`). Nie widzą nawzajem swoich danych. Przenosi się je kopią zapasową:
stara aplikacja → Ustawienia → Kopia zapasowa → Zapisz; nowa → „Wybierz plik kopii” → Przywróć.

## Budowanie
Wymaga Node 22, JDK 21, Android SDK (`platforms;android-36`, `build-tools;35.0.0`).
```
cd podroznik-app
npm install
echo "sdk.dir=/opt/android-sdk" > android/local.properties
npm run apk            # = kopiowanie www/ + cap sync + gradlew assembleDebug
# wynik: android/app/build/outputs/apk/debug/app-debug.apk
```
Po każdej zmianie w `../podroznik/` wystarczy `npm run apk` (albo `npm run sync` i budowanie w Android Studio).
Przy nowej wersji podbij `versionCode` / `versionName` w `android/app/build.gradle`.

W środowisku chmurowym Maven Central (repo.maven.apache.org / repo1) bywa niedostępny (404/429) –
pomaga `~/.gradle/init.d/maven-mirror.gradle` z lustrem `https://maven-central.storage-download.googleapis.com/maven2/`
(przed `google()` nie wstawiać, kolejność: google → lustro).

Wersja docelowa: `./gradlew assembleRelease`, potem `zipalign` i `apksigner` jak w `../podroznik-android/README.md`.

## Logowanie Google i „📬 Z Gmaila” (wersja 2.1)
Aplikacja sama szuka w Gmailu potwierdzeń rezerwacji (loty, pociągi, autobusy, promy, noclegi, wycieczki, bilety,
stoliki w restauracjach) i proponuje dodanie ich do podróży – `podroznik/gmail.js`, wtyczka `GoogleAuthPlugin.java`
(Google Identity Services – Authorization API, `play-services-auth`). Zakres: `gmail.readonly`. Bez serwera i bez hasła:
token dostępu (ok. 1 h) dostaje telefon, Gmail API pyta wprost. Przy uruchomieniu aplikacja sprawdza pocztę sama (co 6 h).

**Konfiguracja w Google Cloud (raz, robi właściciel konta):**
1. https://console.cloud.google.com → nowy projekt, np. „Tripwillow”.
2. *APIs & Services → Library* → **Gmail API** → *Enable*.
3. *Google Auth Platform* (dawniej „OAuth consent screen”) → *Get started*: nazwa aplikacji „Tripwillow”, e-mail kontaktowy,
   odbiorcy **External**. Potem *Audience* → zostaw **Testing** i w *Test users* dodaj swój adres Gmail.
   *Data access* → *Add or remove scopes* → `https://www.googleapis.com/auth/gmail.readonly`.
4. *Clients* → *Create client* → typ **Android**:
   - wersja testowa: pakiet `io.github.chiniak.podroznik.test`, SHA-1 `25:50:DC:17:A8:54:34:A0:04:E2:4A:86:F0:37:2F:51:94:6F:86:FD`
   - wersja docelowa: drugi klient – pakiet `io.github.chiniak.podroznik`, SHA-1 prawdziwego klucza
     (`keytool -list -v -keystore podroznik.keystore`).
5. (opcjonalnie, dla strony WWW) *Clients* → *Create client* → **Web application**, *Authorized JavaScript origins*:
   `https://chiniak.github.io` → identyfikator klienta wpisać do `WEB_CLIENT_ID` w `podroznik/gmail.js`.

W trybie **Testing** Google pokazuje ostrzeżenie „Google nie zweryfikował tej aplikacji” – *Kontynuuj*. Zgoda w tym trybie
może wygasać po 7 dniach – wtedy aplikacja poprosi o ponowne zalogowanie. Publikacja dla innych osób wymagałaby
weryfikacji Google (zakres „restricted”) – dla własnego użytku niepotrzebna.

Błąd „Aplikacja nie jest zarejestrowana w Google Cloud” (kod 10) = brak klienta Android z tym pakietem i odciskiem SHA-1.

## Plan
1. ✅ Projekt Capacitor, pliki przez „Udostępnij”, aparat, położenie, ikona (wersja 2.0.0)
2. ✅ (2.1) Logowanie Google + propozycje z Gmaila
3. ✅ (2.2) Punktualne powiadomienia (Local Notifications – także po restarcie telefonu) + jasność na maks przy bilecie
4. ⬜ „Udostępnij → Tripwillow” dla plików (PDF, .ics, zdjęcia biletów z Gmaila i galerii)
5. ⬜ Widżet na ekranie głównym, OCR z ML Kit, odcisk palca natywnie (WebAuthn w WebView nie działa – teraz tylko PIN)
