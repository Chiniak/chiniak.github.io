/* Podróżnik – projekt Firebase dla wspólnego planowania (sync.js).
   Wartości z konsoli Firebase: Ustawienia projektu → Twoje aplikacje → aplikacja internetowa → firebaseConfig.
   To nie są hasła – identyfikują projekt; dostęp do danych chronią reguły Firestore (firestore.rules) i szyfrowanie.
   null = wspólne planowanie na żywo wyłączone (ekran „Razem” proponuje wysłanie pliku).
   Znajomi z Facebooka: dopisz do obiektu pole facebookAppId: "…" (FACEBOOK-ZNAJOMI.md). */
self.SYNC_CONFIG = null;
