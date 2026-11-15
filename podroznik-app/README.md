# Podróżnik – prawdziwa aplikacja na Androida (Capacitor)

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
- Ikona i ekran startowy Podróżnika (wygenerowane z `podroznik/icon-512.png`).

## Wersje
| | pakiet | nazwa | podpis |
|---|---|---|---|
| testowa (`assembleDebug`) | `io.github.chiniak.podroznik.test` | Podróżnik (test) | `android/app/podroznik-test.keystore` – **jawny klucz tylko do testów** (hasło `podroznik-test`) |
| docelowa (`assembleRelease`) | `io.github.chiniak.podroznik` | Podróżnik | prawdziwy klucz właściciela (`podroznik-klucz-podpisu.zip`, nie w repozytorium) |

Wersja testowa instaluje się **obok** obecnego Podróżnika. Docelowa (ten sam pakiet i klucz co TWA,
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

## Plan
1. ✅ Projekt Capacitor, pliki przez „Udostępnij”, aparat, położenie, ikona (wersja 2.0.0)
2. ⬜ Punktualne powiadomienia (Local Notifications – także po restarcie telefonu) + jasność na maks przy bilecie
3. ⬜ „Udostępnij → Podróżnik” dla plików (PDF, .ics, zdjęcia biletów z Gmaila i galerii)
4. ⬜ Widżet na ekranie głównym, OCR z ML Kit, odcisk palca natywnie (WebAuthn w WebView nie działa – teraz tylko PIN)
