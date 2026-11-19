/* Tripwillow – projekt Firebase dla wspólnego planowania (sync.js).
   Wartości z konsoli Firebase: Ustawienia projektu → Twoje aplikacje → aplikacja internetowa → firebaseConfig.
   To nie są hasła – identyfikują projekt; dostęp do danych chronią reguły Firestore (firestore.rules) i szyfrowanie.
   null = wspólne planowanie na żywo wyłączone (ekran „Razem” proponuje wysłanie pliku).
   Znajomi z Facebooka: dopisz do obiektu pole facebookAppId: "…" (FACEBOOK-ZNAJOMI.md). */
self.SYNC_CONFIG = {
  apiKey: "AIzaSyDXRLlfACl0rZfTQX9yg86UpG2nkXQAXsM",
  authDomain: "tripwillow.firebaseapp.com",
  projectId: "tripwillow",
  storageBucket: "tripwillow.firebasestorage.app",
  messagingSenderId: "560161333631",
  appId: "1:560161333631:web:9bfe79494e04f0c97f3a4a",
};
