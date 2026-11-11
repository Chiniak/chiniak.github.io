# Podróżnik – aplikacja na Androida (TWA)

To jest „opakowanie” strony https://chiniak.github.io/podroznik/ w aplikację na Androida
(Trusted Web Activity, wygenerowane przez Bubblewrap). Cała logika jest w stronie – po zmianie
plików w `podroznik/` aplikacja na telefonie zaktualizuje się sama, **nie trzeba budować nowego APK**.

Nowe APK potrzebne jest tylko przy zmianie nazwy, ikony, koloru, adresu albo wersji Androida.

- pakiet: `io.github.chiniak.podroznik`
- gotowy plik: `podroznik/Podroznik.apk` (do pobrania z https://chiniak.github.io/podroznik/Podroznik.apk)
- odcisk klucza (SHA-256) jest w `.well-known/assetlinks.json` – dzięki temu aplikacja otwiera się bez paska adresu

## Klucz podpisu
Plik `podroznik.keystore` i hasło **nie są w repozytorium** (repozytorium jest publiczne).
Trzymaj je u siebie – bez nich nie zbudujesz aktualizacji z tym samym podpisem
(trzeba by wtedy odinstalować starą aplikację i zmienić odcisk w `assetlinks.json`).

## Budowanie nowej wersji
Wymaga JDK 17+ i Android SDK (platforma 36, build-tools 35).

1. W `app/build.gradle` podbij `versionCode` i `versionName` (oraz `appVersionCode` / `appVersion` w `twa-manifest.json`).
2. Skopiuj `podroznik.keystore` do tego folderu i utwórz `local.properties` z linią `sdk.dir=/ścieżka/do/android-sdk`.
3. `./gradlew assembleRelease`
4. Wyrównanie i podpis:
   ```
   zipalign -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk aligned.apk
   apksigner sign --ks podroznik.keystore --ks-key-alias podroznik --out Podroznik.apk aligned.apk
   ```
5. Skopiuj `Podroznik.apk` do `podroznik/`.

Repozytoria Maven: zamiast wycofanego `jcenter()` używany jest mirror Maven Central (`repo.maven.apache.org`).
