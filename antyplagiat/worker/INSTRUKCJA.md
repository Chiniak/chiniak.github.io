# Antyplagiat – uruchomienie wyszukiwania w internecie

Strona: https://chiniak.github.io/antyplagiat/

Strona sama nie może pytać wyszukiwarki, bo klucz API byłby widoczny dla każdego.
Dlatego zapytania przechodzą przez mały serwer, czyli plik `worker.js` uruchomiony za darmo na Cloudflare Workers.

## 1. Klucz Brave Search API

1. Wejdź na https://api-dashboard.search.brave.com i załóż konto.
2. Wybierz darmowy plan („Free”). Brave może poprosić o kartę tylko do weryfikacji, a w darmowym planie nic nie pobiera, dopóki mieścisz się w limicie.
3. W zakładce **API Keys** utwórz klucz i skopiuj go.

Darmowy plan to zwykle około 1 zapytania na sekundę i kilka tysięcy zapytań miesięcznie, ale sprawdź aktualne warunki na stronie Brave.
Jedno sprawdzenie tekstu zużywa tyle zapytań, ile ustawisz w „Zdań do wyszukania” (domyślnie 10).

## 2. Serwer na Cloudflare Workers

1. Załóż darmowe konto na https://dash.cloudflare.com.
2. Wejdź w **Workers & Pages → Create → Create Worker** (szablon „Hello World”), nazwij go np. `antyplagiat` i kliknij **Deploy**.
3. Kliknij **Edit code**, usuń całą zawartość i wklej zawartość pliku `worker.js`. Kliknij **Deploy**.
4. Wejdź w **Settings → Variables and Secrets** i dodaj:
   - `BRAVE_API_KEY`, typ **Secret**: Twój klucz z Brave,
   - `ALLOWED_ORIGINS`, typ **Text**: `https://chiniak.github.io`.
5. Skopiuj adres Workera, np. `https://antyplagiat.twoja-nazwa.workers.dev`.
   Po otwarciu go w przeglądarce powinien pojawić się tekst `{"ok":true,"brave":true}`.

## 3. Połączenie strony z serwerem

Otwórz stronę, wejdź w **Ustawienia** i wklej adres Workera w polu „Adres serwera wyszukiwania”.
Adres zapisuje się w przeglądarce. Żeby wpisać go na stałe dla wszystkich, ustaw `DEFAULT_WORKER` w pliku `antyplagiat/index.html`.

## Jak to działa

1. Strona wybiera z tekstu najbardziej charakterystyczne zdania (po 8 słów ze środka zdania).
2. Każde zdanie jest wyszukiwane w Brave jako dokładna fraza w cudzysłowie.
3. Strony, które pojawiły się najczęściej (do 10), są pobierane przez Workera i porównywane z tekstem.
4. Do 6 stron z największym pokryciem trafia na listę źródeł i jest zaznaczana kolorami.
   Jeśli strona blokuje pobieranie, porównywany jest tylko opis z wyników wyszukiwania (dopisek „tylko opis”).
5. Przy każdym zdaniu jest przycisk **Google**, który otwiera ręczne wyszukiwanie tej frazy.
   Google ma większy indeks, więc warto sprawdzić tam zdania, przy których Brave nic nie znalazł.

## Ograniczenia

- Brave nie widzi wszystkiego: płatnych baz prac, zamkniętych platform (np. Scribd), części plików PDF.
- Tekst przerobiony synonimami nie zostanie wykryty, bo porównywane są identyczne ciągi słów.
- `ALLOWED_ORIGINS` chroni Twój limit przed innymi stronami, ale nie jest pełnym zabezpieczeniem.
