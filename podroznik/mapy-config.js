/* Tripwillow – klucz do podkładu mapy CARTO Voyager (warstwa „Napisy łacińskie” i „Mapa offline”).
   Od jesieni 2026 CARTO bez klucza zwraca kafelki z napisem „API KEY REQUIRED”. Klucz jest darmowy
   (do 5 mln kafelków / miesiąc niekomercyjnie, 1 mln komercyjnie): https://carto.com/basemaps/apikey
   To nie jest hasło – trafia w adresach kafelków (jak apiKey Firebase); w panelu CARTO można go ograniczyć do domeny.
   Pusty klucz = warstwa CARTO i pobieranie mapy offline wyłączone; mapa używa OpenStreetMap (nazwy w lokalnym języku). */
self.MAP_CONFIG = self.MAP_CONFIG || { // testy mogą podać własny (addInitScript)
  cartoKey: "",
};
